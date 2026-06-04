import { describe, expect, it } from 'vitest';
import { parseInline } from './inline';

describe('parseInline', () => {
  it('returns a single text segment for plain content', () => {
    expect(parseInline('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('parses bold before italic', () => {
    expect(parseInline('a **b** c')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'bold', value: 'b' },
      { type: 'text', value: ' c' },
    ]);
  });

  it('parses italic, code and links', () => {
    expect(parseInline('*i* `x` [t](u)')).toEqual([
      { type: 'italic', value: 'i' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'x' },
      { type: 'text', value: ' ' },
      { type: 'link', value: 't', href: 'u' },
    ]);
  });

  it('takes the earliest match when markers compete', () => {
    const segs = parseInline('`code` then **bold**');
    expect(segs[0]).toEqual({ type: 'code', value: 'code' });
    expect(segs[segs.length - 1]).toEqual({ type: 'bold', value: 'bold' });
  });
});
