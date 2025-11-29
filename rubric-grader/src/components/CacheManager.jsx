import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Stack,
  Alert,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import useCanvasStore from '../store/canvasStore';
import { getCacheSize, getCachedAssignments, getPdfCountForAssignment } from '../utils/pdfCache';

const CacheManager = ({ open, onClose }) => {
  const {
    cachedAssignments,
    deleteAssignmentCache,
    clearAllCache,
    refreshCachedAssignments,
  } = useCanvasStore();
  const [cacheSize, setCacheSize] = useState({ count: 0, size: 0 });
  const [loading, setLoading] = useState(false);
  const [pdfCounts, setPdfCounts] = useState(new Map());

  useEffect(() => {
    if (open) {
      loadCacheInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadCacheInfo = useCallback(async () => {
    setLoading(true);
    try {
      // Get cache size first
      const size = await getCacheSize();
      setCacheSize(size);
      
      // Refresh assignments (computed on-demand from PDFs)
      await refreshCachedAssignments();
      
      // Get actual PDF counts for each assignment
      const { cachedAssignments: currentAssignments } = useCanvasStore.getState();
      if (Array.isArray(currentAssignments) && currentAssignments.length > 0) {
        const counts = new Map();
        await Promise.all(
          currentAssignments.map(async (meta) => {
            const count = await getPdfCountForAssignment(meta.assignmentId);
            counts.set(meta.assignmentId, count);
          })
        );
        setPdfCounts(counts);
      }
    } finally {
      setLoading(false);
    }
  }, [refreshCachedAssignments]);

  const handleDelete = async (assignmentId) => {
    if (!window.confirm('Delete all cached PDFs for this assignment?')) {
      return;
    }
    try {
      await deleteAssignmentCache(assignmentId);
      await loadCacheInfo();
    } catch (error) {
      alert(`Failed to delete cache: ${error.message}`);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete ALL cached PDFs? This cannot be undone.')) {
      return;
    }
    try {
      await clearAllCache();
      await loadCacheInfo();
    } catch (error) {
      alert(`Failed to clear cache: ${error.message}`);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

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
        <Stack direction="row" spacing={1} alignItems="center">
          <StorageIcon />
          <Typography variant="h6">PDF Cache Manager</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {/* Cache Summary */}
        <Box sx={{ mb: 3, p: 2, backgroundColor: 'grey.50', borderRadius: 1, minHeight: 80 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Box sx={{ minWidth: 120 }}>
              <Typography variant="body2" color="text.secondary">
                Total Cached PDFs
              </Typography>
              <Typography variant="h6">{cacheSize.count}</Typography>
            </Box>
            <Box sx={{ minWidth: 120 }}>
              <Typography variant="body2" color="text.secondary">
                Total Cache Size
              </Typography>
              <Typography variant="h6">{formatBytes(cacheSize.size)}</Typography>
            </Box>
            <Button
              startIcon={<RefreshIcon />}
              onClick={loadCacheInfo}
              size="small"
              disabled={loading}
              sx={{ flexShrink: 0 }}
            >
              Refresh
            </Button>
          </Stack>
        </Box>

        {!Array.isArray(cachedAssignments) || cachedAssignments.length === 0 ? (
          <Alert severity="info">No cached assignments found.</Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Assignment</TableCell>
                  <TableCell>Submissions Cached</TableCell>
                  <TableCell>Cached At</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cachedAssignments.map((meta) => (
                  <TableRow key={meta.assignmentId}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {meta.assignmentName || `Assignment ${meta.assignmentId}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID: {meta.assignmentId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={pdfCounts.get(meta.assignmentId) ?? meta.submissionCount ?? 0} size="small" color="primary" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {formatDate(meta.cachedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(meta.assignmentId)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {Array.isArray(cachedAssignments) && cachedAssignments.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleClearAll}
              fullWidth
            >
              Clear All Cache
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CacheManager;

