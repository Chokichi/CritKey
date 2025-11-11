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
import { renderTextWithLatex } from '../utils/latex.jsx';

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
  } = useRubricStore();

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

  // Get criterion safely - will be null if no rubric
  const criterion = currentRubric?.criteria?.[currentCriterionIndex] || null;
  const totalCriteria = currentRubric?.criteria?.length || 0;

  const currentTotalPossible = useMemo(
    () => calculatePossiblePoints(currentRubric?.criteria || []),
    [currentRubric]
  );

  const handleLevelSelect = (levelIndex) => {
    if (!currentRubric) return;
    selectLevel(currentCriterionIndex, levelIndex);
    // Auto-advance to next criterion after selection
    setTimeout(() => {
      if (currentCriterionIndex < totalCriteria - 1) {
        goToNextCriterion();
      }
    }, 150);
  };

  const handleCommentChange = (e) => {
    if (!currentRubric) return;
    updateComment(currentCriterionIndex, e.target.value);
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
  };

  const handleDeleteCriterion = (index) => {
    setDraftCriteria((prev) => prev.filter((_, idx) => idx !== index));
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

  // Keyboard shortcuts (1-9 for levels) - combined into single hook
  useHotkeys(
    '1,2,3,4,5,6,7,8,9',
    (keyboardEvent, hotkeysEvent) => {
      if (canUseHotkeys && criterion) {
        const levelIndex = parseInt(hotkeysEvent.keys[0]) - 1;
        if (criterion.levels?.[levelIndex]) {
          handleLevelSelect(levelIndex);
        }
      }
    },
    { enabled: canUseHotkeys },
    [currentCriterionIndex, commentFocused, criterion, canUseHotkeys]
  );

  // Navigation hotkeys
  useHotkeys(
    'n, right',
    (event) => {
      if (event?.key === 'ArrowRight') {
        event.preventDefault();
      }
      if (canUseHotkeys) goToNextCriterion();
    },
    { enabled: canUseHotkeys },
    [commentFocused, canUseHotkeys]
  );

  useHotkeys(
    'p, left',
    (event) => {
      if (event?.key === 'ArrowLeft') {
        event.preventDefault();
      }
      if (canUseHotkeys) goToPreviousCriterion();
    },
    { enabled: canUseHotkeys },
    [commentFocused, canUseHotkeys]
  );

  // Focus comment hotkey
  useHotkeys(
    'c',
    (keyboardEvent) => {
      if (hasRubric && !commentFocused && !levelDialogOpen) {
        keyboardEvent.preventDefault();
        commentRef.current?.focus();
      }
    },
    { enabled: hasRubric && !commentFocused && !levelDialogOpen, preventDefault: true },
    [commentFocused, hasRubric, levelDialogOpen]
  );

  // Escape to unfocus comment
  useHotkeys(
    'escape',
    () => {
      if (commentFocused) {
        commentRef.current?.blur();
      }
    },
    { enabled: commentFocused },
    [commentFocused]
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
                    placement="right"
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
                            onClick={handleEditLevelsFromCriteria(index)}
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

