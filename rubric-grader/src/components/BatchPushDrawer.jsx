import { useEffect, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  LinearProgress,
  Paper,
  Stack,
  Chip,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  CloudUpload,
  ExpandLess,
  ExpandMore,
  Close,
} from '@mui/icons-material';
import useCanvasStore from '../store/canvasStore';

const BatchPushDrawer = () => {
  const pushingGrades = useCanvasStore((state) => state.pushingGrades);
  const error = useCanvasStore((state) => state.error);
  const selectedAssignment = useCanvasStore((state) => state.selectedAssignment);
  const stagedGrades = useCanvasStore((state) => state.stagedGrades);

  const [open, setOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('preparing'); // preparing, uploading, completed, failed
  const [totalGrades, setTotalGrades] = useState(0);
  const [completedGrades, setCompletedGrades] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  // Open drawer when pushing starts
  useEffect(() => {
    if (pushingGrades) {
      setOpen(true);
      setStatus('preparing');
      setProgress(0);
      setShowSuccess(false);

      // Get total number of grades to push
      const assignmentId = selectedAssignment?.id;
      if (assignmentId && stagedGrades[assignmentId]) {
        const count = Object.keys(stagedGrades[assignmentId]).length;
        setTotalGrades(count);
        setCompletedGrades(0);
      }

      // Simulate progress for preparing phase
      setTimeout(() => {
        setStatus('uploading');
        setProgress(10);
      }, 300);

      // Simulate incremental progress (since Canvas API doesn't provide real-time updates)
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) {
            return prev + 5;
          }
          return prev;
        });
      }, 500);

      return () => clearInterval(interval);
    } else if (open && !error) {
      // Pushing completed successfully
      setProgress(100);
      setStatus('completed');
      setCompletedGrades(totalGrades);
      setShowSuccess(true);

      // Auto-close after 3 seconds
      setTimeout(() => {
        setOpen(false);
        setShowSuccess(false);
      }, 3000);
    } else if (open && error) {
      // Pushing failed
      setStatus('failed');
      setProgress(0);
    }
  }, [pushingGrades, error, open, selectedAssignment, stagedGrades, totalGrades]);

  const handleClose = () => {
    if (!pushingGrades) {
      setOpen(false);
      setShowSuccess(false);
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'preparing':
        return 'Preparing grades for upload...';
      case 'uploading':
        return `Uploading ${totalGrades} grade${totalGrades !== 1 ? 's' : ''} to Canvas...`;
      case 'completed':
        return `Successfully uploaded ${completedGrades} grade${completedGrades !== 1 ? 's' : ''}!`;
      case 'failed':
        return 'Upload failed';
      default:
        return 'Processing...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'primary';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle sx={{ fontSize: 28, color: 'success.main' }} />;
      case 'failed':
        return <ErrorIcon sx={{ fontSize: 28, color: 'error.main' }} />;
      default:
        return <CloudUpload sx={{ fontSize: 28, color: 'primary.main' }} />;
    }
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={handleClose}
      hideBackdrop={true}
      variant="persistent"
      sx={{
        zIndex: 1300,
        '& .MuiDrawer-paper': {
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 3,
          pb: 2,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 1))',
        }}
      >
        <Stack spacing={2}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: status === 'completed'
                  ? 'success.lighter'
                  : status === 'failed'
                  ? 'error.lighter'
                  : 'primary.lighter',
              }}
            >
              {getStatusIcon()}
            </Box>

            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight="600">
                {getStatusMessage()}
              </Typography>
              {status === 'uploading' && (
                <Typography variant="body2" color="text.secondary">
                  Please wait while we sync your grades to Canvas...
                </Typography>
              )}
              {status === 'completed' && (
                <Typography variant="body2" color="success.main" fontWeight="500">
                  All grades have been posted to Canvas
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {totalGrades > 0 && (
                <Chip
                  label={`${completedGrades}/${totalGrades}`}
                  color={getStatusColor()}
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              )}

              {status !== 'uploading' && (
                <IconButton
                  size="small"
                  onClick={handleClose}
                  sx={{ ml: 1 }}
                >
                  <Close />
                </IconButton>
              )}
            </Box>
          </Box>

          {/* Progress Bar */}
          {(status === 'preparing' || status === 'uploading') && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 4,
                    background: 'linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)',
                  },
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {Math.round(progress)}% complete
                </Typography>
                {status === 'uploading' && (
                  <Typography variant="caption" color="text.secondary">
                    This may take a few moments...
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          {/* Success Message */}
          {showSuccess && status === 'completed' && (
            <Alert
              severity="success"
              sx={{
                borderRadius: 2,
                '& .MuiAlert-icon': {
                  fontSize: 24,
                },
              }}
            >
              <Typography variant="body2" fontWeight="500">
                Grades successfully posted! Students will receive notifications if enabled in Canvas.
              </Typography>
            </Alert>
          )}

          {/* Error Message */}
          {status === 'failed' && error && (
            <Alert
              severity="error"
              sx={{
                borderRadius: 2,
                '& .MuiAlert-icon': {
                  fontSize: 24,
                },
              }}
            >
              <Typography variant="body2" fontWeight="500">
                {error}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Please try again or contact support if the issue persists.
              </Typography>
            </Alert>
          )}

          {/* Expandable Details */}
          {totalGrades > 0 && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  py: 1,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                  borderRadius: 1,
                  px: 1,
                  mx: -1,
                }}
                onClick={() => setDetailsExpanded(!detailsExpanded)}
              >
                <Typography variant="body2" fontWeight="500" color="text.secondary">
                  Upload Details
                </Typography>
                {detailsExpanded ? <ExpandLess /> : <ExpandMore />}
              </Box>

              <Collapse in={detailsExpanded}>
                <List dense sx={{ bgcolor: 'action.hover', borderRadius: 2, py: 1 }}>
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <CheckCircle sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Grades posted"
                      secondary={`${totalGrades} student${totalGrades !== 1 ? 's' : ''}`}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <CheckCircle sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Feedback comments included"
                      secondary="Generated from rubric selections"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <CheckCircle sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Assignment"
                      secondary={selectedAssignment?.name || 'Unknown'}
                    />
                  </ListItem>
                </List>
              </Collapse>
            </>
          )}
        </Stack>
      </Paper>
    </Drawer>
  );
};

export default BatchPushDrawer;
