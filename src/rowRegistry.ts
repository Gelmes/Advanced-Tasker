// A small singleton mapping node id -> its rendered row element, so non-React code
// (the store's revealNode) can scroll a row into view on web. NodeRow registers
// its element here; entries are cleared on unmount.

const rows = new Map<string, any>();

export function setRow(id: string, el: any): void {
  if (el) rows.set(id, el);
  else rows.delete(id);
}

export function scrollRowIntoView(id: string): void {
  const el = rows.get(id);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
