import { create } from 'zustand';
import { 
  cachePdf, 
  getCachedPdf, 
  getCachedAssignments, 
  deleteAssignmentCache as deleteAssignmentCacheUtil, 
  clearAllCache as clearAllCacheUtil, 
  getCacheSize 
} from '../utils/pdfCache';

const API_BASE = 'http://localhost:3001';

const dedupeById = (items = []) => {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const id = item?.id ?? item?.user_id ?? item?.submission_id;
    if (id === undefined || id === null) {
      unique.push(item);
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(item);
    }
  }
  return unique;
};

const filterAssignments = (assignments = [], groupId = 'all') => {
  return assignments.filter((assignment) => {
    const isPublished = assignment?.published === true;
    const hasSubmissions = assignment?.has_submitted_submissions === true;
    const matchesGroup = groupId === 'all' || String(assignment?.assignment_group_id) === String(groupId);
    return isPublished && hasSubmissions && matchesGroup;
  });
};

const useCanvasStore = create((set, get) => ({
  // Canvas API configuration
  apiToken: null,
  canvasApiBase: null,
  
  // Current selection
  selectedCourse: null,
  selectedCourseId: null, // Saved course ID for restoration
  selectedAssignment: null,
  selectedSubmission: null,
  submissionIndex: 0,
  selectedAssignmentGroup: 'all',
  
  // Data
  courses: [],
  assignments: [],
  allAssignments: [],
  assignmentGroups: [],
  submissions: [],
  
  // Meta
  lastRequestUrls: {
    courses: null,
    assignments: null,
    submissions: null,
    assignmentGroups: null,
  },
  
  // PDF Caching
  offlineMode: false,
  cachingProgress: { current: 0, total: 0, isCaching: false },
  cachedAssignments: [],
  parallelDownloadLimit: 3, // 0 = no limit
  
  // Loading states
  loadingCourses: false,
  loadingAssignments: false,
  loadingSubmissions: false,
  
  // Error states
  error: null,

  // Set API token
  setApiToken: (token) => {
    set({ apiToken: token });
    // Store in localStorage
    if (token) {
      localStorage.setItem('canvas_api_token', token);
    } else {
      localStorage.removeItem('canvas_api_token');
    }
  },

  // Set Canvas API base URL
  setCanvasApiBase: (baseUrl) => {
    set({ canvasApiBase: baseUrl });
    if (baseUrl) {
      localStorage.setItem('canvas_api_base', baseUrl);
    } else {
      localStorage.removeItem('canvas_api_base');
    }
  },

  // Initialize from localStorage
  initialize: async () => {
    const token = localStorage.getItem('canvas_api_token');
    const baseUrl = localStorage.getItem('canvas_api_base');
    const offlineMode = localStorage.getItem('canvas_offline_mode') === 'true';
    const savedCourseId = localStorage.getItem('canvas_selected_course_id');
    const savedAssignmentGroupId = localStorage.getItem('canvas_selected_assignment_group_id');
    const savedParallelLimit = localStorage.getItem('canvas_parallel_download_limit');
    
    if (token) {
      set({ apiToken: token });
    }
    if (baseUrl) {
      set({ canvasApiBase: baseUrl });
    }
    if (offlineMode) {
      set({ offlineMode: true });
    }
    if (savedCourseId) {
      set({ selectedCourseId: savedCourseId });
    }
    if (savedAssignmentGroupId) {
      set({ selectedAssignmentGroup: savedAssignmentGroupId });
    }
    if (savedParallelLimit !== null) {
      const limit = parseInt(savedParallelLimit, 10);
      if (!isNaN(limit) && limit >= 0) {
        set({ parallelDownloadLimit: limit });
      }
    }
    
    // Load cached assignments metadata
    try {
      const cached = await getCachedAssignments();
      set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
    } catch (error) {
      console.error('Error loading cached assignments:', error);
      set({ cachedAssignments: [] });
    }
  },

  // Toggle offline mode
  setOfflineMode: (enabled) => {
    localStorage.setItem('canvas_offline_mode', enabled ? 'true' : 'false');
    set({ offlineMode: enabled });
  },

  // Set parallel download limit
  setParallelDownloadLimit: (limit) => {
    const limitValue = Math.max(0, parseInt(limit, 10) || 0);
    localStorage.setItem('canvas_parallel_download_limit', String(limitValue));
    set({ parallelDownloadLimit: limitValue });
  },

  // Cache all PDFs for current assignment (parallel downloads, 3 at a time)
  cacheAllPdfs: async () => {
    const { submissions, selectedAssignment, apiToken } = get();
    if (!submissions.length || !selectedAssignment) {
      return;
    }

    set({ cachingProgress: { current: 0, total: submissions.length, isCaching: true } });

    try {
      // Filter submissions with PDFs and check which ones need caching
      const pdfsToCache = [];
      for (const sub of submissions) {
        const pdfUrl = sub.attachments?.[0]?.url;
        if (!pdfUrl) continue;

        // Check if already cached
        const cached = await getCachedPdf(pdfUrl);
        if (!cached) {
          pdfsToCache.push({ url: pdfUrl, submission: sub });
        }
      }

      // Update total to reflect actual PDFs that need caching
      const totalToCache = pdfsToCache.length;
      const alreadyCached = submissions.length - totalToCache;
      set({ cachingProgress: { current: alreadyCached, total: submissions.length, isCaching: true } });

      // Download in parallel batches
      const { parallelDownloadLimit } = get();
      const batchSize = parallelDownloadLimit === 0 ? pdfsToCache.length : parallelDownloadLimit;
      
      if (batchSize >= pdfsToCache.length) {
        // Download all at once if no limit or limit >= total
        await Promise.all(
          pdfsToCache.map(async ({ url, submission }) => {
            try {
              const proxyUrl = `http://localhost:3001/api/proxy-file?url=${encodeURIComponent(url)}&apiToken=${encodeURIComponent(apiToken)}`;
              const response = await fetch(proxyUrl);
              if (!response.ok) {
                console.warn(`Failed to fetch PDF: ${response.status}`);
                return;
              }

              const blob = await response.blob();
              await cachePdf(url, blob, selectedAssignment.id, submission.id || submission.user_id, selectedAssignment.name);

              // Update progress
              set((state) => ({
                cachingProgress: {
                  current: state.cachingProgress.current + 1,
                  total: state.cachingProgress.total,
                  isCaching: true,
                },
              }));
            } catch (err) {
              console.warn(`Failed to cache PDF:`, err);
              // Still update progress even on error
              set((state) => ({
                cachingProgress: {
                  current: state.cachingProgress.current + 1,
                  total: state.cachingProgress.total,
                  isCaching: true,
                },
              }));
            }
          })
        );
      } else {
        // Download in batches
        for (let i = 0; i < pdfsToCache.length; i += batchSize) {
          const batch = pdfsToCache.slice(i, i + batchSize);
          
          await Promise.all(
            batch.map(async ({ url, submission }) => {
              try {
                const proxyUrl = `http://localhost:3001/api/proxy-file?url=${encodeURIComponent(url)}&apiToken=${encodeURIComponent(apiToken)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                  console.warn(`Failed to fetch PDF: ${response.status}`);
                  return;
                }

                const blob = await response.blob();
                await cachePdf(url, blob, selectedAssignment.id, submission.id || submission.user_id, selectedAssignment.name);

                // Update progress
                set((state) => ({
                  cachingProgress: {
                    current: state.cachingProgress.current + 1,
                    total: state.cachingProgress.total,
                    isCaching: true,
                  },
                }));
              } catch (err) {
                console.warn(`Failed to cache PDF:`, err);
                // Still update progress even on error
                set((state) => ({
                  cachingProgress: {
                    current: state.cachingProgress.current + 1,
                    total: state.cachingProgress.total,
                    isCaching: true,
                  },
                }));
              }
            })
          );
        }
      }

      // Update cached assignments list
      try {
        const cached = await getCachedAssignments();
        set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
      } catch (error) {
        console.error('Error updating cached assignments:', error);
      }
    } catch (error) {
      console.error('Error caching PDFs:', error);
    } finally {
      set({ cachingProgress: { current: 0, total: 0, isCaching: false } });
    }
  },

  // Get cached PDF blob URL
  getCachedPdfUrl: async (fileUrl) => {
    const cached = await getCachedPdf(fileUrl);
    if (cached) {
      return URL.createObjectURL(cached);
    }
    return null;
  },

  // Delete assignment cache
  deleteAssignmentCache: async (assignmentId) => {
    await deleteAssignmentCacheUtil(assignmentId);
    try {
      const cached = await getCachedAssignments();
      set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
    } catch (error) {
      console.error('Error refreshing after delete:', error);
      set({ cachedAssignments: [] });
    }
  },

  // Clear all cache
  clearAllCache: async () => {
    await clearAllCacheUtil();
    set({ cachedAssignments: [] });
  },

  // Refresh cached assignments list
  refreshCachedAssignments: async () => {
    try {
      const cached = await getCachedAssignments();
      set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
    } catch (error) {
      console.error('Error refreshing cached assignments:', error);
      set({ cachedAssignments: [] });
    }
  },

  // Fetch courses
  fetchCourses: async () => {
    const { apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    set({ loadingCourses: true, error: null });
    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      console.log(`[Canvas] Fetching courses from API: ${API_BASE}/api/courses`);
      const response = await fetch(`${API_BASE}/api/courses?${params.toString()}`);
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
            // if the response is HTML or non-JSON, include snippet
            message = `${message} - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(message);
      }
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const coursesDataText = await response.text();
      let courses;
      try {
        courses = JSON.parse(coursesDataText);
      } catch (parseError) {
        console.error('Failed to parse courses JSON:', coursesDataText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading courses. Check the Canvas base URL and token.');
      }
      // Server should already filter, but apply client-side filter as backup
      // Filter to only active courses (workflow_state: "available") that haven't ended
      const now = new Date();
      const activeCourses = courses.filter(course => {
        // Must be available (not deleted, completed, unpublished, etc.)
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
      
      console.log('[Client] Total courses received:', courses.length);
      console.log('[Client] Active courses after filtering:', activeCourses.length);
      console.log('[Client] Course workflow states:', [...new Set(courses.map(c => c.workflow_state))]);
      if (activeCourses.length > 0) {
        console.log('[Client] Active course names:', activeCourses.map(c => c.name).join(', '));
      }
      
      const dedupedCourses = dedupeById(activeCourses);
      set((state) => ({
        courses: dedupedCourses,
        loadingCourses: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          courses: requestUrl,
        },
      }));
      
      // Auto-select saved course if it exists
      const currentState = get();
      const savedCourseId = currentState.selectedCourseId || localStorage.getItem('canvas_selected_course_id');
      if (savedCourseId && dedupedCourses.length > 0) {
        const savedCourse = dedupedCourses.find(c => String(c.id) === String(savedCourseId));
        if (savedCourse) {
          // Use setTimeout to avoid calling setState during render
          setTimeout(() => {
            get().selectCourse(savedCourse);
          }, 0);
        }
      }
    } catch (error) {
      set({ error: error.message, loadingCourses: false });
    }
  },

  // Select course and fetch assignments
  selectCourse: async (course) => {
    // Save course ID to localStorage
    if (course && course.id) {
      localStorage.setItem('canvas_selected_course_id', String(course.id));
      set({ selectedCourseId: String(course.id) });
    } else {
      localStorage.removeItem('canvas_selected_course_id');
      set({ selectedCourseId: null });
    }
    
    // Restore saved assignment group if available
    const savedGroupIdFromStorage = localStorage.getItem('canvas_selected_assignment_group_id');
    const savedGroupId = savedGroupIdFromStorage || 'all';
    
    set({
      selectedCourse: course,
      selectedAssignment: null,
      selectedSubmission: null,
      assignments: [],
      allAssignments: [],
      submissions: [],
      assignmentGroups: [],
      selectedAssignmentGroup: savedGroupId,
    });
    
    // Fetch assignment groups first - this will auto-select the saved group and fetch assignments
    await get().fetchAssignmentGroups(course.id);
    // If no saved group or saved group is 'all', fetch assignments now
    // (fetchAssignmentGroups will handle fetching if a specific group is saved)
    if (!savedGroupIdFromStorage || savedGroupIdFromStorage === 'all') {
      await get().fetchAssignments(course.id, 'all');
    }
  },

  // Fetch assignment groups for a course
  fetchAssignmentGroups: async (courseId) => {
    const { apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      console.log(`[Canvas] Fetching assignment groups for course ${courseId}: ${API_BASE}/api/courses/${courseId}/assignment-groups`);
      const response = await fetch(`${API_BASE}/api/courses/${courseId}/assignment-groups?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch assignment groups: ${response.status} ${response.statusText}`;
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
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const groupsText = await response.text();
      let groups;
      try {
        groups = JSON.parse(groupsText);
      } catch (parseError) {
        console.error('Failed to parse assignment groups JSON:', groupsText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading assignment groups.');
      }
      const dedupedGroups = dedupeById(Array.isArray(groups) ? groups : []);
      set((state) => ({
        assignmentGroups: dedupedGroups,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          assignmentGroups: requestUrl,
        },
      }));
      
      // Auto-select saved assignment group if it exists
      const savedGroupId = localStorage.getItem('canvas_selected_assignment_group_id');
      if (savedGroupId) {
        if (savedGroupId === 'all') {
          // 'all' is always valid
          set({ selectedAssignmentGroup: 'all' });
          // Trigger assignment fetch with 'all'
          setTimeout(() => {
            get().fetchAssignments(courseId, 'all');
          }, 0);
        } else {
          // Check if saved group exists in the fetched groups
          const savedGroup = dedupedGroups.find(g => String(g.id) === String(savedGroupId));
          if (savedGroup) {
            // Use setTimeout to avoid calling setState during render
            setTimeout(() => {
              get().selectAssignmentGroup(savedGroup.id);
            }, 0);
          } else {
            // Saved group not found, default to 'all'
            set({ selectedAssignmentGroup: 'all' });
            setTimeout(() => {
              get().fetchAssignments(courseId, 'all');
            }, 0);
          }
        }
      }
    } catch (error) {
      set({ error: error.message });
    }
  },

  // Fetch assignments for a course
  fetchAssignments: async (courseId, groupOverride) => {
    const { apiToken, canvasApiBase, selectedAssignmentGroup } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    const groupId = groupOverride !== undefined ? groupOverride : selectedAssignmentGroup;

    set({ loadingAssignments: true, error: null });
    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      if (groupId && groupId !== 'all') {
        params.append('assignment_group_id', groupId);
      }
      console.log(`[Canvas] Fetching assignments for course ${courseId}: ${API_BASE}/api/courses/${courseId}/assignments${groupId && groupId !== 'all' ? `?assignment_group_id=${groupId}` : ''}`);
      const response = await fetch(`${API_BASE}/api/courses/${courseId}/assignments?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch assignments: ${response.status} ${response.statusText}`;
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
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const assignmentsText = await response.text();
      let assignments;
      try {
        assignments = JSON.parse(assignmentsText);
      } catch (parseError) {
        console.error('Failed to parse assignments JSON:', assignmentsText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading assignments.');
      }
      const deduped = dedupeById(assignments);
      const filtered = filterAssignments(deduped, groupId || 'all');
      set((state) => ({
        assignments: filtered,
        allAssignments: deduped,
        loadingAssignments: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          assignments: requestUrl,
        },
      }));
    } catch (error) {
      set({ error: error.message, loadingAssignments: false });
    }
  },

  // Select assignment and fetch submissions
  selectAssignment: async (assignment) => {
    const { selectedCourse } = get();
    if (!selectedCourse) {
      set({ error: 'No course selected' });
      return;
    }

    set({ selectedAssignment: assignment, selectedSubmission: null, submissions: [], submissionIndex: 0 });
    await get().fetchSubmissions(selectedCourse.id, assignment.id);
  },

  // Change assignment group filter
  selectAssignmentGroup: async (groupId) => {
    const group = groupId || 'all';
    const { selectedCourse } = get();
    
    // Save assignment group ID to localStorage
    if (group && group !== 'all') {
      localStorage.setItem('canvas_selected_assignment_group_id', String(group));
    } else {
      localStorage.removeItem('canvas_selected_assignment_group_id');
    }
    
    set({ selectedAssignmentGroup: group });
    if (selectedCourse) {
      await get().fetchAssignments(selectedCourse.id, group);
    }
  },

  // Fetch submissions for an assignment
  fetchSubmissions: async (courseId, assignmentId) => {
    const { apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    set({ loadingSubmissions: true, error: null });
    try {
      const params = new URLSearchParams({ apiToken });
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      console.log(`[Canvas] Fetching submissions for course ${courseId}, assignment ${assignmentId}: ${API_BASE}/api/courses/${courseId}/assignments/${assignmentId}/submissions`);
      const response = await fetch(`${API_BASE}/api/courses/${courseId}/assignments/${assignmentId}/submissions?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch submissions: ${response.status} ${response.statusText}`;
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
      const requestUrl = response.headers.get('X-Canvas-Request-Url');
      const submissionsText = await response.text();
      let submissions;
      try {
        submissions = JSON.parse(submissionsText);
      } catch (parseError) {
        console.error('Failed to parse submissions JSON:', submissionsText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading submissions.');
      }
      // Filter to only submissions with attachments (PDFs)
      const submissionsWithFiles = submissions.filter(sub => 
        sub.attachments && sub.attachments.length > 0
      );
      set((state) => ({
        submissions: dedupeById(submissionsWithFiles),
        loadingSubmissions: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          submissions: requestUrl,
        },
      }));
      
      // Auto-select first submission if available
      if (submissionsWithFiles.length > 0) {
        get().selectSubmissionByIndex(0);
      }

      // Cache all PDFs in background if offline mode is enabled
      const { offlineMode } = get();
      if (offlineMode && submissionsWithFiles.length > 0) {
        get().cacheAllPdfs();
      }
    } catch (error) {
      set({ error: error.message, loadingSubmissions: false });
    }
  },

  // Select submission by index
  selectSubmissionByIndex: (index) => {
    const { submissions } = get();
    if (index >= 0 && index < submissions.length) {
      set({ selectedSubmission: submissions[index], submissionIndex: index });
    }
  },

  // Navigate to next submission
  nextSubmission: () => {
    const { submissionIndex, submissions } = get();
    if (submissionIndex < submissions.length - 1) {
      get().selectSubmissionByIndex(submissionIndex + 1);
    }
  },

  // Navigate to previous submission
  previousSubmission: () => {
    const { submissionIndex } = get();
    if (submissionIndex > 0) {
      get().selectSubmissionByIndex(submissionIndex - 1);
    }
  },

  // Submit grade and feedback to Canvas
  submitGrade: async (grade, feedback) => {
    const { selectedCourse, selectedAssignment, selectedSubmission, apiToken, canvasApiBase } = get();
    if (!selectedCourse || !selectedAssignment || !selectedSubmission || !apiToken) {
      set({ error: 'Missing required data for submission' });
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/courses/${selectedCourse.id}/assignments/${selectedAssignment.id}/submissions/${selectedSubmission.user_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiToken,
            posted_grade: grade,
            comment: feedback,
            canvasBase: canvasApiBase,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to submit grade: ${response.status} ${response.statusText}`;
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

      const submissionText = await response.text();
      let updatedSubmission;
      try {
        updatedSubmission = JSON.parse(submissionText);
      } catch (parseError) {
        console.error('Failed to parse submission update JSON:', submissionText);
        throw new Error('Failed to parse submission update response from server.');
      }
      // Update the submission in the list
      const { submissions } = get();
      const updatedSubmissions = submissions.map(sub =>
        sub.id === updatedSubmission.id ? updatedSubmission : sub
      );
      set({ submissions: updatedSubmissions });
      return updatedSubmission;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },
}));

export default useCanvasStore;

