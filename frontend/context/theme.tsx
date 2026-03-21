import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { darkColors, lightColors, type DesignColors } from '@/constants/design';

type ColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  colorScheme: ColorScheme;
  colors: DesignColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');

  const toggleTheme = useCallback(() => {
    setColorScheme((s) => (s === 'light' ? 'dark' : 'light'));
  }, []);

  const colors = useMemo(() => (colorScheme === 'dark' ? darkColors : lightColors), [colorScheme]);

  const value = useMemo(
    () => ({ colorScheme, colors, toggleTheme }),
    [colorScheme, colors, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
