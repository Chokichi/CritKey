/**
 * Convert Canvas rubric format to CritKey's internal rubric structure
 *
 * Canvas rubric format:
 * {
 *   id: number,
 *   title: string,
 *   points_possible: number,
 *   data: [
 *     {
 *       id: string,
 *       description: string,
 *       long_description: string,
 *       points: number,
 *       ratings: [
 *         {
 *           id: string,
 *           description: string,
 *           long_description: string,
 *           points: number
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * CritKey internal format:
 * {
 *   name: string,
 *   feedbackLabel: string,
 *   criteria: [
 *     {
 *       name: string,
 *       description: string,
 *       enableRange: string,
 *       levels: [
 *         { name: string, description: string, points: number }
 *       ],
 *       selectedLevel: null,
 *       comment: ''
 *     }
 *   ],
 *   createdAt: string
 * }
 */

/**
 * Convert a Canvas rubric to CritKey's internal format
 * @param {Object} canvasRubric - Canvas rubric object (can be just rubric or { rubric, rubric_association })
 * @returns {Object} CritKey rubric object
 */
export const convertCanvasRubricToInternal = (canvasRubric) => {
  // Handle case where API returns { rubric: ..., rubric_association: ... }
  const rubric = canvasRubric.rubric || canvasRubric;

  if (!rubric || !rubric.data) {
    throw new Error('Invalid Canvas rubric format: missing rubric data');
  }

  // Convert each Canvas criterion to CritKey format
  const criteria = (rubric.data || []).map((criterion) => {
    // Canvas ratings need to be converted to CritKey levels
    const levels = (criterion.ratings || []).map((rating) => ({
      name: rating.description || '',
      description: rating.long_description || '',
      points: typeof rating.points === 'number' ? rating.points : parseFloat(rating.points) || 0,
    }));

    // Sort levels by points descending (highest first) - CritKey convention
    levels.sort((a, b) => b.points - a.points);

    // Set default totalPoints to highest level points
    const defaultTotalPoints = levels.length > 0 
      ? Math.max(...levels.map(l => Number(l.points) || 0))
      : 0;

    return {
      name: criterion.description || '',
      description: criterion.long_description || '',
      enableRange: '', // Canvas doesn't have this field
      levels: levels,
      selectedLevel: null, // No selection by default
      comment: '', // Empty comment field
      totalPoints: defaultTotalPoints, // Default to highest level points
    };
  });

  return {
    name: rubric.title || 'Untitled Rubric',
    feedbackLabel: '', // Empty by default
    criteria: criteria,
    createdAt: new Date().toISOString(),
  };
};

/**
 * Check if a Canvas rubric is valid and can be converted
 * @param {Object} canvasRubric - Canvas rubric object to validate
 * @returns {boolean} true if valid, false otherwise
 */
export const isValidCanvasRubric = (canvasRubric) => {
  try {
    const rubric = canvasRubric.rubric || canvasRubric;

    // Must have title and data array
    if (!rubric || typeof rubric.title !== 'string' || !Array.isArray(rubric.data)) {
      return false;
    }

    // Must have at least one criterion
    if (rubric.data.length === 0) {
      return false;
    }

    // Each criterion must have ratings array
    for (const criterion of rubric.data) {
      if (!Array.isArray(criterion.ratings) || criterion.ratings.length === 0) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Extract rubric summary information for display
 * @param {Object} canvasRubric - Canvas rubric object
 * @returns {Object} { name, pointsPossible, criteriaCount }
 */
export const getCanvasRubricSummary = (canvasRubric) => {
  const rubric = canvasRubric.rubric || canvasRubric;

  return {
    name: rubric.title || 'Untitled Rubric',
    pointsPossible: typeof rubric.points_possible === 'number'
      ? rubric.points_possible
      : null,
    criteriaCount: Array.isArray(rubric.data) ? rubric.data.length : 0,
  };
};
