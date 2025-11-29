import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stack,
  Divider,
} from '@mui/material';
import { Keyboard as KeyboardIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { getHotkeys, formatHotkeyDisplay } from '../utils/hotkeys';
import HotkeyCustomizer from './HotkeyCustomizer';

const ShortcutsModal = ({ open, onClose }) => {
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [hotkeys, setHotkeys] = useState(() => getHotkeys());

  // Listen for hotkey updates
  useEffect(() => {
    const handleUpdate = () => {
      setHotkeys(getHotkeys());
    };
    window.addEventListener('hotkeysUpdated', handleUpdate);
    return () => {
      window.removeEventListener('hotkeysUpdated', handleUpdate);
    };
  }, []);
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
          <Typography variant="h6">Keyboard Shortcuts</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SettingsIcon />}
              onClick={() => setCustomizerOpen(true)}
              sx={{ mb: 2 }}
            >
              Customize Hotkeys
            </Button>
          </Box>
          {/* Rubric Grading */}
          <Box>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Rubric Grading
            </Typography>
            <Stack spacing={1} sx={{ pl: 2 }}>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.selectLevel1)}-{formatHotkeyDisplay(hotkeys.selectLevel9)}:
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Select rubric level (1 = highest points)
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.nextCriterion)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Next criterion
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.previousCriterion)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Previous criterion
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.focusComment)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Focus comment field
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.unfocusComment)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Unfocus comment field
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* Navigation */}
          <Box>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Navigation
            </Typography>
            <Stack spacing={1} sx={{ pl: 2 }}>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.nextSubmission)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Next submission
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.previousSubmission)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Previous submission
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* Actions */}
          <Box>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Actions
            </Typography>
            <Stack spacing={1} sx={{ pl: 2 }}>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.generateFeedback)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Generate feedback (copies to clipboard)
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.resetRubric)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Reset rubric
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.stageGrade)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Stage grade and feedback for Canvas
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* PDF Controls */}
          <Box>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              PDF Controls
            </Typography>
            <Stack spacing={1} sx={{ pl: 2 }}>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  {formatHotkeyDisplay(hotkeys.rotatePdf)}
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Rotate PDF pages 90° clockwise
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
      
      <HotkeyCustomizer
        open={customizerOpen}
        onClose={() => {
          setCustomizerOpen(false);
          // Refresh hotkeys when customizer closes
          if (open) {
            // Force re-render to show updated hotkeys
            window.dispatchEvent(new Event('hotkeysUpdated'));
          }
        }}
      />
    </Dialog>
  );
};

export default ShortcutsModal;

