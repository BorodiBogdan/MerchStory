import { useMemo } from 'react';
import { Platform } from 'react-native';

import { useTheme } from '@/context/theme';

/* ──────────────────────────────────────────────────────────────────────────
 * Shared design tokens for the auth screens (login / register), matching the
 * landing page's "cinematic editorial" aesthetic: serif display type, brand
 * indigo accent, glass surfaces, hairline borders and layered shadows. Flat
 * colors only (no gradients).
 * ────────────────────────────────────────────────────────────────────────── */

export const AUTH_MAXW = 1140;

// Same display faces as LandingPage: Newsreader (web, injected by AuthShell)
// with the bundled Playfair as the native serif; Inter-led sans on web and the
// default system sans on native so fontWeight tokens keep working.
export const AUTH_SERIF =
  Platform.OS === 'web'
    ? "'Newsreader', 'PlayfairDisplay-Regular', Georgia, serif"
    : 'PlayfairDisplay-Regular';
export const AUTH_SANS =
  Platform.OS === 'web'
    ? "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    : undefined;

export type AuthPalette = ReturnType<typeof getAuthPalette>;

/** Flat (gradient-free) cut of the landing palette. */
export function getAuthPalette(isDark: boolean) {
  if (isDark) {
    return {
      isDark: true,
      canvas: '#0A0A11',
      card: '#13131D',
      ink: '#F4F4FB',
      body: '#C3C2D2',
      muted: '#8786A0',
      hairline: 'rgba(255,255,255,0.10)',
      accent: '#818CF8',
      accentText: '#A5B4FC',
      accentSoft: 'rgba(129,140,248,0.16)',
      accentRing: 'rgba(129,140,248,0.30)',
      chipBg: 'rgba(19,19,29,0.72)',
      glassBg: 'rgba(19,19,29,0.62)',
      glassBorder: 'rgba(255,255,255,0.12)',
      btnPrimaryBg: '#6366F1',
      btnPrimaryText: '#FFFFFF',
      dangerBg: 'rgba(248,113,113,0.10)',
      dangerBorder: 'rgba(248,113,113,0.30)',
      dangerText: '#F87171',
      shadowCard: '0 1px 2px rgba(0,0,0,0.4), 0 24px 50px -28px rgba(0,0,0,0.7)',
      shadowNav: '0 10px 40px -16px rgba(0,0,0,0.7)',
      shadowBtn: '0 12px 28px -12px rgba(99,102,241,0.55)',
    };
  }
  return {
    isDark: false,
    canvas: '#FAFAFE',
    card: '#FFFFFF',
    ink: '#16151E',
    body: '#54535F',
    muted: '#928F9E',
    hairline: 'rgba(22,21,30,0.10)',
    accent: '#6366F1',
    accentText: '#4F46E5',
    accentSoft: 'rgba(99,102,241,0.10)',
    accentRing: 'rgba(99,102,241,0.22)',
    chipBg: 'rgba(255,255,255,0.74)',
    glassBg: 'rgba(255,255,255,0.66)',
    glassBorder: 'rgba(255,255,255,0.9)',
    btnPrimaryBg: '#6366F1',
    btnPrimaryText: '#FFFFFF',
    dangerBg: 'rgba(220,38,38,0.08)',
    dangerBorder: 'rgba(220,38,38,0.25)',
    dangerText: '#DC2626',
    shadowCard: '0 1px 2px rgba(22,21,30,0.04), 0 22px 48px -26px rgba(22,21,30,0.16)',
    shadowNav: '0 10px 36px -14px rgba(22,21,30,0.16)',
    shadowBtn: '0 12px 28px -12px rgba(99,102,241,0.5)',
  };
}

export function useAuthPalette(): AuthPalette {
  const { colorScheme } = useTheme();
  return useMemo(() => getAuthPalette(colorScheme === 'dark'), [colorScheme]);
}

// Spread web-only data-* attributes (used for CSS-driven motion/hover).
export const webAttrs = (ds: Record<string, string>) =>
  Platform.OS === 'web' ? ({ dataSet: ds } as Record<string, unknown>) : {};
