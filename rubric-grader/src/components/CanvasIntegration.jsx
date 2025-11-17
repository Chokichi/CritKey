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
  ImportContacts as ImportContactsIcon,
} from '@mui/icons-material';
import useCanvasStore from '../store/canvasStore';
import useRubricStore from '../store/rubricStore';
import CourseDebugModal from './CourseDebugModal';
import CacheManager from './CacheManager';
import { convertCanvasRubricToInternal, isValidCanvasRubric, getCanvasRubricSummary } from '../utils/canvasRubricConverter';

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
    courseRubrics,
    assignmentRubric,
    loadingRubrics,
    fetchCourseRubrics,
  } = useCanvasStore();

  const { importRubric, currentCourse, availableRubrics } = useRubricStore();

  const [localApiToken, setLocalApiToken] = useState('');
  const [localApiBase, setLocalApiBase] = useState('https://canvas.instructure.com/api/v1');
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [cacheManagerOpen, setCacheManagerOpen] = useState(false);
  const [hasAutoConnected, setHasAutoConnected] = useState(false);
  const [selectedCourseRubricId, setSelectedCourseRubricId] = useState('');
  const [importSuccess, setImportSuccess] = useState(null);
  const [importError, setImportError] = useState(null);

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

  // Fetch course rubrics when course is selected
  useEffect(() => {
    if (selectedCourse && apiToken) {
      fetchCourseRubrics();
    }
  }, [selectedCourse, apiToken, fetchCourseRubrics]);

  // Clear rubric selection when course changes
  useEffect(() => {
    setSelectedCourseRubricId('');
  }, [selectedCourse]);

  const handleImportAssignmentRubric = async () => {
    if (!assignmentRubric || !currentCourse) {
      setImportError('Cannot import rubric: missing assignment rubric or course not selected');
      return;
    }

    try {
      setImportError(null);
      setImportSuccess(null);

      // Validate rubric
      if (!isValidCanvasRubric(assignmentRubric)) {
        throw new Error('Invalid Canvas rubric format');
      }

      // Check if rubric with same name already exists
      const rubricName = assignmentRubric.title || 'Untitled Rubric';
      const existingRubric = availableRubrics.find(r => r.name === rubricName);
      if (existingRubric) {
        throw new Error(`A rubric named "${rubricName}" already exists. Please rename or delete the existing rubric first.`);
      }

      // Convert Canvas rubric to CritKey format
      const convertedRubric = convertCanvasRubricToInternal(assignmentRubric);

      // Import into rubricStore
      importRubric(convertedRubric);

      setImportSuccess(`Rubric "${rubricName}" imported successfully! Select it from the rubric dropdown in Setup.`);

      // Clear success message after 5 seconds
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (error) {
      setImportError(error.message || 'Failed to import rubric');
    }
  };

  const handleImportCourseRubric = async () => {
    if (!selectedCourseRubricId || !currentCourse) {
      setImportError('Please select a rubric to import and ensure a course is selected');
      return;
    }

    try {
      setImportError(null);
      setImportSuccess(null);

      // Find selected rubric
      const canvasRubric = courseRubrics.find(r => String(r.id) === String(selectedCourseRubricId));
      if (!canvasRubric) {
        throw new Error('Selected rubric not found');
      }

      // Validate rubric
      if (!isValidCanvasRubric(canvasRubric)) {
        throw new Error('Invalid Canvas rubric format');
      }

      // Check if rubric with same name already exists
      const rubricName = canvasRubric.title || 'Untitled Rubric';
      const existingRubric = availableRubrics.find(r => r.name === rubricName);
      if (existingRubric) {
        throw new Error(`A rubric named "${rubricName}" already exists. Please rename or delete the existing rubric first.`);
      }

      // Convert Canvas rubric to CritKey format
      const convertedRubric = convertCanvasRubricToInternal(canvasRubric);

      // Import into rubricStore
      importRubric(convertedRubric);

      setImportSuccess(`Rubric "${rubricName}" imported successfully! Select it from the rubric dropdown in Setup.`);
      setSelectedCourseRubricId(''); // Reset selection

      // Clear success message after 5 seconds
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (error) {
      setImportError(error.message || 'Failed to import rubric');
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {assignment.name}
                      </Typography>
                      {assignment.points_possible !== null && assignment.points_possible !== undefined && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                          {Number.isInteger(assignment.points_possible)
                            ? `${assignment.points_possible} pts`
                            : `${Number(assignment.points_possible).toFixed(1)} pts`}
                        </Typography>
                      )}
                    </Box>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        )}

        {/* Rubric Import Section */}
        {selectedCourse && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Import Rubric from Canvas
            </Typography>

            {!currentCourse && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Please select a course in the <strong>Setup</strong> panel above before importing rubrics.
              </Alert>
            )}

            {importSuccess && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setImportSuccess(null)}>
                {importSuccess}
              </Alert>
            )}

            {importError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportError(null)}>
                {importError}
              </Alert>
            )}

            {/* Assignment Rubric Section */}
            {selectedAssignment && assignmentRubric && isValidCanvasRubric(assignmentRubric) && (
              <Box sx={{ mb: 2, p: 2, backgroundColor: 'rgba(25, 118, 210, 0.08)', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  This assignment has a rubric
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {getCanvasRubricSummary(assignmentRubric).name}
                  {getCanvasRubricSummary(assignmentRubric).pointsPossible !== null &&
                    ` (${getCanvasRubricSummary(assignmentRubric).pointsPossible} pts)`}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  {getCanvasRubricSummary(assignmentRubric).criteriaCount} criteria
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ImportContactsIcon />}
                  onClick={handleImportAssignmentRubric}
                  disabled={!currentCourse}
                  fullWidth
                  sx={{ mt: 1 }}
                >
                  Import Assignment Rubric
                </Button>
              </Box>
            )}

            {/* Course Rubrics Section */}
            {loadingRubrics ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : courseRubrics.length > 0 ? (
              <Stack spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Select Course Rubric</InputLabel>
                  <Select
                    value={selectedCourseRubricId}
                    onChange={(e) => setSelectedCourseRubricId(e.target.value)}
                    label="Select Course Rubric"
                  >
                    {courseRubrics.filter(isValidCanvasRubric).map((rubric) => {
                      const summary = getCanvasRubricSummary(rubric);
                      return (
                        <MenuItem key={rubric.id} value={rubric.id}>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {summary.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {summary.pointsPossible !== null && `${summary.pointsPossible} pts • `}
                              {summary.criteriaCount} criteria
                            </Typography>
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ImportContactsIcon />}
                  onClick={handleImportCourseRubric}
                  disabled={!selectedCourseRubricId || !currentCourse}
                  fullWidth
                >
                  Import Selected Rubric
                </Button>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No rubrics found in this course
              </Typography>
            )}
          </>
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

