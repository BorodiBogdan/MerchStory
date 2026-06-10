import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

/* ──────────────────────────────────────────────────────────────────────────
 * MerchStory web landing page.
 *
 * Aesthetic: "cinematic editorial". A calm atmospheric gradient sky, an
 * elegant serif display face, a floating glassy product window and generous
 * negative space. Premium and confident rather than the usual dark SaaS slab.
 * Renders on web only (native users are redirected to /login), so we lean
 * fully into web CSS: real gradients, backdrop blur, layered shadows and a
 * hint of motion. The brand indigo carries the accent; light + dark are both
 * first-class via the theme toggle.
 * ────────────────────────────────────────────────────────────────────────── */

const MAXW = 1140;

// Distinctive editorial serif for display type (loaded web-only, see
// useWebPolish). Falls back to the app's bundled Playfair, then Georgia.
const SERIF =
  Platform.OS === 'web'
    ? "'Newsreader', 'PlayfairDisplay-Regular', Georgia, serif"
    : 'PlayfairDisplay-Regular';
const SANS =
  Platform.OS === 'web'
    ? "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    : 'Inter-Regular';

const FEATURE_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'color-wand-outline',
  'partly-sunny-outline',
  'share-social-outline',
];
const STEP_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'camera-outline',
  'sparkles-outline',
  'rocket-outline',
];

type Tint = { bg: string; icon: string; ring: string };
type Palette = ReturnType<typeof getPalette>;

function getPalette(isDark: boolean) {
  if (isDark) {
    return {
      isDark: true,
      // Page + atmospheric sky ("indigo nocturne")
      scrollBg: '#08080E',
      canvas: '#0A0A11',
      heroTop: '#08080E',
      heroMid: '#14132A',
      heroBot: '#0A0A11',
      sunInner: 'rgba(129,140,248,0.34)',
      sunMid: 'rgba(99,102,241,0.16)',
      sunOuter: 'rgba(99,102,241,0)',
      // Surfaces
      card: '#13131D',
      cardAlt: '#0E0E18',
      // Text
      ink: '#F4F4FB',
      body: '#C3C2D2',
      muted: '#8786A0',
      // Lines
      hairline: 'rgba(255,255,255,0.10)',
      hairlineStrong: 'rgba(255,255,255,0.18)',
      // Accent (brand indigo)
      accent: '#818CF8',
      accentText: '#A5B4FC',
      accentSoft: 'rgba(129,140,248,0.16)',
      // Glass
      glassBg: 'rgba(19,19,29,0.62)',
      glassBorder: 'rgba(255,255,255,0.12)',
      chipBg: 'rgba(19,19,29,0.72)',
      // Buttons (indigo primary)
      btnPrimaryBg: '#6366F1',
      btnPrimaryText: '#FFFFFF',
      btnGhostBorder: 'rgba(255,255,255,0.22)',
      // Decorative
      windowGlow: 'rgba(129,140,248,0.26)',
      videoA: '#252150',
      videoB: '#46409A',
      badgeShadow: '0 14px 30px -10px rgba(99,102,241,0.6)',
      shadowWindow:
        '0 2px 6px rgba(0,0,0,0.4), 0 50px 120px -40px rgba(99,102,241,0.34), 0 40px 90px -40px rgba(0,0,0,0.7)',
      shadowCard: '0 1px 2px rgba(0,0,0,0.4), 0 24px 50px -28px rgba(0,0,0,0.7)',
      shadowNav: '0 10px 40px -16px rgba(0,0,0,0.7)',
      shadowBtn: '0 12px 28px -12px rgba(99,102,241,0.55)',
      // Purple-family trio (indigo → violet → orchid) so the feature icons stay
      // on-brand instead of indigo/blue/green.
      tints: [
        { bg: 'rgba(129,140,248,0.14)', icon: '#A5B4FC', ring: 'rgba(129,140,248,0.30)' },
        { bg: 'rgba(139,122,248,0.14)', icon: '#B7A6FC', ring: 'rgba(139,122,248,0.28)' },
        { bg: 'rgba(165,124,245,0.14)', icon: '#C9ABF7', ring: 'rgba(165,124,245,0.28)' },
      ] as Tint[],
    };
  }
  return {
    isDark: false,
    // Page + atmospheric sky ("indigo dawn")
    scrollBg: '#D3D6F4',
    canvas: '#FAFAFE',
    heroTop: '#D3D6F4',
    heroMid: '#E2E1F9',
    heroBot: '#FAFAFE',
    sunInner: '#C3C6FF',
    sunMid: 'rgba(124,131,246,0.42)',
    sunOuter: 'rgba(124,131,246,0)',
    // Surfaces
    card: '#FFFFFF',
    cardAlt: '#F5F5FB',
    // Text
    ink: '#16151E',
    body: '#54535F',
    muted: '#928F9E',
    // Lines
    hairline: 'rgba(22,21,30,0.10)',
    hairlineStrong: 'rgba(22,21,30,0.16)',
    // Accent (brand indigo)
    accent: '#6366F1',
    accentText: '#4F46E5',
    accentSoft: 'rgba(99,102,241,0.10)',
    // Glass
    glassBg: 'rgba(255,255,255,0.66)',
    glassBorder: 'rgba(255,255,255,0.9)',
    chipBg: 'rgba(255,255,255,0.74)',
    // Buttons (indigo primary)
    btnPrimaryBg: '#6366F1',
    btnPrimaryText: '#FFFFFF',
    btnGhostBorder: 'rgba(22,21,30,0.20)',
    // Decorative
    windowGlow: 'rgba(99,102,241,0.22)',
    videoA: '#4338CA',
    videoB: '#6D5DF6',
    badgeShadow: '0 14px 30px -10px rgba(99,102,241,0.55)',
    shadowWindow:
      '0 2px 6px rgba(22,21,30,0.06), 0 50px 120px -40px rgba(99,102,241,0.22), 0 36px 80px -36px rgba(22,21,30,0.26)',
    shadowCard: '0 1px 2px rgba(22,21,30,0.04), 0 22px 48px -26px rgba(22,21,30,0.16)',
    shadowNav: '0 10px 36px -14px rgba(22,21,30,0.16)',
    shadowBtn: '0 12px 28px -12px rgba(99,102,241,0.5)',
    // Purple-family trio (indigo → violet → orchid) so the feature icons stay
    // on-brand instead of indigo/blue/green.
    tints: [
      { bg: '#ECEDFE', icon: '#5457E6', ring: 'rgba(99,102,241,0.22)' },
      { bg: '#EEEBFE', icon: '#6D54E4', ring: 'rgba(124,92,246,0.22)' },
      { bg: '#F1EAFC', icon: '#8A4FD8', ring: 'rgba(150,90,220,0.22)' },
    ] as Tint[],
  };
}

