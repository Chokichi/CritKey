import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import helmet from 'helmet';
import FormData from 'form-data';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Apply security headers with helmet
app.use(helmet({
  // API server doesn't serve HTML, so we can disable CSP
  contentSecurityPolicy: false,
  // Disable HSTS (not needed for HTTP localhost)
  hsts: false,
  // Prevent browsers from MIME-sniffing responses
  noSniff: true,
  // Disable X-Powered-By header to hide Express
  hidePoweredBy: true,
  // Prevent clickjacking
  frameguard: {
    action: 'deny'
  }
}));

// Configure CORS to only allow requests from the frontend
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Vite default port
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting to prevent abuse
// Allow 100 requests per 15 minutes per IP (reasonable for local development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});
app.use('/api/', limiter);

// Middleware to extract Bearer token from Authorization header
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.apiToken = authHeader.substring(7); // Remove 'Bearer ' prefix
  }
  next();
});

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid request parameters' });
  }
  next();
};

// Canvas API base URL - can be configured via environment variable
const CANVAS_API_BASE = process.env.CANVAS_API_BASE || 'https://canvas.instructure.com/api/v1';

const parseLinkHeader = (header) => {
  if (!header) return {};
  return header.split(',').reduce((acc, part) => {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      acc[match[2]] = match[1];
    }
    return acc;
  }, {});
};

// Helper function to make Canvas API requests
async function canvasRequest(endpoint, apiToken, options = {}, baseUrl = CANVAS_API_BASE) {
  const url = `${baseUrl}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Log detailed error server-side for debugging
      console.error('Canvas API request failed:', {
        status: response.status,
        statusText: response.statusText,
        endpoint: endpoint,
      });
      // Return sanitized error to client
      const error = new Error('Canvas API request failed');
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) {
      return { data: null, requestUrl: url };
    }

    const data = await response.json();
    return { data, requestUrl: url };
  } catch (error) {
    // Error already logged above if it's a response error
    // Re-throw with status for route handlers
    throw error;
  }
}

async function canvasRequestAllPages(endpoint, apiToken, options = {}, baseUrl = CANVAS_API_BASE) {
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  let nextUrl = `${baseUrl}${endpoint}`;
  let firstUrl = nextUrl;
  const results = [];

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Log detailed error server-side for debugging
      console.error('Canvas API pagination request failed:', {
        status: response.status,
        statusText: response.statusText,
        endpoint: endpoint,
      });
      // Return sanitized error to client
      const error = new Error('Canvas API request failed');
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return { data, requestUrl: nextUrl };
    }
    results.push(...data);

    const linkHeader = response.headers.get('link');
    const links = parseLinkHeader(linkHeader);
    nextUrl = links.next || null;
  }

  return { data: results, requestUrl: firstUrl };
}

// Get user's courses
app.get('/api/courses', [
  query('unfiltered').optional().isIn(['true', 'false']),
  query('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const apiToken = req.apiToken; // From Authorization header
    const { unfiltered, canvasBase } = req.query;
    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    // Fetch courses with term information and filter for active/available courses
    // Include term data to help identify current semester courses
    const { data, requestUrl } = await canvasRequest('/courses?enrollment_type=teacher&include[]=term&per_page=100', apiToken, {}, canvasBase || CANVAS_API_BASE);
    
    // If unfiltered=true, return all courses without filtering
    if (unfiltered === 'true') {
      console.log(`[Canvas API] Returning ${data.length} unfiltered courses`);
      res.set('X-Canvas-Request-Url', requestUrl);
      return res.json(data);
    }
    
    // Filter for active courses (workflow_state: available) that haven't ended
    const now = new Date();
    const activeCourses = data.filter(course => {
      // Must be available (not deleted, completed, etc.)
      if (course.workflow_state !== 'available') {
        return false;
      }
      
      // Filter by end date - only show courses that haven't ended yet
      // If no end date, include the course (assume it's active)
      if (course.term && course.term.end_at) {
        const endDate = new Date(course.term.end_at);
        // Include courses that haven't ended yet (end date is today or in the future)
        return now <= endDate;
      }
      
      // If no end date, include the course if workflow_state is available
      return true;
    });
    
    // Log filtering results for debugging
    console.log(`[Canvas API] Total courses: ${data.length}, Active courses: ${activeCourses.length}`);
    if (activeCourses.length > 0) {
      console.log('[Canvas API] Active course names:', activeCourses.map(c => c.name).join(', '));
    }
    
    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(activeCourses);
  } catch (error) {
    console.error('Error in /api/courses:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to fetch courses';
    res.status(status).json({ error: message });
  }
});

// Get assignments for a course
app.get('/api/courses/:courseId/assignments', [
  param('courseId').isNumeric(),
  query('canvasBase').optional().isURL(),
  query('assignment_group_id').optional().isNumeric(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { courseId } = req.params;
    const apiToken = req.apiToken; // From Authorization header
    const { canvasBase, assignment_group_id } = req.query;
    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const params = new URLSearchParams();
    params.append('per_page', '100');
    params.append('only_published', 'true');
    params.append('include[]', 'submission_summary');
    params.append('include[]', 'rubric'); // Include rubric data with assignments
    if (assignment_group_id) {
      params.append('assignment_group_id', assignment_group_id);
    }

    const endpoint = `/courses/${courseId}/assignments?${params.toString()}`;
    const { data, requestUrl } = await canvasRequestAllPages(
      endpoint,
      apiToken,
      {},
      canvasBase || CANVAS_API_BASE
    );

    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/courses/:courseId/assignments:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to fetch assignments';
    res.status(status).json({ error: message });
  }
});

// Get submissions for an assignment
app.get('/api/courses/:courseId/assignments/:assignmentId/submissions', [
  param('courseId').isNumeric(),
  param('assignmentId').isNumeric(),
  query('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const apiToken = req.apiToken; // From Authorization header
    const { canvasBase } = req.query;
    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const { data, requestUrl } = await canvasRequest(
      `/courses/${courseId}/assignments/${assignmentId}/submissions?include[]=user&include[]=submission_history&per_page=100`,
      apiToken,
      {},
      canvasBase || CANVAS_API_BASE
    );
    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/courses/:courseId/assignments/:assignmentId/submissions:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to fetch submissions';
    res.status(status).json({ error: message });
  }
});

// Get a specific submission
app.get('/api/courses/:courseId/assignments/:assignmentId/submissions/:userId', [
  param('courseId').isNumeric(),
  param('assignmentId').isNumeric(),
  param('userId').isNumeric(),
  query('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { courseId, assignmentId, userId } = req.params;
    const apiToken = req.apiToken; // From Authorization header
    const { canvasBase } = req.query;
    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const { data, requestUrl } = await canvasRequest(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}?include[]=user&include[]=submission_history`,
      apiToken,
      {},
      canvasBase || CANVAS_API_BASE
    );
    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/courses/:courseId/assignments/:assignmentId/submissions/:userId GET:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to fetch submission';
    res.status(status).json({ error: message });
  }
});

