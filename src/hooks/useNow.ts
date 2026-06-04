import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

// A wall-clock value (ms since epoch) that ticks once a second *only while a
// timer is running*, so elapsed-time displays update live without re-rendering
// the tree when nothing is being tracked.

export function useNow(): number {
  const hasActiveTimer = useStore((s) => s.project.activeTimerNodeId != null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasActiveTimer) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActiveTimer]);

  return now;
}
