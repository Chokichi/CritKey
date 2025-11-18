import { useState, useMemo } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Chip,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  ListSubheader,
} from '@mui/material';
import {
  CheckCircle,
  RadioButtonUnchecked,
  CloudUpload,
} from '@mui/icons-material';
import useCanvasStore from '../store/canvasStore';

const StudentSelector = () => {
  // Use granular selectors to minimize re-renders
  const submissions = useCanvasStore((state) => state.submissions);
  const allSubmissions = useCanvasStore((state) => state.allSubmissions);
  const selectedSubmission = useCanvasStore((state) => state.selectedSubmission);
  const submissionIndex = useCanvasStore((state) => state.submissionIndex);
  const selectSubmissionByIndex = useCanvasStore((state) => state.selectSubmissionByIndex);
  const sortBy = useCanvasStore((state) => state.sortBy);
  const setSortBy = useCanvasStore((state) => state.setSortBy);
  const stagedGrades = useCanvasStore((state) => state.stagedGrades);
  const selectedAssignment = useCanvasStore((state) => state.selectedAssignment);
  const pushAllStagedGrades = useCanvasStore((state) => state.pushAllStagedGrades);
  const pushingGrades = useCanvasStore((state) => state.pushingGrades);
  
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Memoize expensive computations
  const dropdownSubmissions = useMemo(() => {
    return allSubmissions.length > 0 ? allSubmissions : submissions;
  }, [allSubmissions, submissions]);

  // Group and sort submissions for dropdown
  const groupedSubmissions = useMemo(() => {
    const ungraded = [];
    const graded = [];

    dropdownSubmissions.forEach(sub => {
      const needsGrading = !sub.isGraded || sub.isAutoGradedZero;
      if (needsGrading) {
        ungraded.push(sub);
      } else {
        graded.push(sub);
      }
    });

    // Sort each group alphabetically by student name
    const sortByName = (a, b) => {
      const nameA = (a.user?.sortable_name || a.user?.name || '').toLowerCase();
      const nameB = (b.user?.sortable_name || b.user?.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    };

    ungraded.sort(sortByName);
    graded.sort(sortByName);

    return { ungraded, graded };
  }, [dropdownSubmissions]);

  const stagedCount = useMemo(() => {
    return selectedAssignment
      ? Object.keys(stagedGrades[selectedAssignment.id] || {}).length
      : 0;
  }, [selectedAssignment, stagedGrades]);

  if (!dropdownSubmissions || dropdownSubmissions.length === 0) {
    return null;
  }

  const handleSubmissionChange = (event) => {
    const submissionId = event.target.value;
    // Find the submission in the filtered list
    const index = submissions.findIndex(sub => 
      String(sub.user_id || sub.id) === String(submissionId)
    );
    if (index >= 0) {
      selectSubmissionByIndex(index);
    } else {
      // If not found in filtered list, find in allSubmissions and select by ID
      const allIndex = allSubmissions.findIndex(sub => 
        String(sub.user_id || sub.id) === String(submissionId)
      );
      if (allIndex >= 0) {
        // Change sort to 'all' to show this submission, then select it
        setSortBy('all');
        // Wait for sort to apply, then select
        setTimeout(() => {
          const currentState = useCanvasStore.getState();
          const newIndex = currentState.submissions.findIndex(sub => 
            String(sub.user_id || sub.id) === String(submissionId)
          );
          if (newIndex >= 0) {
            currentState.selectSubmissionByIndex(newIndex);
          }
        }, 0);
      }
    }
  };

  const handleSortChange = (event, newSort) => {
    if (newSort !== null) {
      setSortBy(newSort);
    }
  };

  const handlePushGrades = () => {
    // Show confirmation dialog first
    setConfirmDialogOpen(true);
  };

  const handleConfirmPush = async () => {
    setConfirmDialogOpen(false);
    try {
      await pushAllStagedGrades();
    } catch (error) {
      console.error('Error pushing grades:', error);
    }
  };

  const handleCancelPush = () => {
    setConfirmDialogOpen(false);
  };

  const getStudentName = (submission) => {
    return submission.user?.name || submission.user?.sortable_name || `Student ${submission.user_id || submission.id}`;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 250, flex: 1 }}>
          <InputLabel id="student-select-label">Select Student</InputLabel>
          <Select
            labelId="student-select-label"
            id="student-select"
            value={selectedSubmission ? String(selectedSubmission.user_id || selectedSubmission.id) : ''}
            label="Select Student"
            onChange={handleSubmissionChange}
          >
            {/* Ungraded Section */}
            {groupedSubmissions.ungraded.length > 0 && (
              <ListSubheader sx={{ backgroundColor: 'background.paper', fontWeight: 'bold' }}>
                Ungraded ({groupedSubmissions.ungraded.length})
              </ListSubheader>
            )}
            {groupedSubmissions.ungraded.map((sub) => {
              const submissionId = String(sub.user_id || sub.id);
              const isSelected = selectedSubmission &&
                String(selectedSubmission.user_id || selectedSubmission.id) === submissionId;

              return (
                <MenuItem key={submissionId} value={submissionId}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <RadioButtonUnchecked sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {getStudentName(sub)}
                    </Typography>
                    {sub.isLate && (
                      <Chip
                        label="Late"
                        size="small"
                        color="error"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    {sub.isAutoGradedZero && (
                      <Chip
                        label="Auto 0"
                        size="small"
                        color="warning"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    {sub.stagedGrade && (
                      <Chip
                        label="Staged"
                        size="small"
                        color="warning"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>
                </MenuItem>
              );
            })}

            {/* Graded Section */}
            {groupedSubmissions.graded.length > 0 && (
              <ListSubheader sx={{ backgroundColor: 'background.paper', fontWeight: 'bold' }}>
                Graded ({groupedSubmissions.graded.length})
              </ListSubheader>
            )}
            {groupedSubmissions.graded.map((sub) => {
              const submissionId = String(sub.user_id || sub.id);
              const isSelected = selectedSubmission &&
                String(selectedSubmission.user_id || selectedSubmission.id) === submissionId;

              return (
                <MenuItem key={submissionId} value={submissionId}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <CheckCircle color="success" sx={{ fontSize: 18 }} />
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {getStudentName(sub)}
                    </Typography>
                    {sub.isLate && (
                      <Chip
                        label="Late"
                        size="small"
                        color="error"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    {sub.stagedGrade && (
                      <Chip
                        label="Staged"
                        size="small"
                        color="warning"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    {sub.canvasGrade && !sub.stagedGrade && (
                      <Chip
                        label={sub.canvasGrade}
                        size="small"
                        color="success"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        <ToggleButtonGroup
          value={sortBy}
          exclusive
          onChange={handleSortChange}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="ungraded">Ungraded</ToggleButton>
          <ToggleButton value="graded">Graded</ToggleButton>
        </ToggleButtonGroup>

        {stagedCount > 0 && (
          <Tooltip title={`Push ${stagedCount} staged grade${stagedCount !== 1 ? 's' : ''} to Canvas`}>
            <span>
              <IconButton
                color="primary"
                onClick={handlePushGrades}
                disabled={pushingGrades}
                size="small"
              >
                <CloudUpload />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>

      {stagedCount > 0 && (
        <Typography variant="caption" color="text.secondary">
          {stagedCount} grade{stagedCount !== 1 ? 's' : ''} staged. Click upload to push to Canvas.
        </Typography>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelPush}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
      >
        <DialogTitle>
          Confirm Push Grades to Canvas
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="medium">
              This action will post grades and feedback comments to Canvas for {stagedCount} student{stagedCount !== 1 ? 's' : ''}.
            </Typography>
          </Alert>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Pushing staged grades will:
            </Typography>
            <Box component="ul" sx={{ marginTop: 1, marginBottom: 1, paddingLeft: 3 }}>
              <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Post the grade for each student
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Post the feedback comment for each student
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Send notifications to students (if Canvas notifications are enabled)
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              This action cannot be undone. Are you sure you want to proceed?
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelPush} disabled={pushingGrades}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmPush}
            variant="contained"
            color="primary"
            disabled={pushingGrades}
          >
            {pushingGrades ? 'Pushing...' : `Push ${stagedCount} Grade${stagedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StudentSelector;

