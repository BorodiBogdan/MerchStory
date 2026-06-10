import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNavbar } from '@/components/ui/AuthNavbar';
import {
  AUTH_SANS,
  AUTH_SERIF,
  AuthPalette,
  useAuthPalette,
  webAttrs,
} from '@/constants/authTheme';
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

const PANEL_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'camera-outline',
  'sparkles-outline',
  'rocket-outline',
];

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
      @keyframes msUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
      [data-ms-up] { animation: msUp .9s cubic-bezier(.2,.7,.3,1) both; }
      [data-ms-d="1"] { animation-delay: .05s } [data-ms-d="2"] { animation-delay: .13s }
      [data-ms-d="3"] { animation-delay: .21s } [data-ms-d="4"] { animation-delay: .30s }
      [data-ms-d="5"] { animation-delay: .40s }
      [data-ms-btn] { transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease, background-color .2s ease; cursor: pointer; }
      [data-ms-btn]:hover { transform: translateY(-2px); }
      [data-ms-tap] { cursor: pointer; transition: opacity .2s ease, background-color .2s ease, border-color .2s ease; }
      @media (prefers-reduced-motion: reduce) {
        [data-ms-up] { animation: none !important; }
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
  const isWide = isWebPlatform && width >= 1024;
  const hPad = isMobile ? 20 : width < 900 ? 28 : 40;
  const s = useMemo(() => makeShellStyles(P, isMobile, isWide, hPad), [P, isMobile, isWide, hPad]);

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
          <View style={s.shellRow}>
            {/* Editorial brand panel (wide web only) */}
            {isWide && (
              <View style={s.panel}>
                <View style={s.eyebrow} {...webAttrs({ msUp: '1', msD: '1' })}>
                  <Ionicons name="sparkles" size={12} color={P.accent} style={{ marginRight: 7 }} />
                  <Text style={s.eyebrowText}>{t('landing.hero.eyebrow')}</Text>
                </View>

                <Text style={s.panelTitle} {...webAttrs({ msUp: '1', msD: '2' })}>
                  {t('landing.hero.heading').replace(/\n\s*/g, '\n')}
                </Text>

                <Text style={s.panelSub} {...webAttrs({ msUp: '1', msD: '3' })}>
                  {t('landing.hero.subheading')}
                </Text>

                <View style={s.panelSteps} {...webAttrs({ msUp: '1', msD: '4' })}>
                  {[0, 1, 2].map((i) => (
                    <View key={PANEL_ICONS[i]} style={s.stepRow}>
                      <View style={s.stepIcon}>
                        <Ionicons name={PANEL_ICONS[i]} size={16} color={P.accent} />
                      </View>
                      <Text style={s.stepTitle}>
                        {t(`landing.how.step${i + 1}Title` as Parameters<typeof t>[0])}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={s.trust} {...webAttrs({ msUp: '1', msD: '5' })}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={P.muted} />
                  <Text style={s.trustText}>{t('landing.hero.trust')}</Text>
                </View>
              </View>
            )}

            <Animated.View style={[animStyle, s.card]}>{children}</Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeShellStyles(P: AuthPalette, isMobile: boolean, isWide: boolean, hPad: number) {
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
    shellRow: {
      width: '100%',
      maxWidth: 1140,
      flexDirection: isWide ? 'row' : 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isWide ? 72 : 0,
    },

    // ── Editorial panel (wide web) ───────────────────────────────────────
    panel: { flex: 1, maxWidth: 560, minWidth: 0 },
    eyebrow: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: P.chipBg,
      borderWidth: 1,
      borderColor: P.glassBorder,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginBottom: 26,
      // @ts-ignore web-only
      backdropFilter: 'blur(10px)',
      // @ts-ignore web-only
      boxShadow: P.isDark ? 'none' : '0 4px 14px -6px rgba(22,21,30,0.18)',
    },
    eyebrowText: {
      fontFamily: AUTH_SANS,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1.2,
      color: P.accentText,
    },
    panelTitle: {
      fontFamily: AUTH_SERIF,
      fontWeight: '600',
      fontSize: 46,
      lineHeight: 46 * 1.06,
      letterSpacing: -1,
      color: P.ink,
      marginBottom: 16,
      // @ts-ignore web-only
      fontOpticalSizing: 'auto',
    },
    panelSub: {
      fontFamily: AUTH_SANS,
      fontSize: 16,
      lineHeight: 26,
      color: P.body,
      marginBottom: 28,
      maxWidth: 480,
    },
    panelSteps: { gap: 12, marginBottom: 28 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: P.accentSoft,
      borderWidth: 1,
      borderColor: P.accentRing,
    },
    stepTitle: {
      fontFamily: AUTH_SANS,
      fontSize: 15,
      fontWeight: '600',
      color: P.ink,
    },
    trust: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    trustText: { fontFamily: AUTH_SANS, fontSize: 13, color: P.muted },

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
