import { useState } from 'react';
import {
  Box,
  Paper,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Alert,
  Menu,
  MenuItem,
  ListItemText,
  Divider,
  IconButton,
  ButtonGroup,
  Snackbar,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  KeyboardArrowDown as ArrowDownIcon,
} from '@mui/icons-material';
import { useHotkeys } from 'react-hotkeys-hook';
import useRubricStore from '../store/rubricStore';
import useCanvasStore from '../store/canvasStore';
import { generateFeedbackText } from '../utils/csvParser';
import { saveFeedbackToHistory, getFeedbackHistory } from '../utils/localStorage';

const FeedbackGenerator = () => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState(null);
  const [feedbackHistory, setFeedbackHistory] = useState([]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [submittingToCanvas, setSubmittingToCanvas] = useState(false);
  
  const { currentRubric, getTotalPoints, resetGrading } = useRubricStore();
  const { selectedSubmission, submitGrade, nextSubmission } = useCanvasStore();

  const loadFeedbackHistory = () => {
    setFeedbackHistory(getFeedbackHistory());
  };

  const handleGenerate = async ({ showModal }) => {
    if (!currentRubric) return;

    const text = generateFeedbackText(currentRubric);
    setFeedbackText(text);
    setCopied(false);

    if (showModal) {
      setOpen(true);
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (!showModal) {
        setSnackbarOpen(true);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }

    const label = currentRubric.feedbackLabel?.trim();
    const historyLabel = label || currentRubric.name;

    saveFeedbackToHistory(text, currentRubric.name, historyLabel);
    loadFeedbackHistory();
  };

  const handleGenerateWithModal = () => handleGenerate({ showModal: true });
  const handleGenerateHotkey = () => handleGenerate({ showModal: false });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(feedbackText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleReset = () => {
    if (window.confirm('Reset all selections and comments for the next assignment?')) {
      resetGrading();
    }
  };

  const handleHistoryMenuOpen = (event) => {
    loadFeedbackHistory();
    setHistoryMenuAnchor(event.currentTarget);
  };

  const handleHistoryMenuClose = () => {
    setHistoryMenuAnchor(null);
  };

  const handleHistoryItemClick = async (feedback) => {
    setFeedbackText(feedback.text);
    setOpen(true);
    setCopied(false);
    handleHistoryMenuClose();
    
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(feedback.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSubmitToCanvas = async () => {
    if (!selectedSubmission || !currentRubric) {
      return;
    }

    setSubmittingToCanvas(true);
    try {
      const { earned, possible } = getTotalPoints();
      const feedback = feedbackText || generateFeedbackText(currentRubric);
      
      await submitGrade(`${earned}/${possible}`, feedback);
      
      // Show success message
      setSnackbarOpen(true);
      
      // Auto-advance to next submission after a short delay
      setTimeout(() => {
        nextSubmission();
        resetGrading();
      }, 1000);
    } catch (error) {
      console.error('Failed to submit to Canvas:', error);
      alert(`Failed to submit grade to Canvas: ${error.message}`);
    } finally {
      setSubmittingToCanvas(false);
    }
  };

  // Ctrl/Cmd + Enter to generate feedback
  useHotkeys('ctrl+enter, meta+enter', () => {
    if (currentRubric && !open) {
      handleGenerateHotkey();
    }
  }, [currentRubric, open]);

  // Ctrl/Cmd + R to reset
  useHotkeys('ctrl+r, meta+r', (e) => {
    if (currentRubric) {
      e.preventDefault();
      handleReset();
    }
  }, [currentRubric]);

  if (!currentRubric) {
    return null;
  }

  const { earned, possible } = getTotalPoints();
  const allSelected = currentRubric.criteria.every(
    (c) => c.selectedLevel !== null && c.selectedLevel !== undefined
  );

  return (
    <>
      <Paper sx={{ p: 2, mt: 2 }}>
        <Stack spacing={2}>
          {!allSelected && (
            <Alert severity="warning">
              Some criteria have not been graded yet
            </Alert>
          )}
          <Stack direction="row" spacing={1}>
            <ButtonGroup variant="contained" size="large" sx={{ flex: 1 }}>
              <Button
                onClick={handleGenerateWithModal}
                disabled={earned === 0 && possible === 0}
                sx={{ flex: 1 }}
              >
                Generate Feedback (Ctrl+Enter)
              </Button>
              <Button
                onClick={handleHistoryMenuOpen}
                disabled={earned === 0 && possible === 0}
                sx={{ 
                  minWidth: 'auto',
                  px: 1,
                }}
              >
                <ArrowDownIcon />
              </Button>
            </ButtonGroup>
            <IconButton
              onClick={handleReset}
              color="primary"
              sx={{ 
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
              }}
              title="Reset for next assignment (Ctrl+R)"
            >
              <RefreshIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Paper>

      {/* Feedback History Menu */}
      <Menu
        anchorEl={historyMenuAnchor}
        open={Boolean(historyMenuAnchor)}
        onClose={handleHistoryMenuClose}
        PaperProps={{
          sx: { maxWidth: 400, maxHeight: 400 },
        }}
      >
        <MenuItem disabled>
          <Typography variant="subtitle2" fontWeight="bold">
            Recent Feedback (Last 5)
          </Typography>
        </MenuItem>
        <Divider />
        {feedbackHistory.length === 0 ? (
          <MenuItem disabled>
            <ListItemText primary="No feedback history yet" />
          </MenuItem>
        ) : (
          feedbackHistory.map((feedback) => (
            <MenuItem
              key={feedback.id}
              onClick={() => handleHistoryItemClick(feedback)}
              sx={{ whiteSpace: 'normal' }}
            >
              <ListItemText
                primary={feedback.label || feedback.rubricName}
                secondary={
                  <>
                    <Typography variant="caption" component="span" display="block">
                      {new Date(feedback.timestamp).toLocaleString()}
                    </Typography>
                    {feedback.label && feedback.label !== feedback.rubricName && (
                      <Typography variant="caption" component="span" display="block">
                        Rubric: {feedback.rubricName}
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 300,
                        mt: 0.5,
                      }}
                    >
                      {feedback.text.substring(0, 100)}...
                    </Typography>
                  </>
                }
              />
            </MenuItem>
          ))
        )}
      </Menu>

      <Dialog
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography component="span">Generated Feedback</Typography>
            {copied && (
              <CheckIcon
                sx={{
                  color: 'success.main',
                }}
              />
            )}
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              (Auto-copied to clipboard)
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={15}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            variant="outlined"
            sx={{
              '& .MuiInputBase-root': {
                fontFamily: 'monospace',
                fontSize: '0.9rem',
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>
            Close
          </Button>
          <Button
            variant="outlined"
            startIcon={copied ? <CheckIcon /> : <CopyIcon />}
            onClick={handleCopy}
            color={copied ? 'success' : 'primary'}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </Button>
          {selectedSubmission && (
            <Button
              variant="contained"
              onClick={handleSubmitToCanvas}
              disabled={submittingToCanvas}
              color="success"
            >
              {submittingToCanvas ? 'Submitting...' : 'Submit to Canvas'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2500}
        onClose={() => setSnackbarOpen(false)}
        message="Feedback copied to clipboard"
      />
    </>
  );
};

export default FeedbackGenerator;

