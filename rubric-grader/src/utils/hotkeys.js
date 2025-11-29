/**
 * Hotkey configuration and management utilities
 */

const STORAGE_KEY = 'hotrubric_hotkeys';

// Default hotkey mappings
export const DEFAULT_HOTKEYS = {
  // Rubric level selection (1-9)
  selectLevel1: '1',
  selectLevel2: '2',
  selectLevel3: '3',
  selectLevel4: '4',
  selectLevel5: '5',
  selectLevel6: '6',
  selectLevel7: '7',
  selectLevel8: '8',
  selectLevel9: '9',
  
  // Navigation
  nextCriterion: 'n, right',
  previousCriterion: 'p, left',
  nextCriterionSpace: 'space', // When auto-advance is off
  
  // Comment field
  focusComment: 'c',
  unfocusComment: 'escape',
  
  // Submission navigation
  nextSubmission: 'ctrl+shift+right, meta+shift+right',
  previousSubmission: 'ctrl+shift+left, meta+shift+left',
  
  // Actions
  generateFeedback: 'ctrl+enter, meta+enter',
  resetRubric: 'ctrl+r, meta+r',
  stageGrade: 's',

  // PDF controls
  rotatePdf: 'r',

  // Help
  showShortcuts: '?',
};

/**
 * Get all hotkey configurations
 * @returns {Object} Hotkey mappings
 */
export const getHotkeys = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const saved = JSON.parse(data);
      // Merge with defaults to ensure all keys exist
      return { ...DEFAULT_HOTKEYS, ...saved };
    }
  } catch (error) {
    console.error('Error reading hotkeys from localStorage:', error);
  }
  return { ...DEFAULT_HOTKEYS };
};

/**
 * Save hotkey configuration
 * @param {Object} hotkeys - Hotkey mappings to save
 */
export const saveHotkeys = (hotkeys) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hotkeys));
  } catch (error) {
    console.error('Error saving hotkeys to localStorage:', error);
  }
};

/**
 * Reset hotkeys to defaults
 */
export const resetHotkeys = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error resetting hotkeys:', error);
  }
};

/**
 * Get a specific hotkey
 * @param {string} key - Hotkey key name
 * @returns {string} Hotkey string
 */
export const getHotkey = (key) => {
  const hotkeys = getHotkeys();
  return hotkeys[key] || DEFAULT_HOTKEYS[key] || '';
};

/**
 * Get hotkey display name (formatted for UI)
 * @param {string} hotkeyString - Hotkey string (e.g., "ctrl+enter, meta+enter")
 * @returns {string} Formatted display string
 */
export const formatHotkeyDisplay = (hotkeyString) => {
  if (!hotkeyString) return '';
  
  // Split by comma to handle multiple options
  const options = hotkeyString.split(',').map(s => s.trim());
  
  // Format each option
  const formatted = options.map(option => {
    // Replace meta with Cmd on Mac, Ctrl on others
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    let formatted = option
      .replace(/meta/g, isMac ? 'Cmd' : 'Ctrl')
      .replace(/ctrl/g, 'Ctrl')
      .replace(/shift/g, 'Shift')
      .replace(/alt/g, 'Alt')
      .replace(/right/g, '→')
      .replace(/left/g, '←')
      .replace(/up/g, '↑')
      .replace(/down/g, '↓')
      .replace(/escape/g, 'Esc')
      .replace(/space/g, 'Space');
    
    // Capitalize first letter of each word
    formatted = formatted.split('+').map(part => {
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('+');
    
    return formatted;
  });
  
  return formatted.join(' or ');
};

/**
 * Get hotkey descriptions (for UI)
 */
export const getHotkeyDescriptions = () => {
  return {
    selectLevel1: 'Select rubric level 1 (highest points)',
    selectLevel2: 'Select rubric level 2',
    selectLevel3: 'Select rubric level 3',
    selectLevel4: 'Select rubric level 4',
    selectLevel5: 'Select rubric level 5',
    selectLevel6: 'Select rubric level 6',
    selectLevel7: 'Select rubric level 7',
    selectLevel8: 'Select rubric level 8',
    selectLevel9: 'Select rubric level 9',
    nextCriterion: 'Navigate to next criterion',
    previousCriterion: 'Navigate to previous criterion',
    nextCriterionSpace: 'Navigate to next criterion (when auto-advance is off)',
    focusComment: 'Focus comment field',
    unfocusComment: 'Unfocus comment field',
    nextSubmission: 'Navigate to next submission',
    previousSubmission: 'Navigate to previous submission',
    generateFeedback: 'Generate feedback and copy to clipboard',
    resetRubric: 'Reset all rubric selections',
    stageGrade: 'Stage grade and feedback for Canvas submission',
    rotatePdf: 'Rotate PDF pages clockwise 90 degrees',
    showShortcuts: 'Show keyboard shortcuts help',
  };
};

/**
 * Validate hotkey string format
 * @param {string} hotkeyString - Hotkey string to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export const validateHotkey = (hotkeyString) => {
  if (!hotkeyString || !hotkeyString.trim()) {
    return { valid: false, error: 'Hotkey cannot be empty' };
  }
  
  // Split by comma for multiple options
  const options = hotkeyString.split(',').map(s => s.trim());
  
  for (const option of options) {
    // Basic validation - should contain at least one key
    const parts = option.split('+').map(s => s.trim().toLowerCase());
    
    if (parts.length === 0) {
      return { valid: false, error: 'Invalid hotkey format' };
    }
    
    // Check for valid modifiers
    const validModifiers = ['ctrl', 'meta', 'shift', 'alt'];
    const modifiers = parts.slice(0, -1);
    const key = parts[parts.length - 1];
    
    for (const mod of modifiers) {
      if (!validModifiers.includes(mod)) {
        return { valid: false, error: `Invalid modifier: ${mod}` };
      }
    }
    
    // Check for valid keys (basic validation)
    if (!key || key.length === 0) {
      return { valid: false, error: 'Missing key' };
    }
  }
  
  return { valid: true };
};

/**
 * Parse hotkey string to normalized format
 * @param {string} hotkeyString - Hotkey string
 * @returns {string} Normalized hotkey string
 */
export const normalizeHotkey = (hotkeyString) => {
  if (!hotkeyString) return '';
  
  return hotkeyString
    .split(',')
    .map(option => {
      return option
        .trim()
        .toLowerCase()
        .split('+')
        .map(part => part.trim())
        .sort((a, b) => {
          // Sort modifiers: ctrl, meta, shift, alt, then key
          const order = ['ctrl', 'meta', 'shift', 'alt'];
          const aIndex = order.indexOf(a);
          const bIndex = order.indexOf(b);
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.localeCompare(b);
        })
        .join('+');
    })
    .join(', ');
};

