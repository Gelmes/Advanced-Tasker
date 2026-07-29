// Mobile theming (MOBILE.md). The web app styles with CSS variables injected by
// App.tsx; native has no CSS, so mobile components read a concrete palette from
// this context instead. Same tokens, same hex values — fed by the `palettes`
// export in src/theme.ts.

import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type ThemeName } from '../theme';

type Palette = (typeof palettes)[ThemeName];

const ThemeContext = createContext<{ name: ThemeName; palette: Palette }>({
  name: 'light',
  palette: palettes.light,
});

/** Follows the OS scheme for now; a stored theme-mode setting arrives with the
 * store integration in Phase 1. */
export function MobileThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const name: ThemeName = scheme === 'dark' ? 'dark' : 'light';
  return (
    <ThemeContext.Provider value={{ name, palette: palettes[name] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function usePalette(): Palette {
  return useContext(ThemeContext).palette;
}
