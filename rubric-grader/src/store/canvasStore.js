import { create } from 'zustand';
import pLimit from 'p-limit';
import pRetry from 'p-retry';
import confetti from 'canvas-confetti';
import {
  cachePdf,
  getCachedPdf,
  getCachedAssignments,
  deleteAssignmentCache as deleteAssignmentCacheUtil,
  clearAllCache as clearAllCacheUtil,
  getCacheSize,
  cleanupOldCache,
  cleanupCompletedAssignment
} from '../utils/pdfCache';
import {
  getRubricScores,
  saveRubricScore,
  getStagedGrades,
  stageGrade,
  unstageGrade,
  clearStagedGrades,
} from '../utils/localStorage';
import {
  setSecureItem,
  getSecureItem,
  removeSecureItem
} from '../utils/secureStorage';

const API_BASE = 'http://localhost:3001';

// Debug feature flag - set to true to enable debug logging
const DEBUG = import.meta.env.DEV; // Auto-enable in dev, disable in prod

// Debug logging helper - only logs when DEBUG is true
const debugLog = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};

// Helper function to provide user-friendly error messages
const getErrorMessage = (error) => {
  // Detect connection errors (server not running)
  if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
    return 'Backend server not running. Please start the server with: cd server && npm run dev';
  }
  return error.message;
};

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

/**
 * Centralized function to enrich submissions with staged grades, rubric scores, and grading status.
 * This is the single source of truth for enrichment logic to prevent inconsistencies.
 * 
 * @param {Array} submissions - Array of submission objects
 * @param {Object} stagedGrades - Map of assignmentId -> { submissionId -> { grade, feedback } }
 * @param {Object} rubricScores - Map of assignmentId -> { submissionId -> scoreData }
 * @param {string|null} assignmentId - Current assignment ID
 * @returns {Array} Enriched submissions array
 */
