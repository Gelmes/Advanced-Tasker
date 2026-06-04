import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { DropWhere } from '../model/tree';
import { useStore } from '../store/useStore';

// Drag-and-drop plumbing for reordering rows (SPEC.md §3). Rows register a
// measurable handle; on drag start we snapshot every row's window rect, then map
// the pointer's Y to a target row + drop position (before / inside / after). The
// actual move is the pure `moveNodeRelative` op, dispatched on release.

export interface Indicator {
  targetId: string;
  where: DropWhere;
}

interface Rect {
  id: string;
  y: number;
  height: number;
}

interface DragApi {
  register: (id: string) => (node: any) => void;
  beginDrag: (id: string) => void;
  updateDrag: (absY: number) => void;
  endDrag: () => void;
  dragId: string | null;
  indicator: Indicator | null;
}

const DragCtx = createContext<DragApi | null>(null);

export function useDrag(): DragApi {
  const ctx = useContext(DragCtx);
  if (!ctx) throw new Error('useDrag must be used within <DragProvider>');
  return ctx;
}

function measure(node: any, cb: (y: number, h: number) => void): void {
  if (node?.measureInWindow) {
    node.measureInWindow((_x: number, y: number, _w: number, h: number) => cb(y, h));
  } else if (node?.getBoundingClientRect) {
    const r = node.getBoundingClientRect();
    cb(r.top, r.height);
  }
}

function sameIndicator(a: Indicator | null, b: Indicator | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.targetId === b.targetId && a.where === b.where;
}

export function DragProvider({ children }: { children: ReactNode }) {
  const moveNode = useStore((s) => s.moveNode);

  const refs = useRef(new Map<string, any>());
  const rects = useRef<Rect[]>([]);
  const dragIdRef = useRef<string | null>(null);
  const indicatorRef = useRef<Indicator | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  const register = useCallback(
    (id: string) => (node: any) => {
      if (node) refs.current.set(id, node);
      else refs.current.delete(id);
    },
    [],
  );

  const beginDrag = useCallback((id: string) => {
    dragIdRef.current = id;
    setDragId(id);
    const snapshot: Rect[] = [];
    for (const [rid, node] of refs.current.entries()) {
      measure(node, (y, h) => snapshot.push({ id: rid, y, height: h }));
    }
    snapshot.sort((a, b) => a.y - b.y);
    rects.current = snapshot;
  }, []);

  const updateDrag = useCallback((absY: number) => {
    const id = dragIdRef.current;
    if (!id) return;
    const hit = rects.current.find((r) => absY >= r.y && absY <= r.y + r.height);
    let next: Indicator | null = null;
    if (hit && hit.id !== id) {
      const rel = (absY - hit.y) / hit.height;
      const where: DropWhere = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside';
      next = { targetId: hit.id, where };
    }
    if (!sameIndicator(indicatorRef.current, next)) {
      indicatorRef.current = next;
      setIndicator(next);
    }
  }, []);

  const endDrag = useCallback(() => {
    const id = dragIdRef.current;
    const ind = indicatorRef.current;
    if (id && ind) moveNode(id, ind.targetId, ind.where);
    dragIdRef.current = null;
    indicatorRef.current = null;
    rects.current = [];
    setDragId(null);
    setIndicator(null);
  }, [moveNode]);

  return (
    <DragCtx.Provider value={{ register, beginDrag, updateDrag, endDrag, dragId, indicator }}>
      {children}
    </DragCtx.Provider>
  );
}
