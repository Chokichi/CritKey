/**
 * LocalStorage utility functions for persisting rubrics and grading sessions
 */

const STORAGE_KEYS = {
  RUBRICS: 'hotrubric_rubrics',
  COURSES: 'hotrubric_courses',
  CURRENT_SESSION: 'hotrubric_current_session',
  FEEDBACK_HISTORY: 'hotrubric_feedback_history',
  RUBRIC_WINDOW_STATE: 'hotrubric_rubric_window_state',
  PDF_INITIAL_ZOOM: 'hotrubric_pdf_initial_zoom',
  PDF_GRID_MODE: 'hotrubric_pdf_grid_mode',
  PDF_GRID_COLUMNS: 'hotrubric_pdf_grid_columns',
  PDF_PERSIST_ZOOM: 'hotrubric_pdf_persist_zoom',
  RUBRIC_SCORES: 'hotrubric_rubric_scores',
  STAGED_GRADES: 'hotrubric_staged_grades',
};

/**
 * Get all saved rubrics
 * @returns {Object} Map of courseId -> rubrics
 */
export const getAllRubrics = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RUBRICS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading rubrics from localStorage:', error);
    return {};
  }
};

/**
 * Get rubrics for a specific course
 * @param {string} courseId
 * @returns {Array} Array of rubrics
 */
export const getRubricsByCourse = (courseId) => {
  const allRubrics = getAllRubrics();
  return allRubrics[courseId] || [];
};

/**
 * Save a rubric for a specific course
 * @param {string} courseId
 * @param {Object} rubric
 */
export const saveRubric = (courseId, rubric) => {
  try {
    const allRubrics = getAllRubrics();
    if (!allRubrics[courseId]) {
      allRubrics[courseId] = [];
    }
    
    // Check if rubric with same name exists, replace it
    const existingIndex = allRubrics[courseId].findIndex(r => r.name === rubric.name);
    if (existingIndex >= 0) {
      allRubrics[courseId][existingIndex] = rubric;
    } else {
      allRubrics[courseId].push(rubric);
    }
    
    localStorage.setItem(STORAGE_KEYS.RUBRICS, JSON.stringify(allRubrics));
  } catch (error) {
    console.error('Error saving rubric to localStorage:', error);
  }
};

/**
 * Delete a rubric from a course
 * @param {string} courseId
 * @param {string} rubricName
 */
export const deleteRubric = (courseId, rubricName) => {
  try {
    const allRubrics = getAllRubrics();
    if (allRubrics[courseId]) {
      allRubrics[courseId] = allRubrics[courseId].filter(r => r.name !== rubricName);
      localStorage.setItem(STORAGE_KEYS.RUBRICS, JSON.stringify(allRubrics));
    }
  } catch (error) {
    console.error('Error deleting rubric from localStorage:', error);
  }
};

/**
 * Get all course IDs
 * @returns {Array} Array of course IDs
 */
export const getAllCourses = () => {
  const allRubrics = getAllRubrics();
  return Object.keys(allRubrics);
};

/**
 * Save current grading session
 * @param {Object} session
 */
export const saveCurrentSession = (session) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));
  } catch (error) {
    console.error('Error saving session to localStorage:', error);
  }
};

/**
 * Get current grading session
 * @returns {Object|null}
 */
export const getCurrentSession = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error reading session from localStorage:', error);
    return null;
  }
};

/**
 * Clear current session
 */
export const clearCurrentSession = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
  } catch (error) {
    console.error('Error clearing session from localStorage:', error);
  }
};

/**
 * Save rubric window state (docked position, size, etc.)
 * @param {Object} state
 */
export const saveRubricWindowState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEYS.RUBRIC_WINDOW_STATE, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving rubric window state to localStorage:', error);
  }
};

/**
 * Get rubric window state
 * @returns {Object|null}
 */
export const getRubricWindowState = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RUBRIC_WINDOW_STATE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error reading rubric window state from localStorage:', error);
    return null;
  }
};

/**
 * Save feedback to history (keeps last 5)
 * @param {string} feedbackText
 * @param {string} rubricName
 */
