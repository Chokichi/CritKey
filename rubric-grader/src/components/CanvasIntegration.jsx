import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch,
  LinearProgress,
  InputAdornment,
} from '@mui/material';
import {
  BugReport as BugReportIcon,
  Storage as StorageIcon,
  CloudDownload as CloudDownloadIcon,
} from '@mui/icons-material';
import useCanvasStore from '../store/canvasStore';
import CourseDebugModal from './CourseDebugModal';
import CacheManager from './CacheManager';

const CanvasIntegration = () => {
  const {
    apiToken,
    canvasApiBase,
    setApiToken,
    setCanvasApiBase,
    initialize,
    courses,
    assignments,
    submissions,
    assignmentGroups,
    selectedAssignmentGroup,
    selectedCourse,
    selectedAssignment,
    selectedSubmission,
    submissionIndex,
    loadingCourses,
    loadingAssignments,
    loadingSubmissions,
    error,
    fetchCourses,
    selectCourse,
    selectAssignment,
    selectAssignmentGroup,
    nextSubmission,
    previousSubmission,
    lastRequestUrls,
    offlineMode,
    setOfflineMode,
    cacheAllPdfs,
    cachingProgress,
    parallelDownloadLimit,
    setParallelDownloadLimit,
  } = useCanvasStore();

  const [localApiToken, setLocalApiToken] = useState('');
  const [localApiBase, setLocalApiBase] = useState('https://canvas.instructure.com/api/v1');
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [cacheManagerOpen, setCacheManagerOpen] = useState(false);
  const [hasAutoConnected, setHasAutoConnected] = useState(false);

  useEffect(() => {
    initialize();
    if (apiToken) {
      setLocalApiToken(apiToken);
    }
    if (canvasApiBase) {
      setLocalApiBase(canvasApiBase);
    }
  }, [initialize, apiToken, canvasApiBase]);

  // Auto-connect if token is saved (only once on mount)
  useEffect(() => {
    if (apiToken && !hasAutoConnected && !loadingCourses && courses.length === 0) {
      setHasAutoConnected(true);
      fetchCourses();
    }
  }, [apiToken, hasAutoConnected, loadingCourses, courses.length, fetchCourses]);

  const handleSaveConfig = () => {
    setApiToken(localApiToken);
    setCanvasApiBase(localApiBase);
    if (localApiToken) {
      fetchCourses();
    }
  };

  const handleCourseChange = (event) => {
    const courseId = event.target.value;
    const course = courses.find(c => c.id === courseId);
    if (course) {
      selectCourse(course);
    }
  };

  const handleAssignmentChange = (event) => {
    const assignmentId = event.target.value;
    const assignment = assignments.find(a => a.id === assignmentId);
    if (assignment) {
      selectAssignment(assignment);
    }
  };

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">
            Canvas Integration
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Cache Manager">
              <IconButton
                size="small"
                onClick={() => setCacheManagerOpen(true)}
              >
                <StorageIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Debug: View all courses">
              <IconButton
                size="small"
                onClick={() => setDebugModalOpen(true)}
                disabled={!apiToken}
              >
                <BugReportIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

      {/* API Configuration */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <TextField
          label="Canvas API Token"
          type="password"
          value={localApiToken}
          onChange={(e) => setLocalApiToken(e.target.value)}
          placeholder="Enter your Canvas API token"
          fullWidth
          size="small"
          helperText="Get your token from Account > Settings > Approved Integrations in Canvas"
        />
        <TextField
          label="Canvas API Base URL"
          value={localApiBase}
          onChange={(e) => setLocalApiBase(e.target.value)}
          placeholder="https://canvas.instructure.com/api/v1"
          fullWidth
          size="small"
          helperText="Leave as default for Canvas Cloud, or use your school's Canvas URL"
        />
        <Button variant="contained" onClick={handleSaveConfig} disabled={!localApiToken}>
          Save & Connect
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Offline Mode & Caching */}
      <Stack spacing={2} sx={{ mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={offlineMode}
              onChange={(e) => setOfflineMode(e.target.checked)}
            />
          }
          label="Offline Mode (Cache PDFs for offline grading)"
        />
        <Tooltip
          title="More parallel downloads will be faster on a fast internet connection, but it will mean a longer wait for the first assignment on a slow internet connection. Set to 0 for no limit (download all at once)."
          arrow
          placement="right"
        >
          <TextField
            label="Parallel Download Limit"
            type="number"
            value={parallelDownloadLimit}
            onChange={(e) => setParallelDownloadLimit(e.target.value)}
            size="small"
            fullWidth
            inputProps={{ min: 0, step: 1 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  {parallelDownloadLimit === 0 ? 'No limit' : 'at a time'}
                </InputAdornment>
              ),
            }}
            helperText={parallelDownloadLimit === 0 ? 'All PDFs will download simultaneously' : `${parallelDownloadLimit} PDFs will download at a time`}
          />
        </Tooltip>
        {selectedAssignment && (
          <Button
            variant="outlined"
            startIcon={<CloudDownloadIcon />}
            onClick={cacheAllPdfs}
            disabled={cachingProgress.isCaching}
            fullWidth
          >
            {cachingProgress.isCaching
              ? `Caching PDFs... ${cachingProgress.current}/${cachingProgress.total}`
              : 'Cache All PDFs for This Assignment'}
          </Button>
        )}
        {cachingProgress.isCaching && (
          <LinearProgress
            variant="determinate"
            value={(cachingProgress.current / cachingProgress.total) * 100}
          />
        )}
      </Stack>

      <Divider sx={{ my: 2 }} />

      {/* Course Selection */}
      <Stack spacing={2}>
        <FormControl fullWidth size="small" disabled={!apiToken || loadingCourses}>
          <InputLabel>Select Course</InputLabel>
          <Select
            value={selectedCourse?.id || ''}
            onChange={handleCourseChange}
            label="Select Course"
          >
            {loadingCourses ? (
              <MenuItem disabled>
                <CircularProgress size={16} sx={{ mr: 1 }} />
                Loading courses...
              </MenuItem>
            ) : courses.length === 0 ? (
              <MenuItem disabled>No courses available</MenuItem>
            ) : (
              courses.map((course) => (
                <MenuItem key={course.id} value={course.id}>
                  <Box>
                    <Typography variant="body2" fontWeight="bold">
                      {course.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Canvas ID: {course.id} {course.course_code ? `• Code: ${course.course_code}` : ''} {course.sis_course_id ? `• SIS: ${course.sis_course_id}` : ''}
                    </Typography>
                  </Box>
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        {/* Assignment Group Selection */}
        {selectedCourse && (
          <FormControl fullWidth size="small" disabled={loadingAssignments}>
            <InputLabel>Assignment Category</InputLabel>
            <Select
              value={
                selectedAssignmentGroup === 'all' || 
                assignmentGroups.some(g => String(g.id) === String(selectedAssignmentGroup))
                  ? (selectedAssignmentGroup || 'all')
                  : 'all'
              }
              onChange={(e) => selectAssignmentGroup(e.target.value)}
              label="Assignment Category"
            >
              <MenuItem value="all">All Categories</MenuItem>
              {assignmentGroups.length === 0 ? (
                <MenuItem disabled>No categories found</MenuItem>
              ) : (
                assignmentGroups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {group.name || `Group ${group.id}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        ID: {group.id}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        )}

        {/* Assignment Selection */}
        {selectedCourse && (
          <FormControl fullWidth size="small" disabled={loadingAssignments}>
            <InputLabel>Select Assignment</InputLabel>
            <Select
              value={selectedAssignment?.id || ''}
              onChange={handleAssignmentChange}
              label="Select Assignment"
            >
              {loadingAssignments ? (
                <MenuItem disabled>
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                  Loading assignments...
                </MenuItem>
              ) : assignments.length === 0 ? (
                <MenuItem disabled>No assignments available (showing published with submissions only)</MenuItem>
              ) : (
                assignments.map((assignment) => (
                  <MenuItem key={assignment.id} value={assignment.id}>
                    {assignment.name}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        )}

        {/* Submission Info */}
        {selectedSubmission && (
          <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Current Submission: {submissionIndex + 1} of {submissions.length}
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {selectedSubmission.user?.name || `User ${selectedSubmission.user_id}`}
            </Typography>
            {loadingSubmissions && (
              <CircularProgress size={16} sx={{ mt: 1 }} />
            )}
          </Box>
        )}

        {/* Last API Requests */}
        {(lastRequestUrls.courses || lastRequestUrls.assignmentGroups || lastRequestUrls.assignments || lastRequestUrls.submissions) && (
          <Box sx={{ mt: 2, p: 1.5, backgroundColor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
              Last Canvas Requests
            </Typography>
            {lastRequestUrls.courses && (
              <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all' }}>
                Courses: {lastRequestUrls.courses}
              </Typography>
            )}
            {lastRequestUrls.assignmentGroups && (
              <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all' }}>
                Assignment Groups: {lastRequestUrls.assignmentGroups}
              </Typography>
            )}
            {lastRequestUrls.assignments && (
              <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all' }}>
                Assignments: {lastRequestUrls.assignments}
              </Typography>
            )}
            {lastRequestUrls.submissions && (
              <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all' }}>
                Submissions: {lastRequestUrls.submissions}
              </Typography>
            )}
          </Box>
        )}
      </Stack>
      </Paper>
      
      <CourseDebugModal
        open={debugModalOpen}
        onClose={() => setDebugModalOpen(false)}
      />
      <CacheManager
        open={cacheManagerOpen}
        onClose={() => setCacheManagerOpen(false)}
      />
    </>
  );
};

export default CanvasIntegration;

