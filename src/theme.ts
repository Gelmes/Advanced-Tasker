// Design tokens (SPEC.md §4). One place for the palette, type scale, radii and
// shadows so every surface stays consistent.
//
// THEMING: components never see raw hex — `color.*` values are CSS variable
// references (`var(--at-…)`), and App.tsx injects the palettes below as
// `:root { … }` (light) and `[data-theme="dark"] { … }`. Switching theme is a
// data-attribute flip on <html>; no component re-render or dynamic StyleSheet
// needed. Web-only by design (the app is desktop-first react-native-web).
//
// EXCEPTION: react-native-svg draws with SVG *attributes*, where var() is not
// valid — the charts keep concrete hex for data colors and read
// `resolvedTheme()` for their few chrome colors.

const light = {
  // Surfaces, light → dark
  appBg: '#ffffff',
  surface: '#fbfbfc', // toolbar strip
  surfaceAlt: '#f4f5f7', // sidebar, tab strip
  hover: '#eceef2',
  hoverFaint: '#fafafb', // note-row hover
  border: '#e6e8ec',
  borderStrong: '#d4d7dd',
  guide: '#e2e5ea', // outline indent guides

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
  /** Selection ring (accent at ~33% alpha, pre-mixed — var()+alpha can't concat). */
  selectionRing: 'rgba(79, 70, 229, 0.35)',

  // Semantic
  success: '#15803d',
  successSoft: '#dcfce7',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  info: '#1d4ed8',
  infoSoft: '#dbeafe',

  // Content accents (markdown)
  hit: '#fde68a', // search-match highlight bg
  hitInk: '#191b21',
  tagInk: '#6d28d9', // #hashtag text
  tagBg: '#ede9fe',
  tagBgActive: '#ddd6fe',
  tagBorder: '#7c3aed',
  codeBg: '#f1f2f4',
};

type Palette = { [K in keyof typeof light]: string };

const dark: Palette = {
  appBg: '#15171c',
  surface: '#1a1d23',
  surfaceAlt: '#111318',
  hover: '#262a33',
  hoverFaint: '#1a1d22',
  border: '#2a2e37',
  borderStrong: '#3d4350',
  guide: '#272b34',

  ink: '#e8eaf0',
  inkMid: '#b3b9c6',
  inkSoft: '#7c8494',
  inkFaint: '#4a5160',

  accent: '#818cf8',
  accentInk: '#c7ccfd',
  accentSoft: '#272a45',
  accentBorder: '#4c53a8',
  selectionRing: 'rgba(129, 140, 248, 0.45)',

  success: '#4ade80',
  successSoft: '#17351f',
  warn: '#fbbf24',
  warnSoft: '#3a2e14',
  danger: '#f87171',
  dangerSoft: '#3c1d1d',
  info: '#60a5fa',
  infoSoft: '#1a2942',

  hit: '#5c4d15',
  hitInk: '#f4e9c8',
  tagInk: '#c4b5fd',
  tagBg: '#2b2447',
  tagBgActive: '#3a2f5e',
  tagBorder: '#8b74d8',
  codeBg: '#262a33',
};

export type ThemeName = 'light' | 'dark';
export const palettes: Record<ThemeName, Palette> = { light, dark };

/** Token → `var(--at-token)` reference; what every component styles with. */
export const color = Object.fromEntries(
  Object.keys(light).map((k) => [k, `var(--at-${k})`]),
) as Record<keyof typeof light, string>;

/** The stylesheet App.tsx injects: light on :root, dark behind [data-theme]. */
export function themeCss(): string {
  const block = (p: Palette) =>
    Object.entries(p)
      .map(([k, v]) => `--at-${k}: ${v};`)
      .join(' ');
  return (
    `:root { ${block(light)} color-scheme: light; }\n` +
    `[data-theme="dark"] { ${block(dark)} color-scheme: dark; }`
  );
}

/**
 * The theme currently applied to the document — for the rare consumer that needs
 * a concrete hex (SVG charts) rather than a CSS variable.
 */
export function resolvedTheme(): ThemeName {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export const radius = { sm: 6, md: 8, lg: 12 } as const;

/** box-shadow strings (web). */
export const shadow = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0 4px 16px rgba(16, 24, 40, 0.12)',
  lg: '0 8px 30px rgba(16, 24, 40, 0.16)',
} as const;

export const font = { xs: 11, sm: 12, md: 13, base: 14, lg: 16 } as const;
