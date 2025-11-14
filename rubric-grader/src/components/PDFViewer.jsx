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
import { getPdfInitialZoom, savePdfInitialZoom, getPdfGridMode, savePdfGridMode, getPdfGridColumns, savePdfGridColumns } from '../utils/localStorage';

// Configure PDF.js worker to use local bundled file
GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const PDFViewer = ({ fileUrl, apiToken, onNext, onPrevious, hasNext, hasPrevious }) => {
  const { offlineMode, cachingProgress } = useCanvasStore();
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [initialScale, setInitialScale] = useState(1.0);
  const [initialZoomPercent, setInitialZoomPercent] = useState(() => getPdfInitialZoom());
  const [gridMode, setGridMode] = useState(() => getPdfGridMode());
  const [gridColumns, setGridColumns] = useState(() => getPdfGridColumns());
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
  const currentFileUrlRef = useRef(null);
  const previousPdfDocRef = useRef(null);
  const userZoomRatioRef = useRef(1.0); // Track user's zoom relative to initial scale
  const previousInitialScaleRef = useRef(1.0);
  const pageRefs = useRef({});

  // Load PDF document
  useEffect(() => {
    if (!fileUrl) {
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

    // Reset loaded state when fileUrl changes
    setPdfLoaded(false);
    setLoading(true);
    setError(null);
    
    // Update the ref to track current fileUrl
    currentFileUrlRef.current = fileUrl;

    const loadPdf = async () => {
      // Store the current fileUrl to check if it changed during loading
      const currentFileUrl = fileUrl;
      
      try {
        let pdfSource;

        // Try to load from cache first
        let cachedBlob = await getCachedPdf(currentFileUrl);
        
        // If not found and we're in offline mode, wait for caching to complete
        if (!cachedBlob && offlineMode) {
          // Check if caching is in progress
          const currentProgress = useCanvasStore.getState().cachingProgress;
          if (currentProgress.isCaching) {
            setWaitingForCache(true);
            // Poll for the PDF to be cached (check every 500ms)
            const maxWaitTime = 60000; // 60 seconds max
            const startTime = Date.now();
            const pollInterval = 500;
            
            while (!cachedBlob && (Date.now() - startTime) < maxWaitTime) {
              // Check if fileUrl changed (user switched to different PDF)
              if (currentFileUrl !== currentFileUrlRef.current) {
                return; // Abort loading
              }
              
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              cachedBlob = await getCachedPdf(currentFileUrl);
              
              // Check current caching progress from store
              const progress = useCanvasStore.getState().cachingProgress;
              // If caching completed but PDF still not found, break
              if (!progress.isCaching && !cachedBlob) {
                break;
              }
              
              // If we found the cached PDF, break immediately
              if (cachedBlob) {
                break;
              }
            }
            
            setWaitingForCache(false);
          }
          
          // If still not cached after waiting, show error
          if (!cachedBlob) {
            // Check if fileUrl changed before throwing error
            if (currentFileUrl !== currentFileUrlRef.current) {
              return; // Abort loading
            }
            throw new Error('PDF not cached. Please wait for caching to complete or enable online mode.');
          }
        }
        
        // Check if fileUrl changed before proceeding
        if (currentFileUrl !== currentFileUrlRef.current) {
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
          const url = apiToken 
            ? `http://localhost:3001/api/proxy-file?url=${encodeURIComponent(currentFileUrl)}&apiToken=${encodeURIComponent(apiToken)}`
            : currentFileUrl;
          pdfSource = { url, withCredentials: false };
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

    // Cleanup: clear any polling intervals and cancel renders/loads when component unmounts or fileUrl changes
    return () => {
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
  }, [fileUrl, apiToken, offlineMode]); // Removed cachingProgress dependencies to prevent constant re-renders

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
          const gap = 16; // Gap between pages in grid
          const columns = Math.max(1, gridColumns); // Ensure at least 1 column
          
          // Calculate column width (accounting for gaps)
          const columnWidth = (availableWidth - (columns - 1) * gap) / columns;
          
          // Calculate scale so each page fits in its column
          // Use the initial zoom percentage to determine the target page width within the column
          const targetPageWidth = columnWidth * zoomFactor;
          const fitScale = targetPageWidth / pageWidth;
          
          const isNewPdf = previousPdfDocRef.current !== pdfDoc;
          previousPdfDocRef.current = pdfDoc;
          
          if (isNewPdf) {
            setInitialScale(fitScale);
            setScale(fitScale);
            userZoomRatioRef.current = 1.0;
            previousInitialScaleRef.current = fitScale;
          } else {
            const prevInitial = previousInitialScaleRef.current || 1.0;
            const zoomRatio = userZoomRatioRef.current;
            setInitialScale(fitScale);
            setScale(fitScale * zoomRatio);
            previousInitialScaleRef.current = fitScale;
          }
        } else {
          // Vertical mode - original behavior
          const availableWidth = containerRect.width * zoomFactor;
          const fitScale = availableWidth / viewport.width;
          
          const isNewPdf = previousPdfDocRef.current !== pdfDoc;
          previousPdfDocRef.current = pdfDoc;
          
          if (isNewPdf) {
            setInitialScale(fitScale);
            setScale(fitScale);
            userZoomRatioRef.current = 1.0;
            previousInitialScaleRef.current = fitScale;
          } else {
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
  }, [pdfDoc, initialZoomPercent, gridMode, gridColumns]);

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


  if (!fileUrl) {
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
          justifyContent: gridMode ? 'center' : 'center',
          alignContent: gridMode ? 'flex-start' : 'stretch',
          p: 2,
          backgroundColor: 'grey.200',
          gap: gridMode ? 2 : 0,
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
                ...(gridMode && {
                  width: `calc((100% - ${(gridColumns - 1) * 16}px) / ${gridColumns})`,
                  flexShrink: 0,
                }),
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
                  maxWidth: gridMode ? '100%' : 'none',
                  height: gridMode ? 'auto' : 'auto',
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

