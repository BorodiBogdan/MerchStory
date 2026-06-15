import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  Modal,
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
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useIdeas } from '@/hooks/useIdeas';
import { useT } from '@/i18n';
import { type IdeaItem, type IdeaTone, submitIdeaFeedback } from '@/utils/api';

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

// ─── "Ideas for you" — live data ──────────────────────────────────────────────
// Daily-rotating promo angles served by the backend recommendation pipeline
// (Phase 1 returns a Mock provider seed; Phase 3+ swaps in LM Studio + RAG).
//
// PromoIdea is the on-screen shape: it adds a localized source label and an
// Ionicons name resolved from the API's `tone` field. Mapping happens here so
// the backend stays presentation-agnostic.
type PromoIdea = {
  id: string;
  tone: IdeaTone;
  sourceLabel: string;
  sourceIcon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  meta: string;
  body: string;
  suggestedPost: string;
  type: 'announcement' | 'promotion';
  imagePrompt: string;
};

const TONE_ICON: Record<IdeaTone, React.ComponentProps<typeof Ionicons>['name']> = {
  weather: 'rainy-outline',
  holiday: 'gift-outline',
  news: 'newspaper-outline',
  trend: 'flame-outline',
};

function toneLabelKey(
  tone: IdeaTone
): 'ideas.toneWeather' | 'ideas.toneHoliday' | 'ideas.toneNews' | 'ideas.toneTrend' {
  switch (tone) {
    case 'weather':
      return 'ideas.toneWeather';
    case 'holiday':
      return 'ideas.toneHoliday';
    case 'news':
      return 'ideas.toneNews';
    case 'trend':
      return 'ideas.toneTrend';
  }
}

export default function StudioHub() {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const { isAdmin, canViewRecommendations } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  // Match the glass navbar's wide rail so the page edges line up with the pill
  const hPad = !isDesktop ? D.spacing.md : width < 1100 ? D.spacing.xl : 80;

  const styles = useMemo(() => makeStyles(colors, isDesktop, hPad), [colors, isDesktop, hPad]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
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

        {(isAdmin || canViewRecommendations) && (
          <IdeasForYouSection isDesktop={isDesktop} colors={colors} t={t} router={router} />
        )}
      </View>
    </ScrollView>
  );
}

