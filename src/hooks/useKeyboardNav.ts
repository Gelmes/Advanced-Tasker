import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useStore } from '../store/useStore';

// Global keymap for NAVIGATION (selected) mode (SPEC.md §3). Editing-mode keys
// (Enter / Shift+Enter / Esc / Backspace-on-empty) are handled locally by the
// row's TextInput so typing passes through untouched. This listener no-ops while
// mode === 'editing'.

export function useKeyboardNav(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();

      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // Save works in any mode (Cmd/Ctrl+S), even from within a text field.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        consume();
        void s.saveProject();
        return;
      }

      // Undo / redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z or Ctrl+Y) — any mode.
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') {
          consume();
          return e.shiftKey ? s.redo() : s.undo();
        }
        if (k === 'y') {
          consume();
          return s.redo();
        }
      }

      // Markdown emphasis (Cmd/Ctrl+B/I/E) — works while editing too.
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        const marker = k === 'b' ? '**' : k === 'i' ? '*' : k === 'e' ? '`' : null;
        if (marker) {
          consume();
          s.toggleEmphasisSelected(marker);
          return;
        }
      }

      // Don't hijack typing in any text field (node editor, title, status inputs).
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      ) {
        return;
      }

      // Toggle the shortcuts help with "?" in any mode.
      if (e.key === '?') {
        consume();
        s.setHelpOpen(!s.helpOpen);
        return;
      }

      if (s.mode !== 'selected') return;

      // Move a node among its siblings (Alt + ↑/↓) — checked before plain arrows.
      if (e.altKey && e.key === 'ArrowUp') return consume(), s.moveSelected(-1);
      if (e.altKey && e.key === 'ArrowDown') return consume(), s.moveSelected(1);

      switch (e.key) {
        case 'ArrowUp':
          return consume(), s.moveSelection(-1);
        case 'ArrowDown':
          return consume(), s.moveSelection(1);
        case 'ArrowLeft':
          return consume(), s.collapseSelected(true);
        case 'ArrowRight':
          return consume(), s.collapseSelected(false);
        case 'Enter':
          return consume(), s.newSibling();
        case 'Tab':
          consume();
          return e.shiftKey ? s.outdentSelected() : s.indentSelected();
        case 'Delete':
        case 'Backspace':
          return consume(), s.deleteSelected();
        case ' ':
          return consume(), s.toggleTimerSelected();
        case 's':
        case 'S':
          // Shift+S cycles statuses backward.
          return consume(), s.cycleStatusSelected(e.shiftKey ? -1 : 1);
        case 'p':
        case 'P':
          // Shift+P cycles story points backward.
          return consume(), s.cyclePointsSelected(e.shiftKey ? -1 : 1);
        case 'e':
        case 'F2':
          return consume(), s.editSelected();
        case 'i':
        case 'I':
          return consume(), s.toggleDetails();
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
