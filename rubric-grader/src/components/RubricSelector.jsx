import { useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import { 
  Delete as DeleteIcon, 
  Refresh as RefreshIcon,
  Edit as EditIcon,
  ContentCopy as DuplicateIcon,
} from '@mui/icons-material';
import useRubricStore from '../store/rubricStore';

const RubricSelector = () => {
  const {
    currentCourse,
    currentRubric,
    availableRubrics,
    selectRubric,
    deleteRubric,
    resetGrading,
    renameRubric,
    duplicateRubric,
  } = useRubricStore();

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');

  if (!currentCourse) {
    return null;
  }

  const handleDelete = () => {
    if (currentRubric && window.confirm(`Delete rubric "${currentRubric.name}"?`)) {
      deleteRubric(currentRubric.name);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all selections and comments for this rubric?')) {
      resetGrading();
    }
  };

  const handleOpenRenameDialog = () => {
    if (!currentRubric) return;
    setNewName(currentRubric.name);
    setNameError('');
    setRenameDialogOpen(true);
  };

  const handleCloseRenameDialog = () => {
    setRenameDialogOpen(false);
    setNewName('');
    setNameError('');
  };

  const handleRename = () => {
    if (!currentRubric) return;
    
    if (!newName.trim()) {
      setNameError('Please enter a rubric name');
      return;
    }

    if (newName.trim() === currentRubric.name) {
      handleCloseRenameDialog();
      return;
    }

    try {
      renameRubric(currentRubric.name, newName.trim());
      handleCloseRenameDialog();
    } catch (error) {
      setNameError(error.message || 'Failed to rename rubric');
    }
  };

  const handleOpenDuplicateDialog = () => {
    if (!currentRubric) return;
    setNewName(`${currentRubric.name} (Copy)`);
    setNameError('');
    setDuplicateDialogOpen(true);
  };

  const handleCloseDuplicateDialog = () => {
    setDuplicateDialogOpen(false);
    setNewName('');
    setNameError('');
  };

  const handleDuplicate = () => {
    if (!currentRubric) return;
    
    if (!newName.trim()) {
      setNameError('Please enter a rubric name');
      return;
    }

    try {
      duplicateRubric(currentRubric.name, newName.trim());
      handleCloseDuplicateDialog();
    } catch (error) {
      setNameError(error.message || 'Failed to duplicate rubric');
    }
  };

  const handleNameKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (renameDialogOpen) {
        handleRename();
      } else if (duplicateDialogOpen) {
        handleDuplicate();
      }
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <FormControl fullWidth size="small">
          <InputLabel>Rubric</InputLabel>
          <Select
            value={currentRubric?.name || ''}
            label="Rubric"
            onChange={(e) => selectRubric(e.target.value)}
          >
            {availableRubrics.length === 0 && (
              <MenuItem disabled value="" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                No rubrics available - Import one above
              </MenuItem>
            )}
            {availableRubrics.map((rubric) => (
              <MenuItem key={rubric.name} value={rubric.name}>
                {rubric.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {currentRubric && (
          <>
            <Tooltip title="Rename rubric">
              <IconButton onClick={handleOpenRenameDialog} color="primary">
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Duplicate rubric">
              <IconButton onClick={handleOpenDuplicateDialog} color="primary">
                <DuplicateIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reset grading">
              <IconButton onClick={handleReset} color="primary">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete rubric">
              <IconButton onClick={handleDelete} color="error">
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={handleCloseRenameDialog}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Rename Rubric</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Rubric Name"
            fullWidth
            variant="outlined"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setNameError('');
            }}
            onKeyPress={handleNameKeyPress}
            error={!!nameError}
            helperText={nameError || 'Enter a new name for the rubric'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRenameDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRename}
            disabled={!newName.trim() || newName.trim() === currentRubric?.name}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog
        open={duplicateDialogOpen}
        onClose={handleCloseDuplicateDialog}
        PaperProps={{
          sx: { zIndex: 1400 }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Duplicate Rubric</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Rubric Name"
            fullWidth
            variant="outlined"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setNameError('');
            }}
            onKeyPress={handleNameKeyPress}
            error={!!nameError}
            helperText={nameError || 'Enter a name for the duplicated rubric'}
            sx={{ mt: 2 }}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            A copy of "{currentRubric?.name}" will be created. Grading selections and comments will be reset.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDuplicateDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDuplicate}
            disabled={!newName.trim()}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RubricSelector;

