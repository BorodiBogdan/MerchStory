import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { StudioPageHero } from '@/components/ui/studio/StudioPageHero';
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

const DESKTOP_BREAKPOINT = 768;
const CARD_STAGGER_MS = 90;

type HubCard = {
  key: 'catalog' | 'announcements' | 'video';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconFilled: React.ComponentProps<typeof Ionicons>['name'];
  labelKey: 'studio.navCatalog' | 'studio.navAnnouncements' | 'studio.navVideo';
  descKey: 'studio.toolsCatalogDesc' | 'studio.toolsAnnouncementsDesc' | 'studio.toolsVideoDesc';
  href: Href;
  comingSoon?: boolean;
};

const HUB_CARDS: HubCard[] = [
  {
    key: 'catalog',
    icon: 'grid-outline',
    iconFilled: 'grid',
    labelKey: 'studio.navCatalog',
    descKey: 'studio.toolsCatalogDesc',
    href: '/(tabs)/studio/catalog',
  },
  {
    key: 'announcements',
    icon: 'megaphone-outline',
    iconFilled: 'megaphone',
    labelKey: 'studio.navAnnouncements',
    descKey: 'studio.toolsAnnouncementsDesc',
    href: '/(tabs)/studio/announcements',
  },
  {
    key: 'video',
    icon: 'film-outline',
    iconFilled: 'film',
    labelKey: 'studio.navVideo',
    descKey: 'studio.toolsVideoDesc',
    href: '/(tabs)/studio/video',
    comingSoon: true,
  },
];

// ─── MOCK: "Ideas for you" ─────────────────────────────────────────────────────
// Future feature: surface promo suggestions based on weather, news, holidays,
// and seasonal trends. For now this is a static visual mock — no live data.
type IdeaTone = 'weather' | 'holiday' | 'news' | 'trend';

type PromoIdea = {
  id: string;
  tone: IdeaTone;
  sourceLabel: string;
  sourceIcon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  meta: string;
  body: string;
  suggestedPost: string;
};

const PROMO_IDEAS: PromoIdea[] = [
  {
    id: 'rain',
    tone: 'weather',
    sourceLabel: 'Weather',
    sourceIcon: 'rainy-outline',
    title: 'Cold rain rolling in this weekend',
    meta: 'Sat–Sun · 8°C · 85% rain',
    body: 'Warm drinks, comfort food, and cozy apparel move fastest on rainy weekends. Push a "stay-in" promo.',
    suggestedPost: 'Hot drinks · 15% off',
  },
  {
    id: 'mothers-day',
    tone: 'holiday',
    sourceLabel: 'Holiday',
    sourceIcon: 'gift-outline',
    title: "Mother's Day is in 4 days",
    meta: 'May 11 · national holiday',
    body: 'Curate a gift bundle — beauty, handmade goods and flowers historically outsell everything else this week.',
    suggestedPost: "Mother's Day gift guide",
  },
  {
    id: 'marathon',
    tone: 'news',
    sourceLabel: 'Local news',
    sourceIcon: 'newspaper-outline',
    title: 'Downtown half-marathon on Saturday',
    meta: 'Runs past your street · ~4k runners',
    body: 'Thousands will walk past your shop. Run a hydration promo or a finisher-reward bundle on race day.',
    suggestedPost: 'Marathon weekend special',
  },
  {
    id: 'spring-clean',
    tone: 'trend',
    sourceLabel: 'Trending',
    sourceIcon: 'flame-outline',
    title: 'Spring-cleaning searches peaking',
    meta: 'Google Trends · +62% this week',
    body: 'Home organizers, cleaning kits and storage solutions are seeing their biggest national lift of the year.',
    suggestedPost: 'Spring refresh bundle',
  },
];

// Per-tone label kept for the source pill copy; color comes from the theme.

export default function StudioHub() {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const styles = useMemo(() => makeStyles(colors, isDesktop), [colors, isDesktop]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        <View style={styles.ambientGlow} pointerEvents="none" />
        <View style={styles.ambientGlow2} pointerEvents="none" />

        <StudioPageHero title={t('studio.title')} subtitle={t('studio.subtitle')} />

        <View style={styles.cardsRow}>
          {HUB_CARDS.map((card, index) => (
            <HubOptionCard
              key={card.key}
              card={card}
              index={index}
              isDesktop={isDesktop}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                router.push(card.href);
              }}
              t={t}
              colors={colors}
            />
          ))}
        </View>

        <IdeasForYouSection isDesktop={isDesktop} colors={colors} />
      </View>
    </ScrollView>
  );
}

