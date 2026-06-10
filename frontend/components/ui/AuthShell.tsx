import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNavbar } from '@/components/ui/AuthNavbar';
import { AUTH_SANS, AUTH_SERIF, AuthPalette, useAuthPalette } from '@/constants/authTheme';
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

// Re-export the auth tokens so the screens have a single import surface.
export { useAuthPalette, webAttrs } from '@/constants/authTheme';

/* ──────────────────────────────────────────────────────────────────────────
 * Shared scaffold for the login / register screens, matching the landing
 * page's "cinematic editorial" aesthetic with flat colors only (no
 * gradients): a calm canvas, the floating glass navbar (web), and a centered
 * form card with hairline border and layered shadow. On native the form
 * renders full-bleed with a theme toggle in the corner.
 * ────────────────────────────────────────────────────────────────────────── */

const isWebPlatform = Platform.OS === 'web';

/** Web-only polish: reuse the landing font payload (same element id, so the
 *  stylesheet is fetched once per page) and add entrance/hover CSS. */
function useAuthWebPolish(accent: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const fontId = 'ms-landing-fonts';
    if (!document.getElementById(fontId)) {
      const pre1 = document.createElement('link');
      pre1.rel = 'preconnect';
      pre1.href = 'https://fonts.googleapis.com';
      document.head.appendChild(pre1);
      const pre2 = document.createElement('link');
      pre2.rel = 'preconnect';
      pre2.href = 'https://fonts.gstatic.com';
      pre2.crossOrigin = 'anonymous';
      document.head.appendChild(pre2);
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }

    const styleId = 'ms-auth-style';
    document.getElementById(styleId)?.remove();
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
      ::selection { background: ${accent}; color: #fff; }
      [data-ms-btn] { transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease, background-color .2s ease; cursor: pointer; }
      [data-ms-btn]:hover { transform: translateY(-2px); }
      [data-ms-tap] { cursor: pointer; transition: opacity .2s ease, background-color .2s ease, border-color .2s ease; }
      @media (prefers-reduced-motion: reduce) {
        [data-ms-btn]:hover { transform: none; }
      }
    `;
    document.head.appendChild(style);
  }, [accent]);
}

interface AuthShellProps {
  /** Label for the navbar CTA pill (web only) */
  ctaLabel: string;
  /** Route the navbar CTA pushes to (web only) */
  ctaHref: '/(auth)/login' | '/(auth)/register';
  /** Form card contents */
  children: ReactNode;
}

export function AuthShell({ ctaLabel, ctaHref, children }: AuthShellProps) {
  const { colorScheme, toggleTheme } = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();

  const isDark = colorScheme === 'dark';
  const P = useAuthPalette();
  useAuthWebPolish(P.accent);

  const isMobile = width < 560;
  const hPad = isMobile ? 20 : width < 900 ? 28 : 40;
  const s = useMemo(() => makeShellStyles(P, isMobile, hPad), [P, isMobile, hPad]);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: D.duration.slow });
    translateY.value = withTiming(0, {
      duration: D.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {isWebPlatform ? (
        <AuthNavbar ctaLabel={ctaLabel} ctaHref={ctaHref} />
      ) : (
        <Pressable
          onPress={toggleTheme}
          style={s.themeToggle}
          accessibilityLabel={isDark ? t('common.lightMode') : t('common.darkMode')}
          accessibilityRole="button"
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={22} color={P.body} />
        </Pressable>
      )}

      <KeyboardAvoidingView style={s.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[animStyle, s.card]}>{children}</Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeShellStyles(P: AuthPalette, isMobile: boolean, hPad: number) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: P.canvas },
    flex: { flex: 1 },
    themeToggle: {
      position: 'absolute',
      top: D.spacing.md,
      right: D.spacing.md,
      zIndex: 10,
      padding: D.spacing.sm,
      outlineWidth: 0,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: hPad,
      paddingTop: isWebPlatform ? 104 : D.spacing.xl,
      paddingBottom: isWebPlatform ? 48 : D.spacing.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      width: '100%',
      ...(isWebPlatform
        ? ({
            maxWidth: 460,
            backgroundColor: P.card,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: P.hairline,
            paddingHorizontal: isMobile ? 24 : 36,
            paddingVertical: isMobile ? 28 : 38,
            boxShadow: P.shadowCard,
          } as object)
        : {}),
    },
  });
}

/** Shared styles for the form card contents (headings, buttons, footer...). */
export function makeAuthFormStyles(P: AuthPalette) {
  return StyleSheet.create({
    logoContainer: { alignItems: 'center', marginBottom: D.spacing.lg },
    heading: {
      fontFamily: AUTH_SERIF,
      ...(isWebPlatform ? ({ fontWeight: '600', fontOpticalSizing: 'auto' } as object) : {}),
      fontSize: 32,
      lineHeight: 38,
      letterSpacing: -0.6,
      color: P.ink,
      textAlign: 'center',
      marginBottom: 6,
    },
    subheading: {
      fontFamily: AUTH_SANS,
      fontSize: 15,
      lineHeight: 22,
      color: P.body,
      textAlign: 'center',
      marginBottom: D.spacing.xl,
    },
    socialRow: { flexDirection: 'row', gap: 10, marginBottom: D.spacing.lg },
    socialBtn: { flex: 1, borderRadius: 999 },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: D.spacing.lg },
    orLine: { flex: 1, height: 1, backgroundColor: P.hairline },
    orText: {
      fontFamily: AUTH_SANS,
      fontSize: 11,
      fontWeight: '600',
      color: P.muted,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      backgroundColor: P.dangerBg,
      borderWidth: 1,
      borderColor: P.dangerBorder,
      borderRadius: 14,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 2,
      marginBottom: D.spacing.md,
    },
    errorBannerText: {
      flex: 1,
      fontFamily: AUTH_SANS,
      fontSize: 13,
      lineHeight: 18,
      color: P.dangerText,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 52,
      borderRadius: 999,
      backgroundColor: P.btnPrimaryBg,
      marginTop: D.spacing.sm,
      marginBottom: D.spacing.sm,
      outlineWidth: 0,
      ...(isWebPlatform ? ({ boxShadow: P.shadowBtn } as object) : D.shadow.glow),
    },
    primaryButtonDisabled: {
      opacity: 0.45,
      ...(isWebPlatform ? ({ boxShadow: 'none' } as object) : { shadowOpacity: 0, elevation: 0 }),
    },
    primaryButtonPressed: { opacity: 0.9 },
    primaryButtonText: {
      fontFamily: AUTH_SANS,
      fontSize: 15,
      fontWeight: '600',
      color: P.btnPrimaryText,
      letterSpacing: 0.2,
    },
    forgotButton: {
      alignSelf: 'center',
      paddingVertical: D.spacing.sm,
      marginBottom: D.spacing.md,
      outlineWidth: 0,
    },
    forgotText: { fontFamily: AUTH_SANS, fontSize: 13.5, color: P.body },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: D.spacing.sm,
    },
    footerText: { fontFamily: AUTH_SANS, fontSize: 13.5, color: P.muted },
    footerLink: {
      fontFamily: AUTH_SANS,
      fontSize: 13.5,
      fontWeight: '600',
      color: P.accentText,
      outlineWidth: 0,
    },
    strengthContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      marginTop: -D.spacing.sm,
      marginBottom: D.spacing.md,
      paddingHorizontal: 2,
    },
    strengthBar: { flex: 1, flexDirection: 'row', gap: 4 },
    strengthSegment: { flex: 1, height: 3, borderRadius: 2 },
    strengthLabel: {
      fontFamily: AUTH_SANS,
      fontSize: 11,
      fontWeight: '500',
      minWidth: 44,
      textAlign: 'right',
    },
  });
}
