// Fractional-index order keys (SYNC.md). Sibling order is stored as a base-62
// string so two clients can insert *between* two existing keys without colliding
// or renumbering — the merge never has to renumber a whole sibling list. Pure,
// dependency-free, unit-tested.
//
// This is the well-known "fractional indexing" midpoint algorithm (David
// Greenspan / Figma / Observable), specialised to a fixed base-62 alphabet with
// variable-length keys. The keys behave like fractions written in base-62 after
// an implicit radix point: "V" is ~0.5, "V0V" ~0.5..., etc. `midpoint(a, b)`
// returns the fraction halfway between them, extending precision (length) only
// as needed. Because it's a true midpoint, there is always room to subdivide
// again on either side.
//
// Invariant: keyBetween(a, b) returns k with a < k < b under plain lexicographic
// (<) comparison. `a`/`b` may be null for an open end.

// Ordered digit alphabet — ASCII order matters, so this must be ascending.
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length; // 62

function digit(c: string): number {
  const i = DIGITS.indexOf(c);
  if (i < 0) throw new Error(`orderKey: bad digit ${JSON.stringify(c)}`);
  return i;
}

/**
 * The string strictly between `a` and `b`, treating each as a base-62 fraction
 * "0.a" / "0.b" after an implicit radix point. `a` may be '' (== 0) and `b` may
 * be null (== 1). Requires a < b. Halves the interval, adding digits only when a
 * whole-digit gap isn't available, so the result always leaves room to subdivide.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`orderKey: midpoint needs a < b (got ${a}, ${b})`);
  }
  // Copy the shared prefix — the midpoint agrees with both up to their first
  // differing digit, so recurse past it (keeps the common lead, halves the rest).
  if (b !== null && a.length && a[0] === b[0]) {
    return a[0] + midpoint(a.slice(1), b.slice(1));
  }
  // First digits differ (or a is empty / b is open). Work with the leading
  // digits as integers: da (a's, or 0 when a ended) and db (b's, or BASE when b
  // is open/ended).
  const da = a.length ? digit(a[0]) : 0;
  const db = b !== null && b.length ? digit(b[0]) : BASE;

  if (db - da > 1) {
    // A whole digit fits between them: pick the rounded middle and stop.
    const mid = Math.round((da + db) / 2);
    return DIGITS[mid];
  }
  // Digits are adjacent (db === da + 1). Keep a's leading digit and find the
  // midpoint between the *rest of a* and 1 (open top) — i.e. a value above a's
  // tail but still under b, since anything sharing a[0] is < b.
  if (b !== null && b.length > 1) {
    // b has more precision after an adjacent digit (e.g. a='' , b='01'): descend
    // into b so we land below it. Emit b's leading digit, recurse on b's tail.
    return b[0] + midpoint('', b.slice(1));
  }
  // Otherwise take a's leading digit (or 0) and keep subdividing its tail vs. 1.
  return DIGITS[da] + midpoint(a.length ? a.slice(1) : '', null);
}

/**
 * A key strictly between `a` and `b` (lexicographically), always with room to
 * subdivide again. Pass null for an open end: keyBetween(null, x) sorts before x;
 * keyBetween(x, null) sorts after x; keyBetween(null, null) is the first key.
 * Throws if a >= b.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`orderKey: keyBetween needs a < b (got ${a}, ${b})`);
  }
  return midpoint(a ?? '', b);
}

/**
 * Assign evenly-spaced order keys to a fresh list of `count` siblings, in order.
 * Used by flatten() to derive keys from the current array order.
 */
export function initialKeys(count: number): string[] {
  const keys: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < count; i++) {
    const k = keyBetween(prev, null);
    keys.push(k);
    prev = k;
  }
  return keys;
}