// ─── Ideas for you (mocked) ───────────────────────────────────────────────────
function IdeasForYouSection({
  isDesktop,
  colors,
}: {
  isDesktop: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const styles = useMemo(() => makeIdeasStyles(colors, isDesktop), [colors, isDesktop]);

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.eyebrow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>Ideas for you</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={styles.title}>Promo angles worth posting today</Text>
          <Text style={styles.subtitle}>
            AI-picked from weather, local news, holidays and trending searches — updated every
            morning.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh ideas"
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.refreshButton,
            (pressed || hovered) && { borderColor: colors.accent.primary },
          ]}
          onPress={() => {}}
        >
          <Ionicons name="refresh" size={14} color={colors.text.secondary} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {PROMO_IDEAS.map((idea, index) => (
          <IdeaCard key={idea.id} idea={idea} index={index} isDesktop={isDesktop} colors={colors} />
        ))}
      </View>
    </View>
  );
}

function IdeaCard({
  idea,
  index,
  isDesktop,
  colors,
}: {
  idea: PromoIdea;
  index: number;
  isDesktop: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const styles = useMemo(() => makeIdeaCardStyles(colors, isDesktop), [colors, isDesktop]);

  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(14)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const hover = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: D.duration.entrance,
        delay: 270 + index * 70,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: D.duration.entrance,
        delay: 270 + index * 70,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translate, index]);

  const springTo = (v: Animated.Value, to: number) =>
    Animated.spring(v, { toValue: to, friction: 6, tension: 180, useNativeDriver: true }).start();
  const timingTo = (v: Animated.Value, to: number) =>
    Animated.timing(v, {
      toValue: to,
      duration: D.duration.normal,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

  const haloOpacity = hover.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] });
  const borderColor = hover.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border.subtle, colors.accent.primary],
  });

  return (
    <Animated.View
      style={[styles.cardWrap, { opacity, transform: [{ translateY: translate }, { scale }] }]}
    >
      <Animated.View pointerEvents="none" style={[styles.halo, { opacity: haloOpacity }]} />
      <Pressable
        onPressIn={() => springTo(scale, 0.98)}
        onPressOut={() => springTo(scale, 1)}
        onHoverIn={() => Platform.OS === 'web' && timingTo(hover, 1)}
        onHoverOut={() => Platform.OS === 'web' && timingTo(hover, 0)}
        onPress={() => {}}
        accessibilityRole="button"
        accessibilityLabel={`${idea.sourceLabel}: ${idea.title}`}
        style={styles.pressable}
      >
        <Animated.View style={[styles.card, { borderColor }]}>
          <View style={styles.sourceRow}>
            <View style={styles.sourcePill}>
              <Ionicons name={idea.sourceIcon} size={12} color={colors.text.muted} />
              <Text style={styles.sourceText}>{idea.sourceLabel}</Text>
            </View>
            <Text style={styles.meta}>{idea.meta}</Text>
          </View>

          <Text style={styles.cardTitle}>{idea.title}</Text>
          <Text style={styles.cardBody} numberOfLines={3}>
            {idea.body}
          </Text>

          <View style={styles.footer}>
            <View style={styles.suggested}>
              <Ionicons name="sparkles" size={12} color={colors.accent.primary} />
              <Text style={styles.suggestedText} numberOfLines={1}>
                {idea.suggestedPost}
              </Text>
            </View>
            <View style={styles.generateBtn}>
              <Text style={styles.generateText}>Generate</Text>
              <Ionicons name="arrow-forward" size={12} color={colors.accent.primary} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

type HubOptionCardProps = {
  card: HubCard;
  index: number;
  isDesktop: boolean;
  onPress: () => void;
  t: ReturnType<typeof useT>;
  colors: ReturnType<typeof useTheme>['colors'];
};

function HubOptionCard({ card, index, isDesktop, onPress, t, colors }: HubOptionCardProps) {
  const styles = useMemo(
    () => makeCardStyles(colors, isDesktop, !!card.comingSoon),
    [colors, isDesktop, card.comingSoon]
  );

  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const iconLift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: D.duration.entrance,
        delay: index * CARD_STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: D.duration.entrance,
        delay: index * CARD_STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translate, index]);

  const springTo = (value: Animated.Value, toValue: number) =>
    Animated.spring(value, {
      toValue,
      friction: 6,
      tension: 180,
      useNativeDriver: true,
    }).start();

  const timingTo = (value: Animated.Value, toValue: number) =>
    Animated.timing(value, {
      toValue,
      duration: D.duration.normal,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

  const handlePressIn = () => {
    springTo(scale, card.comingSoon ? 0.985 : 0.97);
  };
  const handlePressOut = () => {
    springTo(scale, 1);
  };
  const handleHoverIn = () => {
    if (Platform.OS !== 'web' || card.comingSoon) return;
    timingTo(glow, 1);
    springTo(iconLift, 1);
  };
  const handleHoverOut = () => {
    if (Platform.OS !== 'web' || card.comingSoon) return;
    timingTo(glow, 0);
    springTo(iconLift, 0);
  };

  const iconTranslateY = iconLift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const borderActive = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border.subtle, colors.border.focus],
  });

  const a11yLabel = `${t(card.labelKey)}. ${t(card.descKey)}${
    card.comingSoon ? `, ${t('studio.comingSoon')}` : ''
  }`;

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        {
          opacity,
          transform: [{ translateY: translate }, { scale }],
        },
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.glowHalo, { opacity: glowOpacity }]} />
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('studio.hub.cardCtaOpen')}
        style={styles.pressable}
      >
        <Animated.View style={[styles.card, { borderColor: borderActive }]}>
          {card.comingSoon && (
            <View style={styles.comingSoonPill}>
              <Ionicons name="time-outline" size={11} color={colors.accent.primary} />
              <Text style={styles.comingSoonText}>{t('studio.comingSoon')}</Text>
            </View>
          )}

          <Animated.View style={[styles.iconTile, { transform: [{ translateY: iconTranslateY }] }]}>
            <Ionicons name={card.iconFilled} size={26} color={colors.accent.primary} />
          </Animated.View>

          <View style={styles.bodyBlock}>
            <Text style={styles.title}>{t(card.labelKey)}</Text>
            <Text style={styles.desc}>{t(card.descKey)}</Text>
          </View>

          {!card.comingSoon && (
            <View style={styles.footerRow}>
              <Text style={styles.ctaText}>{t('studio.hub.cardCtaOpen')}</Text>
              <View style={styles.ctaArrow}>
                <Ionicons name="arrow-forward" size={14} color={colors.accent.primary} />
              </View>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function makeIdeasStyles(colors: ReturnType<typeof useTheme>['colors'], isDesktop: boolean) {
  return StyleSheet.create({
    sectionWrap: {
      marginTop: isDesktop ? D.spacing['2xl'] : D.spacing.xl,
      paddingTop: isDesktop ? D.spacing.xl : D.spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    header: {
      flexDirection: isDesktop ? 'row' : 'column',
      alignItems: isDesktop ? 'flex-end' : 'flex-start',
      justifyContent: 'space-between',
      gap: D.spacing.md,
      marginBottom: D.spacing.lg,
    },
    headerText: {
      flex: 1,
      maxWidth: 640,
    },
    eyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: D.spacing.sm,
    },
    eyebrowDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent.primary,
    },
    eyebrowText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginLeft: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(74,222,128,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(74,222,128,0.45)',
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#4ADE80',
    },
    liveText: {
      fontSize: 9,
      fontWeight: D.fontWeight.bold,
      color: '#4ADE80',
      letterSpacing: 1,
    },
    title: {
      fontSize: isDesktop ? D.fontSize.xl : D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.4,
      lineHeight: isDesktop ? 28 : 24,
    },
    subtitle: {
      marginTop: 4,
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    refreshButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 8,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
      ...(Platform.OS === 'web'
        ? ({ outlineWidth: 0, cursor: 'pointer', transitionDuration: '180ms' } as any)
        : {}),
    } as any,
    refreshText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: isDesktop ? D.spacing.md : D.spacing.sm,
    },
  });
}

