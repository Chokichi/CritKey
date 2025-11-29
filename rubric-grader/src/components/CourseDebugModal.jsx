import { useState, useEffect } from 'react';
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
  Chip,
  Box,
  Typography,
} from '@mui/material';
import confetti from 'canvas-confetti';
import useCanvasStore from '../store/canvasStore';

const CourseDebugModal = ({ open, onClose }) => {
  const { apiToken, canvasApiBase } = useCanvasStore();
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && apiToken) {
      fetchAllCourses();
    }
  }, [open, apiToken]);

  const fetchAllCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!apiToken) {
        throw new Error('API token not set.');
      }
      const params = new URLSearchParams({ unfiltered: 'true' });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      // Fetch unfiltered courses for debugging
      const url = params.toString()
        ? `http://localhost:3001/api/courses?${params.toString()}`
        : 'http://localhost:3001/api/courses';
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch courses: ${response.status} ${response.statusText}`;
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData?.error) {
              message = errorData.error;
            }
          } catch (parseError) {
            message = `${message} - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(message);
      }
      const rawText = await response.text();
      let courses;
      try {
        courses = JSON.parse(rawText);
      } catch (parseError) {
        console.error('Failed to parse debug courses JSON:', rawText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response when loading courses.');
      }
      setAllCourses(courses);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const wouldBeFiltered = (course) => {
    const reasons = [];
    
    // Check workflow_state
    if (course.workflow_state !== 'available') {
      reasons.push(`workflow_state: ${course.workflow_state}`);
    }
    
    // Check end date - only filter if course has ended
    if (course.term && course.term.end_at) {
      const now = new Date();
      const endDate = new Date(course.term.end_at);
      if (now > endDate) {
        const daysAgo = Math.ceil((now - endDate) / (1000 * 60 * 60 * 24));
        reasons.push(`ended ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`);
      }
    }
    // If no end date, course is included (assumed active)
    
    return {
      filtered: reasons.length > 0,
      reasons: reasons.length > 0 ? reasons.join(', ') : 'Included',
    };
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const testConfetti = () => {
    // Trigger confetti from both sides of the window (same as the real effect)
    const duration = 3000;
    const end = Date.now() + duration;
    
    const triggerConfetti = () => {
      if (Date.now() > end) return;
      
      // Left side confetti
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.5 },
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'],
      });
      
      // Right side confetti
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.5 },
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'],
      });
      
      requestAnimationFrame(triggerConfetti);
    };
    
    triggerConfetti();
  };

  if (!open) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { zIndex: 1400 }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Course Debug - All Courses</Typography>
          <Button onClick={fetchAllCourses} disabled={loading} size="small">
            Refresh
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            Error: {error}
          </Typography>
        )}
        {loading ? (
          <Typography>Loading courses...</Typography>
        ) : (
          <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Course Name</TableCell>
                  <TableCell>Course Code</TableCell>
                  <TableCell>Canvas ID</TableCell>
                  <TableCell>SIS Course ID</TableCell>
                  <TableCell>Workflow State</TableCell>
                  <TableCell>Term Start</TableCell>
                  <TableCell>Term End</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Filter Reason</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allCourses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No courses found
                    </TableCell>
                  </TableRow>
                ) : (
                  allCourses.map((course) => {
                    const filterInfo = wouldBeFiltered(course);
                    return (
                      <TableRow key={course.id}>
                        <TableCell>{course.name || 'N/A'}</TableCell>
                        <TableCell>{course.course_code || 'N/A'}</TableCell>
                        <TableCell>{course.id || 'N/A'}</TableCell>
                        <TableCell>{course.sis_course_id || 'N/A'}</TableCell>
                        <TableCell>
                          <Chip
                            label={course.workflow_state || 'N/A'}
                            size="small"
                            color={
                              course.workflow_state === 'available'
                                ? 'success'
                                : course.workflow_state === 'completed'
                                ? 'default'
                                : 'error'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {formatDate(course.term?.start_at)}
                        </TableCell>
                        <TableCell>
                          {formatDate(course.term?.end_at)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={filterInfo.filtered ? 'Filtered Out' : 'Included'}
                            size="small"
                            color={filterInfo.filtered ? 'error' : 'success'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color={filterInfo.filtered ? 'error' : 'success'}
                            sx={{ fontSize: '0.75rem' }}
                          >
                            {filterInfo.reasons}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            Filtering Criteria:
          </Typography>
          <Typography variant="body2" component="div">
            • workflow_state must be "available"
            <br />
            • If course has term.end_at, current date must be ≤ end date
            <br />
            • If no end date, course is included (assumed active)
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={testConfetti} color="primary" variant="outlined">
          Test Confetti 🎉
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CourseDebugModal;

