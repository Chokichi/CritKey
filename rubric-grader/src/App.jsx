import { useEffect, useState, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  Box,
  Typography,
  Paper,
  Stack,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { Keyboard as KeyboardIcon } from '@mui/icons-material';
import useRubricStore from './store/rubricStore';
import useCanvasStore from './store/canvasStore';
import { useHotkeyConfig } from './hooks/useHotkeyConfig';
import SideDrawer from './components/SideDrawer';
import RubricDisplay from './components/RubricDisplay';
import FeedbackGenerator from './components/FeedbackGenerator';
import PDFViewer from './components/PDFViewer';
import DockableRubricWindow from './components/DockableRubricWindow';
import DockedRubricPanel from './components/DockedRubricPanel';
import TotalPoints from './components/TotalPoints';
import ShortcutsModal from './components/ShortcutsModal';
import { getRubricWindowState, saveRubricWindowState } from './utils/localStorage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  const initialize = useRubricStore((state) => state.initialize);
  const currentRubric = useRubricStore((state) => state.currentRubric);
  const currentCriterionIndex = useRubricStore((state) => state.currentCriterionIndex);
  const getTotalPoints = useRubricStore((state) => state.getTotalPoints);
  const goToNextCriterion = useRubricStore((state) => state.goToNextCriterion);
  const goToPreviousCriterion = useRubricStore((state) => state.goToPreviousCriterion);
  const autoAdvance = useRubricStore((state) => state.autoAdvance);
  const initializeCanvas = useCanvasStore((state) => state.initialize);
  const selectedSubmission = useCanvasStore((state) => state.selectedSubmission);
  const selectedAssignment = useCanvasStore((state) => state.selectedAssignment);
  const submissions = useCanvasStore((state) => state.submissions);
  const submissionIndex = useCanvasStore((state) => state.submissionIndex);
  const loadingSubmissions = useCanvasStore((state) => state.loadingSubmissions);
  const apiToken = useCanvasStore((state) => state.apiToken);
  const nextSubmission = useCanvasStore((state) => state.nextSubmission);
  const previousSubmission = useCanvasStore((state) => state.previousSubmission);
  
  const pdfViewerRef = useRef(null);
  const [rubricDocked, setRubricDocked] = useState(() => {
    const saved = getRubricWindowState();
    return saved?.docked || null;
  });
  const savedState = getRubricWindowState();
  const [rubricWidth, setRubricWidth] = useState(savedState?.size?.width || 600);
  const [rubricHeight, setRubricHeight] = useState(savedState?.size?.height || 600);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  
  // Handle undock
  const handleUndock = () => {
    setRubricDocked(null);
    // Save the undocked state
    const state = getRubricWindowState();
    if (state) {
      saveRubricWindowState({
        ...state,
        docked: null,
      });
    }
  };
  
  // Save width/height changes
  useEffect(() => {
    const state = getRubricWindowState();
    if (state) {
      saveRubricWindowState({
        ...state,
        size: { width: rubricWidth, height: rubricHeight },
      });
    } else {
      // Create initial state if none exists
      saveRubricWindowState({
        docked: rubricDocked,
        position: { x: 0, y: 0 },
        size: { width: rubricWidth, height: rubricHeight },
      });
    }
  }, [rubricWidth, rubricHeight, rubricDocked]);

  useEffect(() => {
    initialize();
    initializeCanvas();
  }, [initialize, initializeCanvas]);

  // Get PDF URL from submission
  // Check attachments array first, then fall back to submission_history if needed
  const getPdfUrl = (submission) => {
    if (!submission) return null;
    
    // Try attachments array first
    if (submission.attachments && submission.attachments.length > 0) {
      const pdfAttachment = submission.attachments.find(att => 
        att.content_type?.includes('pdf') || 
        att.filename?.toLowerCase().endsWith('.pdf') ||
        att.url
      ) || submission.attachments[0];
      return pdfAttachment?.url || null;
    }
    
    // Fall back to submission_history if attachments not in main object
    if (submission.submission_history && submission.submission_history.length > 0) {
      for (const historyItem of submission.submission_history) {
        if (historyItem.attachments && historyItem.attachments.length > 0) {
          const pdfAttachment = historyItem.attachments.find(att => 
            att.content_type?.includes('pdf') || 
            att.filename?.toLowerCase().endsWith('.pdf') ||
            att.url
          ) || historyItem.attachments[0];
          if (pdfAttachment?.url) {
            return pdfAttachment.url;
          }
        }
      }
    }
    
    return null;
  };
  
  const pdfUrl = getPdfUrl(selectedSubmission);

  // Get current criterion info for mini view
  const getCriterionInfo = () => {
    if (!currentRubric || !currentRubric.criteria) return null;

    const criterion = currentRubric.criteria[currentCriterionIndex];
    if (!criterion) return null;

    // Get earned points for current criterion
    const earnedPoints = criterion.selectedLevel !== null && criterion.selectedLevel !== undefined
      ? criterion.levels[criterion.selectedLevel]?.points || 0
      : 0;

    // Get max possible points for current criterion
    const possiblePoints = criterion.levels && criterion.levels.length > 0
      ? Math.max(...criterion.levels.map(l => Number(l.points) || 0))
      : 0;

    // Get total points for entire rubric
    const totalPoints = getTotalPoints();

    return {
      currentIndex: currentCriterionIndex,
      total: currentRubric.criteria.length,
      earned: earnedPoints,
      possible: possiblePoints,
      totalEarned: totalPoints.earned,
      totalPossible: totalPoints.possible,
    };
  };

  const criterionInfo = getCriterionInfo();

  const hotkeys = useHotkeyConfig();

  // Hotkeys for submission navigation
  useHotkeys(hotkeys.nextSubmission, (e) => {
    e.preventDefault();
    if (submissionIndex < submissions.length - 1) {
      nextSubmission();
    }
  }, [submissionIndex, submissions.length, nextSubmission, hotkeys.nextSubmission]);

  useHotkeys(hotkeys.previousSubmission, (e) => {
    e.preventDefault();
    if (submissionIndex > 0) {
      previousSubmission();
    }
  }, [submissionIndex, previousSubmission, hotkeys.previousSubmission]);

  // Hotkeys for criterion navigation (work even when rubric is collapsed)
  useHotkeys(hotkeys.nextCriterion, (e) => {
    // Only prevent default for arrow keys
    if (e?.key === 'ArrowRight') {
      e.preventDefault();
    }
    if (currentRubric) {
      const totalCriteria = currentRubric.criteria?.length || 0;
      if (currentCriterionIndex < totalCriteria - 1) {
        goToNextCriterion();
      }
    }
  }, { enableOnFormTags: false }, [currentRubric, currentCriterionIndex, goToNextCriterion, hotkeys.nextCriterion]);

  useHotkeys(hotkeys.previousCriterion, (e) => {
    // Only prevent default for arrow keys
    if (e?.key === 'ArrowLeft') {
      e.preventDefault();
    }
    if (currentRubric && currentCriterionIndex > 0) {
      goToPreviousCriterion();
    }
  }, { enableOnFormTags: false }, [currentRubric, currentCriterionIndex, goToPreviousCriterion, hotkeys.previousCriterion]);

  useHotkeys(hotkeys.nextCriterionSpace, (e) => {
    e.preventDefault();
    if (!autoAdvance && currentRubric) {
      const totalCriteria = currentRubric.criteria?.length || 0;
      if (currentCriterionIndex < totalCriteria - 1) {
        goToNextCriterion();
      }
    }
  }, { enabled: !autoAdvance, enableOnFormTags: false }, [autoAdvance, currentRubric, currentCriterionIndex, goToNextCriterion, hotkeys.nextCriterionSpace]);

  // Shortcuts modal hotkey
  useHotkeys(hotkeys.showShortcuts, (e) => {
    e.preventDefault();
    setShortcutsOpen(true);
  }, [hotkeys.showShortcuts]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box 
        sx={{ 
          height: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.default',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}
      >
        {/* Side Drawer */}
        <SideDrawer />

        {/* Header */}
        <Paper 
          elevation={0} 
          sx={{ 
            px: 2,
            py: 1,
            backgroundColor: 'grey.50',
            borderBottom: 1,
            borderColor: 'divider',
            zIndex: 100,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="h6" fontWeight="bold">
            CritKey Grader
          </Typography>
          <Tooltip title="Keyboard Shortcuts">
            <IconButton
              size="small"
              onClick={() => setShortcutsOpen(true)}
              sx={{ color: 'text.secondary' }}
            >
              <KeyboardIcon />
            </IconButton>
          </Tooltip>
        </Paper>

        {/* PDF Viewer and Rubric Layout */}
        <Stack
          direction={
            rubricDocked === 'left' || rubricDocked === 'right' ? 'row' : 'column'
          }
          sx={{
            flex: 1,
            minHeight: 0,
            maxHeight: '100%',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Left Docked Rubric */}
          {rubricDocked === 'left' && (
            <DockedRubricPanel
              docked="left"
              width={rubricWidth}
              height={rubricHeight}
              onWidthChange={setRubricWidth}
              onHeightChange={setRubricHeight}
              onUndock={handleUndock}
              criterionInfo={criterionInfo}
            >
              <TotalPoints />
              <RubricDisplay />
              <FeedbackGenerator />
            </DockedRubricPanel>
          )}

          {/* PDF Viewer */}
          <Box
            ref={pdfViewerRef}
            sx={{
              flex: 1,
              minHeight: 0,
              maxHeight: '100%',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Show PDFViewer if we have pdfUrl OR if we have a selected submission and assignment (for cache-only loading) */}
            {pdfUrl || (selectedSubmission && selectedAssignment) ? (
              <PDFViewer
                fileUrl={pdfUrl}
                apiToken={apiToken}
                onNext={nextSubmission}
                onPrevious={previousSubmission}
                hasNext={submissionIndex < submissions.length - 1}
                hasPrevious={submissionIndex > 0}
              />
            ) : loadingSubmissions && selectedAssignment ? (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'grey.100',
                  gap: 2,
                }}
              >
                <CircularProgress size={48} />
                <Typography variant="h6" color="text.secondary">
                  Loading submissions for {selectedAssignment.name}...
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'grey.100',
                }}
              >
                <Typography variant="h6" color="text.secondary">
                  No PDF selected. Select an assignment from Canvas to begin grading.
                </Typography>
              </Box>
            )}

            {/* Top Docked Rubric */}
            {rubricDocked === 'top' && (
              <DockedRubricPanel
                docked="top"
                width={rubricWidth}
                height={rubricHeight}
                onWidthChange={setRubricWidth}
                onHeightChange={setRubricHeight}
                onUndock={handleUndock}
                criterionInfo={criterionInfo}
              >
                <TotalPoints />
                <RubricDisplay />
                <FeedbackGenerator />
              </DockedRubricPanel>
            )}

            {/* Floating Rubric Window */}
            {!rubricDocked && (
              <DockableRubricWindow
                title="Rubric Grader"
                pdfViewerRef={pdfViewerRef}
                onDockChange={setRubricDocked}
                criterionInfo={criterionInfo}
              >
                <TotalPoints />
                <RubricDisplay />
                <FeedbackGenerator />
              </DockableRubricWindow>
            )}
          </Box>

          {/* Right Docked Rubric */}
          {rubricDocked === 'right' && (
            <DockedRubricPanel
              docked="right"
              width={rubricWidth}
              height={rubricHeight}
              onWidthChange={setRubricWidth}
              onHeightChange={setRubricHeight}
              onUndock={handleUndock}
              criterionInfo={criterionInfo}
            >
              <TotalPoints />
              <RubricDisplay />
              <FeedbackGenerator />
            </DockedRubricPanel>
          )}
        </Stack>

        {/* Keyboard Shortcuts Footer */}
        <Paper 
          elevation={0} 
          sx={{ 
            px: 2,
            py: 0.75, 
            backgroundColor: 'grey.50',
            borderTop: 1,
            borderColor: 'divider',
            zIndex: 100,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            Press <strong>?</strong> or click the <KeyboardIcon sx={{ fontSize: 14 }} /> icon for keyboard shortcuts
          </Typography>
        </Paper>

        {/* Shortcuts Modal */}
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </Box>
    </ThemeProvider>
  );
}

export default App;