/** Web-only: inject the display font + keyframes/hover rules once. Lives here
 *  (not in +html.tsx) so the whole redesign stays contained to this file. */
function useWebPolish(accent: string) {
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

    const styleId = 'ms-landing-style';
    document.getElementById(styleId)?.remove();
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      html { scroll-behavior: smooth; }
      body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
      ::selection { background: ${accent}; color: #fff; }
      @keyframes msUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
      @keyframes msFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      [data-ms-up] { animation: msUp .9s cubic-bezier(.2,.7,.3,1) both; }
      [data-ms-d="1"] { animation-delay: .05s } [data-ms-d="2"] { animation-delay: .13s }
      [data-ms-d="3"] { animation-delay: .21s } [data-ms-d="4"] { animation-delay: .30s }
      [data-ms-d="5"] { animation-delay: .40s } [data-ms-d="6"] { animation-delay: .52s }
      [data-ms-float] { animation: msFloat 7s ease-in-out infinite; }
      @keyframes msPulse { 0% { transform: scale(0.9); opacity: .5; } 70% { transform: scale(1.7); opacity: 0; } 100% { opacity: 0; } }
      [data-ms-pulse] { animation: msPulse 2.8s ease-out infinite; }
      [data-ms-lift] { transition: transform .3s cubic-bezier(.2,.7,.3,1), box-shadow .3s ease, border-color .3s ease; }
      [data-ms-lift]:hover { transform: translateY(-5px); }
      [data-ms-btn] { transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease, background-color .2s ease; cursor: pointer; }
      [data-ms-btn]:hover { transform: translateY(-2px); }
      [data-ms-tap] { cursor: pointer; transition: opacity .2s ease, background-color .2s ease, border-color .2s ease; }
      @media (prefers-reduced-motion: reduce) {
        [data-ms-up], [data-ms-float] { animation: none !important; }
        html { scroll-behavior: auto; }
      }
    `;
    document.head.appendChild(style);
  }, [accent]);
}

// Spread web-only data-* attributes (used for CSS-driven motion/hover).
const web = (ds: Record<string, string>) =>
  Platform.OS === 'web' ? ({ dataSet: ds } as Record<string, unknown>) : {};

export default function LandingPage() {
  const { colorScheme, toggleTheme } = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const t = useT();

  const isDark = colorScheme === 'dark';
  const P = getPalette(isDark);
  useWebPolish(P.accent);

  const isNarrow = width < 900; // stack the bento / steps
  const isMobile = width < 560; // tighten type + spacing
  const hPad = isMobile ? 20 : isNarrow ? 28 : 40;
  const s = makeStyles(P, isNarrow, isMobile, hPad, height);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const goRegister = () => router.push('/(auth)/register');
  const goLogin = () => router.push('/(auth)/login');

  const FEATURES = [0, 1, 2].map((i) => ({
    icon: FEATURE_ICONS[i],
    title: t(`landing.features.feat${i + 1}Title` as Parameters<typeof t>[0]),
    body: t(`landing.features.feat${i + 1}Body` as Parameters<typeof t>[0]),
    tint: P.tints[i],
  }));

  const STEPS = [0, 1, 2].map((i) => ({
    num: `0${i + 1}`,
    icon: STEP_ICONS[i],
    title: t(`landing.how.step${i + 1}Title` as Parameters<typeof t>[0]),
    body: t(`landing.how.step${i + 1}Body` as Parameters<typeof t>[0]),
  }));

  const STATS = [1, 2, 3].map((i) => ({
    value: t(`landing.stats.stat${i}Value` as Parameters<typeof t>[0]),
    label: t(`landing.stats.stat${i}Label` as Parameters<typeof t>[0]),
  }));

  const FAQS = [1, 2, 3, 4].map((i) => ({
    q: t(`landing.faq.q${i}` as Parameters<typeof t>[0]),
    a: t(`landing.faq.a${i}` as Parameters<typeof t>[0]),
  }));

  const PrimaryBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      {...web({ msBtn: '1' })}
      style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.9 }]}
    >
      <Text style={s.btnPrimaryText}>{label}</Text>
      <Ionicons name="arrow-forward" size={16} color={P.btnPrimaryText} style={{ marginLeft: 8 }} />
    </Pressable>
  );

  const GhostBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      {...web({ msBtn: '1' })}
      style={({ pressed }) => [s.btnGhost, pressed && { opacity: 0.6 }]}
    >
      <Text style={s.btnGhostText}>{label}</Text>
    </Pressable>
  );

  const ThemeToggle = ({ subtle }: { subtle?: boolean }) => (
    <Pressable
      onPress={toggleTheme}
      {...web({ msTap: '1' })}
      style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={isDark ? t('common.lightMode') : t('common.darkMode')}
    >
      <Ionicons
        name={isDark ? 'sunny-outline' : 'moon-outline'}
        size={18}
        color={subtle ? P.muted : P.body}
      />
    </Pressable>
  );

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Floating glass nav ───────────────────────────────────────────── */}
      <View style={s.navWrap}>
        <View style={s.nav}>
          <BrandLogo size="sm" variant="horizontal" />
          <View style={s.navRight}>
            <ThemeToggle />
            <Pressable
              onPress={goLogin}
              {...web({ msTap: '1' })}
              style={({ pressed }) => [s.navSignIn, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.navSignInText}>{t('landing.signIn')}</Text>
            </Pressable>
            {!isMobile && (
              <Pressable
                onPress={goRegister}
                {...web({ msBtn: '1' })}
                style={({ pressed }) => [s.navCta, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.navCtaText}>{t('landing.hero.ctaPrimary')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <View style={s.hero}>
        {/* Sky painted as a CSS gradient (web). Percentage-sized SVG was leaving
            a lavender strip at the hero's bottom; a CSS gradient always fills and
            its bottom stop == canvas, so there's no seam into the next section. */}
        <View style={s.heroBg} pointerEvents="none" />

        <View style={s.heroContent}>
          <View style={s.eyebrow} {...web({ msUp: '1', msD: '1' })}>
            <Ionicons name="sparkles" size={12} color={P.accent} style={{ marginRight: 7 }} />
            <Text style={s.eyebrowText}>{t('landing.hero.eyebrow')}</Text>
          </View>

          <Text style={s.heroTitle} {...web({ msUp: '1', msD: '2' })}>
            {t('landing.hero.heading')}
          </Text>

          <Text style={s.heroSub} {...web({ msUp: '1', msD: '3' })}>
            {t('landing.hero.subheading')}
          </Text>

          <View style={s.heroCtas} {...web({ msUp: '1', msD: '4' })}>
            <PrimaryBtn label={t('landing.hero.ctaPrimary')} onPress={goRegister} />
            <GhostBtn label={t('landing.hero.ctaSecondary')} onPress={goLogin} />
          </View>

          <View style={s.trust} {...web({ msUp: '1', msD: '5' })}>
            <Ionicons name="shield-checkmark-outline" size={14} color={P.muted} />
            <Text style={s.trustText}>{t('landing.hero.trust')}</Text>
          </View>

          {/* Floating product window */}
          <View style={s.showcaseWrap} {...web({ msUp: '1', msD: '6' })}>
            <View style={s.window} {...web({ msFloat: '1' })}>
              <View style={s.winBar}>
                <View style={[s.winDot, { backgroundColor: '#FF5F57' }]} />
                <View style={[s.winDot, { backgroundColor: '#FEBC2E' }]} />
                <View style={[s.winDot, { backgroundColor: '#28C840' }]} />
                <View style={s.winAddr}>
                  <Ionicons name="sparkles" size={10} color={P.accent} />
                  <Text style={s.winAddrText}>MerchStory Studio</Text>
                </View>
              </View>
              {/* Video preview slot. Swap this block for a <video> when ready. */}
              <View style={s.videoFrame}>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg width="100%" height="100%">
                    <Defs>
                      <LinearGradient id="vidBg" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={P.videoA} />
                        <Stop offset="1" stopColor={P.videoB} />
                      </LinearGradient>
                      <RadialGradient id="vidGlow" cx="0.3" cy="0.16" r="0.95">
                        <Stop offset="0" stopColor="rgba(255,255,255,0.22)" />
                        <Stop offset="1" stopColor="rgba(255,255,255,0)" />
                      </RadialGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#vidBg)" />
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#vidGlow)" />
                  </Svg>
                </View>

                <View style={s.playWrap} pointerEvents="none">
                  <View style={s.playPulse} {...web({ msPulse: '1' })} />
                  <View style={s.playBtn}>
                    <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 4 }} />
                  </View>
                </View>

                <View style={s.vidScrim} pointerEvents="none" />
                <View style={s.vidControls} pointerEvents="none">
                  <Ionicons name="play" size={14} color="rgba(255,255,255,0.92)" />
                  <View style={s.vidTrack}>
                    <View style={s.vidProgress} />
                    <View style={s.vidThumb} />
                  </View>
                  <Text style={s.vidTime}>0:11</Text>
                  <Ionicons name="volume-medium" size={14} color="rgba(255,255,255,0.92)" />
                  <Ionicons name="scan-outline" size={14} color="rgba(255,255,255,0.92)" />
                </View>
              </View>
            </View>

            {!isNarrow && (
              <>
                <View style={[s.floatBadge, s.floatBadgeTL]} {...web({ msFloat: '1' })}>
                  <Ionicons name="color-wand" size={16} color="#fff" />
                </View>
                <View style={[s.floatChip, s.floatChipBR]} {...web({ msFloat: '1' })}>
                  <Ionicons name="checkmark-circle" size={15} color="#fff" />
                  <Ionicons name="logo-facebook" size={14} color="#fff" style={{ marginLeft: 7 }} />
                  <Ionicons
                    name="logo-instagram"
                    size={14}
                    color="#fff"
                    style={{ marginLeft: 5 }}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* ── Features (bento) ─────────────────────────────────────────────── */}
      {/* Channels strip */}
      <View style={s.channels}>
        <Text style={s.channelsLabel}>{t('landing.channels.label')}</Text>
        <View style={s.channelsRow}>
          <View style={s.channelChip}>
            <Ionicons name="logo-facebook" size={18} color="#1877F2" />
            <Text style={s.channelName}>Facebook</Text>
          </View>
          <View style={s.channelChip}>
            <Ionicons name="logo-instagram" size={18} color={P.isDark ? '#E1719C' : '#C13584'} />
            <Text style={s.channelName}>Instagram</Text>
          </View>
          <View style={s.channelSep} />
          <View style={s.channelChip}>
            <Ionicons name="sparkles" size={15} color={P.accent} />
            <Text style={s.channelName}>{t('landing.channels.poweredBy')}</Text>
          </View>
        </View>
      </View>

      {/* Features (bento) */}
      <View style={s.section}>
        <View style={s.intro}>
          <Text style={s.eyebrowLabel}>{t('landing.features.label')}</Text>
          <Text style={s.sectionTitle}>{t('landing.features.heading')}</Text>
        </View>
        <View style={[s.bentoRow, isNarrow && s.stackCol]}>
          {FEATURES.map((f) => (
            <View key={f.title} style={s.featCard} {...web({ msLift: '1' })}>
              <View style={[s.featIcon, { backgroundColor: f.tint.bg, borderColor: f.tint.ring }]}>
                <Ionicons name={f.icon} size={24} color={f.tint.icon} />
              </View>
              <Text style={s.featTitle}>{f.title}</Text>
              <Text style={s.featBody}>{f.body}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      {/* Stats */}
      <View style={s.statsSection}>
        <View style={s.statsInner}>
          {STATS.map((st, i) => (
            <Fragment key={st.label}>
              {i > 0 && !isNarrow && <View style={s.statDivider} />}
              <View style={s.statItem}>
                <Text style={s.statValue}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            </Fragment>
          ))}
        </View>
      </View>

      {/* How it works */}
      <View style={s.stepsSection}>
        <View style={s.intro}>
          <Text style={s.eyebrowLabel}>{t('landing.how.label')}</Text>
          <Text style={s.sectionTitle}>{t('landing.how.heading')}</Text>
        </View>
        <View style={[s.stepsRow, isNarrow && s.stackCol]}>
          {STEPS.map((step) => (
            <View key={step.num} style={s.stepCard} {...web({ msLift: '1' })}>
              <View style={s.stepTop}>
                <Text style={s.stepNum}>{step.num}</Text>
                <View style={s.stepIcon}>
                  <Ionicons name={step.icon} size={20} color={P.accent} />
                </View>
              </View>
              <Text style={s.stepTitle}>{step.title}</Text>
              <Text style={s.stepBody}>{step.body}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      {/* FAQ */}
      <View style={s.section}>
        <View style={s.intro}>
          <Text style={s.eyebrowLabel}>{t('landing.faq.label')}</Text>
          <Text style={s.sectionTitle}>{t('landing.faq.heading')}</Text>
        </View>
        <View style={s.faqList}>
          {FAQS.map((f, i) => {
            const open = openFaq === i;
            return (
              <Pressable
                key={f.q}
                onPress={() => setOpenFaq(open ? null : i)}
                {...web({ msTap: '1' })}
                style={s.faqItem}
              >
                <View style={s.faqQRow}>
                  <Text style={s.faqQ}>{f.q}</Text>
                  <View style={s.faqIcon}>
                    <Ionicons name={open ? 'remove' : 'add'} size={18} color={P.accent} />
                  </View>
                </View>
                {open && <Text style={s.faqA}>{f.a}</Text>}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Closing CTA */}
      <View style={s.ctaSection}>
        <View style={s.ctaPanel}>
          <View style={s.ctaBg} pointerEvents="none">
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id="ctaGlow" cx="0.5" cy="0" r="0.9">
                  <Stop offset="0" stopColor={P.sunInner} />
                  <Stop offset="0.6" stopColor={P.sunMid} />
                  <Stop offset="1" stopColor={P.sunOuter} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#ctaGlow)" />
            </Svg>
          </View>
          <Text style={s.ctaHeading}>{t('landing.footer.heading')}</Text>
          <Text style={s.ctaSub}>{t('landing.footer.subheading')}</Text>
          <View style={s.ctaBtns}>
            <PrimaryBtn label={t('landing.footer.ctaPrimary')} onPress={goRegister} />
          </View>
          <Pressable onPress={goLogin} {...web({ msTap: '1' })} style={s.ctaLink}>
            <Text style={s.ctaLinkText}>{t('landing.footer.ctaSecondary')}</Text>
          </Pressable>
        </View>

        {/* Footer bar */}
        <View style={[s.footerBar, isMobile && s.footerBarCol]}>
          <BrandLogo size="xs" variant="horizontal" />
          <Text style={s.copyright}>
            © {new Date().getFullYear()} {t('landing.footer.copyright')}
          </Text>
          <ThemeToggle subtle />
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(P: Palette, isNarrow: boolean, isMobile: boolean, hPad: number, vh: number) {
  const heroTitleSize = isMobile ? 40 : isNarrow ? 52 : 66;
  const sectionTitleSize = isMobile ? 30 : isNarrow ? 36 : 46;
  // Approx. height the floating nav occupies (its band). The hero is pulled up
  // by this amount so the sky gradient flows unbroken *behind* the nav instead
  // of starting below it; hero content is padded down by the same amount.
  const NAV_H = isMobile ? 76 : 80;
  // Atmospheric sky as a CSS gradient (web). The linear stack ends on heroBot,
  // which equals `canvas` (the next section's colour), so the hero fades into
  // the following section with no visible line. Sun glow is the radial layer.
  const heroSky =
    `radial-gradient(80% 55% at 62% 40%, ${P.sunInner} 20%, ${P.sunMid} 55%, ${P.sunOuter} 100%), ` +
    `linear-gradient(to bottom, ${P.heroTop} 0%, ${P.heroMid} 76%, ${P.heroBot} 86%, ${P.heroBot} 100%)`;

  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: P.scrollBg },
    // The page bg sits BEHIND the floating nav, so it matches the hero gradient's
    // top colour (no white band). Sections below the hero re-assert the canvas.
    scrollContent: { flexGrow: 1, backgroundColor: P.heroTop },

    // ── Nav ──────────────────────────────────────────────────────────────
    navWrap: {
      // @ts-ignore web-only
      position: 'sticky',
      top: 0,
      zIndex: 100,
      width: '100%',
      paddingHorizontal: hPad,
      paddingTop: isMobile ? 8 : 12,
      paddingBottom: 8,
    },
    nav: {
      maxWidth: MAXW,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingLeft: 18,
      paddingRight: 12,
      borderRadius: 20,
      backgroundColor: P.glassBg,
      borderWidth: 1,
      borderColor: P.glassBorder,
      // @ts-ignore web-only
      backdropFilter: 'blur(18px)',
      // @ts-ignore web-only
      boxShadow: P.shadowNav,
    },
    navRight: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? 4 : 8 },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      // @ts-ignore web-only
      outlineWidth: 0,
    },
    navSignIn: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      // @ts-ignore web-only
      outlineWidth: 0,
    },
    navSignInText: { fontFamily: SANS, fontSize: 14, fontWeight: '600', color: P.ink },
    navCta: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: P.btnPrimaryBg,
      // @ts-ignore web-only
      boxShadow: P.shadowBtn,
    },
    navCtaText: { fontFamily: SANS, fontSize: 14, fontWeight: '600', color: P.btnPrimaryText },

    // ── Hero ─────────────────────────────────────────────────────────────
    hero: {
      position: 'relative',
      paddingHorizontal: hPad,
      minHeight: vh,
      justifyContent: 'center',
      // Slide the hero up under the floating nav so its gradient + sun glow sit
      // continuously behind the nav (no flat band / seam). scrollContent bg ==
      // heroTop, so any sliver above the gradient stays seamless.
      marginTop: -NAV_H,
      // No overflow clip, and lifted above the next section, so the product
      // window's soft shadow bleeds naturally across the seam instead of being
      // cut into a hard line.
      zIndex: 1,
    },
    heroBg: {
      ...StyleSheet.absoluteFillObject,
      // Base colour == next section, so any sliver the gradient doesn't cover
      // still matches and never shows as a line.
      backgroundColor: P.canvas,
      // @ts-ignore web-only
      backgroundImage: heroSky,
    },
    heroContent: {
      maxWidth: 1140,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
      alignItems: 'center',
      paddingTop: (isMobile ? 22 : 30) + NAV_H,
      paddingBottom: isMobile ? 30 : 44,
    },
    eyebrow: {
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
      fontFamily: SANS,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1.2,
      color: P.accentText,
    },
    heroTitle: {
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: heroTitleSize,
      lineHeight: heroTitleSize * 1.04,
      color: P.ink,
      textAlign: 'center',
      letterSpacing: isMobile ? -0.5 : -1.4,
      marginBottom: 18,
      // @ts-ignore web-only: use the serif's display optical size at large sizes
      fontOpticalSizing: 'auto',
    },
    heroSub: {
      fontFamily: SANS,
      fontSize: isMobile ? 16 : 19,
      lineHeight: isMobile ? 25 : 30,
      color: P.body,
      textAlign: 'center',
      maxWidth: 600,
      marginBottom: 24,
    },
    heroCtas: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 14,
      marginBottom: 20,
    },
    trust: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    trustText: { fontFamily: SANS, fontSize: 13, color: P.muted },

    // ── Buttons ──────────────────────────────────────────────────────────
    btnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: P.btnPrimaryBg,
      paddingHorizontal: 26,
      paddingVertical: 15,
      borderRadius: 999,
      // @ts-ignore web-only
      boxShadow: P.shadowBtn,
    },
    btnPrimaryText: { fontFamily: SANS, fontSize: 15, fontWeight: '600', color: P.btnPrimaryText },
    btnGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 15,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: P.btnGhostBorder,
      backgroundColor: P.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)',
    },
    btnGhostText: { fontFamily: SANS, fontSize: 15, fontWeight: '600', color: P.ink },

    // ── Product window ───────────────────────────────────────────────────
    showcaseWrap: {
      width: '100%',
      maxWidth: 1120,
      marginTop: isMobile ? 26 : 40,
      marginBottom: 0,
      position: 'relative',
      // @ts-ignore web-only
      zIndex: 2,
    },
    window: {
      width: '100%',
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: P.card,
      borderWidth: 1,
      borderColor: P.hairline,
      // @ts-ignore web-only
      boxShadow: P.shadowWindow,
    },
    winBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: P.hairline,
      backgroundColor: P.isDark ? '#0E0E18' : '#FBFAFE',
    },
    winDot: { width: 11, height: 11, borderRadius: 6 },
    winAddr: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginLeft: 12,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: P.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(22,21,30,0.04)',
    },
    winAddrText: { fontFamily: SANS, fontSize: 12, fontWeight: '500', color: P.muted },

    // Video preview slot
    videoFrame: {
      width: '100%',
      aspectRatio: 16 / 9,
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: P.videoA,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playWrap: { alignItems: 'center', justifyContent: 'center' },
    playPulse: {
      position: 'absolute',
      width: 86,
      height: 86,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.45)',
    },
    playBtn: {
      width: 86,
      height: 86,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.6)',
      // @ts-ignore web-only
      backdropFilter: 'blur(8px)',
      // @ts-ignore web-only
      boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)',
    },
    vidScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 96,
      // @ts-ignore web-only
      backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0))',
    },
    vidControls: {
      position: 'absolute',
      left: 18,
      right: 18,
      bottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    vidTrack: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.30)',
      justifyContent: 'center',
    },
    vidProgress: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '32%',
      borderRadius: 999,
      backgroundColor: '#FFFFFF',
    },
    vidThumb: {
      position: 'absolute',
      left: '32%',
      width: 11,
      height: 11,
      borderRadius: 999,
      marginLeft: -5,
      backgroundColor: '#FFFFFF',
      // @ts-ignore web-only
      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
    },
    vidTime: { fontFamily: SANS, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.92)' },

    floatBadge: {
      position: 'absolute',
      // @ts-ignore web-only
      top: -22,
      left: -22,
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: P.accent,
      borderWidth: 3,
      borderColor: P.canvas,
      // @ts-ignore web-only
      boxShadow: P.badgeShadow,
    },
    floatBadgeTL: {},
    floatChip: {
      position: 'absolute',
      bottom: -18,
      right: -14,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: P.accent,
      borderWidth: 3,
      borderColor: P.canvas,
      // @ts-ignore web-only
      boxShadow: P.badgeShadow,
    },
    floatChipBR: {},

    // ── Section scaffolding ──────────────────────────────────────────────
    section: {
      backgroundColor: P.canvas,
      paddingHorizontal: hPad,
      paddingTop: isNarrow ? 64 : 92,
      paddingBottom: isNarrow ? 56 : 90,
    },
    intro: {
      maxWidth: 740,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
      alignItems: 'center',
      marginBottom: isNarrow ? 40 : 60,
    },
    eyebrowLabel: {
      fontFamily: SANS,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 2,
      color: P.accentText,
      marginBottom: 16,
    },
    sectionTitle: {
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: sectionTitleSize,
      lineHeight: sectionTitleSize * 1.08,
      color: P.ink,
      textAlign: 'center',
      letterSpacing: -0.8,
      // @ts-ignore web-only
      fontOpticalSizing: 'auto',
    },

    // ── Bento features ───────────────────────────────────────────────────
    bentoRow: {
      flexDirection: 'row',
      gap: 22,
      maxWidth: MAXW,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
    },
    stackCol: { flexDirection: 'column' },
    featCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: P.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: P.hairline,
      padding: isMobile ? 26 : 34,
      overflow: 'hidden',
      position: 'relative',
      // @ts-ignore web-only
      boxShadow: P.shadowCard,
    },
    featIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      marginBottom: 22,
    },
    featTitle: {
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: 24,
      color: P.ink,
      marginBottom: 12,
      letterSpacing: -0.3,
    },
    featBody: { fontFamily: SANS, fontSize: 15.5, lineHeight: 25, color: P.body },

    // ── Steps ────────────────────────────────────────────────────────────
    stepsSection: {
      backgroundColor: P.canvas,
      paddingHorizontal: hPad,
      paddingVertical: isNarrow ? 64 : 100,
    },
    stepsRow: {
      flexDirection: 'row',
      gap: 22,
      maxWidth: MAXW,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
    },
    stepCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: P.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: P.hairline,
      padding: isMobile ? 26 : 32,
      // @ts-ignore web-only
      boxShadow: P.shadowCard,
    },
    stepTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    stepNum: {
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: 44,
      color: P.accentText,
      opacity: P.isDark ? 0.9 : 0.85,
      letterSpacing: -1,
    },
    stepIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: P.accentSoft,
      borderWidth: 1,
      borderColor: P.isDark ? 'rgba(129,140,248,0.3)' : 'rgba(99,102,241,0.2)',
    },
    stepTitle: {
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: 22,
      color: P.ink,
      marginBottom: 10,
      letterSpacing: -0.3,
    },
    stepBody: { fontFamily: SANS, fontSize: 15.5, lineHeight: 24, color: P.body },

    // ── Closing CTA ──────────────────────────────────────────────────────
    ctaSection: {
      backgroundColor: P.canvas,
      paddingHorizontal: hPad,
      paddingTop: isNarrow ? 64 : 100,
      paddingBottom: 40,
    },
    ctaPanel: {
      maxWidth: MAXW,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
      alignItems: 'center',
      overflow: 'hidden',
      borderRadius: 32,
      borderWidth: 1,
      borderColor: P.hairline,
      backgroundColor: P.card,
      paddingHorizontal: hPad,
      paddingVertical: isNarrow ? 56 : 88,
      position: 'relative',
      // @ts-ignore web-only
      boxShadow: P.shadowCard,
    },
    ctaBg: {
      // @ts-ignore web-only
      ...StyleSheet.absoluteFillObject,
    },
    ctaHeading: {
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: isMobile ? 34 : isNarrow ? 44 : 56,
      lineHeight: (isMobile ? 34 : isNarrow ? 44 : 56) * 1.05,
      color: P.ink,
      textAlign: 'center',
      letterSpacing: -1,
      marginBottom: 18,
      // @ts-ignore web-only
      fontOpticalSizing: 'auto',
    },
    ctaSub: {
      fontFamily: SANS,
      fontSize: isMobile ? 16 : 18,
      lineHeight: 28,
      color: P.body,
      textAlign: 'center',
      maxWidth: 540,
      marginBottom: 32,
    },
    ctaBtns: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
    ctaLink: { marginTop: 18, paddingVertical: 6 },
    ctaLinkText: {
      fontFamily: SANS,
      fontSize: 14,
      fontWeight: '500',
      color: P.muted,
      textAlign: 'center',
      // @ts-ignore web-only
      textDecorationLine: 'underline',
    },

    // ── Channels strip ───────────────────────────────────────────────────
    channels: {
      backgroundColor: P.canvas,
      paddingHorizontal: hPad,
      paddingTop: isNarrow ? 44 : 60,
      paddingBottom: isNarrow ? 4 : 16,
      alignItems: 'center',
    },
    channelsLabel: {
      fontFamily: SANS,
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 2,
      color: P.muted,
      marginBottom: 18,
      textAlign: 'center',
    },
    channelsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
    },
    channelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: P.hairline,
      backgroundColor: P.card,
    },
    channelName: { fontFamily: SANS, fontSize: 14, fontWeight: '600', color: P.body },
    channelSep: { width: 1, height: 22, backgroundColor: P.hairline, marginHorizontal: 4 },

    // ── Stats ────────────────────────────────────────────────────────────
    statsSection: {
      backgroundColor: P.canvas,
      paddingHorizontal: hPad,
      paddingVertical: isNarrow ? 36 : 56,
    },
    statsInner: {
      maxWidth: MAXW,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
      flexDirection: isNarrow ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: P.card,
      borderWidth: 1,
      borderColor: P.hairline,
      borderRadius: 26,
      paddingVertical: isNarrow ? 30 : 42,
      paddingHorizontal: isNarrow ? 24 : 32,
      gap: isNarrow ? 26 : 12,
      // @ts-ignore web-only
      boxShadow: P.shadowCard,
    },
    statItem: { flex: 1, alignItems: 'center', minWidth: 0 },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: P.hairline, marginVertical: 4 },
    statValue: {
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: isMobile ? 38 : 48,
      color: P.ink,
      letterSpacing: -1,
      marginBottom: 8,
      textAlign: 'center',
      // @ts-ignore web-only
      fontOpticalSizing: 'auto',
    },
    statLabel: {
      fontFamily: SANS,
      fontSize: 14.5,
      lineHeight: 20,
      color: P.muted,
      textAlign: 'center',
      maxWidth: 200,
    },

    // ── FAQ ──────────────────────────────────────────────────────────────
    faqList: {
      maxWidth: 760,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
      gap: 12,
    },
    faqItem: {
      backgroundColor: P.card,
      borderWidth: 1,
      borderColor: P.hairline,
      borderRadius: 18,
      paddingHorizontal: isMobile ? 20 : 26,
      paddingVertical: isMobile ? 18 : 22,
      // @ts-ignore web-only
      boxShadow: P.shadowCard,
    },
    faqQRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    faqQ: {
      flex: 1,
      fontFamily: SERIF,
      fontWeight: '600',
      fontSize: isMobile ? 17 : 19,
      color: P.ink,
      letterSpacing: -0.2,
    },
    faqIcon: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: P.accentSoft,
    },
    faqA: { fontFamily: SANS, fontSize: 15.5, lineHeight: 25, color: P.body, marginTop: 14 },

    // ── Footer bar ───────────────────────────────────────────────────────
    footerBar: {
      maxWidth: MAXW,
      width: '100%',
      // @ts-ignore web-only
      marginHorizontal: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 36,
      marginTop: 28,
      borderTopWidth: 1,
      borderTopColor: P.hairline,
    },
    footerBarCol: { flexDirection: 'column', gap: 16, alignItems: 'center' },
    copyright: { fontFamily: SANS, fontSize: 13, color: P.muted },
  });
}
