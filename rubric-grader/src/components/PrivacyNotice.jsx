import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Lock as LockIcon,
  Storage as StorageIcon,
  DeleteForever as DeleteIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';

const PrivacyNotice = ({ open, onClose }) => {
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon />
          <Typography variant="h6">Privacy & Data Security</Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 3 }}>
          CritKey Pro respects your privacy and implements multiple security measures to protect your Canvas API token.
        </Alert>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          What Data We Collect
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          CritKey Pro only stores:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemIcon>
              <LockIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Canvas API Token"
              secondary="Your personal access token for authenticating with Canvas LMS"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <StorageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Canvas API Base URL"
              secondary="The base URL for your institution's Canvas instance (optional)"
            />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
          How We Protect Your Data
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText
              primary="🔒 AES-256 Encryption"
              secondary="Your API token is encrypted using military-grade AES-256 encryption before storage"
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="🔐 Session Storage Only"
              secondary="Data is stored in sessionStorage (cleared when you close your browser) instead of persistent localStorage"
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="🔑 Authorization Headers"
              secondary="API tokens are sent via secure Authorization headers, never in URLs or browser history"
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="🛡️ Rate Limiting"
              secondary="Server-side rate limiting prevents abuse and brute force attacks"
            />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
          How We Use Your Data
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Your Canvas API token is used exclusively to:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="• Fetch your courses from Canvas" />
          </ListItem>
          <ListItem>
            <ListItemText primary="• Retrieve assignments and student submissions" />
          </ListItem>
          <ListItem>
            <ListItemText primary="• Submit grades and feedback to Canvas" />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
          Data Sharing & Third Parties
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          <strong>We never share your data with third parties.</strong> Your API token stays on your device and is only sent to:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText
              primary="1. Your Local Server"
              secondary="The CritKey Pro server running on your localhost (http://localhost:3001)"
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="2. Your Canvas Instance"
              secondary="The Canvas LMS server at your institution (e.g., canvas.instructure.com)"
            />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
          When Data is Deleted
        </Typography>
        <List dense>
          <ListItem>
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText
              primary="Automatic Deletion"
              secondary="All encrypted data is automatically deleted when you close your browser"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText
              primary="Manual Deletion"
              secondary="Use the 'Clear All Data' button in Setup to immediately delete all stored information"
            />
          </ListItem>
        </List>

        <Alert severity="warning" sx={{ mt: 3 }}>
          <Typography variant="body2">
            <strong>Important:</strong> Keep your Canvas API token secure. Anyone with access to your token can perform actions on Canvas as you. If you suspect your token has been compromised, regenerate it immediately in Canvas under Account → Settings → Approved Integrations.
          </Typography>
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PrivacyNotice;
