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
import { Keyboard as KeyboardIcon } from '@mui/icons-material';

const ShortcutsModal = ({ open, onClose }) => {
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
          {/* Rubric Grading */}
          <Box>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Rubric Grading
            </Typography>
            <Stack spacing={1} sx={{ pl: 2 }}>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  1-9:
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Select rubric level (1 = highest points)
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  N or →
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Next criterion
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  P or ←
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Previous criterion
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  C
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Focus comment field
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  Esc
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
                  Ctrl+Shift+→ (Cmd+Shift+→)
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Next submission
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  Ctrl+Shift+← (Cmd+Shift+←)
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
                  Ctrl+Enter (Cmd+Enter)
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Generate feedback (copies to clipboard)
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" component="span" fontWeight="medium">
                  Ctrl+R (Cmd+R)
                </Typography>
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Reset rubric
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShortcutsModal;