const enrichSubmissions = (submissions, stagedGrades, rubricScores, assignmentId) => {
  if (!submissions || submissions.length === 0) return submissions;
  if (!assignmentId) return submissions;

  const assignmentStagedGrades = stagedGrades[assignmentId] || {};
  const assignmentRubricScores = rubricScores[assignmentId] || {};

  return submissions.map(sub => {
    const submissionId = String(sub.user_id || sub.id);
    const hasStagedGrade = assignmentStagedGrades[submissionId] !== undefined;
    const hasRubricScore = assignmentRubricScores[submissionId] !== undefined;

    // Re-calculate isGraded based on current staged grades and Canvas grade
    // This ensures we always have the latest status
    const isGradedInCanvas = (sub.canvasGrade !== null && sub.canvasGrade !== undefined) && !sub.isAutoGradedZero;
    const isGraded = isGradedInCanvas || hasStagedGrade;

    // If we have a staged grade, update the submission with it
    if (hasStagedGrade) {
      return {
        ...sub,
        isGraded: isGraded,
        stagedGrade: assignmentStagedGrades[submissionId],
        rubricScore: assignmentRubricScores[submissionId] || sub.rubricScore || null,
      };
    }

    // If we have a rubric score but no staged grade, update rubricScore
    if (hasRubricScore && !sub.rubricScore) {
      return {
        ...sub,
        isGraded: isGraded,
        rubricScore: assignmentRubricScores[submissionId],
      };
    }

    // Ensure isGraded is correct even if no staged grade or rubric score
    if (sub.isGraded !== isGraded) {
      return {
        ...sub,
        isGraded: isGraded,
      };
    }

    return sub;
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
  currentAssignmentRequestId: null, // Track in-flight assignment requests
  
  // Data
  courses: [],
  assignments: [],
  allAssignments: [],
  assignmentGroups: [],
  prefetchedAssignmentGroups: {}, // Map of courseId -> groups for prefetched data
  submissions: [], // Filtered/sorted submissions for display
  allSubmissions: [], // All submissions (unfiltered) for caching
  courseRubrics: [], // All rubrics available in the selected course
  assignmentRubric: null, // Rubric attached to selected assignment (if any)
  
  // Meta
  lastRequestUrls: {
    courses: null,
    assignments: null,
    submissions: null,
    assignmentGroups: null,
  },
  
  // PDF Caching
  offlineMode: false,
  cachingProgress: { current: 0, total: 0, isCaching: false, failed: [] }, // Track failed downloads
  cachedAssignments: [],
  parallelDownloadLimit: 3, // 0 = no limit
  
  // Grading and sorting
  sortBy: 'all', // 'all' | 'graded' | 'ungraded' - default to 'all' to show all submissions
  rubricScores: {}, // Map of assignmentId -> { submissionId -> scoreData }
  stagedGrades: {}, // Map of assignmentId -> { submissionId -> { grade, feedback } }
  confettiShownForAssignment: null, // Track which assignment we've shown confetti for
  
  // Loading states
  loadingCourses: false,
  loadingAssignments: false,
  loadingSubmissions: false,
  pushingGrades: false,
  loadingRubrics: false,
  
  // Error states
  error: null,

  // Set API token
  setApiToken: (token) => {
    set({ apiToken: token });
    // Store in encrypted sessionStorage (cleared on browser close)
    if (token) {
      setSecureItem('canvas_api_token', token);
    } else {
      removeSecureItem('canvas_api_token');
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

  // Initialize from sessionStorage (encrypted)
  initialize: async () => {
    const token = getSecureItem('canvas_api_token');
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

    // Auto-cleanup: Remove PDFs older than 7 days
    try {
      await cleanupOldCache(7);
    } catch (error) {
      console.error('Error cleaning up old cache:', error);
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

  // Cache all PDFs for current assignment (optimized parallel downloads with retry logic)
  cacheAllPdfs: async (requestId) => {
    const { allSubmissions, selectedAssignment, apiToken, currentAssignmentRequestId } = get();
    if (!allSubmissions.length || !selectedAssignment) {
      return;
    }

    // Validate request is still current
    if (currentAssignmentRequestId !== requestId) {
      debugLog('[cacheAllPdfs] Request cancelled - assignment changed');
      return;
    }

    set({ cachingProgress: { current: 0, total: allSubmissions.length, isCaching: true, failed: [] } });

    try {
      // Filter submissions with PDFs and check which ones need caching
      // Use allSubmissions (unfiltered) to cache all PDFs regardless of sort filter
      const pdfsToCache = [];
      for (const sub of allSubmissions) {
        // Use the same URL extraction logic as App.jsx
        let pdfUrl = null;

        // Try attachments array first
        if (sub.attachments && sub.attachments.length > 0) {
          const pdfAttachment = sub.attachments.find(att =>
            att.content_type?.includes('pdf') ||
            att.filename?.toLowerCase().endsWith('.pdf') ||
            att.url
          ) || sub.attachments[0];
          pdfUrl = pdfAttachment?.url || null;
        }

        // Fall back to submission_history if attachments not in main object
        if (!pdfUrl && sub.submission_history && sub.submission_history.length > 0) {
          for (const historyItem of sub.submission_history) {
            if (historyItem.attachments && historyItem.attachments.length > 0) {
              const pdfAttachment = historyItem.attachments.find(att =>
                att.content_type?.includes('pdf') ||
                att.filename?.toLowerCase().endsWith('.pdf') ||
                att.url
              ) || historyItem.attachments[0];
              if (pdfAttachment?.url) {
                pdfUrl = pdfAttachment.url;
                break;
              }
            }
          }
        }

        if (!pdfUrl) continue;

        // Check if already cached by assignmentId + submissionId (more reliable than URL)
        const submissionId = String(sub.id || sub.user_id);
        const cached = await getCachedPdf(pdfUrl, {
          assignmentId: selectedAssignment.id,
          submissionId: submissionId,
        });
        if (!cached) {
          pdfsToCache.push({ url: pdfUrl, submission: sub });
        }
      }

      // Update total to reflect actual PDFs that need caching
      const totalToCache = pdfsToCache.length;
      const alreadyCached = allSubmissions.length - totalToCache;
      set({ cachingProgress: { current: alreadyCached, total: allSubmissions.length, isCaching: true, failed: [] } });

      // Check again before starting cache downloads
      if (get().currentAssignmentRequestId !== requestId) {
        debugLog('[cacheAllPdfs] Request cancelled before downloads');
        set({ cachingProgress: { current: 0, total: 0, isCaching: false, failed: [] } });
        return;
      }

      // Optimized parallel downloads with p-limit and retry logic
      const { parallelDownloadLimit } = get();
      // When rate limit is 0 (unlimited), use 20 concurrent downloads for optimal browser performance
      // Otherwise use the configured limit
      const concurrency = parallelDownloadLimit === 0 ? 20 : parallelDownloadLimit;
      const limit = pLimit(concurrency);

      debugLog(`[cacheAllPdfs] Starting download with concurrency: ${concurrency} (limit: ${parallelDownloadLimit})`);

      // Define download function with retry logic
      const downloadPdf = async ({ url, submission }) => {
        const submissionId = submission.id || submission.user_id;

        try {
          // Use p-retry to automatically retry failed downloads
          await pRetry(
            async () => {
              // Check if request is still current before each attempt
              if (get().currentAssignmentRequestId !== requestId) {
                throw new pRetry.AbortError('Request cancelled');
              }

              const proxyUrl = `${API_BASE}/api/proxy-file?url=${encodeURIComponent(url)}`;
              const response = await fetch(proxyUrl, {
                headers: {
                  'Authorization': `Bearer ${apiToken}`,
                  'Content-Type': 'application/json'
                }
              });

              if (!response.ok) {
                // Distinguish between retryable and non-retryable errors
                if (response.status === 404) {
                  // Don't retry 404s - file doesn't exist
                  throw new pRetry.AbortError(`PDF not found (404): ${url}`);
                }
                if (response.status >= 400 && response.status < 500) {
                  // Don't retry other 4xx errors (client errors)
                  throw new pRetry.AbortError(`Client error (${response.status}): ${url}`);
                }
                // Retry 5xx (server errors) and network errors
                throw new Error(`Server error (${response.status})`);
              }

              const blob = await response.blob();

              // Validate blob has content
              if (blob.size === 0) {
                throw new Error('Downloaded PDF is empty');
              }

              await cachePdf(url, blob, selectedAssignment.id, submissionId, selectedAssignment.name);

              debugLog(`[cacheAllPdfs] Successfully cached PDF for submission ${submissionId}`);
            },
            {
              retries: 3,
              minTimeout: 1000,    // Start with 1 second
              maxTimeout: 10000,   // Max 10 seconds between retries
              factor: 2,           // Exponential backoff: 1s, 2s, 4s
              onFailedAttempt: (error) => {
                if (error.retriesLeft > 0) {
                  debugLog(`[cacheAllPdfs] Retry ${3 - error.retriesLeft}/3 for submission ${submissionId}: ${error.message}`);
                }
              }
            }
          );

          // Success - update progress
          set((state) => ({
            cachingProgress: {
              current: state.cachingProgress.current + 1,
              total: state.cachingProgress.total,
              isCaching: true,
              failed: state.cachingProgress.failed, // Preserve failed array
            },
          }));
        } catch (err) {
          // Failed after all retries or aborted
          if (err.message !== 'Request cancelled') {
            console.warn(`[cacheAllPdfs] Failed to cache PDF for submission ${submissionId} after retries:`, err.message);
          }
          // Still update progress and track failure
          set((state) => ({
            cachingProgress: {
              current: state.cachingProgress.current + 1,
              total: state.cachingProgress.total,
              isCaching: true,
              failed: [...state.cachingProgress.failed, { submissionId, error: err.message }],
            },
          }));
        }
      };

      // Execute all downloads with concurrency control
      await Promise.all(
        pdfsToCache.map(pdf => limit(() => downloadPdf(pdf)))
      );

      // Check again before updating cached assignments
      if (get().currentAssignmentRequestId !== requestId) {
        debugLog('[cacheAllPdfs] Request cancelled before updating cached assignments');
        set({ cachingProgress: { current: 0, total: 0, isCaching: false } });
        return;
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
      // Preserve progress counts when stopping (don't reset to 0/0)
      set((state) => ({
        cachingProgress: {
          ...state.cachingProgress,
          isCaching: false
        }
      }));
    }
  },

  // Wrapper for manual PDF caching from UI (provides currentAssignmentRequestId)
  cacheAllPdfsManual: () => {
    const { currentAssignmentRequestId } = get();
    if (!currentAssignmentRequestId) {
      console.warn('[cacheAllPdfsManual] No assignment selected for caching');
      return;
    }
    get().cacheAllPdfs(currentAssignmentRequestId);
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
      const params = new URLSearchParams();
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const url = params.toString() ? `${API_BASE}/api/courses?${params.toString()}` : `${API_BASE}/api/courses`;
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
      
      
      const dedupedCourses = dedupeById(activeCourses);
      set((state) => ({
        courses: dedupedCourses,
        loadingCourses: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          courses: requestUrl,
        },
      }));

      // Prefetch assignment groups for all courses in parallel
      // This optimizes UX by avoiding separate fetches when courses are selected
      if (dedupedCourses.length > 0) {
        const groupsMap = {};
        try {
          await Promise.all(
            dedupedCourses.map(async (course) => {
              try {
                const params = new URLSearchParams();
                if (canvasApiBase) {
                  params.append('canvasBase', canvasApiBase);
                }
                const url = params.toString()
                  ? `${API_BASE}/api/courses/${course.id}/assignment-groups?${params.toString()}`
                  : `${API_BASE}/api/courses/${course.id}/assignment-groups`;
                const response = await fetch(url, {
                  headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                  }
                });
                if (response.ok) {
                  const groups = await response.json();
                  groupsMap[course.id] = dedupeById(Array.isArray(groups) ? groups : []);
                }
              } catch (err) {
                // Silently fail for individual course groups - not critical
                console.warn(`Failed to prefetch groups for course ${course.id}:`, err);
              }
            })
          );
          // Store prefetched groups
          set({ prefetchedAssignmentGroups: groupsMap });
        } catch (err) {
          console.warn('Failed to prefetch assignment groups:', err);
        }
      }

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
      set({ error: getErrorMessage(error), loadingCourses: false });
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
    const { apiToken, canvasApiBase, prefetchedAssignmentGroups } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    // Check if groups are already prefetched
    if (prefetchedAssignmentGroups[courseId]) {
      debugLog('[fetchAssignmentGroups] Using prefetched groups for course', courseId);
      set({ assignmentGroups: prefetchedAssignmentGroups[courseId] });

      // Still execute auto-selection logic below
      const savedGroupId = localStorage.getItem('canvas_selected_assignment_group_id');
      if (savedGroupId) {
        if (savedGroupId === 'all') {
          set({ selectedAssignmentGroup: 'all' });
        } else {
          const savedGroup = prefetchedAssignmentGroups[courseId].find(g => String(g.id) === String(savedGroupId));
          if (savedGroup) {
            set({ selectedAssignmentGroup: savedGroupId });
            await get().fetchAssignments(courseId, savedGroupId);
          } else {
            set({ selectedAssignmentGroup: 'all' });
          }
        }
      }
      return;
    }

    try {
      const params = new URLSearchParams();
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const url = params.toString()
        ? `${API_BASE}/api/courses/${courseId}/assignment-groups?${params.toString()}`
        : `${API_BASE}/api/courses/${courseId}/assignment-groups`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
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
      set({ error: getErrorMessage(error) });
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
      const params = new URLSearchParams();
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      if (groupId && groupId !== 'all') {
        params.append('assignment_group_id', groupId);
      }
      const url = params.toString()
        ? `${API_BASE}/api/courses/${courseId}/assignments?${params.toString()}`
        : `${API_BASE}/api/courses/${courseId}/assignments`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
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
      set({ error: getErrorMessage(error), loadingAssignments: false });
    }
  },

  // Select assignment and fetch submissions
  selectAssignment: async (assignment) => {
    const { selectedCourse } = get();
    if (!selectedCourse) {
      set({ error: 'No course selected' });
      return;
    }

    // Reset confetti flag when selecting a new assignment
    set({ confettiShownForAssignment: null });

    // Generate unique request ID for this assignment selection
    const requestId = `${assignment.id}_${Date.now()}`;

    // Check if assignment has a rubric
    const hasRubric = assignment && assignment.rubric && Array.isArray(assignment.rubric);
    const assignmentRubric = hasRubric ? {
      id: assignment.rubric_id || assignment.id,
      title: assignment.rubric_settings?.title || `${assignment.name} Rubric`,
      points_possible: assignment.rubric_settings?.points_possible || assignment.points_possible,
      data: assignment.rubric,
    } : null;

    // Single atomic state update with request tracking
    set({
      selectedAssignment: assignment,
      selectedSubmission: null,
      submissions: [],
      allSubmissions: [],
      submissionIndex: 0,
      assignmentRubric: assignmentRubric,
      currentAssignmentRequestId: requestId, // Mark this request as current
    });

    await get().fetchSubmissions(selectedCourse.id, assignment.id, requestId);
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
  fetchSubmissions: async (courseId, assignmentId, requestId) => {
    const { apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }

    set({ loadingSubmissions: true, error: null });
    try {
      const params = new URLSearchParams();
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const url = params.toString()
        ? `${API_BASE}/api/courses/${courseId}/assignments/${assignmentId}/submissions?${params.toString()}`
        : `${API_BASE}/api/courses/${courseId}/assignments/${assignmentId}/submissions`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
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
      // Log raw submissions from API
      debugLog('[Submission Debug] Raw submissions from Canvas API:', submissions.length);
      debugLog('[Submission Debug] First submission sample:', submissions[0]);

      // Filter to only submissions with attachments (PDFs)
      // Check both top-level attachments and submission_history
      const submissionsWithFiles = submissions.filter(sub => {
        // Check top-level attachments first
        if (sub.attachments && sub.attachments.length > 0) {
          return true;
        }

        // Fall back to submission_history if attachments not in main object
        if (sub.submission_history && sub.submission_history.length > 0) {
          for (const historyItem of sub.submission_history) {
            if (historyItem.attachments && historyItem.attachments.length > 0) {
              return true;
            }
          }
        }

        return false;
      });

      debugLog('[Submission Debug] After attachments filter:', submissionsWithFiles.length);
      
      // Load rubric scores and staged grades
      // Use store's stagedGrades if available (more up-to-date), otherwise fall back to localStorage
      const state = get();
      const storedStagedGrades = state.stagedGrades[assignmentId] || {};
      const localStorageStagedGrades = getStagedGrades(assignmentId);
      // Merge: store's version takes precedence, but include any from localStorage that aren't in store
      const stagedGrades = { ...localStorageStagedGrades, ...storedStagedGrades };
      
      const rubricScores = getRubricScores(assignmentId);
      
      // Enrich submissions with graded status and rubric scores
      const enrichedSubmissions = submissionsWithFiles.map(sub => {
        const submissionId = String(sub.user_id || sub.id);
        const canvasGrade = sub.grade;
        const canvasScore = sub.score;
        
        // Check if submission is late
        const isLate = sub.late === true || (sub.submitted_at && sub.cached_due_date && 
                     new Date(sub.submitted_at) > new Date(sub.cached_due_date));
        
        // Check if graded in Canvas (but exclude auto-graded zeros)
        // A grade of "0" or score of 0 on a late submission typically means auto-graded and still needs manual grading
        const isAutoGradedZero = isLate && 
                                  (canvasGrade === "0" || canvasGrade === 0 || canvasScore === 0) && 
                                  !rubricScores[submissionId] && 
                                  !stagedGrades[submissionId];
        const isGradedInCanvas = (canvasGrade !== null && canvasGrade !== undefined) && !isAutoGradedZero;
        const hasRubricScore = rubricScores[submissionId] !== undefined;
        const hasStagedGrade = stagedGrades[submissionId] !== undefined;
        const isGraded = isGradedInCanvas || hasStagedGrade;

        // Debug logging for submissions with staged grades
        if (hasStagedGrade) {
          console.log(`[fetchSubmissions] Enriching submission ${submissionId}:`, {
            submissionId,
            isGradedInCanvas,
            hasStagedGrade,
            isGraded,
            stagedGradeData: stagedGrades[submissionId],
            canvasGrade,
            isAutoGradedZero,
            subUserId: sub.user_id,
            subId: sub.id,
          });
        }

        // Determine submission status
        const status = isLate ? 'late' : (isAutoGradedZero ? 'auto-graded' : null);

        return {
          ...sub,
          isGraded: isGraded,
          canvasGrade: canvasGrade,
          canvasScore: canvasScore,
          rubricScore: rubricScores[submissionId] || null,
          stagedGrade: stagedGrades[submissionId] || null,
          isLate: isLate,
          status: status,
          isAutoGradedZero: isAutoGradedZero,
        };
      });
      
      const dedupedSubmissions = dedupeById(enrichedSubmissions);

      debugLog('[Submission Debug] After enrichment and deduplication:', dedupedSubmissions.length);
      debugLog('[Submission Debug] Enriched submission sample (isGraded, canvasGrade):', {
        isGraded: dedupedSubmissions[0]?.isGraded,
        canvasGrade: dedupedSubmissions[0]?.canvasGrade,
        canvasScore: dedupedSubmissions[0]?.canvasScore,
        isAutoGradedZero: dedupedSubmissions[0]?.isAutoGradedZero
      });
      debugLog('[Submission Debug] Current sortBy value:', get().sortBy);

      // Check if this request is still current before updating state
      const currentState = get();
      if (currentState.currentAssignmentRequestId !== requestId) {
        debugLog('[fetchSubmissions] Request cancelled - assignment changed');
        return; // Abort silently
      }

      set((state) => ({
        allSubmissions: dedupedSubmissions, // Store unfiltered list for caching
        submissions: dedupedSubmissions, // Will be filtered by applySorting
        rubricScores: { ...state.rubricScores, [assignmentId]: rubricScores },
        stagedGrades: { ...state.stagedGrades, [assignmentId]: stagedGrades },
        loadingSubmissions: false,
        lastRequestUrls: {
          ...state.lastRequestUrls,
          submissions: requestUrl,
        },
      }));

      // Check again before applying sorting
      if (get().currentAssignmentRequestId !== requestId) {
        debugLog('[fetchSubmissions] Request cancelled before applySorting');
        return;
      }

      // Apply sorting (this will filter submissions for display)
      get().applySorting();

      // Check again before auto-selecting submission
      if (get().currentAssignmentRequestId !== requestId) {
        debugLog('[fetchSubmissions] Request cancelled before auto-select');
        return;
      }

      // Auto-select first submission if available
      const { submissions: sortedSubmissions, selectedSubmission } = get();
      debugLog('[Submission Debug] After sorting, submissions count:', sortedSubmissions.length);
      debugLog('[Submission Debug] Currently selected submission:', selectedSubmission?.user?.name || 'None');

      // Only auto-select if no submission is currently selected
      // or if the current selection is not in the filtered list
      if (sortedSubmissions.length > 0) {
        if (!selectedSubmission) {
          // No submission selected, select the first one
          debugLog('[Submission Debug] No submission selected, auto-selecting first one');
          get().selectSubmissionByIndex(0);
          debugLog('[Submission Debug] After auto-select, selectedSubmission:', get().selectedSubmission?.user?.name);
        } else {
          // Check if current selection is still in the filtered list
          const currentIndex = sortedSubmissions.findIndex(sub =>
            String(sub.user_id || sub.id) === String(selectedSubmission.user_id || selectedSubmission.id)
          );
          debugLog('[Submission Debug] Current selection index in filtered list:', currentIndex);
          if (currentIndex < 0) {
            // Current selection was filtered out, select the first one
            debugLog('[Submission Debug] Current selection filtered out, selecting first one');
            get().selectSubmissionByIndex(0);
          }
        }
      } else {
        debugLog('[Submission Debug] No submissions available to select');
      }

      // Check again before caching PDFs
      if (get().currentAssignmentRequestId !== requestId) {
        debugLog('[fetchSubmissions] Request cancelled before cacheAllPdfs');
        return;
      }

      // Cache all PDFs in background if offline mode is enabled
      // Use allSubmissions (unfiltered) for caching, not the filtered list
      const { offlineMode, allSubmissions } = get();
      if (offlineMode && allSubmissions.length > 0) {
        get().cacheAllPdfs(requestId);
      }
    } catch (error) {
      set({ error: getErrorMessage(error), loadingSubmissions: false });
    }
  },

  // Select submission by index
  selectSubmissionByIndex: (index) => {
    const { submissions } = get();
    if (index >= 0 && index < submissions.length) {
      set({ selectedSubmission: submissions[index], submissionIndex: index });
    }
  },

  // Navigate to next submission (cycles back to first)
  nextSubmission: () => {
    const { submissionIndex, submissions } = get();
    if (submissions.length === 0) return;

    // Cycle to first submission if at the end
    const nextIndex = submissionIndex >= submissions.length - 1 ? 0 : submissionIndex + 1;
    get().selectSubmissionByIndex(nextIndex);
  },

  // Navigate to next ungraded submission (prioritizes ungraded)
  nextUngradedSubmission: () => {
    const { submissionIndex, submissions } = get();
    if (submissions.length === 0) return;

    // Helper to check if submission needs grading
    const needsGrading = (sub) => !sub.isGraded || sub.isAutoGradedZero;

    // Search from current position + 1 to end
    for (let i = submissionIndex + 1; i < submissions.length; i++) {
      if (needsGrading(submissions[i])) {
        get().selectSubmissionByIndex(i);
        return;
      }
    }

    // Wrap around: search from beginning to current position
    for (let i = 0; i < submissionIndex; i++) {
      if (needsGrading(submissions[i])) {
        get().selectSubmissionByIndex(i);
        return;
      }
    }

    // No ungraded submissions found, fall back to regular next
    get().nextSubmission();
  },

  // Navigate to previous submission (cycles to last)
  previousSubmission: () => {
    const { submissionIndex, submissions } = get();
    if (submissions.length === 0) return;

    // Cycle to last submission if at the beginning
    const prevIndex = submissionIndex <= 0 ? submissions.length - 1 : submissionIndex - 1;
    get().selectSubmissionByIndex(prevIndex);
  },

  // Save rubric score for current submission
  saveRubricScoreForSubmission: (score, feedback) => {
    const { selectedAssignment, selectedSubmission } = get();
    if (!selectedAssignment || !selectedSubmission) return;
    
    const submissionId = String(selectedSubmission.user_id || selectedSubmission.id);
    const scoreData = {
      score,
      feedback,
      timestamp: new Date().toISOString(),
    };
    
    // Save to localStorage
    saveRubricScore(selectedAssignment.id, submissionId, scoreData);

    // Stage the grade (don't push to Canvas yet)
    const stagedGradeData = {
      grade: score.toString(),
      feedback,
    };
    stageGrade(selectedAssignment.id, submissionId, stagedGradeData);

    // Debug: Log the staged grade data to verify feedback is stored correctly
    const feedbackLines = stagedGradeData.feedback?.split('\n') || [];
    const firstTwoLines = feedbackLines.slice(0, 2).join('\n') || 'no feedback';
    debugLog(`[saveRubricScoreForSubmission] Staged grade for submission ${submissionId}:`, {
      assignmentId: selectedAssignment.id,
      submissionId,
      grade: stagedGradeData.grade,
      feedbackLength: stagedGradeData.feedback?.length || 0,
      feedbackFirstTwoLines: firstTwoLines,
      feedbackPreview: stagedGradeData.feedback?.substring(0, 100) || 'no feedback',
    });
    console.log(`[saveRubricScoreForSubmission] First 2 lines of feedback for submission ${submissionId}:`, firstTwoLines);

    // Only update metadata (rubricScores and stagedGrades) - don't touch arrays
    // applySorting will handle enriching and updating arrays based on this metadata
    set((state) => {
      const assignmentId = selectedAssignment.id;

      // Update rubric scores
      const newRubricScores = { ...state.rubricScores };
      if (!newRubricScores[assignmentId]) {
        newRubricScores[assignmentId] = {};
      }
      newRubricScores[assignmentId][submissionId] = scoreData;

      // Update staged grades
      const newStagedGrades = { ...state.stagedGrades };
      if (!newStagedGrades[assignmentId]) {
        newStagedGrades[assignmentId] = {};
      }
      newStagedGrades[assignmentId][submissionId] = {
        grade: score.toString(),
        feedback,
      };

      debugLog(`[saveRubricScoreForSubmission] Updated metadata for submission ${submissionId}:`, {
        assignmentId,
        submissionId,
        grade: score.toString(),
        feedbackLength: feedback?.length || 0,
      });

      return {
        rubricScores: newRubricScores,
        stagedGrades: newStagedGrades,
        // NO array updates here - applySorting will handle that
      };
    });
    
    // Re-apply sorting to enrich and update arrays based on updated metadata
    get().applySorting();
    
    // Check if all submissions are now graded and trigger confetti
    // Use setTimeout to ensure applySorting has completed and state is updated
    setTimeout(() => {
      const { allSubmissions, selectedAssignment, confettiShownForAssignment } = get();
      if (selectedAssignment && allSubmissions.length > 0) {
        const assignmentId = selectedAssignment.id;
        const allGraded = allSubmissions.every(sub => sub.isGraded && !sub.isAutoGradedZero);
        
        // Only show confetti if all are graded AND we haven't shown it for this assignment yet
        if (allGraded && confettiShownForAssignment !== assignmentId) {
          // Mark that we've shown confetti for this assignment
          set({ confettiShownForAssignment: assignmentId });
          
          // Trigger confetti from both sides of the window
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
        }
      }
    }, 100); // Small delay to ensure applySorting has completed
  },

  // Unstage grade for current submission
  unstageGradeForSubmission: () => {
    const { selectedAssignment, selectedSubmission, stagedGrades } = get();
    if (!selectedAssignment || !selectedSubmission) return;
    
    const submissionId = String(selectedSubmission.user_id || selectedSubmission.id);
    const assignmentId = selectedAssignment.id;
    
    // Check if there's actually a staged grade
    const hasStagedGrade = stagedGrades[assignmentId]?.[submissionId];
    if (!hasStagedGrade) return;
    
    // Remove from localStorage
    unstageGrade(assignmentId, submissionId);
    
    // Only update metadata (stagedGrades) - don't touch arrays
    // applySorting will handle enriching and updating arrays based on this metadata
    set((state) => {
      let newStagedGrades = { ...state.stagedGrades };
      if (newStagedGrades[assignmentId]) {
        const assignmentStaged = { ...newStagedGrades[assignmentId] };
        delete assignmentStaged[submissionId];
        // Clean up empty assignment objects
        if (Object.keys(assignmentStaged).length === 0) {
          const updatedStagedGrades = { ...newStagedGrades };
          delete updatedStagedGrades[assignmentId];
          newStagedGrades = updatedStagedGrades;
        } else {
          newStagedGrades[assignmentId] = assignmentStaged;
        }
      }
      
      debugLog(`[unstageGradeForSubmission] Removed staged grade for submission ${submissionId}`);
      
      return {
        stagedGrades: newStagedGrades,
        // NO array updates here - applySorting will handle that
      };
    });
    
    // Re-apply sorting to enrich and update arrays based on updated metadata
    get().applySorting();
    
    debugLog(`[unstageGradeForSubmission] Unstaged grade for submission ${submissionId}`);
  },

  // Set sort order
  setSortBy: (sortBy) => {
    set({ sortBy });
    get().applySorting();
  },

  // Apply sorting to submissions (for display only, doesn't affect allSubmissions)
  applySorting: () => {
    const { allSubmissions, sortBy, stagedGrades, selectedAssignment, rubricScores } = get();
    debugLog('[applySorting] Starting with allSubmissions:', allSubmissions.length, 'sortBy:', sortBy);
    if (!allSubmissions.length) return;

    // Use centralized enrichment function - single source of truth
    const assignmentId = selectedAssignment?.id;
    const enriched = enrichSubmissions(allSubmissions, stagedGrades, rubricScores, assignmentId);

    // Start with enriched submissions, then filter/sort for display
    let sorted = [...enriched];
    
    // Debug: Check for submissions with staged grades
    if (selectedAssignment) {
      const assignmentStagedGrades = stagedGrades[selectedAssignment.id] || {};
      const stagedSubmissionIds = Object.keys(assignmentStagedGrades);
      if (stagedSubmissionIds.length > 0) {
        console.log(`[applySorting] Found ${stagedSubmissionIds.length} staged grades for assignment ${selectedAssignment.id}`);
        stagedSubmissionIds.forEach(subId => {
          const sub = sorted.find(s => String(s.user_id || s.id) === subId);
          if (sub) {
            console.log(`[applySorting] Submission ${subId} in sorted array:`, {
              submissionId: subId,
              isGraded: sub.isGraded,
              hasStagedGrade: !!sub.stagedGrade,
              stagedGradeGrade: sub.stagedGrade?.grade,
            });
          } else {
            console.warn(`[applySorting] Staged submission ${subId} not found in sorted array!`);
          }
        });
      }
    }

    if (sortBy === 'ungraded') {
      // Show ungraded submissions (including auto-graded zeros)
      debugLog('[applySorting] Filtering for ungraded. Sample sub.isGraded:', sorted[0]?.isGraded, 'sub.isAutoGradedZero:', sorted[0]?.isAutoGradedZero);
      sorted = sorted.filter(sub => !sub.isGraded || sub.isAutoGradedZero);
      debugLog('[applySorting] After ungraded filter:', sorted.length);
    } else if (sortBy === 'graded') {
      // Show only fully graded (exclude auto-graded zeros)
      sorted = sorted.filter(sub => sub.isGraded && !sub.isAutoGradedZero);
      debugLog('[applySorting] After graded filter:', sorted.length);
    }
    // 'all' shows everything, no filter needed

    // Sort: ungraded first (including auto-graded zeros), then by student last name
    sorted.sort((a, b) => {
      // First, prioritize ungraded (including auto-graded zeros)
      const aNeedsGrading = !a.isGraded || a.isAutoGradedZero;
      const bNeedsGrading = !b.isGraded || b.isAutoGradedZero;
      if (aNeedsGrading !== bNeedsGrading) {
        return aNeedsGrading ? -1 : 1;
      }
      // Then sort by student last name (sortable_name is "Last, First" format in Canvas)
      const nameA = a.user?.sortable_name || a.user?.name || '';
      const nameB = b.user?.sortable_name || b.user?.name || '';
      return nameA.localeCompare(nameB);
    });

    // Calculate new submission index if needed
    const { selectedSubmission, submissionIndex } = get();
    let newIndex = submissionIndex;
    if (selectedSubmission) {
      const foundIndex = sorted.findIndex(sub =>
        String(sub.user_id || sub.id) === String(selectedSubmission.user_id || selectedSubmission.id)
      );
      if (foundIndex >= 0) {
        newIndex = foundIndex;
      }
    }

    // Single atomic state update for both submissions, allSubmissions, and index
    // Update allSubmissions with enriched data so StudentSelector dropdown sees the updates
    set({
      submissions: sorted,
      allSubmissions: enriched, // Update allSubmissions with enriched data
      submissionIndex: newIndex
    });
  },

  // Push all staged grades to Canvas
  pushAllStagedGrades: async (includeComments = true) => {
    const { selectedCourse, selectedAssignment, apiToken, canvasApiBase, stagedGrades } = get();
    if (!selectedCourse || !selectedAssignment || !apiToken) {
      set({ error: 'Missing required data for pushing grades' });
      return;
    }

    const assignmentId = selectedAssignment.id;
    // Use store's stagedGrades (most up-to-date), but also check localStorage as fallback
    const storeStagedGrades = stagedGrades[assignmentId] || {};
    const localStorageStagedGrades = getStagedGrades(assignmentId);
    // Merge: store's version takes precedence
    const gradesToPush = { ...localStorageStagedGrades, ...storeStagedGrades };
    
    // Debug: Log what we're about to push
    debugLog(`[pushAllStagedGrades] Preparing to push ${Object.keys(gradesToPush).length} grades:`, {
      assignmentId,
      submissionIds: Object.keys(gradesToPush),
      fromStore: Object.keys(storeStagedGrades).length,
      fromLocalStorage: Object.keys(localStorageStagedGrades).length,
    });
    
    if (Object.keys(gradesToPush).length === 0) {
      set({ error: 'No staged grades to push' });
      return;
    }

    set({ pushingGrades: true, error: null });
    
    try {
      // Get submissions to access attempt numbers
      const { allSubmissions } = get();
      
      // Build grade_data object for batch update
      const grade_data = {};
      for (const [submissionId, gradeData] of Object.entries(gradesToPush)) {
        // Find the submission object to get the attempt number
        const submission = allSubmissions.find(
          sub => String(sub.user_id || sub.id) === String(submissionId)
        );
        
        // Debug: Log the grade data being pushed for this submission
        debugLog(`[pushAllStagedGrades] Processing submission ${submissionId}:`, {
          grade: gradeData.grade,
          feedbackLength: gradeData.feedback?.length || 0,
          feedbackPreview: gradeData.feedback?.substring(0, 100) || 'no feedback',
          hasSubmission: !!submission,
        });
        
        // Get the most recent attempt number
        let attemptNumber = null;
        if (submission) {
          // The submission object has an 'attempt' field which is the current/latest attempt
          // This field is preserved from Canvas API response via ...sub spread in fetchSubmissions
          if (submission.attempt !== null && submission.attempt !== undefined) {
            attemptNumber = submission.attempt;
          } else if (submission.submission_history && submission.submission_history.length > 0) {
            // Fallback: find the highest attempt number from history
            const attempts = submission.submission_history
              .map(h => h.attempt)
              .filter(a => a !== null && a !== undefined);
            if (attempts.length > 0) {
              attemptNumber = Math.max(...attempts);
            }
          }
        }
        
        grade_data[submissionId] = {
          posted_grade: gradeData.grade,
        };
        
        // Include comment only if includeComments is true
        if (includeComments && gradeData.feedback) {
          grade_data[submissionId].text_comment = gradeData.feedback;
          
          // Include attempt number if available and comment exists
          if (attemptNumber !== null) {
            grade_data[submissionId].attempt = attemptNumber;
          }
          
          // Debug: Log what's being sent to Canvas
          debugLog(`[pushAllStagedGrades] Sending to Canvas for ${submissionId}:`, {
            grade: grade_data[submissionId].posted_grade,
            commentLength: grade_data[submissionId].text_comment?.length || 0,
            attempt: grade_data[submissionId].attempt || 'not set',
          });
        }
      }

      // Make batch update request
      const params = new URLSearchParams();
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const url = params.toString()
        ? `${API_BASE}/api/courses/${selectedCourse.id}/assignments/${assignmentId}/submissions/update_grades?${params.toString()}`
        : `${API_BASE}/api/courses/${selectedCourse.id}/assignments/${assignmentId}/submissions/update_grades`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grade_data,
          canvasBase: canvasApiBase,
        }),
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
      
      // Canvas returns a Progress object for async operations
      // Poll for completion if progress_id is present
      if (progressData.id) {
        const progressId = progressData.id;
        let progressComplete = false;
        let pollAttempts = 0;
        const maxPollAttempts = 60; // Poll for up to 60 seconds (1 second intervals)
        
        debugLog(`[pushAllStagedGrades] Batch update started, progress ID: ${progressId}`);
        
        while (!progressComplete && pollAttempts < maxPollAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          
          const progressParams = new URLSearchParams();
          if (canvasApiBase) {
            progressParams.append('canvasBase', canvasApiBase);
          }
          const progressUrl = progressParams.toString()
            ? `${API_BASE}/api/progress/${progressId}?${progressParams.toString()}`
            : `${API_BASE}/api/progress/${progressId}`;

          const progressResponse = await fetch(progressUrl, {
            headers: {
              'Authorization': `Bearer ${apiToken}`,
            },
          });

          if (progressResponse.ok) {
            const progress = await progressResponse.json();
            debugLog(`[pushAllStagedGrades] Progress: ${progress.workflow_state} (${progress.completion || 0}%)`);
            if (progress.workflow_state === 'completed') {
              progressComplete = true;
            } else if (progress.workflow_state === 'failed') {
              throw new Error('Batch grade update failed on Canvas server');
            }
          }
          
          pollAttempts++;
        }

        if (!progressComplete) {
          console.warn('Batch update progress polling timed out, but update may still be processing');
        } else {
          debugLog(`[pushAllStagedGrades] Batch update completed successfully`);
        }
      }

      // After batch update completes, mark all staged submissions as graded
      // Note: We don't have individual submission responses from batch update,
      // so we'll mark them as graded based on the fact that the batch succeeded
      const results = Object.keys(gradesToPush).map(submissionId => ({
        submissionId,
        submission: null, // We don't have individual submission data from batch update
      }));
      
      // Clear staged grades for this assignment
      clearStagedGrades(assignmentId);
      
      // Update submissions - mark all staged submissions as graded
      // Note: We don't have individual submission responses from batch update,
      // so we'll mark them as graded based on the fact that the batch succeeded
      const { submissions } = get();
      const stagedSubmissionIds = new Set(Object.keys(gradesToPush).map(id => String(id)));
      
      const updateSubmission = (sub) => {
        const submissionId = String(sub.user_id || sub.id);
        if (stagedSubmissionIds.has(submissionId)) {
          // Mark as graded - actual grade/score will be updated when Canvas syncs
          const gradeData = gradesToPush[submissionId];
          return {
            ...sub,
            isGraded: true,
            stagedGrade: null,
            // Keep existing canvasGrade/canvasScore if available, or use staged grade
            canvasGrade: sub.canvasGrade || gradeData?.grade || null,
            canvasScore: sub.canvasScore || (gradeData?.grade?.split('/')[0]) || null,
          };
        }
        return sub;
      };
      
      const updatedSubmissions = submissions.map(updateSubmission);
      const updatedAllSubmissions = allSubmissions.map(updateSubmission);
      
      set((state) => ({
        submissions: updatedSubmissions,
        allSubmissions: updatedAllSubmissions,
        stagedGrades: {
          ...state.stagedGrades,
          [assignmentId]: {},
        },
        pushingGrades: false,
      }));
      
      // Re-apply sorting after pushing grades
      get().applySorting();

      // Batch update succeeded - all grades were pushed
      set({ error: null });
      debugLog(`[pushAllStagedGrades] Successfully pushed ${results.length} grades in batch`);

      // Auto-cleanup: Check if all submissions are graded and all staged grades pushed
      try {
        const { allSubmissions, stagedGrades } = get();
        const allGraded = allSubmissions.every(sub => sub.isGraded && !sub.isAutoGradedZero);
        const allPushed = !stagedGrades[assignmentId] || Object.keys(stagedGrades[assignmentId]).length === 0;

        if (allGraded && allPushed) {
          debugLog(`[pushAllStagedGrades] All submissions graded and pushed for assignment ${assignmentId}, cleaning up cache`);
          await cleanupCompletedAssignment(assignmentId, { allGraded, allPushed });

          // Update cached assignments list
          const cached = await getCachedAssignments();
          set({ cachedAssignments: Array.isArray(cached) ? cached : [] });
        }
      } catch (error) {
        console.error('Error during auto-cleanup after pushing grades:', error);
      }

      return { results, errors: [] }; // Batch update either succeeds or fails entirely
    } catch (error) {
      set({ error: getErrorMessage(error), pushingGrades: false });
      throw error;
    }
  },

  // Fetch all rubrics for the selected course
  fetchCourseRubrics: async () => {
    const { selectedCourse, apiToken, canvasApiBase } = get();
    if (!apiToken) {
      set({ error: 'API token not set' });
      return;
    }
    if (!selectedCourse) {
      set({ error: 'No course selected' });
      return;
    }

    set({ loadingRubrics: true, error: null });
    try {
      const params = new URLSearchParams();
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const url = params.toString()
        ? `${API_BASE}/api/courses/${selectedCourse.id}/rubrics?${params.toString()}`
        : `${API_BASE}/api/courses/${selectedCourse.id}/rubrics`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch rubrics: ${response.status} ${response.statusText}`;
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

      const rubricsText = await response.text();
      let rubrics;
      try {
        rubrics = JSON.parse(rubricsText);
      } catch (parseError) {
        console.error('Failed to parse rubrics JSON:', rubricsText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading rubrics.');
      }

      set({ courseRubrics: Array.isArray(rubrics) ? rubrics : [], loadingRubrics: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loadingRubrics: false });
    }
  },

  // Fetch a specific rubric by ID
  fetchRubricById: async (rubricId) => {
    const { selectedCourse, apiToken, canvasApiBase } = get();
    if (!apiToken) {
      throw new Error('API token not set');
    }
    if (!selectedCourse) {
      throw new Error('No course selected');
    }

    try {
      const params = new URLSearchParams();
      if (canvasApiBase) {
        params.append('canvasBase', canvasApiBase);
      }
      const url = params.toString()
        ? `${API_BASE}/api/courses/${selectedCourse.id}/rubrics/${rubricId}?${params.toString()}`
        : `${API_BASE}/api/courses/${selectedCourse.id}/rubrics/${rubricId}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        let message = `Failed to fetch rubric: ${response.status} ${response.statusText}`;
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

      const rubricText = await response.text();
      let rubric;
      try {
        rubric = JSON.parse(rubricText);
      } catch (parseError) {
        console.error('Failed to parse rubric JSON:', rubricText.slice(0, 500));
        throw new Error('Canvas returned an unexpected response while loading rubric.');
      }

      return rubric;
    } catch (error) {
      throw error;
    }
  },
}));

export default useCanvasStore;

