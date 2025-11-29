import Papa from 'papaparse';

/**
 * Parse Canvas rubric CSV export into internal rubric structure
 * @param {File} file - CSV file
 * @returns {Promise<Object>} Parsed rubric object
 */
export const parseCanvasRubricCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => {
        try {
          const rubric = processCanvasCSV(results.data);
          resolve(rubric);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
      skipEmptyLines: true,
    });
  });
};

/**
 * Process parsed CSV data into rubric structure
 * @param {Array} data - Parsed CSV rows
 * @returns {Object} Rubric object
 */
const processCanvasCSV = (data) => {
  if (data.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  const headers = data[0];
  const rows = data.slice(1);

  // Find the rubric name from the first data row
  const rubricName = rows[0]?.[0] || 'Untitled Rubric';

  // Process criteria
  const criteria = [];
  
  for (const row of rows) {
    if (!row[0] || !row[1]) continue; // Skip rows without rubric name or criteria name

    const criteriaName = row[1];
    const criteriaDescription = row[2] || '';
    const enableRange = row[3] || '';

    // Parse rating levels - they come in groups of 3 columns: Name, Description, Points
    const levels = [];
    let colIndex = 4;

    while (colIndex < row.length) {
      const ratingName = row[colIndex];
      const ratingDescription = row[colIndex + 1];
      const ratingPoints = row[colIndex + 2];

      // Stop if we hit empty rating data
      if (!ratingName && !ratingPoints) break;

      levels.push({
        name: ratingName || '',
        description: ratingDescription || '',
        points: ratingPoints ? parseFloat(ratingPoints) : 0,
      });

      colIndex += 3;
    }

    // Sort levels by points descending (highest first)
    levels.sort((a, b) => b.points - a.points);

    // Set default totalPoints to highest level points
    const defaultTotalPoints = levels.length > 0 
      ? Math.max(...levels.map(l => Number(l.points) || 0))
      : 0;

    criteria.push({
      name: criteriaName,
      description: criteriaDescription,
      enableRange: enableRange,
      levels: levels,
      selectedLevel: null, // Index of selected level
      comment: '', // Additional comment for this criterion
      totalPoints: defaultTotalPoints, // Default to highest level points
    });
  }

  return {
    name: rubricName,
    criteria: criteria,
    createdAt: new Date().toISOString(),
  };
};

/**
 * Calculate total points from rubric
 * @param {Object} rubric - Rubric with selected levels
 * @returns {Object} { earned, possible }
 */
export const calculateTotalPoints = (rubric) => {
  let earned = 0;
  let possible = 0;

  for (const criterion of rubric.criteria) {
    // Use criterion.totalPoints if useCustomTotalPoints is true, otherwise use max level points
    let criterionTotalPoints;
    if (criterion.useCustomTotalPoints === true && criterion.totalPoints !== undefined && criterion.totalPoints !== null) {
      criterionTotalPoints = Number(criterion.totalPoints);
    } else {
      // Fallback: calculate from max level points
      criterionTotalPoints = criterion.levels?.length > 0 
        ? Math.max(...criterion.levels.map(l => Number(l.points) || 0))
        : 0;
    }
    possible += criterionTotalPoints;

    // Get earned points from selected level
    if (criterion.selectedLevel !== null && criterion.selectedLevel !== undefined) {
      const selectedLevelData = criterion.levels?.[criterion.selectedLevel];
      earned += selectedLevelData ? (Number(selectedLevelData.points) || 0) : 0;
    }
  }

  return { earned, possible };
};

/**
 * Generate feedback text from graded rubric
 * @param {Object} rubric - Rubric with selected levels and comments
 * @returns {string} Formatted feedback text
 */
const inlineLatexPattern = /\$\$([\s\S]+?)\$\$/g;

const toInlineLatex = (text = '') =>
  text.replace(inlineLatexPattern, (_, expr) => `\\(${expr}\\)`);

export const generateFeedbackText = (rubric) => {
  const { earned, possible } = calculateTotalPoints(rubric);
  
  let feedback = `Rubric: ${toInlineLatex(rubric.name)}\n\n`;

  for (const criterion of rubric.criteria) {
    if (criterion.selectedLevel !== null && criterion.selectedLevel !== undefined) {
      const level = criterion.levels[criterion.selectedLevel];
      // Use criterion.totalPoints if useCustomTotalPoints is true, otherwise use max level points
      let maxPoints;
      if (criterion.useCustomTotalPoints === true && criterion.totalPoints !== undefined && criterion.totalPoints !== null) {
        maxPoints = Number(criterion.totalPoints);
      } else {
        maxPoints = criterion.levels?.length > 0 
          ? Math.max(...criterion.levels.map(l => Number(l.points) || 0))
          : 0;
      }

      feedback += `${level.points}/${maxPoints} — ${toInlineLatex(criterion.name)}`;

      if (level.name) {
        feedback += ` (${toInlineLatex(level.name)})`;
      }

      if (level.description) {
        feedback += `: ${toInlineLatex(level.description)}`;
      }

      if (criterion.comment) {
        feedback += `\n  Note: ${toInlineLatex(criterion.comment)}`;
      }

      feedback += '\n\n';
    }
  }

  feedback += `Total: ${earned}/${possible} points`;

  return feedback;
};

/**
 * Generate a sample Canvas rubric CSV template
 * @returns {string} CSV template string
 */
export const generateTemplateCSV = () => {
  const templateRubric = {
    name: 'Sample Rubric',
    criteria: [
      {
        name: 'Content Quality',
        description: 'Quality and accuracy of content',
        enableRange: '',
        levels: [
          {
            name: 'Excellent',
            description: 'Content is thorough, accurate, and well-researched',
            points: 10,
          },
          {
            name: 'Good',
            description: 'Content is mostly accurate with minor gaps',
            points: 7,
          },
          {
            name: 'Needs Improvement',
            description: 'Content has significant gaps or inaccuracies',
            points: 4,
          },
          {
            name: 'Poor',
            description: 'Content is incomplete or mostly inaccurate',
            points: 0,
          },
        ],
      },
      {
        name: 'Organization',
        description: 'Structure and logical flow of work',
        enableRange: '',
        levels: [
          {
            name: 'Excellent',
            description: 'Well-organized with clear logical flow',
            points: 10,
          },
          {
            name: 'Good',
            description: 'Mostly organized with some minor issues',
            points: 7,
          },
          {
            name: 'Needs Improvement',
            description: 'Organization is unclear or confusing',
            points: 4,
          },
          {
            name: 'Poor',
            description: 'Lacks organization and structure',
            points: 0,
          },
        ],
      },
    ],
  };

  return generateCanvasCSV([templateRubric]);
};

/**
 * Generate Canvas-compatible CSV from one or more rubrics
 * @param {Array<Object>} rubrics - Array of rubric objects
 * @returns {string} CSV string
 */
export const generateCanvasCSV = (rubrics = []) => {
  if (!Array.isArray(rubrics) || rubrics.length === 0) {
    return '';
  }

  // Determine the maximum number of levels across all criteria
  const maxLevels = rubrics.reduce((max, rubric) => {
    const rubricMax = (rubric.criteria || []).reduce((critMax, criterion) => {
      return Math.max(critMax, (criterion.levels || []).length);
    }, 0);
    return Math.max(max, rubricMax);
  }, 0);

  const header = [
    'Rubric Name',
    'Criteria Name',
    'Criteria Description',
    'Criteria Enable Range',
  ];

  for (let i = 0; i < maxLevels; i += 1) {
    header.push('Rating Name', 'Rating Description', 'Rating Points');
  }

  const rows = [];

  rubrics.forEach((rubric) => {
    (rubric.criteria || []).forEach((criterion) => {
      const row = [
        rubric.name || 'Untitled Rubric',
        criterion.name || 'Untitled Criterion',
        criterion.description || '',
        criterion.enableRange || '',
      ];

      (criterion.levels || []).forEach((level) => {
        row.push(
          level.name || '',
          level.description || '',
          level.points !== undefined && level.points !== null
            ? level.points
            : ''
        );
      });

      while (row.length < header.length) {
        row.push('');
      }

      rows.push(row);
    });
  });

  return Papa.unparse({
    fields: header,
    data: rows,
  });
};