// Batch update submissions (post grades and feedback for multiple students)
app.post('/api/courses/:courseId/assignments/:assignmentId/submissions/update_grades', [
  param('courseId').isNumeric(),
  param('assignmentId').isNumeric(),
  body('grade_data').isObject(),
  body('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const apiToken = req.apiToken; // From Authorization header
    const { grade_data, canvasBase } = req.body;

    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    // First, get the assignment to determine grading type
    let assignment = null;
    try {
      const assignmentResponse = await canvasRequest(
        `/courses/${courseId}/assignments/${assignmentId}`,
        apiToken,
        {},
        canvasBase || CANVAS_API_BASE
      );
      assignment = assignmentResponse.data;
    } catch (err) {
      console.warn('Could not fetch assignment details:', err.message);
    }

    const gradingType = assignment?.grading_type || 'points';

    // Helper function to format grade based on assignment type
    const formatGrade = (postedGrade) => {
      if (!postedGrade) return null;
      
      // If grade is in "earned/possible" format (e.g., "85/100")
      if (typeof postedGrade === 'string' && postedGrade.includes('/')) {
        const [earnedStr, possibleStr] = postedGrade.split('/').map(s => s.trim());
        const earned = parseFloat(earnedStr);
        const possible = parseFloat(possibleStr);
        
        if (!isNaN(earned) && !isNaN(possible) && possible > 0) {
          switch (gradingType) {
            case 'points':
              return earned.toString();
            case 'percent':
              const percentage = (earned / possible) * 100;
              return `${percentage.toFixed(2)}%`;
            case 'letter_grade':
              return earned.toString(); // Canvas will convert
            case 'gpa_scale':
              return earned.toString();
            case 'pass_fail':
              const passPercentage = (earned / possible) * 100;
              return passPercentage >= 60 ? 'pass' : 'fail';
            default:
              return earned.toString();
          }
        }
      }
      return postedGrade;
    };

    // Build form data for Canvas API
    const formData = new FormData();

    // Process each student's grade data
    for (const [userId, data] of Object.entries(grade_data)) {
      if (data.posted_grade !== undefined && data.posted_grade !== null) {
        const formattedGrade = formatGrade(data.posted_grade);
        if (formattedGrade) {
          formData.append(`grade_data[${userId}][posted_grade]`, formattedGrade);
        }
      }
      if (data.text_comment) {
        formData.append(`grade_data[${userId}][text_comment]`, data.text_comment);
        // Include attempt number if provided (Canvas expects comment[attempt] parameter)
        if (data.attempt !== null && data.attempt !== undefined) {
          formData.append(`grade_data[${userId}][comment][attempt]`, String(data.attempt));
        }
      }
    }

    // Make request to Canvas API
    const url = `${canvasBase || CANVAS_API_BASE}/courses/${courseId}/assignments/${assignmentId}/submissions/update_grades`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => null);
      let message = `Failed to batch update grades: ${response.status} ${response.statusText}`;
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

    const progressData = await response.json();
    res.set('X-Canvas-Request-Url', url);
    res.json(progressData);
  } catch (error) {
    console.error('Error in /api/courses/:courseId/assignments/:assignmentId/submissions/update_grades POST:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to batch update grades';
    res.status(status).json({ error: message });
  }
});

