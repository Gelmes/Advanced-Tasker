// Per-pane scroll memory for split view (SPEC.md §4). Focus swaps remount both
// panes' scroll containers, which would reset them to the top — so the live and
// cold offsets are tracked here (a plain module, not the store: scroll positions
// change every frame and must never trigger re-renders), stashed on swap, and
// restored after the new tree paints. Same pattern as rowRegistry.

let liveY = 0;
let coldY = 0;
let liveScroller: ((y: number) => void) | null = null;

export const paneScroll = {
  /** Called from the live OutlineView's onScroll. */
  setLive(y: number): void {
    liveY = y;
  },
  getLive(): number {
    return liveY;
  },
  /** Called from the cold pane's onScroll (scrolling it while parked is allowed). */
  setCold(y: number): void {
    coldY = y;
  },
  getCold(): number {
    return coldY;
  },
  /** The live OutlineView registers its ScrollView here on mount. */
  registerLiveScroller(fn: ((y: number) => void) | null): void {
    liveScroller = fn;
  },
  /** Scroll the live pane once the swapped-in content has rendered. */
  scrollLiveTo(y: number): void {
    liveY = y;
    const raf = (globalThis as any).requestAnimationFrame as
      | ((cb: () => void) => void)
      | undefined;
    const go = () => liveScroller?.(y);
    if (raf) raf(() => raf(go));
    else setTimeout(go, 30);
  },
};
