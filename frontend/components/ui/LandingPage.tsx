import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

const ACCENT = '#6366F1';
const MAX_WIDTH = 1100;

const FEATURES = [
  {
    icon: '✦',
    title: 'AI Scene Generation',
    body: 'Upload a raw photo. Get a studio-quality product shot placed in a professional scene.',
  },
  {
    icon: '◈',
    title: 'Context Engine',
    body: 'Post at the right moment — tuned to local weather, events, and trending occasions.',
  },
  {
    icon: '◎',
    title: 'One-Touch Distribution',
    body: 'Publish directly to your social channels from the same screen you created the ad.',
  },
];

const STEPS = [
  { num: '01', title: 'Upload', body: 'Take a photo of any product with your phone.' },
  { num: '02', title: 'Generate', body: 'AI removes the background and builds a professional ad.' },
  {
    num: '03',
    title: 'Post & Sell',
    body: 'Share to Facebook, Instagram, or download in one tap.',
  },
];

export default function LandingPage() {
  const { colors, colorScheme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const isNarrow = width < 768;
  const hPad = isNarrow ? D.spacing.md : D.spacing.xl;

  const s = makeStyles(colors, colorScheme, hPad, isNarrow);

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <View style={s.navOuter}>
        <View style={s.navInner}>
          <Text style={s.logo}>
            Merch<Text style={s.logoAccent}>Story</Text>
          </Text>
          <Pressable
            style={({ pressed }) => [s.navBtn, pressed && s.navBtnPressed]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={s.navBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <View style={s.heroOuter}>
        <View style={s.heroBg} pointerEvents="none" />
        <View style={s.heroInner}>
          <Text style={s.eyebrow}>AI-POWERED ADS FOR LOCAL RETAILERS</Text>
          <Text style={s.heroHeadline}>
            Turn product photos{'\n'}into professional ads{'\n'}
            <Text style={s.heroAccent}>instantly.</Text>
          </Text>
          <Text style={s.heroSub}>
            MerchStory uses AI to transform raw product photos into scroll-stopping ads — no design
            skills required.
          </Text>
          <View style={s.heroCtas}>
            <Pressable
              style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPrimaryPressed]}
              onPress={() => router.push('/(auth)/register')}
            >
              <Text style={s.ctaPrimaryText}>Get Started Free</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.ctaSecondary, pressed && s.ctaSecondaryPressed]}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={s.ctaSecondaryText}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Features ───────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.container}>
          <Text style={s.sectionLabel}>WHAT IT DOES</Text>
          <Text style={s.sectionHeading}>Everything you need to sell more.</Text>
          <View style={[s.featureRow, isNarrow && s.featureRowNarrow]}>
            {FEATURES.map((f) => (
              <View key={f.title} style={[s.featureCard, isNarrow && s.featureCardNarrow]}>
                <Text style={s.featureIcon}>{f.icon}</Text>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureBody}>{f.body}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── How It Works ───────────────────────────────────────── */}
      <View style={s.stepsOuter}>
        <View style={s.container}>
          <Text style={s.sectionLabel}>HOW IT WORKS</Text>
          <Text style={s.sectionHeading}>From photo to ad in seconds.</Text>
          <View style={[s.stepsRow, isNarrow && s.stepsRowNarrow]}>
            {STEPS.map((step, i) => (
              <View key={step.num} style={[s.stepItem, isNarrow && s.stepItemNarrow]}>
                <View style={s.stepBadge}>
                  <Text style={s.stepNum}>{step.num}</Text>
                </View>
                {!isNarrow && i < STEPS.length - 1 && <View style={s.stepConnector} />}
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepBody}>{step.body}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── Footer CTA ─────────────────────────────────────────── */}
      <View style={s.footerOuter}>
        <View style={s.container}>
          <Text style={s.footerHeading}>Ready to level up your store?</Text>
          <Text style={s.footerSub}>
            Join small retailers already using MerchStory to create professional ads in minutes.
          </Text>
          <Pressable
            style={({ pressed }) => [s.ctaPrimary, s.footerCta, pressed && s.ctaPrimaryPressed]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={s.ctaPrimaryText}>Start for Free</Text>
          </Pressable>
          <Text style={s.copyright}>
            © {new Date().getFullYear()} MerchStory · Built for local retailers
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  colorScheme: string,
  hPad: number,
  isNarrow: boolean
) {
  const isDark = colorScheme === 'dark';

  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    scrollContent: {
      flexGrow: 1,
    },

    // ── Navbar
    navOuter: {
      // @ts-ignore — web-only sticky positioning
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: colors.bg.base,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    navInner: {
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
      paddingHorizontal: hPad,
      paddingVertical: D.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    logo: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    logoAccent: {
      color: ACCENT,
    },
    navBtn: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    navBtnPressed: {
      opacity: 0.7,
    },
    navBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },

    // ── Hero
    heroOuter: {
      minHeight: isNarrow ? 480 : 600,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      position: 'relative',
      paddingVertical: D.spacing['2xl'],
      paddingHorizontal: hPad,
    },
    heroBg: {
      position: 'absolute',
      top: '10%',
      left: '50%',
      // @ts-ignore
      transform: [{ translateX: '-50%' }],
      width: 600,
      height: 400,
      borderRadius: 300,
      backgroundColor: isDark ? 'rgba(99,102,241,0.07)' : 'rgba(99,102,241,0.05)',
    },
    heroInner: {
      maxWidth: 680,
      // @ts-ignore
      marginHorizontal: 'auto',
      alignItems: 'center',
    },
    eyebrow: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: ACCENT,
      letterSpacing: 2,
      marginBottom: D.spacing.md,
    },
    heroHeadline: {
      fontSize: isNarrow ? 36 : 52,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      lineHeight: isNarrow ? 44 : 62,
      letterSpacing: -1.5,
      marginBottom: D.spacing.lg,
    },
    heroAccent: {
      color: ACCENT,
    },
    heroSub: {
      fontSize: D.fontSize.lg,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 28,
      marginBottom: D.spacing['2xl'],
      maxWidth: 520,
    },
    heroCtas: {
      flexDirection: 'row',
      gap: D.spacing.md,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },

    // ── Buttons
    ctaPrimary: {
      backgroundColor: ACCENT,
      paddingHorizontal: D.spacing.xl,
      paddingVertical: D.spacing.md,
      borderRadius: D.radius.pill,
    },
    ctaPrimaryPressed: {
      opacity: 0.85,
    },
    ctaPrimaryText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
    },
    ctaSecondary: {
      paddingHorizontal: D.spacing.xl,
      paddingVertical: D.spacing.md,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    ctaSecondaryPressed: {
      opacity: 0.7,
    },
    ctaSecondaryText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },

    // ── Section shared
    section: {
      paddingVertical: isNarrow ? D.spacing['2xl'] : 80,
      paddingHorizontal: hPad,
    },
    container: {
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
    },
    sectionLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      letterSpacing: 2,
      marginBottom: D.spacing.sm,
      textAlign: 'center',
    },
    sectionHeading: {
      fontSize: isNarrow ? D.fontSize['2xl'] : D.fontSize['3xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      letterSpacing: -0.5,
      marginBottom: isNarrow ? D.spacing.lg : D.spacing['2xl'],
    },

    // ── Features
    featureRow: {
      flexDirection: 'row',
      gap: D.spacing.lg,
    },
    featureRowNarrow: {
      flexDirection: 'column',
    },
    featureCard: {
      flex: 1,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.lg,
    },
    featureCardNarrow: {
      flex: undefined,
    },
    featureIcon: {
      fontSize: 24,
      color: ACCENT,
      marginBottom: D.spacing.md,
    },
    featureTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: D.spacing.sm,
    },
    featureBody: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      lineHeight: 22,
    },

    // ── How It Works
    stepsOuter: {
      backgroundColor: colors.bg.surface,
      paddingVertical: isNarrow ? D.spacing['2xl'] : 80,
      paddingHorizontal: hPad,
    },
    stepsRow: {
      flexDirection: 'row',
      gap: D.spacing.lg,
      position: 'relative',
    },
    stepsRowNarrow: {
      flexDirection: 'column',
    },
    stepItem: {
      flex: 1,
      alignItems: 'center',
      position: 'relative',
    },
    stepItemNarrow: {
      flex: undefined,
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: D.spacing.md,
    },
    stepBadge: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: ACCENT,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
      flexShrink: 0,
    },
    stepNum: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      color: ACCENT,
      letterSpacing: 1,
    },
    stepConnector: {
      position: 'absolute',
      top: 24,
      left: '55%',
      right: '-45%',
      height: 1,
      backgroundColor: colors.border.default,
    },
    stepTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
      textAlign: isNarrow ? 'left' : 'center',
    },
    stepBody: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      lineHeight: 22,
      textAlign: isNarrow ? 'left' : 'center',
    },

    // ── Footer CTA
    footerOuter: {
      paddingVertical: isNarrow ? D.spacing['2xl'] : 100,
      paddingHorizontal: hPad,
      alignItems: 'center',
    },
    footerHeading: {
      fontSize: isNarrow ? D.fontSize['2xl'] : 40,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      letterSpacing: -0.5,
      marginBottom: D.spacing.md,
    },
    footerSub: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: D.spacing['2xl'],
      maxWidth: 480,
    },
    footerCta: {
      marginBottom: D.spacing['2xl'],
    },
    copyright: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      textAlign: 'center',
    },
  });
}
