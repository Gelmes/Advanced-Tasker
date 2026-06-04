import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import type { DropWhere } from '../model/tree';
import { useStore } from '../store/useStore';

// Drag-and-drop plumbing for reordering rows (SPEC.md §3). On web we use native
// pointer events rather than PanResponder: PanResponder doesn't reliably capture
// the mouse on react-native-web (the browser starts a text selection instead).
// A row registers its DOM element; on drag we snapshot every row's client rect and
// map the pointer's Y to a target row + drop position (before / inside / after).
// The move itself is the pure `moveNodeRelative` op, dispatched on release.

export interface Indicator {
  targetId: string;
  where: DropWhere;
}

interface Rect {
  id: string;
  top: number;
  height: number;
}

interface DragApi {
  /** ref callback for a row's container element (used for hit-testing). */
  register: (id: string) => (node: any) => void;
  /** Begin a drag from the given node at an initial pointer Y (client coords). */
  startDrag: (id: string, clientY: number) => void;
  dragId: string | null;
  indicator: Indicator | null;
}

const DragCtx = createContext<DragApi | null>(null);

export function useDrag(): DragApi {
  const ctx = useContext(DragCtx);
  if (!ctx) throw new Error('useDrag must be used within <DragProvider>');
  return ctx;
}

function sameIndicator(a: Indicator | null, b: Indicator | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.targetId === b.targetId && a.where === b.where;
}

export function DragProvider({ children }: { children: ReactNode }) {
  const moveNode = useStore((s) => s.moveNode);

  const rows = useRef(new Map<string, any>());
  const rects = useRef<Rect[]>([]);
  const dragIdRef = useRef<string | null>(null);
  const indicatorRef = useRef<Indicator | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  const register = useCallback(
    (id: string) => (node: any) => {
      if (node) rows.current.set(id, node);
      else rows.current.delete(id);
    },
    [],
  );

  const computeIndicator = useCallback((clientY: number) => {
    const id = dragIdRef.current;
    if (!id) return;
    const hit = rects.current.find((r) => clientY >= r.top && clientY <= r.top + r.height);
    let next: Indicator | null = null;
    if (hit && hit.id !== id) {
      const rel = (clientY - hit.top) / hit.height;
      const where: DropWhere = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside';
      next = { targetId: hit.id, where };
    }
    if (!sameIndicator(indicatorRef.current, next)) {
      indicatorRef.current = next;
      setIndicator(next);
    }
  }, []);

  const startDrag = useCallback(
    (id: string, clientY: number) => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return;

      const snapshot: Rect[] = [];
      rows.current.forEach((node, rid) => {
        if (node?.getBoundingClientRect) {
          const r = node.getBoundingClientRect();
          snapshot.push({ id: rid, top: r.top, height: r.height });
        }
      });
      snapshot.sort((a, b) => a.top - b.top);
      rects.current = snapshot;

      dragIdRef.current = id;
      setDragId(id);
      computeIndicator(clientY);

      const body = document.body;
      const prevSelect = body.style.userSelect;
      body.style.userSelect = 'none';

      const onMove = (e: PointerEvent) => {
        e.preventDefault();
        computeIndicator(e.clientY);
      };
      const finish = () => {
        const did = dragIdRef.current;
        const ind = indicatorRef.current;
        if (did && ind) moveNode(did, ind.targetId, ind.where);
        dragIdRef.current = null;
        indicatorRef.current = null;
        rects.current = [];
        setDragId(null);
        setIndicator(null);
        body.style.userSelect = prevSelect;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    },
    [computeIndicator, moveNode],
  );

  return (
    <DragCtx.Provider value={{ register, startDrag, dragId, indicator }}>
      {children}
    </DragCtx.Provider>
  );
}