export const saveFeedbackToHistory = (feedbackText, rubricName, label) => {
  try {
    const history = getFeedbackHistory();
    const newEntry = {
      id: Date.now().toString(),
      text: feedbackText,
      rubricName,
      label: label || rubricName,
      timestamp: new Date().toISOString(),
    };
    
    // Add to beginning and keep only last 5
    history.unshift(newEntry);
    const trimmedHistory = history.slice(0, 5);
    
    localStorage.setItem(STORAGE_KEYS.FEEDBACK_HISTORY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Error saving feedback to history:', error);
  }
};

/**
 * Get feedback history
 * @returns {Array} Array of feedback entries
 */
export const getFeedbackHistory = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.FEEDBACK_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading feedback history from localStorage:', error);
    return [];
  }
};

/**
 * Clear feedback history
 */
export const clearFeedbackHistory = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.FEEDBACK_HISTORY);
  } catch (error) {
    console.error('Error clearing feedback history from localStorage:', error);
  }
};

/**
 * Get PDF initial zoom percentage
 * @returns {number} Initial zoom percentage (default: 90)
 */
export const getPdfInitialZoom = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PDF_INITIAL_ZOOM);
    return data ? parseFloat(data) : 90;
  } catch (error) {
    console.error('Error reading PDF initial zoom from localStorage:', error);
    return 90;
  }
};

/**
 * Save PDF initial zoom percentage
 * @param {number} zoomPercentage
 */
export const savePdfInitialZoom = (zoomPercentage) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PDF_INITIAL_ZOOM, zoomPercentage.toString());
  } catch (error) {
    console.error('Error saving PDF initial zoom to localStorage:', error);
  }
};

/**
 * Get PDF grid mode setting
 * @returns {boolean} Whether grid mode is enabled (default: false)
 */
export const getPdfGridMode = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PDF_GRID_MODE);
    return data === 'true';
  } catch (error) {
    console.error('Error reading PDF grid mode from localStorage:', error);
    return false;
  }
};

/**
 * Save PDF grid mode setting
 * @param {boolean} enabled
 */
export const savePdfGridMode = (enabled) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PDF_GRID_MODE, enabled.toString());
  } catch (error) {
    console.error('Error saving PDF grid mode to localStorage:', error);
  }
};

/**
 * Get PDF grid columns setting
 * @returns {number} Number of columns in grid mode (default: 2)
 */
export const getPdfGridColumns = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PDF_GRID_COLUMNS);
    return data ? parseInt(data, 10) : 2;
  } catch (error) {
    console.error('Error reading PDF grid columns from localStorage:', error);
    return 2;
  }
};

/**
 * Save PDF grid columns setting
 * @param {number} columns
 */
export const savePdfGridColumns = (columns) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PDF_GRID_COLUMNS, columns.toString());
  } catch (error) {
    console.error('Error saving PDF grid columns to localStorage:', error);
  }
};

/**
 * Get PDF persist zoom setting
 * @returns {boolean} Whether to persist zoom across students (default: false)
 */
export const getPdfPersistZoom = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PDF_PERSIST_ZOOM);
    return data === 'true';
  } catch (error) {
    console.error('Error reading PDF persist zoom from localStorage:', error);
    return false;
  }
};

/**
 * Save PDF persist zoom setting
 * @param {boolean} enabled
 */
export const savePdfPersistZoom = (enabled) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PDF_PERSIST_ZOOM, enabled.toString());
  } catch (error) {
    console.error('Error saving PDF persist zoom to localStorage:', error);
  }
};

/**
 * Get rubric scores for an assignment
 * @param {string} assignmentId
 * @returns {Object} Map of submissionId/userId -> { score, feedback, timestamp }
 */
export const getRubricScores = (assignmentId) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RUBRIC_SCORES);
    const allScores = data ? JSON.parse(data) : {};
    return allScores[assignmentId] || {};
  } catch (error) {
    console.error('Error reading rubric scores from localStorage:', error);
    return {};
  }
};

/**
 * Save rubric score for a submission
 * @param {string} assignmentId
 * @param {string} submissionId - user_id or submission id
 * @param {Object} scoreData - { score, feedback, timestamp, rubricState? }
 */
export const saveRubricScore = (assignmentId, submissionId, scoreData) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RUBRIC_SCORES);
    const allScores = data ? JSON.parse(data) : {};
    if (!allScores[assignmentId]) {
      allScores[assignmentId] = {};
    }
    allScores[assignmentId][submissionId] = {
      ...scoreData,
      timestamp: scoreData.timestamp || new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.RUBRIC_SCORES, JSON.stringify(allScores));
  } catch (error) {
    console.error('Error saving rubric score to localStorage:', error);
  }
};

