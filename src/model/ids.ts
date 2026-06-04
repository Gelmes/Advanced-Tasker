// Stable id generation. Uses crypto.randomUUID when available (browsers, modern
// runtimes) with a small fallback for environments that lack it.

export function newId(): string {
  const c = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback: RFC4122-ish v4 from Math.random. Sufficient for local ids.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