// Get progress status for async operations
app.get('/api/progress/:progressId', [
  param('progressId').isNumeric(),
  query('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { progressId } = req.params;
    const apiToken = req.apiToken;
    const { canvasBase } = req.query;

    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const { data, requestUrl } = await canvasRequest(
      `/progress/${progressId}`,
      apiToken,
      {},
      canvasBase || CANVAS_API_BASE
    );

    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/progress/:progressId GET:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to get progress';
    res.status(status).json({ error: message });
  }
});

// Get assignment groups for a course
app.get('/api/courses/:courseId/assignment-groups', [
  param('courseId').isNumeric(),
  query('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { courseId } = req.params;
    const apiToken = req.apiToken; // From Authorization header
    const { canvasBase } = req.query;
    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const { data, requestUrl } = await canvasRequest(
      `/courses/${courseId}/assignment_groups?per_page=100`,
      apiToken,
      {},
      canvasBase || CANVAS_API_BASE
    );
    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/courses/:courseId/assignment-groups:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to fetch assignment groups';
    res.status(status).json({ error: message });
  }
});

// Get all rubrics for a course
app.get('/api/courses/:courseId/rubrics', [
  param('courseId').isNumeric(),
  query('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { courseId } = req.params;
    const apiToken = req.apiToken; // From Authorization header
    const { canvasBase } = req.query;
    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const { data, requestUrl } = await canvasRequestAllPages(
      `/courses/${courseId}/rubrics?per_page=100&include[]=associations`,
      apiToken,
      {},
      canvasBase || CANVAS_API_BASE
    );
    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/courses/:courseId/rubrics:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to fetch rubrics';
    res.status(status).json({ error: message });
  }
});

// Get a specific rubric by ID
app.get('/api/courses/:courseId/rubrics/:rubricId', [
  param('courseId').isNumeric(),
  param('rubricId').isNumeric(),
  query('canvasBase').optional().isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { courseId, rubricId } = req.params;
    const apiToken = req.apiToken; // From Authorization header
    const { canvasBase } = req.query;
    if (!apiToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const { data, requestUrl } = await canvasRequest(
      `/courses/${courseId}/rubrics/${rubricId}?include[]=associations`,
      apiToken,
      {},
      canvasBase || CANVAS_API_BASE
    );
    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/courses/:courseId/rubrics/:rubricId:', error.message);
    const status = error.status || 500;
    const message = error.status === 401 ? 'Authorization required' : 'Failed to fetch rubric';
    res.status(status).json({ error: message });
  }
});

// Proxy file downloads (to handle CORS)
app.get('/api/proxy-file', [
  query('url').isURL(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { url } = req.query;
    const apiToken = req.apiToken; // From Authorization header
    if (!url || !apiToken) {
      return res.status(400).json({ error: 'URL and authorization required' });
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }

    // Forward the content type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Stream the file
    response.body.pipe(res);
  } catch (error) {
    console.error('Error in /api/proxy-file:', error.message);
    res.status(500).json({ error: 'Failed to proxy file' });
  }
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`✅ CritKey Pro server running on http://localhost:${PORT}`);
  console.log(`Canvas API Base: ${CANVAS_API_BASE}`);
});