// ─── Ideas for you (live) ─────────────────────────────────────────────────────
function IdeasForYouSection({
  isDesktop,
  colors,
  t,
  router,
}: {
  isDesktop: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  t: ReturnType<typeof useT>;
  router: ReturnType<typeof useRouter>;
}) {
  const styles = useMemo(() => makeIdeasStyles(colors, isDesktop), [colors, isDesktop]);
  const { isAdmin } = useAuth();
  const {
    ideas: rawIdeas,
    recommendationId,
    feedback,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useIdeas();

  // Thumb state lives here (not inside each card) so it survives card remounts
  // and is seeded from the server's persisted feedback. This is what keeps a
  // like/dislike from vanishing when the user switches tabs or logs back in.
  const [thumbs, setThumbs] = useState<Record<string, 'up' | 'down'>>({});

  useEffect(() => {
    const seeded: Record<string, 'up' | 'down'> = {};
    for (const [id, action] of Object.entries(feedback)) {
      seeded[id] = action === 'thumbs_up' ? 'up' : 'down';
    }
    setThumbs(seeded);
  }, [feedback]);

  const promoIdeas = useMemo<PromoIdea[]>(
    () =>
      rawIdeas.map((it: IdeaItem) => ({
        id: it.id,
        tone: it.tone,
        sourceLabel: t(toneLabelKey(it.tone)),
        sourceIcon: TONE_ICON[it.tone],
        title: it.title,
        meta: it.meta,
        body: it.body,
        suggestedPost: it.suggestedPost,
        type: it.type,
        imagePrompt: it.imagePrompt,
      })),
    [rawIdeas, t]
  );

  const refreshDisabled = isRefreshing || isLoading;

  function handleRefresh() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    void refresh();
  }

  const [selectedIdea, setSelectedIdea] = useState<PromoIdea | null>(null);

  function handleIdeaPress(idea: PromoIdea) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedIdea(idea);
  }

  function handleGenerateFromModal(idea: PromoIdea) {
    if (recommendationId) {
      void submitIdeaFeedback(recommendationId, idea.id, 'generated_from');
    }
    setSelectedIdea(null);
    router.push({
      pathname: '/(tabs)/studio/announcements',
      params: {
        brief: idea.imagePrompt || idea.suggestedPost,
        postType: idea.type === 'promotion' ? 'Promotion' : 'Announcement',
      },
    });
  }

  function handleThumb(idea: PromoIdea, action: 'thumbs_up' | 'thumbs_down') {
    if (!recommendationId) return;
    const direction = action === 'thumbs_up' ? 'up' : 'down';
    // Press-once: an already-active thumb is a no-op. The user changes their
    // vote only by pressing the opposite thumb (i.e. changing their mind).
    if (thumbs[idea.id] === direction) return;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setThumbs((prev) => ({ ...prev, [idea.id]: direction }));
    void submitIdeaFeedback(recommendationId, idea.id, action);
  }

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('ideas.sectionTitle')}</Text>
          <Text style={styles.subtitle}>{t('ideas.sectionSubtitle')}</Text>
        </View>
        {/* Force-refresh is admin-only — the backend endpoint requires the
            AdminOnly policy; regular users rely on the daily cache. */}
        {isAdmin && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ideas.refresh')}
            accessibilityState={{ busy: isRefreshing, disabled: refreshDisabled }}
            disabled={refreshDisabled}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.refreshButton,
              (pressed || hovered) && !refreshDisabled && { borderColor: colors.accent.primary },
              refreshDisabled && { opacity: 0.5 },
            ]}
            onPress={handleRefresh}
          >
            <Ionicons name="refresh" size={14} color={colors.text.secondary} />
            <Text style={styles.refreshText}>{t('ideas.refresh')}</Text>
          </Pressable>
        )}
      </View>

      {isLoading && <Text style={styles.statusText}>{t('ideas.loading')}</Text>}
      {error && !isLoading && <Text style={styles.errorText}>{error}</Text>}
      {!isLoading && !error && promoIdeas.length === 0 && (
        <Text style={styles.statusText}>{t('ideas.empty')}</Text>
      )}

      {promoIdeas.length > 0 && (
        <View style={styles.grid}>
          {promoIdeas.map((idea, index) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              index={index}
              isDesktop={isDesktop}
              colors={colors}
              t={t}
              thumbState={thumbs[idea.id] ?? null}
              onPress={() => handleIdeaPress(idea)}
              onThumb={(action) => handleThumb(idea, action)}
            />
          ))}
        </View>
      )}

      <IdeaDetailModal
        idea={selectedIdea}
        colors={colors}
        t={t}
        onClose={() => setSelectedIdea(null)}
        onGenerate={handleGenerateFromModal}
      />
    </View>
  );
}

