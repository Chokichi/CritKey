import { create } from 'zustand';
import { 
  saveRubric as saveRubricToStorage, 
  deleteRubric as deleteRubricFromStorage,
  getRubricsByCourse,
  getAllCourses,
  saveCurrentSession,
  getCurrentSession,
  clearCurrentSession 
} from '../utils/localStorage';
import { calculateTotalPoints } from '../utils/csvParser';

const useRubricStore = create((set, get) => ({
  // Current state
  currentCourse: null,
  currentRubric: null,
  currentCriterionIndex: 0,
  availableCourses: [],
  availableRubrics: [],

  // Initialize store
  initialize: () => {
    let courses = getAllCourses();
    
    // Try to restore previous session
    const session = getCurrentSession();
    if (session && session.currentCourse) {
      // Ensure the restored course is in the available courses list
      if (!courses.includes(session.currentCourse)) {
        courses.push(session.currentCourse);
      }
      
      set({
        availableCourses: courses,
        currentCourse: session.currentCourse,
        currentRubric: session.currentRubric,
        currentCriterionIndex: session.currentCriterionIndex || 0,
      });
      
      get().loadRubricsForCourse(session.currentCourse);
    } else {
      set({ availableCourses: courses });
    }
  },

  // Course management
  selectCourse: (courseId) => {
    set({ currentCourse: courseId, currentRubric: null, currentCriterionIndex: 0 });
    get().loadRubricsForCourse(courseId);
    get().saveSession();
  },

  addCourse: (courseId) => {
    const courses = [...get().availableCourses];
    if (!courses.includes(courseId)) {
      courses.push(courseId);
      set({ availableCourses: courses });
    }
  },

  loadRubricsForCourse: (courseId) => {
    const rubrics = getRubricsByCourse(courseId);
    set({ availableRubrics: rubrics });
  },

  // Rubric management
  selectRubric: (rubricName) => {
    const rubric = get().availableRubrics.find(r => r.name === rubricName);
    if (rubric) {
      // Create a fresh copy for grading
      const rubricCopy = JSON.parse(JSON.stringify(rubric));
      set({ currentRubric: rubricCopy, currentCriterionIndex: 0 });
      get().saveSession();
    }
  },

  importRubric: (rubric) => {
    const { currentCourse } = get();
    if (!currentCourse) {
      throw new Error('Please select a course first');
    }
    
    saveRubricToStorage(currentCourse, rubric);
    get().loadRubricsForCourse(currentCourse);
    
    // Auto-select the newly imported rubric
    set({ currentRubric: rubric, currentCriterionIndex: 0 });
    get().saveSession();
  },

  deleteRubric: (rubricName) => {
    const { currentCourse } = get();
    if (!currentCourse) return;
    
    deleteRubricFromStorage(currentCourse, rubricName);
    get().loadRubricsForCourse(currentCourse);
    
    // Clear current rubric if it was deleted
    if (get().currentRubric?.name === rubricName) {
      set({ currentRubric: null, currentCriterionIndex: 0 });
      get().saveSession();
    }
  },

  // Grading actions
  selectLevel: (criterionIndex, levelIndex) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    updatedRubric.criteria[criterionIndex].selectedLevel = levelIndex;
    set({ currentRubric: updatedRubric });
    get().saveSession();
  },

  updateComment: (criterionIndex, comment) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    updatedRubric.criteria[criterionIndex].comment = comment;
    set({ currentRubric: updatedRubric });
    get().saveSession();
  },

  addLevel: (criterionIndex, levelData) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    const updatedCriteria = [...updatedRubric.criteria];
    const criterion = updatedCriteria[criterionIndex];
    if (!criterion) return;

    const levels = [...(criterion.levels || [])];
    const selectedLevelRef =
      criterion.selectedLevel !== null && criterion.selectedLevel !== undefined
        ? levels[criterion.selectedLevel]
        : null;

    const newLevel = {
      name: levelData?.name?.trim() || '',
      description: levelData?.description?.trim() || '',
      points: Number(levelData?.points) || 0,
    };

    levels.push(newLevel);
    levels.sort((a, b) => b.points - a.points);

    const nextSelectedLevel =
      selectedLevelRef && levels.includes(selectedLevelRef)
        ? levels.indexOf(selectedLevelRef)
        : selectedLevelRef === null
          ? null
          : null;

    updatedCriteria[criterionIndex] = {
      ...criterion,
      levels,
      selectedLevel: nextSelectedLevel,
    };

    updatedRubric.criteria = updatedCriteria;
    set({ currentRubric: updatedRubric });
    get().saveSession();
    get().persistCurrentRubric();
  },

  updateLevel: (criterionIndex, levelIndex, updates) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    const updatedCriteria = [...updatedRubric.criteria];
    const criterion = updatedCriteria[criterionIndex];
    if (!criterion) return;

    const levels = [...(criterion.levels || [])];
    if (!levels[levelIndex]) return;

    levels[levelIndex] = {
      ...levels[levelIndex],
      ...updates,
      name: updates?.name?.trim() ?? levels[levelIndex].name ?? '',
      description: updates?.description?.trim() ?? levels[levelIndex].description ?? '',
      points:
        updates?.points !== undefined && updates?.points !== null
          ? Number(updates.points)
          : Number(levels[levelIndex].points) || 0,
    };

    const selectedLevelRef =
      criterion.selectedLevel !== null && criterion.selectedLevel !== undefined
        ? levels[criterion.selectedLevel]
        : null;

    const editedLevelRef = levels[levelIndex];
    levels.sort((a, b) => b.points - a.points);

    let nextSelectedLevel = null;
    if (selectedLevelRef && levels.includes(selectedLevelRef)) {
      nextSelectedLevel = levels.indexOf(selectedLevelRef);
    }

    updatedCriteria[criterionIndex] = {
      ...criterion,
      levels,
      selectedLevel: nextSelectedLevel,
    };

    updatedRubric.criteria = updatedCriteria;
    set({ currentRubric: updatedRubric });
    get().saveSession();
    get().persistCurrentRubric();

    return levels.indexOf(editedLevelRef);
  },

  deleteLevel: (criterionIndex, levelIndex) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    const updatedRubric = { ...currentRubric };
    const updatedCriteria = [...updatedRubric.criteria];
    const criterion = updatedCriteria[criterionIndex];
    if (!criterion) return;

    const levels = [...(criterion.levels || [])];
    if (!levels[levelIndex]) return;

    levels.splice(levelIndex, 1);

    let nextSelectedLevel = null;
    const currentSelected = criterion.selectedLevel;

    if (currentSelected !== null && currentSelected !== undefined) {
      if (levels.length === 0) {
        nextSelectedLevel = null;
      } else if (currentSelected === levelIndex) {
        nextSelectedLevel = null;
      } else if (currentSelected > levelIndex) {
        nextSelectedLevel = currentSelected - 1;
      } else {
        nextSelectedLevel = currentSelected;
      }
    }

    updatedCriteria[criterionIndex] = {
      ...criterion,
      levels,
      selectedLevel: nextSelectedLevel,
    };

    updatedRubric.criteria = updatedCriteria;
    set({ currentRubric: updatedRubric });
    get().saveSession();
    get().persistCurrentRubric();
  },

  replaceCriteria: (newCriteria) => {
    const state = get();
    const { currentRubric, currentCriterionIndex } = state;
    if (!currentRubric || !Array.isArray(newCriteria)) return;

    const sanitizedCriteria = newCriteria.map((criterion) => ({
      name: criterion?.name || '',
      description: criterion?.description || '',
      enableRange: criterion?.enableRange || '',
      levels: Array.isArray(criterion?.levels)
        ? criterion.levels.map((level) => ({
            name: level?.name || '',
            description: level?.description || '',
            points:
              level?.points !== undefined && level?.points !== null
                ? Number(level.points)
                : 0,
          }))
        : [],
      selectedLevel:
        criterion?.selectedLevel !== undefined
          ? criterion.selectedLevel
          : null,
      comment: criterion?.comment || '',
    }));

    const nextIndex =
      sanitizedCriteria.length === 0
        ? 0
        : Math.min(currentCriterionIndex || 0, sanitizedCriteria.length - 1);

    const updatedRubric = {
      ...currentRubric,
      criteria: sanitizedCriteria,
    };

    set({
      currentRubric: updatedRubric,
      currentCriterionIndex: nextIndex,
    });
    state.saveSession();
    state.persistCurrentRubric();
  },

  // Navigation
  goToNextCriterion: () => {
    const { currentRubric, currentCriterionIndex } = get();
    if (!currentRubric) return;

    if (currentCriterionIndex < currentRubric.criteria.length - 1) {
      set({ currentCriterionIndex: currentCriterionIndex + 1 });
      get().saveSession();
    }
  },

  goToPreviousCriterion: () => {
    const { currentCriterionIndex } = get();
    if (currentCriterionIndex > 0) {
      set({ currentCriterionIndex: currentCriterionIndex - 1 });
      get().saveSession();
    }
  },

  goToCriterion: (index) => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    if (index >= 0 && index < currentRubric.criteria.length) {
      set({ currentCriterionIndex: index });
      get().saveSession();
    }
  },

  // Session management
  saveSession: () => {
    const { currentCourse, currentRubric, currentCriterionIndex } = get();
    saveCurrentSession({
      currentCourse,
      currentRubric,
      currentCriterionIndex,
    });
  },

  resetGrading: () => {
    const { currentRubric } = get();
    if (!currentRubric) return;

    // Reset all selections and comments
    const resetRubric = { ...currentRubric };
    resetRubric.criteria = resetRubric.criteria.map(criterion => ({
      ...criterion,
      selectedLevel: null,
      comment: '',
    }));

    set({ currentRubric: resetRubric, currentCriterionIndex: 0 });
    get().saveSession();
  },

  clearSession: () => {
    clearCurrentSession();
    set({ 
      currentRubric: null, 
      currentCriterionIndex: 0 
    });
  },

  // Computed values
  getTotalPoints: () => {
    const { currentRubric } = get();
    if (!currentRubric) return { earned: 0, possible: 0 };
    return calculateTotalPoints(currentRubric);
  },

  persistCurrentRubric: () => {
    const { currentRubric, currentCourse, availableRubrics, loadRubricsForCourse } = get();
    if (!currentRubric || !currentCourse) return;

    saveRubricToStorage(currentCourse, currentRubric);

    const updatedRubrics = [...availableRubrics];
    const existingIndex = updatedRubrics.findIndex(
      (rubric) => rubric.name === currentRubric.name
    );
    const rubricCopy = JSON.parse(JSON.stringify(currentRubric));

    if (existingIndex >= 0) {
      updatedRubrics[existingIndex] = rubricCopy;
    } else {
      updatedRubrics.push(rubricCopy);
    }

    set({ availableRubrics: updatedRubrics });
    loadRubricsForCourse(currentCourse);
  },
}));

export default useRubricStore;

