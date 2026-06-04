import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useStore } from '../store/useStore';

// Global keymap for NAVIGATION (selected) mode (SPEC.md §3). Editing-mode keys
// (Enter / Shift+Enter / Esc / Backspace-on-empty) are handled locally by the
// row's TextInput so typing passes through untouched. This listener no-ops while
// mode === 'editing'.

const VIM_PAGE = 10; // rows moved by Ctrl-d / Ctrl-u

export function useKeyboardNav(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // State for the `gg` two-key motion.
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

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

      // Vim navigation layer (opt-in). Falls through to the standard keymap for
      // any key it doesn't claim, so S/P/Space/Enter/Tab/Delete still work.
      if (s.vimNav) {
        if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'd' || e.key === 'u')) {
          consume();
          return s.moveSelectionBy(e.key === 'd' ? VIM_PAGE : -VIM_PAGE);
        }
        switch (e.key) {
          case 'j':
            return consume(), s.moveSelection(1);
          case 'k':
            return consume(), s.moveSelection(-1);
          case 'h':
            return consume(), s.collapseSelected(true);
          case 'l':
            return consume(), s.collapseSelected(false);
          case 'G':
            return consume(), s.selectEdge('last');
          case 'g':
            consume();
            if (pendingG) {
              pendingG = false;
              if (gTimer) clearTimeout(gTimer);
              gTimer = null;
              s.selectEdge('first');
            } else {
              pendingG = true;
              gTimer = setTimeout(() => {
                pendingG = false;
                gTimer = null;
              }, 600);
            }
            return;
          case 'i': // insert
          case 'a': // append
            return consume(), s.editSelected();
          case 'o': // open line below
            return consume(), s.newSibling();
          default:
            break; // not a vim key — fall through
        }
      }

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