function makeIdeaCardStyles(colors: ReturnType<typeof useTheme>['colors'], isDesktop: boolean) {
  return StyleSheet.create({
    cardWrap: {
      position: 'relative',
      width: isDesktop ? ('calc(50% - 8px)' as any) : '100%',
      ...(isDesktop ? {} : {}),
    } as any,
    halo: {
      position: 'absolute',
      inset: 0,
      borderRadius: D.radius.xl,
      backgroundColor: colors.accent.primary,
      opacity: 0,
      ...(Platform.OS === 'web'
        ? ({ filter: 'blur(24px)', transform: [{ scale: 0.97 }] } as any)
        : {}),
    } as any,
    pressable: {
      borderRadius: D.radius.xl,
      ...(Platform.OS === 'web'
        ? ({ outlineWidth: 0, cursor: 'pointer', transitionDuration: '200ms' } as any)
        : {}),
    } as any,
    card: {
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: D.radius.xl,
      padding: isDesktop ? D.spacing.lg : D.spacing.md,
      minHeight: isDesktop ? 200 : undefined,
      gap: D.spacing.sm,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({
            transitionProperty: 'border-color, background-color',
            transitionDuration: '220ms',
          } as any)
        : {}),
    } as any,
    sourceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    sourcePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    sourceText: {
      fontSize: 10,
      fontWeight: D.fontWeight.bold,
      color: colors.text.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    meta: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      flexShrink: 1,
      textAlign: 'right',
    },
    cardTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
      lineHeight: 22,
      marginTop: 4,
    },
    cardBody: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 19,
      flex: 1,
    },
    footer: {
      marginTop: D.spacing.sm,
      paddingTop: D.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: D.spacing.sm,
    },
    suggested: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    suggestedText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary,
    },
    generateText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.4,
    },
  });
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], isDesktop: boolean) {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: isDesktop ? D.spacing.xl : D.spacing.md,
      paddingVertical: isDesktop ? D.spacing['2xl'] : D.spacing.lg,
    },
    container: {
      width: '100%',
      maxWidth: 1120,
      position: 'relative',
    },
    ambientGlow: {
      position: 'absolute',
      top: -120,
      left: -120,
      width: 360,
      height: 360,
      borderRadius: 360,
      backgroundColor: colors.accent.dim,
      opacity: 0.55,
      ...(Platform.OS === 'web' ? ({ filter: 'blur(72px)' } as any) : {}),
    } as any,
    ambientGlow2: {
      position: 'absolute',
      bottom: -140,
      right: -100,
      width: 320,
      height: 320,
      borderRadius: 320,
      backgroundColor: colors.accent.dim,
      opacity: 0.35,
      ...(Platform.OS === 'web' ? ({ filter: 'blur(80px)' } as any) : {}),
    } as any,
    cardsRow: {
      marginTop: D.spacing.lg,
      flexDirection: isDesktop ? 'row' : 'column',
      gap: isDesktop ? D.spacing.lg : D.spacing.md,
      alignItems: 'stretch',
    },
  });
}

function makeCardStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDesktop: boolean,
  comingSoon: boolean
) {
  return StyleSheet.create({
    cardWrap: {
      flex: isDesktop ? 1 : undefined,
      width: isDesktop ? undefined : '100%',
      minWidth: isDesktop ? 240 : undefined,
      position: 'relative',
    },
    glowHalo: {
      position: 'absolute',
      inset: 0,
      borderRadius: D.radius.xl,
      backgroundColor: colors.accent.primary,
      opacity: 0,
      ...(Platform.OS === 'web'
        ? ({ filter: 'blur(28px)', transform: [{ scale: 0.98 }] } as any)
        : { ...D.shadow.glow }),
    } as any,
    pressable: {
      borderRadius: D.radius.xl,
      ...(Platform.OS === 'web'
        ? ({
            outlineWidth: 0,
            cursor: comingSoon ? 'pointer' : 'pointer',
            transitionDuration: '200ms',
          } as any)
        : {}),
    } as any,
    card: {
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: D.radius.xl,
      padding: isDesktop ? D.spacing.xl : D.spacing.lg,
      minHeight: isDesktop ? 260 : 128,
      flexDirection: isDesktop ? 'column' : 'row',
      alignItems: isDesktop ? 'flex-start' : 'center',
      gap: isDesktop ? D.spacing.md : D.spacing.md,
      overflow: 'hidden',
      position: 'relative',
      ...(Platform.OS === 'web'
        ? ({
            transitionProperty: 'border-color, background-color, box-shadow',
            transitionDuration: '220ms',
          } as any)
        : {}),
    } as any,
    iconTile: {
      width: isDesktop ? 56 : 48,
      height: isDesktop ? 56 : 48,
      borderRadius: D.radius.lg,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? ({ transitionDuration: '220ms' } as any) : {}),
    } as any,
    bodyBlock: {
      flex: isDesktop ? 0 : 1,
      marginTop: isDesktop ? D.spacing.md : 0,
    },
    title: {
      fontSize: isDesktop ? D.fontSize.xl : D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
      lineHeight: isDesktop ? 28 : 22,
    },
    desc: {
      marginTop: 4,
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 19,
      maxWidth: isDesktop ? 220 : undefined,
    },
    footerRow: {
      marginTop: isDesktop ? 'auto' : 0,
      paddingTop: isDesktop ? D.spacing.lg : 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    ctaText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
      letterSpacing: 0.2,
    },
    ctaArrow: {
      width: 22,
      height: 22,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    comingSoonPill: {
      position: 'absolute',
      top: D.spacing.md,
      right: D.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary,
    },
    comingSoonText: {
      fontSize: 10,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
  });
}
