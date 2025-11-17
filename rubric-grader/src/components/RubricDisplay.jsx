import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Stack,
  Chip,
  Divider,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Collapse,
} from '@mui/material';
import {
  NavigateBefore,
  NavigateNext,
  Comment as CommentIcon,
  Add as AddIcon,
  Edit as EditIcon,
  ArrowUpward,
  ArrowDownward,
  Delete as DeleteIcon,
  DragIndicator,
} from '@mui/icons-material';
import { useHotkeys } from 'react-hotkeys-hook';
import useRubricStore from '../store/rubricStore';
import useCanvasStore from '../store/canvasStore';
import { renderTextWithLatex } from '../utils/latex.jsx';
import { useHotkeyConfig } from '../hooks/useHotkeyConfig';

const calculatePossiblePoints = (criteria = []) =>
  criteria.reduce((sum, criterion) => {
    if (!criterion?.levels?.length) return sum;
    const maxPoints = Math.max(
      ...criterion.levels.map((level) =>
        Number(level?.points) || 0
      )
    );
    return Number.isFinite(maxPoints) ? sum + maxPoints : sum;
  }, 0);

const cloneLevels = (levels = []) =>
  levels.map((level) => ({ ...level }));

const cloneCriteria = (criteria = []) =>
  criteria.map((criterion) => ({
    ...criterion,
    levels: Array.isArray(criterion.levels)
      ? criterion.levels.map((level) => ({ ...level }))
      : [],
  }));

const formatPoints = (points) => {
  const value = Number(points) || 0;
  return Number.isInteger(value) ? value : value.toFixed(2);
};

