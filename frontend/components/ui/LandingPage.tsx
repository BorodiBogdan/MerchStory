import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

const ACCENT = '#6366F1';
const MAX_WIDTH = 1100;

const FEATURE_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'color-wand-outline',
  'partly-sunny-outline',
  'share-social-outline',
];
const FEATURE_IMAGES: ImageSourcePropType[] = [
  require('@/assets/images/background-removal.png'),
  require('@/assets/images/recommandations.png'),
  require('@/assets/images/publish-to.png'),
];

const STEP_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'camera-outline',
  'sparkles-outline',
  'rocket-outline',
];

export default function LandingPage() {
  const { colors, colorScheme, toggleTheme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const t = useT();

  const FEATURES = [
    {
      icon: FEATURE_ICONS[0],
      title: t('landing.features.feat1Title'),
      body: t('landing.features.feat1Body'),
      image: FEATURE_IMAGES[0],
    },
    {
      icon: FEATURE_ICONS[1],
      title: t('landing.features.feat2Title'),
      body: t('landing.features.feat2Body'),
      image: FEATURE_IMAGES[1],
    },
    {
      icon: FEATURE_ICONS[2],
      title: t('landing.features.feat3Title'),
      body: t('landing.features.feat3Body'),
      image: FEATURE_IMAGES[2],
    },
  ];

  const STEPS = [
    {
      num: '01',
      icon: STEP_ICONS[0],
      title: t('landing.how.step1Title'),
      body: t('landing.how.step1Body'),
    },
    {
      num: '02',
      icon: STEP_ICONS[1],
      title: t('landing.how.step2Title'),
      body: t('landing.how.step2Body'),
    },
    {
      num: '03',
      icon: STEP_ICONS[2],
      title: t('landing.how.step3Title'),
      body: t('landing.how.step3Body'),
    },
  ];

  const isNarrow = width < 768;
  const hPad = isNarrow ? D.spacing.md : D.spacing.xl;
  const isDark = colorScheme === 'dark';

  const s = makeStyles(colors, isDark, hPad, isNarrow);

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <View style={s.navOuter}>
        <View style={s.navInner}>
          {/* Logo — matches post-login header exactly */}
          <Pressable
            style={({ pressed }) => [s.logoBtn, pressed && { opacity: 0.75 }]}
            onPress={() => {}}
            accessibilityRole="button"
          >
            <View style={s.logoMark}>
              <Ionicons name="color-wand" size={13} color="#fff" />
            </View>
            <Text style={s.logoWordmark}>
              <Text style={s.logoWordmarkBold}>Merch</Text>
              <Text style={s.logoWordmarkAccent}>Story</Text>
            </Text>
          </Pressable>

          <View style={s.navRight}>
            {/* Theme toggle */}
            <Pressable
              onPress={toggleTheme}
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={isDark ? t('common.lightMode') : t('common.darkMode')}
              accessibilityRole="button"
            >
              <Ionicons
                name={isDark ? 'sunny-outline' : 'moon-outline'}
                size={19}
                color={colors.text.secondary}
              />
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.navSignIn, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={s.navSignInText}>{t('landing.signIn')}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <View style={s.heroOuter}>
        {/* Background glow */}
        <View style={s.heroBgGlow} pointerEvents="none" />

        <View style={[s.heroInner, !isNarrow && s.heroInnerRow]}>
          {/* Left — copy */}
          <View style={[s.heroLeft, !isNarrow && s.heroLeftWide]}>
            <View style={s.eyebrowPill}>
              <Ionicons name="sparkles" size={11} color={ACCENT} style={{ marginRight: 5 }} />
              <Text style={s.eyebrowText}>{t('landing.hero.eyebrow')}</Text>
            </View>

            <Text style={s.heroHeadline}>{t('landing.hero.heading')}</Text>

            <Text style={s.heroSub}>{t('landing.hero.subheading')}</Text>

            <View style={s.heroCtas}>
              <Pressable
                style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPrimaryPressed]}
                onPress={() => router.push('/(auth)/register')}
              >
                <Text style={s.ctaPrimaryText}>{t('landing.hero.ctaPrimary')}</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" style={{ marginLeft: 6 }} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.ctaSecondary, pressed && s.ctaSecondaryPressed]}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={s.ctaSecondaryText}>{t('landing.hero.ctaSecondary')}</Text>
              </Pressable>
            </View>

            <View style={s.trustRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.text.muted} />
              <Text style={s.trustText}>{t('landing.hero.trust')}</Text>
            </View>
          </View>

          {/* Right — app mockup placeholder */}
          {!isNarrow && (
            <View style={s.heroRight}>
              <View style={s.mockupGlow} pointerEvents="none" />
              <View style={s.phoneMockup}>
                {/* Status bar dots */}
                <View style={s.mockStatusBar}>
                  <View style={[s.mockDot, { backgroundColor: '#FF5F57' }]} />
                  <View style={[s.mockDot, { backgroundColor: '#FEBC2E' }]} />
                  <View style={[s.mockDot, { backgroundColor: '#28C840' }]} />
                </View>

                {/* Mock header */}
                <View style={s.mockHeader}>
                  <View style={s.mockLogoMark}>
                    <Ionicons name="color-wand" size={9} color="#fff" />
                  </View>
                  <View style={s.mockSkeletonLine} />
                  <View style={[s.mockSkeletonLine, { width: 28, opacity: 0.4 }]} />
                </View>

                {/* Mock image area — placeholder for screenshot */}
                <View style={s.mockImageArea}>
                  <View style={s.mockImagePlaceholder}>
                    <Ionicons
                      name="image-outline"
                      size={28}
                      color={ACCENT}
                      style={{ opacity: 0.5 }}
                    />
                    <Text style={s.mockImageLabel}>{t('landing.mockup.placeholder')}</Text>
                  </View>
                </View>

                {/* Mock product chips */}
                <View style={s.mockChipRow}>
                  <View style={[s.mockChip, s.mockChipActive]} />
                  <View style={s.mockChip} />
                  <View style={s.mockChip} />
                </View>

                {/* Mock skeleton lines */}
                <View style={s.mockTextBlock}>
                  <View style={[s.mockSkeletonLine, { width: '90%' }]} />
                  <View style={[s.mockSkeletonLine, { width: '65%', marginTop: 6 }]} />
                </View>

                {/* Mock action button */}
                <View style={s.mockActionRow}>
                  <View style={s.mockActionBtn}>
                    <Ionicons name="sparkles" size={11} color="#fff" />
                    <View
                      style={[s.mockSkeletonLine, { width: 60, opacity: 0.9, marginLeft: 5 }]}
                    />
                  </View>
                  <View style={s.mockIconBtn}>
                    <Ionicons name="share-social-outline" size={14} color={ACCENT} />
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Mobile mockup — below copy on narrow */}
        {isNarrow && (
          <View style={s.mockupNarrow}>
            <View style={s.mockImageAreaNarrow}>
              <Ionicons name="image-outline" size={36} color={ACCENT} style={{ opacity: 0.45 }} />
              <Text style={s.mockImageLabel}>{t('landing.mockup.comingSoon')}</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Features ───────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.container}>
          <Text style={s.sectionLabel}>{t('landing.features.label')}</Text>
          <Text style={s.sectionHeading}>{t('landing.features.heading')}</Text>

          <View style={[s.featureRow, isNarrow && s.featureRowNarrow]}>
            {FEATURES.map((f) => (
              <View key={f.title} style={[s.featureCard, isNarrow && s.featureCardNarrow]}>
                {/* Feature image */}
                <Image source={f.image} style={s.featureImg} resizeMode="cover" />
                {/* Content */}
                <View style={s.featureCardBody}>
                  <View style={s.featureIconBadge}>
                    <Ionicons name={f.icon} size={16} color={ACCENT} />
                  </View>
                  <Text style={s.featureTitle}>{f.title}</Text>
                  <Text style={s.featureBody}>{f.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── How It Works ───────────────────────────────────────── */}
      <View style={s.stepsOuter}>
        <View style={s.container}>
          <Text style={s.sectionLabel}>{t('landing.how.label')}</Text>
          <Text style={s.sectionHeading}>{t('landing.how.heading')}</Text>

          <View style={[s.stepsRow, isNarrow && s.stepsRowNarrow]}>
            {STEPS.map((step, i) => (
              <View key={step.num} style={[s.stepItem, isNarrow && s.stepItemNarrow]}>
                {/* Connector line — desktop only, between items */}
                {!isNarrow && i < STEPS.length - 1 && <View style={s.stepConnector} />}

                <View style={s.stepBadge}>
                  <Ionicons name={step.icon} size={22} color={ACCENT} />
                </View>
                <View style={s.stepNumLabel}>
                  <Text style={s.stepNum}>{step.num}</Text>
                </View>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepBody}>{step.body}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <View style={s.footerOuter}>
        <View style={s.footerBgGlow} pointerEvents="none" />
        <View style={s.container}>
          {/* CTA row */}
          <View style={[s.footerTop, isNarrow && s.footerTopNarrow]}>
            <View style={s.footerTopLeft}>
              <Text style={s.footerHeading}>{t('landing.footer.heading')}</Text>
              <Text style={s.footerSub}>{t('landing.footer.subheading')}</Text>
            </View>
            <View style={[s.footerTopRight, isNarrow && s.footerTopRightNarrow]}>
              <Pressable
                style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPrimaryPressed]}
                onPress={() => router.push('/(auth)/register')}
              >
                <Text style={s.ctaPrimaryText}>{t('landing.footer.ctaPrimary')}</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" style={{ marginLeft: 6 }} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  s.ctaSecondary,
                  s.footerSignIn,
                  pressed && s.ctaSecondaryPressed,
                ]}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={s.ctaSecondaryText}>{t('landing.footer.ctaSecondary')}</Text>
              </Pressable>
            </View>
          </View>

          {/* Divider */}
          <View style={s.footerDivider} />

          {/* Bottom bar */}
          <View style={[s.footerBottom, isNarrow && s.footerBottomNarrow]}>
            {/* Logo */}
            <View style={s.footerLogoRow}>
              <View style={s.logoMark}>
                <Ionicons name="color-wand" size={11} color="#fff" />
              </View>
              <Text style={s.footerLogoText}>
                <Text style={s.logoWordmarkBold}>Merch</Text>
                <Text style={s.logoWordmarkAccent}>Story</Text>
              </Text>
            </View>

            <Text style={s.copyright}>
              © {new Date().getFullYear()} {t('landing.footer.copyright')}
            </Text>

            {/* Theme toggle */}
            <Pressable
              onPress={toggleTheme}
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={isDark ? t('common.lightMode') : t('common.darkMode')}
              accessibilityRole="button"
            >
              <Ionicons
                name={isDark ? 'sunny-outline' : 'moon-outline'}
                size={17}
                color={colors.text.muted}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean,
  hPad: number,
  isNarrow: boolean
) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    scrollContent: {
      flexGrow: 1,
    },

    // ── Shared layout
    container: {
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
      paddingHorizontal: hPad,
    },

    // ── Navbar ──────────────────────────────────────────────────
    navOuter: {
      // @ts-ignore
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: isDark ? 'rgba(15,17,23,0.85)' : 'rgba(248,250,252,0.88)',
      // @ts-ignore
      backdropFilter: 'blur(12px)',
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
    logoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      // @ts-ignore
      outlineWidth: 0,
    },
    logoMark: {
      width: 26,
      height: 26,
      borderRadius: D.radius.sm,
      backgroundColor: ACCENT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoWordmark: {
      fontSize: D.fontSize.lg,
      letterSpacing: -0.5,
    },
    logoWordmarkBold: {
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    logoWordmarkAccent: {
      fontWeight: D.fontWeight.bold,
      color: ACCENT,
    },
    navLinks: {
      flexDirection: 'row',
      gap: D.spacing.xl,
      position: 'absolute',
      // @ts-ignore
      left: '50%',
      transform: [{ translateX: -80 }],
    },
    navLink: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
      // @ts-ignore
      cursor: 'pointer',
    },
    navRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      // @ts-ignore
      outlineWidth: 0,
    },
    navSignIn: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm - 2,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      // @ts-ignore
      outlineWidth: 0,
    },
    navSignInText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },

    // ── Hero ────────────────────────────────────────────────────
    heroOuter: {
      paddingTop: isNarrow ? D.spacing.xl : 80,
      paddingBottom: isNarrow ? D.spacing['2xl'] : 80,
      paddingHorizontal: hPad,
      overflow: 'hidden',
      position: 'relative',
    },
    heroBgGlow: {
      position: 'absolute',
      top: -80,
      // @ts-ignore
      left: '30%',
      width: 600,
      height: 500,
      borderRadius: 300,
      backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)',
    },
    heroInner: {
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
      alignItems: 'center',
    },
    heroInnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: D.spacing['2xl'],
    },
    heroLeft: {
      alignItems: isNarrow ? 'center' : 'flex-start',
    },
    heroLeftWide: {
      flex: 1,
      maxWidth: 520,
    },
    eyebrowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)',
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.xs + 2,
      marginBottom: D.spacing.lg,
      alignSelf: isNarrow ? 'center' : 'flex-start',
    },
    eyebrowText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: ACCENT,
      letterSpacing: 0.8,
    },
    heroHeadline: {
      fontSize: isNarrow ? 34 : 52,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: isNarrow ? 'center' : 'left',
      lineHeight: isNarrow ? 42 : 62,
      letterSpacing: -1.5,
      marginBottom: D.spacing.lg,
    },
    heroAccent: {
      color: ACCENT,
    },
    heroSub: {
      fontSize: isNarrow ? D.fontSize.base : D.fontSize.lg,
      color: colors.text.secondary,
      textAlign: isNarrow ? 'center' : 'left',
      lineHeight: 28,
      marginBottom: D.spacing['2xl'],
      maxWidth: 480,
    },
    heroCtas: {
      flexDirection: 'row',
      gap: D.spacing.md,
      flexWrap: 'wrap',
      justifyContent: isNarrow ? 'center' : 'flex-start',
      marginBottom: D.spacing.lg,
    },
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    trustText: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },

    // ── Mockup — desktop ───────────────────────────────────────
    heroRight: {
      flex: 1,
      maxWidth: 400,
      alignItems: 'center',
      position: 'relative',
    },
    mockupGlow: {
      position: 'absolute',
      top: '20%',
      left: '10%',
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)',
    },
    phoneMockup: {
      width: 320,
      backgroundColor: isDark ? '#161B27' : '#FFFFFF',
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      ...D.shadow.modal,
    },
    mockStatusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      backgroundColor: isDark ? '#0F1117' : '#F1F5F9',
    },
    mockDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    mockHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    mockLogoMark: {
      width: 20,
      height: 20,
      borderRadius: 5,
      backgroundColor: ACCENT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mockSkeletonLine: {
      height: 8,
      flex: 1,
      borderRadius: 4,
      backgroundColor: colors.border.default,
    },
    mockImageArea: {
      height: 180,
      margin: D.spacing.md,
      borderRadius: D.radius.md,
      backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.12)',
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mockImagePlaceholder: {
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    mockImageLabel: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    mockChipRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      paddingBottom: D.spacing.sm,
    },
    mockChip: {
      height: 24,
      width: 64,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
    },
    mockChipActive: {
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: ACCENT,
    },
    mockTextBlock: {
      paddingHorizontal: D.spacing.md,
      paddingBottom: D.spacing.sm,
      gap: 4,
    },
    mockActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      padding: D.spacing.md,
    },
    mockActionBtn: {
      flex: 1,
      height: 36,
      borderRadius: D.radius.md,
      backgroundColor: ACCENT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.spacing.md,
    },
    mockIconBtn: {
      width: 36,
      height: 36,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.25)',
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Mockup — narrow ────────────────────────────────────────
    mockupNarrow: {
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
      marginTop: D.spacing['2xl'],
    },
    mockImageAreaNarrow: {
      height: 160,
      borderRadius: D.radius.lg,
      backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)',
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
    },

    // ── Buttons ────────────────────────────────────────────────
    ctaPrimary: {
      backgroundColor: ACCENT,
      paddingHorizontal: D.spacing.xl,
      paddingVertical: D.spacing.md,
      borderRadius: D.radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      ...D.shadow.glow,
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
      color: colors.text.secondary,
    },

    // ── Section shared ─────────────────────────────────────────
    section: {
      paddingVertical: isNarrow ? D.spacing['2xl'] : 80,
    },
    sectionLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: ACCENT,
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
      maxWidth: 640,
      // @ts-ignore
      alignSelf: 'center',
    },

    // ── Features ───────────────────────────────────────────────
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
      overflow: 'hidden',
    },
    featureCardNarrow: {
      flex: undefined,
    },
    featureImg: {
      width: '100%',
      height: 140,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    featureCardBody: {
      padding: D.spacing.lg,
    },
    featureIconBadge: {
      width: 36,
      height: 36,
      borderRadius: D.radius.sm,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
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

    // ── How It Works ───────────────────────────────────────────
    stepsOuter: {
      backgroundColor: colors.bg.surface,
      paddingVertical: isNarrow ? D.spacing['2xl'] : 80,
      paddingHorizontal: hPad,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    stepsRow: {
      flexDirection: 'row',
      gap: D.spacing.lg,
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
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
    },
    stepConnector: {
      position: 'absolute',
      top: 28,
      // @ts-ignore
      left: '60%',
      right: '-40%',
      height: 1,
      backgroundColor: colors.border.default,
    },
    stepBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.sm,
    },
    stepNumLabel: {
      marginBottom: D.spacing.sm,
    },
    stepNum: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: ACCENT,
      letterSpacing: 1.5,
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
      maxWidth: isNarrow ? undefined : 200,
    },

    // ── Footer ─────────────────────────────────────────────────
    footerOuter: {
      position: 'relative',
      overflow: 'hidden',
      paddingTop: isNarrow ? D.spacing['2xl'] : 80,
      paddingBottom: D.spacing['2xl'],
      paddingHorizontal: hPad,
    },
    footerBgGlow: {
      position: 'absolute',
      bottom: -100,
      // @ts-ignore
      left: '20%',
      width: 500,
      height: 400,
      borderRadius: 250,
      backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)',
    },
    footerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: D.spacing['2xl'],
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
      marginBottom: D.spacing['2xl'],
    },
    footerTopNarrow: {
      flexDirection: 'column',
    },
    footerTopLeft: {
      flex: 1,
      maxWidth: 480,
    },
    footerHeading: {
      fontSize: isNarrow ? D.fontSize['2xl'] : 40,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
      lineHeight: isNarrow ? 36 : 52,
      marginBottom: D.spacing.md,
    },
    footerHeadingAccent: {
      color: ACCENT,
    },
    footerSub: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      lineHeight: 24,
      maxWidth: 400,
    },
    footerTopRight: {
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: D.spacing.md,
    },
    footerTopRightNarrow: {
      marginTop: D.spacing.lg,
    },
    footerSignIn: {
      paddingHorizontal: 0,
      borderWidth: 0,
    },
    footerDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
      marginBottom: D.spacing.lg,
    },
    footerBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      maxWidth: MAX_WIDTH,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
    },
    footerBottomNarrow: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: D.spacing.md,
    },
    footerLogoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    footerLogoText: {
      fontSize: D.fontSize.base,
      letterSpacing: -0.3,
    },
    copyright: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
  });
}
