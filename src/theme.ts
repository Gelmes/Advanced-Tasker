// Design tokens (SPEC.md §4). One place for the palette, type scale, radii and
// shadows so every surface stays consistent. Cool neutral grays layered light →
// dark, one indigo accent, and semantic colors for save/sync/timer states.

export const color = {
  // Surfaces, light → dark
  appBg: '#ffffff',
  surface: '#fbfbfc', // toolbar strip
  surfaceAlt: '#f4f5f7', // sidebar, tab strip
  hover: '#eceef2',
  border: '#e6e8ec',
  borderStrong: '#d4d7dd',

  // Ink (text), dark → faint
  ink: '#191b21',
  inkMid: '#4b5563',
  inkSoft: '#8a919e',
  inkFaint: '#c3c8d1',

  // Accent (indigo)
  accent: '#4f46e5',
  accentInk: '#3730a3',
  accentSoft: '#eef0fe',
  accentBorder: '#c7cbfa',

  // Semantic
  success: '#15803d',
  successSoft: '#dcfce7',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  info: '#1d4ed8',
  infoSoft: '#dbeafe',
} as const;

export const radius = { sm: 6, md: 8, lg: 12 } as const;

/** box-shadow strings (web). */
export const shadow = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0 4px 16px rgba(16, 24, 40, 0.12)',
  lg: '0 8px 30px rgba(16, 24, 40, 0.16)',
} as const;

export const font = { xs: 11, sm: 12, md: 13, base: 14, lg: 16 } as const;
