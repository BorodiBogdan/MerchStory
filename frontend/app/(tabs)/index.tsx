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
      </View>
    </ScrollView>
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
      flex: isDesktop ? 1 : 0,
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