// ─── Idea-detail modal ─────────────────────────────────────────────────────
// Pops up when a card is pressed. Shows full title / meta / body / suggestedPost
// untruncated, plus a Generate button that navigates to announcements.
function IdeaDetailModal({
  idea,
  colors,
  t,
  onClose,
  onGenerate,
}: {
  idea: PromoIdea | null;
  colors: ReturnType<typeof useTheme>['colors'];
  t: ReturnType<typeof useT>;
  onClose: () => void;
  onGenerate: (idea: PromoIdea) => void;
}) {
  const styles = useMemo(() => makeIdeaModalStyles(colors), [colors]);

  return (
    <Modal visible={idea !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
        {idea !== null && (
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.headerRow}>
              <View style={styles.sourcePill}>
                <Ionicons name={idea.sourceIcon} size={12} color={colors.text.muted} />
                <Text style={styles.sourceText}>{idea.sourceLabel}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={colors.text.secondary} />
              </Pressable>
            </View>

            <Text style={styles.meta}>{idea.meta}</Text>
            <Text style={styles.title}>{idea.title}</Text>
            <Text style={styles.body}>{idea.body}</Text>

            <View style={styles.suggestedBlock}>
              <View style={styles.suggestedRow}>
                <Ionicons name="sparkles" size={14} color={colors.accent.primary} />
                <Text style={styles.suggestedLabel}>{t('ideas.modalSuggestedLabel')}</Text>
              </View>
              <Text style={styles.suggestedText}>{idea.suggestedPost}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ideas.generate')}
              onPress={() => onGenerate(idea)}
              style={({ pressed }: { pressed: boolean }) => [
                styles.generateBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.generateText}>{t('ideas.generate')}</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </Pressable>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

function IdeaCard({
  idea,
  index,
  isDesktop,
  colors,
  t,
  thumbState,
  onPress,
  onThumb,
}: {
  idea: PromoIdea;
  index: number;
  isDesktop: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  t: ReturnType<typeof useT>;
  // Controlled thumb state, owned by IdeasForYouSection so it persists across
  // card remounts and is seeded from the server's saved feedback.
  thumbState?: null | 'up' | 'down';
  onPress?: () => void;
  onThumb?: (action: 'thumbs_up' | 'thumbs_down') => void;
}) {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  // The press-once / switch-only rule and the optimistic update live in the
  // parent's onThumb handler; the card just reports which thumb was tapped.
  function handleThumbPress(direction: 'up' | 'down', e: GestureResponderEvent) {
    e.stopPropagation();
    onThumb?.(direction === 'up' ? 'thumbs_up' : 'thumbs_down');
  }
  const styles = useMemo(
    () => makeIdeaCardStyles(colors, isDesktop, isDark),
    [colors, isDesktop, isDark]
  );

  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(14)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const hover = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);

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

  const cardLift = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  // Light mode: visible-but-soft outline; dark mode keeps its original border
  const borderColor = hover.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? colors.border.strong : colors.border.default, colors.border.focus],
  });

  const handleHoverIn = () => {
    if (Platform.OS !== 'web') return;
    setHovered(true);
    timingTo(hover, 1);
    springTo(lift, 1);
  };
  const handleHoverOut = () => {
    if (Platform.OS !== 'web') return;
    setHovered(false);
    timingTo(hover, 0);
    springTo(lift, 0);
  };

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        { opacity, transform: [{ translateY: translate }, { translateY: cardLift }, { scale }] },
      ]}
    >
      <Pressable
        onPressIn={() => springTo(scale, 0.98)}
        onPressOut={() => springTo(scale, 1)}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${idea.sourceLabel}: ${idea.title}`}
        style={styles.pressable}
      >
        <Animated.View style={[styles.card, { borderColor }, hovered && styles.cardHover]}>
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
            <View style={styles.footerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thumbs up"
                accessibilityState={{ selected: thumbState === 'up' }}
                hitSlop={6}
                onPress={(e) => handleThumbPress('up', e)}
                style={styles.thumbBtn}
              >
                <Ionicons
                  name={thumbState === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={14}
                  color={thumbState === 'up' ? colors.accent.primary : colors.text.muted}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thumbs down"
                accessibilityState={{ selected: thumbState === 'down' }}
                hitSlop={6}
                onPress={(e) => handleThumbPress('down', e)}
                style={styles.thumbBtn}
              >
                <Ionicons
                  name={thumbState === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                  size={14}
                  color={thumbState === 'down' ? colors.text.error : colors.text.muted}
                />
              </Pressable>
              <View style={styles.generateBtn}>
                <Text style={styles.generateText}>{t('ideas.generate')}</Text>
                <Ionicons name="arrow-forward" size={12} color={colors.accent.primary} />
              </View>
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
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const styles = useMemo(
    () => makeCardStyles(colors, isDesktop, isDark),
    [colors, isDesktop, isDark]
  );

  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);

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
    setHovered(true);
    timingTo(glow, 1);
    springTo(lift, 1);
  };
  const handleHoverOut = () => {
    if (Platform.OS !== 'web' || card.comingSoon) return;
    setHovered(false);
    timingTo(glow, 0);
    springTo(lift, 0);
  };

  const iconTranslateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  const cardLift = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  // Light mode: visible-but-soft outline; dark mode keeps its original border
  const borderActive = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? colors.border.strong : colors.border.default, colors.border.focus],
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
          transform: [{ translateY: translate }, { translateY: cardLift }, { scale }],
        },
      ]}
    >
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
        <Animated.View
          style={[styles.card, { borderColor: borderActive }, hovered && styles.cardHover]}
        >
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
    statusText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      paddingVertical: D.spacing.md,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.error,
      paddingVertical: D.spacing.md,
    },
  });
}

function makeIdeaCardStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDesktop: boolean,
  isDark: boolean
) {
  return StyleSheet.create({
    cardWrap: {
      position: 'relative',
      width: isDesktop ? ('calc(50% - 8px)' as any) : '100%',
      ...(isDesktop ? {} : {}),
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
            // Soft resting shadow lifts white cards off the light canvas;
            // dark mode keeps its original flat look.
            ...(isDark
              ? {}
              : { boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 20px 44px -30px rgba(0,0,0,0.20)' }),
            transitionProperty: 'border-color, background-color, box-shadow',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDuration: '220ms',
          } as any)
        : {}),
    } as any,
    cardHover: {
      ...(Platform.OS === 'web'
        ? ({
            backgroundColor: colors.bg.elevated,
            boxShadow: isDark
              ? '0 18px 40px -12px rgba(0,0,0,0.45)'
              : '0 1px 2px rgba(0,0,0,0.05), 0 28px 56px -28px rgba(0,0,0,0.32)',
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
    footerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    thumbBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: D.radius.pill,
    },
  });
}

function makeIdeaModalStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: D.spacing.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: 480,
      backgroundColor: colors.bg.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.xl,
      gap: D.spacing.md,
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 32px 64px -28px rgba(0,0,0,0.40)',
          } as object)
        : {}),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sourcePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    sourceText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: D.radius.pill,
    },
    meta: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    title: {
      fontSize: D.fontSize.xl,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.4,
      lineHeight: 28,
    },
    body: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      lineHeight: 22,
    },
    suggestedBlock: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.md,
      gap: 6,
    },
    suggestedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    suggestedLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    suggestedText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
      lineHeight: 22,
    },
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: '0 12px 28px -12px rgba(99,102,241,0.5)' } as object)
        : D.shadow.glow),
    },
    generateText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
  });
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDesktop: boolean,
  hPad: number
) {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: hPad,
      paddingVertical: isDesktop ? D.spacing.xl : D.spacing.lg,
    },
    container: {
      width: '100%',
      maxWidth: 1440,
      position: 'relative',
    },
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
  isDark: boolean
) {
  return StyleSheet.create({
    cardWrap: {
      flex: isDesktop ? 1 : undefined,
      width: isDesktop ? undefined : '100%',
      minWidth: isDesktop ? 240 : undefined,
      position: 'relative',
    },
    pressable: {
      borderRadius: D.radius.xl,
      ...(Platform.OS === 'web'
        ? ({
            outlineWidth: 0,
            cursor: 'pointer',
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
            // Soft resting shadow lifts white cards off the light canvas;
            // dark mode keeps its original flat look.
            ...(isDark
              ? {}
              : { boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 20px 44px -30px rgba(0,0,0,0.20)' }),
            transitionProperty: 'border-color, background-color, box-shadow',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDuration: '220ms',
          } as any)
        : {}),
    } as any,
    cardHover: {
      ...(Platform.OS === 'web'
        ? ({
            backgroundColor: colors.bg.elevated,
            boxShadow: isDark
              ? '0 18px 40px -12px rgba(0,0,0,0.45)'
              : '0 1px 2px rgba(0,0,0,0.05), 0 28px 56px -28px rgba(0,0,0,0.32)',
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
