// A tiny inline-markdown tokenizer (SPEC.md §4). Rows are single-line, so we
// support the inline subset that fits: bold, italic, `code`, and [links](url).
// Block constructs (lists, headings) are out of scope — content is one line.

export type Segment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'tag'; value: string }; // value excludes the leading '#'

interface Rule {
  re: RegExp;
  make: (m: RegExpExecArray) => Segment;
}

// Order matters: bold (**) before italic (*), and code/link are unambiguous.
const RULES: Rule[] = [
  { re: /`([^`]+)`/, make: (m) => ({ type: 'code', value: m[1] }) },
  { re: /\*\*([^*]+)\*\*/, make: (m) => ({ type: 'bold', value: m[1] }) },
  { re: /\*([^*]+)\*/, make: (m) => ({ type: 'italic', value: m[1] }) },
  {
    re: /\[([^\]]+)\]\(([^)]+)\)/,
    make: (m) => ({ type: 'link', value: m[1], href: m[2] }),
  },
  {
    re: /(?<![\w])#([\p{L}\p{N}_-]+)/u,
    make: (m) => ({ type: 'tag', value: m[1] }),
  },
];

/**
 * Toggle wrapping `text` in a marker (`**` bold, `*` italic, `` ` `` code). If the
 * whole string is already wrapped in that exact marker it is unwrapped; otherwise
 * it is wrapped. The italic check ignores bold (`**`) so they don't collide.
 */
export function toggleWrap(text: string, marker: string): string {
  const wrapped =
    text.length >= marker.length * 2 &&
    text.startsWith(marker) &&
    text.endsWith(marker) &&
    !(marker === '*' && (text.startsWith('**') || text.endsWith('**')));
  return wrapped
    ? text.slice(marker.length, text.length - marker.length)
    : `${marker}${text}${marker}`;
}

/** Split a line into inline segments, earliest-match wins, left to right. */
export function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  let rest = text;

  while (rest.length > 0) {
    let best: { index: number; length: number; seg: Segment } | null = null;

    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, length: m[0].length, seg: rule.make(m) };
      }
    }

    if (!best) {
      out.push({ type: 'text', value: rest });
      break;
    }
    if (best.index > 0) {
      out.push({ type: 'text', value: rest.slice(0, best.index) });
    }
    out.push(best.seg);
    rest = rest.slice(best.index + best.length);
  }

  return out;
}
