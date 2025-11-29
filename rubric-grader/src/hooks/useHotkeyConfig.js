import { useState, useEffect } from 'react';
import { getHotkeys } from '../utils/hotkeys';

/**
 * Hook to get hotkey configuration reactively
 * Updates when hotkeys change
 */
export const useHotkeyConfig = () => {
  const [hotkeys, setHotkeys] = useState(() => getHotkeys());

  useEffect(() => {
    const handleUpdate = () => {
      setHotkeys(getHotkeys());
    };

    // Listen for hotkey updates
    window.addEventListener('hotkeysUpdated', handleUpdate);
    
    // Also check periodically (fallback)
    const interval = setInterval(() => {
      const current = getHotkeys();
      const currentStr = JSON.stringify(current);
      const prevStr = JSON.stringify(hotkeys);
      if (currentStr !== prevStr) {
        setHotkeys(current);
      }
    }, 500);

    return () => {
      window.removeEventListener('hotkeysUpdated', handleUpdate);
      clearInterval(interval);
    };
  }, [hotkeys]);

  return hotkeys;
};

