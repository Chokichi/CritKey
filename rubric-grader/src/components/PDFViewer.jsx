import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  IconButton,
  Stack,
  Typography,
  Slider,
  Tooltip,
  TextField,
  Collapse,
  InputAdornment,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  ZoomIn,
  ZoomOut,
  ZoomOutMap,
  NavigateBefore,
  NavigateNext,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import useCanvasStore from '../store/canvasStore';
import { getCachedPdf } from '../utils/pdfCache';
import { getPdfInitialZoom, savePdfInitialZoom, getPdfGridMode, savePdfGridMode, getPdfGridColumns, savePdfGridColumns, getPdfPersistZoom, savePdfPersistZoom } from '../utils/localStorage';
import StudentSelector from './StudentSelector';

// Configure PDF.js worker to use local bundled file
GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const PDFViewer = ({ fileUrl, apiToken, onNext, onPrevious, hasNext, hasPrevious }) => {
  const { offlineMode, cachingProgress, selectedSubmission, selectedAssignment } = useCanvasStore();
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [initialScale, setInitialScale] = useState(1.0);
  const [initialZoomPercent, setInitialZoomPercent] = useState(() => getPdfInitialZoom());
  const [gridMode, setGridMode] = useState(() => getPdfGridMode());
  const [gridColumns, setGridColumns] = useState(() => getPdfGridColumns());
  const [persistZoom, setPersistZoom] = useState(() => getPdfPersistZoom());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [waitingForCache, setWaitingForCache] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [renderedPages, setRenderedPages] = useState(new Set());
  const [showZoomSettings, setShowZoomSettings] = useState(false);
  const canvasRefs = useRef({});
  const containerRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const renderTaskRefs = useRef({});
  const loadingTaskRef = useRef(null);
  const abortControllerRef = useRef(null);
  const currentFileUrlRef = useRef(null);
  const previousPdfDocRef = useRef(null);
  const userZoomRatioRef = useRef(1.0); // Track user's zoom relative to initial scale
  const previousInitialScaleRef = useRef(1.0);
  const pageRefs = useRef({});

  // Helper function to wait for PDF cache using event-driven approach
  const waitForPdfCache = async (fileUrl, assignmentId, submissionId, signal, maxWaitTime = 60000) => {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms

    return new Promise((resolve, reject) => {
      // If already aborted, reject immediately
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      // Set up abort listener
      const abortHandler = () => {
        cleanup();
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', abortHandler);

      // Subscribe to caching progress changes
      let checkTimer = null;
      const unsubscribe = useCanvasStore.subscribe(
        (state) => state.cachingProgress,
        async (progress) => {
          // Clear any pending check
          if (checkTimer) {
            clearTimeout(checkTimer);
          }

          // Check for cached PDF
          const cachedBlob = await getCachedPdf(fileUrl || '', {
            assignmentId,
            submissionId,
          });

          if (cachedBlob) {
            // Found cached PDF
            cleanup();
            resolve(cachedBlob);
            return;
          }

          // Check timeout
          if (Date.now() - startTime > maxWaitTime) {
            cleanup();
            reject(new Error('Timeout waiting for PDF cache'));
            return;
          }

          // Check if caching completed but PDF not found
          if (!progress.isCaching) {
            cleanup();
            reject(new Error('PDF not found after caching completed'));
            return;
          }

          // Schedule next check
          checkTimer = setTimeout(async () => {
            // Trigger subscription callback by checking state
            const currentProgress = useCanvasStore.getState().cachingProgress;
            if (currentProgress.isCaching) {
              // Re-check periodically
              const cachedBlob = await getCachedPdf(fileUrl || '', {
                assignmentId,
                submissionId,
              });
              if (cachedBlob) {
                cleanup();
                resolve(cachedBlob);
              }
            }
          }, checkInterval);
        },
        {
          fireImmediately: true, // Check immediately on subscription
        }
      );

      const cleanup = () => {
        if (checkTimer) {
          clearTimeout(checkTimer);
        }
        signal.removeEventListener('abort', abortHandler);
        unsubscribe();
      };
    });
  };

  // Load PDF document
  useEffect(() => {
    // Check if we have either a fileUrl OR assignmentId + submissionId
    const submissionId = selectedSubmission ? String(selectedSubmission.user_id || selectedSubmission.id) : null;
    const assignmentId = selectedAssignment ? String(selectedAssignment.id) : null;
    const hasIds = assignmentId && submissionId;

    if (!fileUrl && !hasIds) {
      // No fileUrl and no IDs - can't load anything
      setPdfDoc(null);
      setNumPages(0);
      setLoading(false);
      setWaitingForCache(false);
      setPdfLoaded(false);
      setRenderedPages(new Set());
      previousPdfDocRef.current = null;
      canvasRefs.current = {};
      renderTaskRefs.current = {};
      pageRefs.current = {};
      return;
    }

    // Reset loaded state when fileUrl or selection changes
    setPdfLoaded(false);
    setLoading(true);
    setError(null);

    // Update the ref to track current fileUrl
    currentFileUrlRef.current = fileUrl;

    const loadPdf = async () => {
      // Create AbortController for this loading operation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Store the current fileUrl to check if it changed during loading
      const currentFileUrl = fileUrl;
      const currentSubmissionId = selectedSubmission ? String(selectedSubmission.user_id || selectedSubmission.id) : null;
      const currentAssignmentId = selectedAssignment ? String(selectedAssignment.id) : null;

      try {
        let pdfSource;

        // Try to load from cache first (always check cache, regardless of offline mode)
        // Primary lookup: by assignmentId + submissionId (most reliable)
        // This works even if fileUrl is null
        let cachedBlob = await getCachedPdf(currentFileUrl || '', {
          assignmentId: currentAssignmentId,
          submissionId: currentSubmissionId,
        });

        // If not found and we're in offline mode, wait for caching to complete
        if (!cachedBlob && offlineMode) {
          // Check if caching is in progress
          const currentProgress = useCanvasStore.getState().cachingProgress;
          if (currentProgress.isCaching) {
            setWaitingForCache(true);
            try {
              // Use event-driven approach instead of polling
              cachedBlob = await waitForPdfCache(
                currentFileUrl,
                currentAssignmentId,
                currentSubmissionId,
                abortController.signal
              );
            } catch (err) {
              setWaitingForCache(false);
              if (err.message === 'Aborted') {
                return; // Silently abort
              }
              throw err; // Re-throw other errors
            }
            setWaitingForCache(false);
          }

          // If still not cached after waiting, show error
          if (!cachedBlob) {
            throw new Error('PDF not cached. Please wait for caching to complete or enable online mode.');
          }
        }
        
        // Check if fileUrl or selection changed before proceeding
        const currentSubmissionIdCheck = selectedSubmission ? String(selectedSubmission.user_id || selectedSubmission.id) : null;
        const currentAssignmentIdCheck = selectedAssignment ? String(selectedAssignment.id) : null;
        if (currentFileUrl !== currentFileUrlRef.current ||
            currentSubmissionIdCheck !== currentSubmissionId ||
            currentAssignmentIdCheck !== currentAssignmentId) {
          return; // Abort loading
        }
        
        if (cachedBlob) {
          // Convert blob to ArrayBuffer for PDF.js
          const arrayBuffer = await cachedBlob.arrayBuffer();
          pdfSource = {
            data: arrayBuffer,
          };
        } else if (!offlineMode) {
          // Fetch PDF through proxy if we have an API token and not in offline mode
          if (apiToken) {
            const url = `http://localhost:3001/api/proxy-file?url=${encodeURIComponent(currentFileUrl)}`;
            pdfSource = {
              url,
              httpHeaders: {
                'Authorization': `Bearer ${apiToken}`,
              },
              withCredentials: false
            };
          } else {
            pdfSource = { url: currentFileUrl, withCredentials: false };
          }
        } else {
          throw new Error('PDF not cached and offline mode is enabled.');
        }

        const loadingTask = getDocument(pdfSource);
        loadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        
        // Check if this loading task is still current and fileUrl hasn't changed
        if (loadingTaskRef.current === loadingTask && currentFileUrl === currentFileUrlRef.current) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setLoading(false);
          setPdfLoaded(true); // Mark as loaded to prevent further polling
          setRenderedPages(new Set());
          canvasRefs.current = {};
          renderTaskRefs.current = {};
          pageRefs.current = {};
          loadingTaskRef.current = null;
          
          // Reset scroll position to top when new PDF loads
          if (containerRef.current) {
            containerRef.current.scrollTop = 0;
          }
        } else {
          // PDF loaded but we're no longer on this file, destroy it
          pdf.destroy();
        }
      } catch (err) {
        // Only set error if this is still the current loading task and fileUrl hasn't changed
        if (loadingTaskRef.current && currentFileUrl === currentFileUrlRef.current) {
          // Ignore cancellation/abort errors
          if (err.name !== 'AbortException' && 
              err.name !== 'RenderingCancelledException' &&
              err.message !== 'The loading task was aborted') {
            console.error('Error loading PDF:', err);
            setError(err.message);
          }
          setLoading(false);
          setWaitingForCache(false);
          setPdfLoaded(false);
          loadingTaskRef.current = null;
        }
      }
    };

    loadPdf();

    // Cleanup: abort loading, clear polling intervals, and cancel renders/loads when component unmounts or fileUrl changes
    return () => {
      // Abort any in-flight PDF cache waiting
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      // Cancel all render tasks
      Object.values(renderTaskRefs.current).forEach(task => {
        if (task) task.cancel();
      });
      renderTaskRefs.current = {};
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy();
        loadingTaskRef.current = null;
      }
      // Reset PDF document to prevent stale renders
      setPdfDoc(null);
    };
  }, [fileUrl, apiToken, offlineMode, selectedSubmission?.user_id, selectedSubmission?.id, selectedAssignment?.id]); // Include selection IDs so we reload when selection changes

  // Reset scroll position when PDF document changes or when pages are rendered
  useEffect(() => {
    if (pdfDoc && containerRef.current) {
      // Reset scroll to top when a new PDF is loaded
      // Use a small delay to ensure layout is complete
      const resetScroll = () => {
        if (containerRef.current) {
          containerRef.current.scrollTop = 0;
          // Also ensure we can scroll to the very top by checking scrollTop again
          requestAnimationFrame(() => {
            if (containerRef.current && containerRef.current.scrollTop !== 0) {
              containerRef.current.scrollTop = 0;
            }
          });
        }
      };
      
      // Reset immediately and after a short delay to catch any layout shifts
      resetScroll();
      setTimeout(resetScroll, 100);
    }
  }, [pdfDoc]);

  // Calculate initial scale to fit PDF in viewer and grid columns
  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;

    const calculateInitialScale = async () => {
      try {
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Get container dimensions (accounting for padding)
        const container = containerRef.current;
        if (!container) return;
        
        const containerRect = container.getBoundingClientRect();
        // Use configured initial zoom percentage of container width
        const zoomFactor = initialZoomPercent / 100;
        
        if (gridMode) {
          // In grid mode, use user-specified number of columns and adjust scale to fit
          const pageWidth = viewport.width;
          const availableWidth = containerRect.width - 32; // Account for padding (16px padding on each side)
          const gap = 8; // Gap between pages in grid (reduced from 16px)
          const columns = Math.max(1, gridColumns); // Ensure at least 1 column

          // Calculate column width (accounting for gaps)
          const columnWidth = (availableWidth - (columns - 1) * gap) / columns;

          // Calculate scale so each page fills the column width
          // In grid mode, use full column width (ignore initial zoom percentage)
          const targetPageWidth = columnWidth;
          const fitScale = targetPageWidth / pageWidth;
          
          const isNewPdf = previousPdfDocRef.current !== pdfDoc;
          previousPdfDocRef.current = pdfDoc;

          if (isNewPdf && !persistZoom) {
            // New PDF and persist zoom is OFF - reset zoom to 100%
            setInitialScale(fitScale);
            setScale(fitScale);
            userZoomRatioRef.current = 1.0;
            previousInitialScaleRef.current = fitScale;
          } else {
            // Either same PDF OR persist zoom is ON - maintain zoom ratio
            const prevInitial = previousInitialScaleRef.current || 1.0;
            const zoomRatio = userZoomRatioRef.current;
            setInitialScale(fitScale);
            setScale(fitScale * zoomRatio);
            previousInitialScaleRef.current = fitScale;
          }
        } else {
          // Vertical mode - original behavior
          // Account for padding (16px on each side = 32px total)
          const availableWidth = (containerRect.width - 32) * zoomFactor;
          const fitScale = availableWidth / viewport.width;
          
          const isNewPdf = previousPdfDocRef.current !== pdfDoc;
          previousPdfDocRef.current = pdfDoc;

          if (isNewPdf && !persistZoom) {
            // New PDF and persist zoom is OFF - reset zoom to 100%
            setInitialScale(fitScale);
            setScale(fitScale);
            userZoomRatioRef.current = 1.0;
            previousInitialScaleRef.current = fitScale;
          } else {
            // Either same PDF OR persist zoom is ON - maintain zoom ratio
            const prevInitial = previousInitialScaleRef.current || 1.0;
            const zoomRatio = userZoomRatioRef.current;
            setInitialScale(fitScale);
            setScale(fitScale * zoomRatio);
            previousInitialScaleRef.current = fitScale;
          }
        }
      } catch (err) {
        console.error('Error calculating initial scale:', err);
      }
    };

    calculateInitialScale();

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      calculateInitialScale();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [pdfDoc, initialZoomPercent, gridMode, gridColumns, persistZoom]);

  // Render all PDF pages
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    const renderAllPages = async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          // Cancel any ongoing render operation for this page
          if (renderTaskRefs.current[pageNum]) {
            renderTaskRefs.current[pageNum].cancel();
            renderTaskRefs.current[pageNum] = null;
          }

          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = canvasRefs.current[pageNum];
          if (!canvas) {
            // Canvas not mounted yet, skip
            continue;
          }

          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          // Store the render task so we can cancel it if needed
          const renderTask = page.render(renderContext);
          renderTaskRefs.current[pageNum] = renderTask;

          await renderTask.promise;
          renderTaskRefs.current[pageNum] = null;
          
          // Mark page as rendered
          setRenderedPages(prev => new Set([...prev, pageNum]));
        } catch (err) {
          // Ignore cancellation errors
          if (err.name !== 'RenderingCancelledException') {
            console.error(`Error rendering page ${pageNum}:`, err);
            if (pageNum === 1) {
              setError(err.message);
            }
          }
          renderTaskRefs.current[pageNum] = null;
        }
      }
    };

    renderAllPages();

    // Cleanup: cancel all renders when component unmounts or dependencies change
    return () => {
      Object.values(renderTaskRefs.current).forEach(task => {
        if (task) task.cancel();
      });
      renderTaskRefs.current = {};
    };
  }, [pdfDoc, numPages, scale]);

  const handleZoomIn = () => {
    setScale((prev) => {
      const newScale = Math.min(prev + (initialScale * 0.25), initialScale * 3.0);
      userZoomRatioRef.current = newScale / initialScale;
      return newScale;
    });
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const newScale = Math.max(prev - (initialScale * 0.25), initialScale * 0.5);
      userZoomRatioRef.current = newScale / initialScale;
      return newScale;
    });
  };

  const handleZoomReset = () => {
    setScale(initialScale);
    userZoomRatioRef.current = 1.0;
  };

  const handleScaleChange = (event, newValue) => {
    setScale(newValue);
    userZoomRatioRef.current = newValue / initialScale;
  };

  const handleInitialZoomChange = (event, newValue) => {
    const zoomPercent = typeof newValue === 'number' ? newValue : parseFloat(newValue);
    setInitialZoomPercent(zoomPercent);
    savePdfInitialZoom(zoomPercent);
  };

  const handleInitialZoomInputChange = (event) => {
    const value = parseFloat(event.target.value);
    if (!isNaN(value) && value >= 10 && value <= 200) {
      setInitialZoomPercent(value);
      savePdfInitialZoom(value);
    }
  };

  const handleGridModeChange = (event) => {
    const enabled = event.target.checked;
    setGridMode(enabled);
    savePdfGridMode(enabled);
  };

  const handlePersistZoomChange = (event) => {
    const enabled = event.target.checked;
    setPersistZoom(enabled);
    savePdfPersistZoom(enabled);
  };

  const handleGridColumnsChange = (event, newValue) => {
    const columns = typeof newValue === 'number' ? newValue : parseInt(newValue, 10);
    if (!isNaN(columns) && columns >= 1 && columns <= 10) {
      setGridColumns(columns);
      savePdfGridColumns(columns);
    }
  };

  const handleGridColumnsInputChange = (event) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 10) {
      setGridColumns(value);
      savePdfGridColumns(value);
    }
  };

  const handleScrollToPage = (pageNum) => {
    const pageElement = pageRefs.current[pageNum];
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePreviousPage = () => {
    // Find current visible page and scroll to previous
    const container = containerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    let currentPage = 1;
    
    // Find which page is currently most visible
    for (let i = 1; i <= numPages; i++) {
      const pageElement = pageRefs.current[i];
      if (pageElement) {
        const rect = pageElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top <= containerRect.top + containerRect.height / 2) {
          currentPage = i;
        }
      }
    }
    
    if (currentPage > 1) {
      handleScrollToPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    // Find current visible page and scroll to next
    const container = containerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    let currentPage = 1;
    
    // Find which page is currently most visible
    for (let i = 1; i <= numPages; i++) {
      const pageElement = pageRefs.current[i];
      if (pageElement) {
        const rect = pageElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top <= containerRect.top + containerRect.height / 2) {
          currentPage = i;
        }
      }
    }
    
    if (currentPage < numPages) {
      handleScrollToPage(currentPage + 1);
    }
  };


  // Check if we have either fileUrl or assignmentId + submissionId
  const hasFileUrl = !!fileUrl;
  const hasIds = selectedAssignment?.id && selectedSubmission?.id;
  
  if (!hasFileUrl && !hasIds) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">No PDF selected</Typography>
      </Paper>
    );
  }

  if (loading || waitingForCache) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <Typography>
          {waitingForCache 
            ? `Waiting for PDF to cache... (${cachingProgress.current}/${cachingProgress.total})`
            : 'Loading PDF...'}
        </Typography>
        {waitingForCache && cachingProgress.isCaching && (
          <Box sx={{ width: '300px' }}>
            <Slider
              value={(cachingProgress.total > 0 ? (cachingProgress.current / cachingProgress.total) * 100 : 0)}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value)}%`}
              disabled
            />
          </Box>
        )}
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="error">Error loading PDF: {error}</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', flex: 1, minHeight: 0 }}>
      {/* Student Selector */}
      <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <StudentSelector />
      </Box>
      
      {/* Controls */}
      <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {/* Navigation */}
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Previous submission">
            <span>
              <IconButton size="small" onClick={onPrevious} disabled={!hasPrevious}>
                <NavigateBefore />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Next submission">
            <span>
              <IconButton size="small" onClick={onNext} disabled={!hasNext}>
                <NavigateNext />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Page navigation */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" onClick={handlePreviousPage}>
            <NavigateBefore />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>
            {numPages} {numPages === 1 ? 'page' : 'pages'}
          </Typography>
          <IconButton size="small" onClick={handleNextPage}>
            <NavigateNext />
          </IconButton>
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Zoom controls */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 200 }}>
          <Tooltip title="Zoom out">
            <IconButton size="small" onClick={handleZoomOut}>
              <ZoomOut />
            </IconButton>
          </Tooltip>
          <Slider
            value={scale}
            onChange={handleScaleChange}
            min={initialScale * 0.5}
            max={initialScale * 3.0}
            step={initialScale * 0.1}
            sx={{ width: 100 }}
            size="small"
          />
          <Tooltip title="Zoom in">
            <IconButton size="small" onClick={handleZoomIn}>
              <ZoomIn />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset zoom">
            <IconButton size="small" onClick={handleZoomReset}>
              <ZoomOutMap />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" sx={{ minWidth: 50 }}>
            {Math.round((scale / initialScale) * 100)}%
          </Typography>
          <Tooltip title="Zoom settings">
            <IconButton size="small" onClick={() => setShowZoomSettings(!showZoomSettings)}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Initial Zoom Settings */}
      <Collapse in={showZoomSettings}>
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', backgroundColor: 'grey.50' }}>
          <Stack spacing={1}>
            <Typography variant="body2" fontWeight="medium">
              Initial Page Zoom
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Slider
                value={initialZoomPercent}
                onChange={handleInitialZoomChange}
                min={10}
                max={200}
                step={5}
                sx={{ flex: 1 }}
                size="small"
              />
              <TextField
                type="number"
                value={initialZoomPercent}
                onChange={handleInitialZoomInputChange}
                inputProps={{ min: 10, max: 200, step: 5 }}
                sx={{ width: 80 }}
                size="small"
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Sets the initial width of PDF pages relative to the viewer (default: 90%)
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={gridMode}
                  onChange={handleGridModeChange}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  Grid Mode
                </Typography>
              }
            />
            {gridMode && (
              <Stack spacing={1}>
                <Typography variant="body2" fontWeight="medium">
                  Pages Across
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Slider
                    value={gridColumns}
                    onChange={handleGridColumnsChange}
                    min={1}
                    max={10}
                    step={1}
                    sx={{ flex: 1 }}
                    size="small"
                  />
                  <TextField
                    type="number"
                    value={gridColumns}
                    onChange={handleGridColumnsInputChange}
                    inputProps={{ min: 1, max: 10, step: 1 }}
                    sx={{ width: 80 }}
                    size="small"
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Number of pages to display across. Zoom will be adjusted to fit.
                </Typography>
              </Stack>
            )}
            {!gridMode && (
              <Typography variant="caption" color="text.secondary">
                Display pages in a grid layout. Zoom will be adjusted to fit the specified number of pages across.
              </Typography>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={persistZoom}
                  onChange={handlePersistZoomChange}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  Persist Zoom
                </Typography>
              }
            />
            <Typography variant="caption" color="text.secondary">
              Keep zoom level when switching between students
            </Typography>
          </Stack>
        </Box>
      </Collapse>

      {/* PDF Canvas Container */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: gridMode ? 'row' : 'column',
          flexWrap: gridMode ? 'wrap' : 'nowrap',
          alignItems: 'flex-start',
          justifyContent: gridMode ? 'center' : 'flex-start',
          alignContent: gridMode ? 'flex-start' : 'stretch',
          pt: 2,
          px: 2,
          pb: 2,
          backgroundColor: 'grey.200',
          gap: gridMode ? 1 : 0, // 1 = 8px gap in grid mode
          position: 'relative',
        }}
      >
        {Array.from({ length: numPages }, (_, i) => {
          const pageNum = i + 1;
          return (
            <Box
              key={pageNum}
              ref={(el) => {
                if (el) pageRefs.current[pageNum] = el;
              }}
              sx={{
                mb: gridMode ? 0 : 2,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                width: gridMode ? `calc((100% - ${(gridColumns - 1) * 8}px) / ${gridColumns})` : '100%',
                flexShrink: 0,
                '&:last-child': {
                  mb: 0,
                },
              }}
            >
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current[pageNum] = el;
                }}
                style={{
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  display: 'block',
                  maxWidth: gridMode ? '100%' : '100%',
                  height: 'auto',
                  margin: '0 auto',
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

export default PDFViewer;

