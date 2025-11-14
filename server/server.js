import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
      const error = new Error(`Canvas API error: ${response.status} ${response.statusText} - ${errorText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.body = errorText;
      error.url = url;
      throw error;
    }

    if (response.status === 204) {
      return { data: null, requestUrl: url };
    }

    const data = await response.json();
    return { data, requestUrl: url };
  } catch (error) {
    console.error('Canvas API request failed:', {
      message: error.message,
      status: error.status,
      endpoint: endpoint,
      url: error.url,
    });
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
      const error = new Error(`Canvas API error: ${response.status} ${response.statusText} - ${errorText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.body = errorText;
      error.url = nextUrl;
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
app.get('/api/courses', async (req, res) => {
  try {
    const { apiToken, unfiltered, canvasBase } = req.query;
    if (!apiToken) {
      return res.status(400).json({ error: 'API token required' });
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
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// Get assignments for a course
app.get('/api/courses/:courseId/assignments', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { apiToken, canvasBase, assignment_group_id } = req.query;
    if (!apiToken) {
      return res.status(400).json({ error: 'API token required' });
    }

    const params = new URLSearchParams();
    params.append('per_page', '100');
    params.append('only_published', 'true');
    params.append('include[]', 'submission_summary');
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
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// Get submissions for an assignment
app.get('/api/courses/:courseId/assignments/:assignmentId/submissions', async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const { apiToken, canvasBase } = req.query;
    if (!apiToken) {
      return res.status(400).json({ error: 'API token required' });
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
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// Get a specific submission
app.get('/api/courses/:courseId/assignments/:assignmentId/submissions/:userId', async (req, res) => {
  try {
    const { courseId, assignmentId, userId } = req.params;
    const { apiToken, canvasBase } = req.query;
    if (!apiToken) {
      return res.status(400).json({ error: 'API token required' });
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
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// Update a submission (post grade and feedback)
app.put('/api/courses/:courseId/assignments/:assignmentId/submissions/:userId', async (req, res) => {
  try {
    const { courseId, assignmentId, userId } = req.params;
    const { apiToken, posted_grade, comment, canvasBase } = req.body;
    
    if (!apiToken) {
      return res.status(400).json({ error: 'API token required' });
    }

    const body = {};
    if (posted_grade !== undefined) {
      body.submission = { posted_grade };
    }
    if (comment) {
      body.comment = { text_comment: comment };
    }

    const { data, requestUrl } = await canvasRequest(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      apiToken,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
      canvasBase || CANVAS_API_BASE
    );
    res.set('X-Canvas-Request-Url', requestUrl);
    res.json(data);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// Get assignment groups for a course
app.get('/api/courses/:courseId/assignment-groups', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { apiToken, canvasBase } = req.query;
    if (!apiToken) {
      return res.status(400).json({ error: 'API token required' });
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
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// Proxy file downloads (to handle CORS)
app.get('/api/proxy-file', async (req, res) => {
  try {
    const { url, apiToken } = req.query;
    if (!url || !apiToken) {
      return res.status(400).json({ error: 'URL and API token required' });
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
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`CritKey Pro server running on http://localhost:${PORT}`);
  console.log(`Canvas API Base: ${CANVAS_API_BASE}`);
});

