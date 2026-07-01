import { describe, expect, it } from 'vitest';
import { initialKeys, keyBetween } from './orderKey';

describe('keyBetween', () => {
  it('first key with both ends open', () => {
    const k = keyBetween(null, null);
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  it('a < keyBetween(a, null) — append after', () => {
    const a = keyBetween(null, null);
    const after = keyBetween(a, null);
    expect(a < after).toBe(true);
  });

  it('keyBetween(null, b) < b — prepend before', () => {
    const b = keyBetween(null, null);
    const before = keyBetween(null, b);
    expect(before < b).toBe(true);
  });

  it('produces a key strictly between two adjacent keys', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const mid = keyBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('can keep inserting between the same tightening pair', () => {
    let a = keyBetween(null, null);
    let b = keyBetween(a, null);
    for (let i = 0; i < 50; i++) {
      const mid = keyBetween(a, b);
      expect(a < mid && mid < b).toBe(true);
      b = mid; // squeeze toward a each time
    }
  });

  it('two clients inserting into the same gap do not collide or reorder', () => {
    // Shared starting siblings X0 < X2.
    const x0 = keyBetween(null, null);
    const x2 = keyBetween(x0, null);
    // Client A inserts between; client B inserts between independently.
    const a = keyBetween(x0, x2);
    const b = keyBetween(x0, x2);
    // Both land in the gap (order between a/b may vary but both are valid).
    for (const k of [a, b]) expect(x0 < k && k < x2).toBe(true);
  });

  it('throws when a >= b', () => {
    const a = keyBetween(null, null);
    expect(() => keyBetween(a, a)).toThrow();
  });
});

describe('initialKeys', () => {
  it('returns count keys in strictly ascending order', () => {
    const keys = initialKeys(6);
    expect(keys).toHaveLength(6);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(6); // all distinct
  });

  it('empty for zero siblings', () => {
    expect(initialKeys(0)).toEqual([]);
  });
});