const RubricDisplay = () => {
  const {
    currentRubric,
    currentCriterionIndex,
    selectLevel,
    updateComment,
    goToNextCriterion,
    goToPreviousCriterion,
    goToCriterion,
    addLevel,
    updateLevel,
    deleteLevel,
    replaceCriteria,
    updateFeedbackLabel,
    autoAdvance,
    loadRubricForSubmission,
    saveRubricForSubmission,
    availableRubrics,
  } = useRubricStore();
  
  const {
    selectedSubmission,
    selectedAssignment,
  } = useCanvasStore();

  const [commentFocused, setCommentFocused] = useState(false);
  const commentRef = useRef(null);
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const [levelDialogMode, setLevelDialogMode] = useState('add');
  const [levelForm, setLevelForm] = useState({
    name: '',
    points: '',
    description: '',
  });
  const [levelFormError, setLevelFormError] = useState('');
  const [editingLevelIndex, setEditingLevelIndex] = useState(null);
  const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
  const [draftCriteria, setDraftCriteria] = useState([]);
  const [draggedCriterionIndex, setDraggedCriterionIndex] = useState(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [editingLevels, setEditingLevels] = useState({});
  const previousSubmissionRef = useRef(null);

  // Get criterion safely - will be null if no rubric
  const criterion = currentRubric?.criteria?.[currentCriterionIndex] || null;
  const totalCriteria = currentRubric?.criteria?.length || 0;

  // Sync rubric with selected submission
  useEffect(() => {
    if (!selectedSubmission || !selectedAssignment || availableRubrics.length === 0) {
      return;
    }

    const submissionId = String(selectedSubmission.user_id || selectedSubmission.id);
    const previousSubmissionId = previousSubmissionRef.current 
      ? String(previousSubmissionRef.current.user_id || previousSubmissionRef.current.id)
      : null;

    // Only reload if submission changed
    if (submissionId === previousSubmissionId) {
      return;
    }

    previousSubmissionRef.current = selectedSubmission;

    // Use the first available rubric (or current rubric if it exists)
    const baseRubric = currentRubric || availableRubrics[0];
    if (baseRubric) {
      loadRubricForSubmission(selectedAssignment.id, submissionId, baseRubric);
    }
  }, [selectedSubmission?.user_id, selectedSubmission?.id, selectedAssignment?.id, availableRubrics.length]);

  // Save rubric state when it changes
  useEffect(() => {
    if (!currentRubric || !selectedSubmission || !selectedAssignment) return;
    
    const submissionId = String(selectedSubmission.user_id || selectedSubmission.id);
    saveRubricForSubmission(selectedAssignment.id, submissionId);
  }, [currentRubric?.criteria, currentRubric?.feedbackLabel, selectedSubmission?.user_id, selectedAssignment?.id]);

  const currentTotalPossible = useMemo(
    () => calculatePossiblePoints(currentRubric?.criteria || []),
    [currentRubric]
  );

  const handleLevelSelect = (levelIndex) => {
    if (!currentRubric) return;
    selectLevel(currentCriterionIndex, levelIndex);
    // Save rubric state after selection
    if (selectedSubmission && selectedAssignment) {
      const submissionId = String(selectedSubmission.user_id || selectedSubmission.id);
      saveRubricForSubmission(selectedAssignment.id, submissionId);
    }
    // Auto-advance to next criterion after selection
    if (autoAdvance) {
      setTimeout(() => {
        if (currentCriterionIndex < totalCriteria - 1) {
          goToNextCriterion();
        }
      }, 150);
    }
  };

  const handleCommentChange = (e) => {
    if (!currentRubric) return;
    updateComment(currentCriterionIndex, e.target.value);
    // Save rubric state after comment change
    if (selectedSubmission && selectedAssignment) {
      const submissionId = String(selectedSubmission.user_id || selectedSubmission.id);
      saveRubricForSubmission(selectedAssignment.id, submissionId);
    }
  };

  const handleOpenAddLevelDialog = () => {
    setLevelDialogMode('add');
    setLevelForm({
      name: '',
      points: '',
      description: '',
    });
    setLevelFormError('');
    setEditingLevelIndex(null);
    setLevelDialogOpen(true);
  };

  const handleOpenEditLevelDialog = (index) => {
    if (!criterion?.levels?.[index]) return;
    const level = criterion.levels[index];
    setLevelDialogMode('edit');
    setLevelForm({
      name: level.name || '',
      points: level.points !== undefined && level.points !== null ? String(level.points) : '',
      description: level.description || '',
    });
    setLevelFormError('');
    setEditingLevelIndex(index);
    setLevelDialogOpen(true);
  };

  const handleLevelFormChange = (field) => (event) => {
    setLevelForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleCloseLevelDialog = () => {
    setLevelDialogOpen(false);
    setLevelFormError('');
    setEditingLevelIndex(null);
  };

  const handleSubmitLevelDialog = () => {
    if (!currentRubric) return;

    const parsedPoints = Number(levelForm.points);
    if (Number.isNaN(parsedPoints)) {
      setLevelFormError('Please enter a numeric point value.');
      return;
    }

    const payload = {
      name: levelForm.name,
      description: levelForm.description,
      points: parsedPoints,
    };

    if (levelDialogMode === 'add') {
      addLevel(currentCriterionIndex, payload);
    } else if (levelDialogMode === 'edit' && editingLevelIndex !== null) {
      updateLevel(currentCriterionIndex, editingLevelIndex, payload);
    }

    handleCloseLevelDialog();
  };

  const handleDeleteLevel = () => {
    if (!currentRubric || editingLevelIndex === null) return;
    deleteLevel(currentCriterionIndex, editingLevelIndex);
    handleCloseLevelDialog();
  };

  const handleOpenCriteriaDialog = () => {
    setDraftCriteria(cloneCriteria(currentRubric?.criteria || []));
    setCriteriaDialogOpen(true);
    const initialExpanded = {};
    (currentRubric?.criteria || []).forEach((_, idx) => {
      initialExpanded[idx] = false;
    });
    setExpandedDescriptions(initialExpanded);
    setEditingLevels({});
  };
  const toggleDescription = (index) => () => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };


  const handleCloseCriteriaDialog = () => {
    setCriteriaDialogOpen(false);
  };

  const handleDraftCriterionChange = (index, field) => (event) => {
    const value = event.target.value;
    setDraftCriteria((prev) => {
      const updated = cloneCriteria(prev);
      if (!updated[index]) return prev;
      updated[index][field] = value;
      return updated;
    });
  };

  const handleAddCriterion = () => {
    setDraftCriteria((prev) => [
      ...cloneCriteria(prev),
      {
        name: '',
        description: '',
        enableRange: '',
        levels: [],
        selectedLevel: null,
        comment: '',
      },
    ]);
  };

  const handleAddCriterionBelow = (index) => {
    setDraftCriteria((prev) => {
      const updated = cloneCriteria(prev);
      updated.splice(index + 1, 0, {
        name: '',
        description: '',
        enableRange: '',
        levels: [],
        selectedLevel: null,
        comment: '',
      });
      return updated;
    });
    setEditingLevels((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        const idx = Number(key);
        if (idx <= index) {
          next[idx] = prev[idx];
        } else {
          next[idx + 1] = prev[idx];
        }
      });
      return next;
    });
  };

  const handleDeleteCriterion = (index) => {
    setDraftCriteria((prev) => prev.filter((_, idx) => idx !== index));
    setEditingLevels((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        const idx = Number(key);
        if (idx === index) return;
        if (idx > index) {
          next[idx - 1] = prev[idx];
        } else {
          next[idx] = prev[idx];
        }
      });
      return next;
    });
  };

  const handleOpenLevelsEditor = (index) => () => {
    setEditingLevels((prev) => {
      const next = { ...prev };
      if (next[index]) {
        delete next[index];
      } else {
        next[index] = cloneLevels(draftCriteria[index]?.levels || []);
      }
      return next;
    });
  };

  const handleLevelFieldChange = (criterionIndex, levelIndex, field) => (event) => {
    const value = event.target.value;
    setEditingLevels((prev) => {
      const cloned = { ...prev };
      const targetLevels = cloneLevels(cloned[criterionIndex] || cloneLevels(draftCriteria[criterionIndex]?.levels || []));
      if (!targetLevels[levelIndex]) {
        targetLevels[levelIndex] = { name: '', description: '', points: 0 };
      }
      if (field === 'points') {
        targetLevels[levelIndex][field] = value;
      } else {
        targetLevels[levelIndex][field] = value;
      }
      cloned[criterionIndex] = targetLevels;
      return cloned;
    });
  };

  const handleAddLevelInline = (criterionIndex) => () => {
    setEditingLevels((prev) => {
      const cloned = { ...prev };
      const target = cloneLevels(cloned[criterionIndex] || draftCriteria[criterionIndex]?.levels || []);
      target.push({ name: '', points: '', description: '' });
      cloned[criterionIndex] = target;
      return cloned;
    });
  };

  const handleRemoveLevelInline = (criterionIndex, levelIndex) => () => {
    setEditingLevels((prev) => {
      const cloned = { ...prev };
      const target = cloneLevels(cloned[criterionIndex] || draftCriteria[criterionIndex]?.levels || []);
      target.splice(levelIndex, 1);
      cloned[criterionIndex] = target;
      return cloned;
    });
  };

  const sanitizeLevels = (levels = []) =>
    levels
      .map((level) => ({
        name: level?.name || '',
        description: level?.description || '',
        points: level?.points !== undefined && level?.points !== null && level.points !== ''
          ? Number(level.points)
          : 0,
      }))
      .filter((level) => level.name || level.description || level.points !== 0);

  const handleCancelLevelsEdit = (index) => () => {
    setEditingLevels((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleSaveLevelsEdit = (index) => () => {
    setDraftCriteria((prev) => {
      const updated = cloneCriteria(prev);
      if (!updated[index]) return prev;
      const newLevels = sanitizeLevels(editingLevels[index] || []);
      updated[index] = {
        ...updated[index],
        levels: newLevels,
      };
      return updated;
    });
    setEditingLevels((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleMoveCriterion = (index, direction) => () => {
    setDraftCriteria((prev) => {
      const updated = cloneCriteria(prev);
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= updated.length) return prev;
      const [removed] = updated.splice(index, 1);
      updated.splice(targetIndex, 0, removed);
      return updated;
    });
    setEditingLevels((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        const idx = Number(key);
        if (idx === index) {
          next[index + direction] = prev[idx];
        } else if (idx === index + direction) {
          next[idx - direction] = prev[idx];
        } else {
          next[idx] = prev[idx];
        }
      });
      return next;
    });
  };

  const handleEditLevelsFromCriteria = (index) => () => {
    goToCriterion(index);
    setCriteriaDialogOpen(false);
  };

  const handleSaveCriteria = () => {
    replaceCriteria(cloneCriteria(draftCriteria));
    setCriteriaDialogOpen(false);
  };

  const draftTotalPossible = useMemo(
    () => calculatePossiblePoints(draftCriteria),
    [draftCriteria]
  );
  const handleCriterionDragStart = (index) => (event) => {
    setDraggedCriterionIndex(index);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  };

  const handleCriterionDragOver = (index) => (event) => {
    event.preventDefault();
    if (draggedCriterionIndex === null || draggedCriterionIndex === index) return;
    setDraftCriteria((prev) => {
      const updated = cloneCriteria(prev);
      const [moved] = updated.splice(draggedCriterionIndex, 1);
      updated.splice(index, 0, moved);
      return updated;
    });
    setDraggedCriterionIndex(index);
  };

  const handleCriterionDragEnd = () => {
    setDraggedCriterionIndex(null);
  };

  // All hooks must be called unconditionally - disable when no rubric
  const hasRubric = !!currentRubric;
  const canUseHotkeys = hasRubric && !commentFocused && !levelDialogOpen;
  const hotkeys = useHotkeyConfig();

  // Keyboard shortcuts (1-9 for levels) - individual hooks for each level
  useHotkeys(
    hotkeys.selectLevel1,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[0]) {
        handleLevelSelect(0);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel1]
  );
  useHotkeys(
    hotkeys.selectLevel2,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[1]) {
        handleLevelSelect(1);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel2]
  );
  useHotkeys(
    hotkeys.selectLevel3,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[2]) {
        handleLevelSelect(2);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel3]
  );
  useHotkeys(
    hotkeys.selectLevel4,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[3]) {
        handleLevelSelect(3);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel4]
  );
  useHotkeys(
    hotkeys.selectLevel5,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[4]) {
        handleLevelSelect(4);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel5]
  );
  useHotkeys(
    hotkeys.selectLevel6,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[5]) {
        handleLevelSelect(5);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel6]
  );
  useHotkeys(
    hotkeys.selectLevel7,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[6]) {
        handleLevelSelect(6);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel7]
  );
  useHotkeys(
    hotkeys.selectLevel8,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[7]) {
        handleLevelSelect(7);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel8]
  );
  useHotkeys(
    hotkeys.selectLevel9,
    () => {
      if (canUseHotkeys && criterion && criterion.levels?.[8]) {
        handleLevelSelect(8);
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys, hotkeys.selectLevel9]
  );

  // Note: Navigation hotkeys (N/P/arrows/space) are now handled in App.jsx
  // so they work even when the rubric is collapsed

  // Focus comment hotkey
  useHotkeys(
    hotkeys.focusComment,
    (keyboardEvent) => {
      if (hasRubric && !commentFocused && !levelDialogOpen) {
        keyboardEvent.preventDefault();
        commentRef.current?.focus();
      }
    },
    { enabled: hasRubric && !commentFocused && !levelDialogOpen, preventDefault: true },
    [commentFocused, hasRubric, levelDialogOpen, hotkeys.focusComment]
  );

  // Escape to unfocus inputs
  useHotkeys(
    hotkeys.unfocusComment,
    (event) => {
      event.preventDefault();
      const activeEl = document.activeElement;
      if (activeEl && typeof activeEl.blur === 'function') {
        activeEl.blur();
      }
      if (commentFocused) {
        setCommentFocused(false);
      }
    },
    { enableOnFormTags: true },
    [commentFocused, hotkeys.unfocusComment]
  );

  // Early return AFTER all hooks
  if (!currentRubric) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Select a rubric to begin grading
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Criterion Navigation */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack 
          direction={{ xs: 'column', sm: 'row' }} 
          justifyContent="space-between" 
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={{ xs: 1, sm: 0 }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Criterion {currentCriterionIndex + 1} of {totalCriteria}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              size="small"
              startIcon={<NavigateBefore />}
              onClick={goToPreviousCriterion}
              disabled={currentCriterionIndex === 0}
              sx={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
            >
              Previous (P/←)
            </Button>
            <Button
              size="small"
              endIcon={<NavigateNext />}
              onClick={goToNextCriterion}
              disabled={currentCriterionIndex === totalCriteria - 1}
              sx={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
            >
              Next (N/→)
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Current Criterion */}
      <Paper sx={{ p: 3 }}>
        {currentCriterionIndex === 0 && (
          <TextField
            label="Student Name (optional)"
            value={currentRubric.feedbackLabel || ''}
            onChange={(e) => updateFeedbackLabel(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 2 }}
          />
        )}
        <Typography variant="h6" gutterBottom>
          {renderTextWithLatex(criterion.name, { inline: true })}
        </Typography>
        {criterion.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {renderTextWithLatex(criterion.description, { inline: true })}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Level Selection */}
        <Typography variant="subtitle2" gutterBottom>
          Select Level (Hotkeys 1-{criterion.levels.length}):
        </Typography>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {criterion.levels.map((level, index) => {
            const isSelected = criterion.selectedLevel === index;
            return (
              <Stack
                key={`${level.name || 'level'}-${index}`}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Box sx={{ flex: 1 }}>
                  <Tooltip
                    title={
                      level.description ? (
                        <Box sx={{ maxWidth: 320 }}>
                          {renderTextWithLatex(level.description, {
                            inline: true,
                          })}
                        </Box>
                      ) : ''
                    }
                    placement="bottom"
                    arrow
                  >
                    <Button
                      fullWidth
                      variant={isSelected ? 'contained' : 'outlined'}
                      onClick={() => handleLevelSelect(index)}
                      sx={{
                        textTransform: 'none',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        minHeight: 'auto',
                        py: 1.5,
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <Chip
                          label={index + 1}
                          size="small"
                          color={isSelected ? 'primary' : 'default'}
                          sx={{ flexShrink: 0 }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {renderTextWithLatex(
                            level.name || `Level ${index + 1}`,
                            { inline: true }
                          )}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body1"
                        fontWeight="bold"
                        color={isSelected ? 'inherit' : 'primary'}
                        sx={{
                          ml: 1,
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {level.points} pts
                      </Typography>
                    </Button>
                  </Tooltip>
                </Box>
                <Tooltip title="Edit level" arrow>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => handleOpenEditLevelDialog(index)}
                    aria-label={`Edit level ${level.name || index + 1}`}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            );
          })}
        </Stack>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleOpenAddLevelDialog}
          sx={{ alignSelf: 'flex-start', mb: 2 }}
        >
          Add Item
        </Button>

        {/* Comment Field */}
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <CommentIcon sx={{ mt: 1, color: 'text.secondary' }} />
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Additional Comment (Press C to focus)"
            value={criterion.comment}
            onChange={handleCommentChange}
            onFocus={() => setCommentFocused(true)}
            onBlur={() => setCommentFocused(false)}
            inputRef={commentRef}
            placeholder="Optional feedback for this criterion..."
          />
        </Stack>
      </Paper>

      {/* Criterion Overview */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          sx={{ mb: 2 }}
        >
          <Typography variant="subtitle2">
            All Criteria
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Total Possible: {formatPoints(currentTotalPossible)} pts
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={handleOpenCriteriaDialog}
            >
              Manage Criteria
            </Button>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {currentRubric.criteria.map((crit, index) => {
            const isComplete = crit.selectedLevel !== null && crit.selectedLevel !== undefined;
            const isCurrent = index === currentCriterionIndex;
            return (
              <Chip
                key={index}
                label={`${index + 1}. ${crit.name}`}
                onClick={() => goToCriterion(index)}
                color={isCurrent ? 'primary' : isComplete ? 'success' : 'default'}
                variant={isCurrent ? 'filled' : isComplete ? 'outlined' : 'outlined'}
                size="small"
                sx={{ 
                  mb: 1,
                  maxWidth: '100%',
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  },
                }}
              />
            );
          })}
        </Stack>
      </Paper>
      <Dialog
        open={levelDialogOpen}
        onClose={handleCloseLevelDialog}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {levelDialogMode === 'add' ? 'Add Rubric Level' : 'Edit Rubric Level'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Level Name"
              value={levelForm.name}
              onChange={handleLevelFormChange('name')}
              placeholder="e.g., Exceeds expectations"
              autoFocus
            />
            <TextField
              label="Points"
              type="number"
              value={levelForm.points}
              onChange={handleLevelFormChange('points')}
              error={Boolean(levelFormError)}
              helperText={levelFormError || 'Enter a whole number or decimal value'}
            />
            <TextField
              label="Description"
              value={levelForm.description}
              onChange={handleLevelFormChange('description')}
              multiline
              minRows={3}
              placeholder="Optional description for this level"
            />
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Preview</Typography>
              <Paper
                variant="outlined"
                sx={{
                  mt: 1,
                  p: 2,
                  backgroundColor: 'grey.50',
                }}
              >
                <Typography
                  component="div"
                  variant="body1"
                  fontWeight="bold"
                  sx={{ mb: levelForm.description ? 1 : 0 }}
                >
                  {renderTextWithLatex(
                    levelForm.name || 'Level name preview',
                    { inline: true }
                  )}
                </Typography>
                <Box component="div">
                  {levelForm.description ? (
                    renderTextWithLatex(levelForm.description, { inline: true })
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Description preview will appear here.
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          {levelDialogMode === 'edit' ? (
            <Button color="error" onClick={handleDeleteLevel}>
              Delete Level
            </Button>
          ) : (
            <Box />
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={handleCloseLevelDialog}>Cancel</Button>
            <Button variant="contained" onClick={handleSubmitLevelDialog}>
              {levelDialogMode === 'add' ? 'Add Level' : 'Save Changes'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog
        open={criteriaDialogOpen}
        onClose={handleCloseCriteriaDialog}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Manage Criteria</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ py: 0.75 }}>
              Use this editor to add, rename, reorder, or remove criteria.
              Levels can be edited from the grading view.
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5 }}>
              Total Possible Points: <strong>{formatPoints(draftTotalPossible)} pts</strong>
            </Typography>
            {draftCriteria.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No criteria yet. Add one to get started.
                </Typography>
              </Paper>
            ) : (
              <Stack spacing={0.9}>
                {draftCriteria.map((crit, index) => (
                  <Paper
                    key={`criterion-${index}`}
                    variant="outlined"
                    draggable
                    onDragStart={handleCriterionDragStart(index)}
                    onDragOver={handleCriterionDragOver(index)}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (event?.dataTransfer) {
                        event.dataTransfer.dropEffect = 'move';
                        event.dataTransfer.clearData();
                      }
                      handleCriterionDragEnd();
                    }}
                    onDragEnd={handleCriterionDragEnd}
                    sx={{
                      p: 1.15,
                      borderColor:
                        draggedCriterionIndex === index
                          ? 'primary.main'
                          : 'divider',
                      boxShadow:
                        draggedCriterionIndex === index ? 4 : 'none',
                    }}
                  >
                    <Stack spacing={0.4}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.6,
                          width: '100%',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Stack direction="row" spacing={0.4} alignItems="center">
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'grab',
                              color: 'text.secondary',
                            }}
                            aria-hidden="true"
                          >
                            <DragIndicator fontSize="small" />
                          </Box>
                          <Typography variant="subtitle2">
                            Criterion {index + 1}
                          </Typography>
                        </Stack>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            flexGrow: 1,
                            textAlign: 'center',
                            minWidth: 120,
                          }}
                        >
                          {crit.levels?.length || 0} levels • Max{' '}
                          {formatPoints(calculatePossiblePoints([crit]))} pts
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={0.4}
                          alignItems="center"
                          sx={{ ml: 'auto' }}
                        >
                          <IconButton
                            size="small"
                            onClick={handleMoveCriterion(index, -1)}
                            disabled={index === 0}
                            aria-label="Move criterion up"
                          >
                            <ArrowUpward fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={handleMoveCriterion(index, 1)}
                            disabled={index === draftCriteria.length - 1}
                            aria-label="Move criterion down"
                          >
                            <ArrowDownward fontSize="small" />
                          </IconButton>
                          <Button
                            size="small"
                            onClick={handleOpenLevelsEditor(index)}
                            sx={{ textTransform: 'none' }}
                          >
                            Edit Levels
                          </Button>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteCriterion(index)}
                            aria-label="Delete criterion"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Box>
                      <TextField
                        label="Criterion Name"
                        value={crit.name}
                        onChange={handleDraftCriterionChange(index, 'name')}
                        size="small"
                        sx={{ mt: 0.2 }}
                        fullWidth
                      />
                      <Box>
                        <Button
                          variant="text"
                          size="small"
                          onClick={toggleDescription(index)}
                          disableRipple
                          sx={{
                            textTransform: 'none',
                            px: 0,
                            py: 0,
                            minHeight: 'auto',
                            justifyContent: 'flex-start',
                          }}
                        >
                          {expandedDescriptions[index] ? 'Hide Description' : 'Show Description'}
                        </Button>
                        <Collapse in={expandedDescriptions[index]}>
                          <TextField
                            label="Description"
                            value={crit.description}
                            onChange={handleDraftCriterionChange(index, 'description')}
                            multiline
                            minRows={2}
                            size="small"
                            sx={{ mt: 0.2 }}
                            fullWidth
                          />
                        </Collapse>
                      </Box>
                      <Collapse in={Boolean(editingLevels[index])} unmountOnExit>
                        <Paper
                          variant="outlined"
                          sx={{ p: 1.25, backgroundColor: 'grey.50' }}
                        >
                          <Stack spacing={1}>
                            <Typography variant="subtitle2">Levels</Typography>
                            {(editingLevels[index] || []).length === 0 && (
                              <Typography variant="body2" color="text.secondary">
                                No levels yet. Add one below.
                              </Typography>
                            )}
                            {(editingLevels[index] || []).map((level, levelIndex) => (
                              <Paper key={`crit-${index}-level-${levelIndex}`} variant="outlined" sx={{ p: 1 }}>
                                <Stack spacing={0.75}>
                                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                                    <TextField
                                      label={`Level ${levelIndex + 1} Name`}
                                      value={level.name || ''}
                                      onChange={handleLevelFieldChange(index, levelIndex, 'name')}
                                      size="small"
                                      fullWidth
                                    />
                                    <TextField
                                      label="Points"
                                      type="number"
                                      value={level.points}
                                      onChange={handleLevelFieldChange(index, levelIndex, 'points')}
                                      size="small"
                                      sx={{ width: { xs: '100%', sm: 120 } }}
                                    />
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={handleRemoveLevelInline(index, levelIndex)}
                                      aria-label="Remove level"
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Stack>
                                  <TextField
                                    label="Description"
                                    value={level.description || ''}
                                    onChange={handleLevelFieldChange(index, levelIndex, 'description')}
                                    multiline
                                    minRows={2}
                                    size="small"
                                    fullWidth
                                  />
                                </Stack>
                              </Paper>
                            ))}
                            <Button
                              variant="text"
                              size="small"
                              startIcon={<AddIcon fontSize="small" />}
                              onClick={handleAddLevelInline(index)}
                              sx={{ textTransform: 'none', alignSelf: 'flex-start', px: 0 }}
                            >
                              Add Level
                            </Button>
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button onClick={handleCancelLevelsEdit(index)}>Cancel</Button>
                              <Button variant="contained" onClick={handleSaveLevelsEdit(index)}>
                                Save Levels
                              </Button>
                            </Stack>
                          </Stack>
                        </Paper>
                      </Collapse>
                    </Stack>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.15, mb: -1 }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => handleAddCriterionBelow(index)}
                        startIcon={<AddIcon fontSize="small" />}
                        sx={{ textTransform: 'none', px: 0, minHeight: 'auto', lineHeight: 1.15 }}
                      >
                        Add Criterion Below
                      </Button>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            )}
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddCriterion}>
              Add Criterion
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCriteriaDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveCriteria}
            disabled={!draftCriteria.length}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RubricDisplay;

