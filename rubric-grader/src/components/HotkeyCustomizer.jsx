import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Stack,
  Divider,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Restore as RestoreIcon,
  Keyboard as KeyboardIcon,
} from '@mui/icons-material';
import {
  getHotkeys,
  saveHotkeys,
  resetHotkeys,
  getHotkeyDescriptions,
  formatHotkeyDisplay,
  validateHotkey,
  normalizeHotkey,
  DEFAULT_HOTKEYS,
} from '../utils/hotkeys';

const HotkeyCustomizer = ({ open, onClose }) => {
  const [hotkeys, setHotkeys] = useState({});
  const [errors, setErrors] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open) {
      const current = getHotkeys();
      setHotkeys({ ...current });
      setErrors({});
      setHasChanges(false);
    }
  }, [open]);

  const descriptions = getHotkeyDescriptions();

  const handleHotkeyChange = (key, value) => {
    const normalized = normalizeHotkey(value);
    const validation = validateHotkey(normalized);
    
    setHotkeys(prev => ({ ...prev, [key]: normalized }));
    
    if (validation.valid) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setErrors(prev => ({ ...prev, [key]: validation.error }));
    }
    
    setHasChanges(true);
  };

  const handleSave = () => {
    // Check for any errors
    const hasErrors = Object.keys(errors).length > 0;
    if (hasErrors) {
      return;
    }
    
    saveHotkeys(hotkeys);
    setHasChanges(false);
    // Dispatch event to notify other components
    window.dispatchEvent(new Event('hotkeysUpdated'));
    onClose();
  };

  const handleReset = () => {
    if (window.confirm('Reset all hotkeys to defaults? This cannot be undone.')) {
      resetHotkeys();
      setHotkeys({ ...DEFAULT_HOTKEYS });
      setErrors({});
      setHasChanges(false);
      // Dispatch event to notify other components
      window.dispatchEvent(new Event('hotkeysUpdated'));
    }
  };

  const handleResetSingle = (key) => {
    setHotkeys(prev => ({ ...prev, [key]: DEFAULT_HOTKEYS[key] }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setHasChanges(true);
  };

  const hotkeyGroups = [
    {
      title: 'Rubric Level Selection',
      keys: ['selectLevel1', 'selectLevel2', 'selectLevel3', 'selectLevel4', 'selectLevel5', 'selectLevel6', 'selectLevel7', 'selectLevel8', 'selectLevel9'],
    },
    {
      title: 'Navigation',
      keys: ['nextCriterion', 'previousCriterion', 'nextCriterionSpace'],
    },
    {
      title: 'Comment Field',
      keys: ['focusComment', 'unfocusComment'],
    },
    {
      title: 'Submission Navigation',
      keys: ['nextSubmission', 'previousSubmission'],
    },
    {
      title: 'Actions',
      keys: ['generateFeedback', 'resetRubric'],
    },
    {
      title: 'Help',
      keys: ['showShortcuts'],
    },
  ];

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { zIndex: 1400 }
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <KeyboardIcon />
          <Typography variant="h6">Customize Keyboard Shortcuts</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Alert severity="info">
            Customize your keyboard shortcuts. Use comma to separate multiple options (e.g., "ctrl+enter, meta+enter").
            Modifiers: ctrl, meta (Cmd on Mac), shift, alt. Press Enter to save changes.
          </Alert>

          {hotkeyGroups.map((group, groupIndex) => (
            <Box key={group.title}>
              {groupIndex > 0 && <Divider sx={{ mb: 2 }} />}
              <Typography variant="h6" gutterBottom fontWeight="bold">
                {group.title}
              </Typography>
              <Stack spacing={2} sx={{ pl: 2, mt: 1 }}>
                {group.keys.map((key) => (
                  <Box key={key}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        label={descriptions[key] || key}
                        value={hotkeys[key] || ''}
                        onChange={(e) => handleHotkeyChange(key, e.target.value)}
                        error={!!errors[key]}
                        helperText={errors[key] || `Current: ${formatHotkeyDisplay(hotkeys[key] || DEFAULT_HOTKEYS[key])}`}
                        size="small"
                        fullWidth
                        placeholder={DEFAULT_HOTKEYS[key]}
                      />
                      <Tooltip title="Reset to default">
                        <IconButton
                          size="small"
                          onClick={() => handleResetSingle(key)}
                          disabled={hotkeys[key] === DEFAULT_HOTKEYS[key]}
                        >
                          <RestoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 2 }}>
        <Button
          onClick={handleReset}
          color="warning"
          startIcon={<RestoreIcon />}
        >
          Reset All to Defaults
        </Button>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>
            {hasChanges ? 'Cancel' : 'Close'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={hasErrors || !hasChanges}
          >
            Save Changes
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

export default HotkeyCustomizer;