/**
 * Save full rubric state for a submission (criteria selections, comments, etc.)
 * @param {string} assignmentId
 * @param {string} submissionId
 * @param {Object} rubricState - { criteria: [...], feedbackLabel: string }
 */
export const saveRubricState = (assignmentId, submissionId, rubricState) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RUBRIC_SCORES);
    const allScores = data ? JSON.parse(data) : {};
    if (!allScores[assignmentId]) {
      allScores[assignmentId] = {};
    }
    if (!allScores[assignmentId][submissionId]) {
      allScores[assignmentId][submissionId] = {};
    }
    allScores[assignmentId][submissionId].rubricState = rubricState;
    localStorage.setItem(STORAGE_KEYS.RUBRIC_SCORES, JSON.stringify(allScores));
  } catch (error) {
    console.error('Error saving rubric state to localStorage:', error);
  }
};

/**
 * Get rubric state for a submission
 * @param {string} assignmentId
 * @param {string} submissionId
 * @returns {Object|null} Rubric state with criteria selections and comments
 */
export const getRubricState = (assignmentId, submissionId) => {
  try {
    const scores = getRubricScores(assignmentId);
    return scores[submissionId]?.rubricState || null;
  } catch (error) {
    console.error('Error reading rubric state from localStorage:', error);
    return null;
  }
};

/**
 * Get staged grades for an assignment
 * @param {string} assignmentId
 * @returns {Object} Map of submissionId -> { grade, feedback }
 */
export const getStagedGrades = (assignmentId) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.STAGED_GRADES);
    const allStaged = data ? JSON.parse(data) : {};
    return allStaged[assignmentId] || {};
  } catch (error) {
    console.error('Error reading staged grades from localStorage:', error);
    return {};
  }
};

/**
 * Stage a grade for a submission (not yet pushed to Canvas)
 * @param {string} assignmentId
 * @param {string} submissionId - user_id or submission id
 * @param {Object} gradeData - { grade, feedback }
 */
export const stageGrade = (assignmentId, submissionId, gradeData) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.STAGED_GRADES);
    const allStaged = data ? JSON.parse(data) : {};
    if (!allStaged[assignmentId]) {
      allStaged[assignmentId] = {};
    }
    allStaged[assignmentId][submissionId] = gradeData;
    localStorage.setItem(STORAGE_KEYS.STAGED_GRADES, JSON.stringify(allStaged));
  } catch (error) {
    console.error('Error staging grade to localStorage:', error);
  }
};

/**
 * Unstage a single grade for a submission
 * @param {string} assignmentId
 * @param {string} submissionId - user_id or submission id
 */
export const unstageGrade = (assignmentId, submissionId) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.STAGED_GRADES);
    const allStaged = data ? JSON.parse(data) : {};
    if (allStaged[assignmentId] && allStaged[assignmentId][submissionId]) {
      delete allStaged[assignmentId][submissionId];
      // Clean up empty assignment objects
      if (Object.keys(allStaged[assignmentId]).length === 0) {
        delete allStaged[assignmentId];
      }
      localStorage.setItem(STORAGE_KEYS.STAGED_GRADES, JSON.stringify(allStaged));
    }
  } catch (error) {
    console.error('Error unstaging grade from localStorage:', error);
  }
};

/**
 * Clear staged grades for an assignment (after pushing to Canvas)
 * @param {string} assignmentId
 */
export const clearStagedGrades = (assignmentId) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.STAGED_GRADES);
    const allStaged = data ? JSON.parse(data) : {};
    delete allStaged[assignmentId];
    localStorage.setItem(STORAGE_KEYS.STAGED_GRADES, JSON.stringify(allStaged));
  } catch (error) {
    console.error('Error clearing staged grades from localStorage:', error);
  }
};

/**
 * Clear rubric scores for an assignment (for re-grading)
 * @param {string} assignmentId
 */
export const clearRubricScores = (assignmentId) => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RUBRIC_SCORES);
    const allScores = data ? JSON.parse(data) : {};
    delete allScores[assignmentId];
    localStorage.setItem(STORAGE_KEYS.RUBRIC_SCORES, JSON.stringify(allScores));
  } catch (error) {
    console.error('Error clearing rubric scores from localStorage:', error);
  }
};

/**
 * Get all staged grades (across all assignments)
 * @returns {Object} Map of assignmentId -> { submissionId -> { grade, feedback } }
 */
export const getAllStagedGrades = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.STAGED_GRADES);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading all staged grades from localStorage:', error);
    return {};
  }
};

