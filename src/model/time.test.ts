import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration } from './time';

describe('parseDuration', () => {
  it('reads a bare number as minutes', () => {
    expect(parseDuration('90')).toBe(5400);
    expect(parseDuration('0')).toBe(0);
  });

  it('parses h/m/s tokens individually and combined', () => {
    expect(parseDuration('45s')).toBe(45);
    expect(parseDuration('12m')).toBe(720);
    expect(parseDuration('2h')).toBe(7200);
    expect(parseDuration('1h30m')).toBe(5400);
    expect(parseDuration('1h03m')).toBe(3780);
    expect(parseDuration('1h 2m 3s')).toBe(3723);
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseDuration('  1H30M ')).toBe(5400);
  });

  it('round-trips with formatDuration', () => {
    for (const secs of [45, 720, 7200, 5400, 3780]) {
      expect(parseDuration(formatDuration(secs))).toBe(secs);
    }
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('   ')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });
});
