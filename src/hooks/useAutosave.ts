import { useEffect } from 'react';
import { useStore } from '../store/useStore';

const DEBOUNCE_MS = 600;

// Debounced auto-save: whenever the project becomes dirty and a file is bound,
// write it back after a short quiet period (SPEC.md §5). With no bound file,
// changes stay in memory until the user saves (which prompts for a location).

export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsub = useStore.subscribe((state) => {
      if (!state.dirty || !state.fileHandle || state.saving) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const s = useStore.getState();
        if (s.dirty && s.fileHandle && !s.saving) void s.saveProject();
      }, DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);
}
