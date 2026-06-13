import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

import { glassNavRail } from '@/components/ui/GlassNavbar';
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

const DESKTOP_BREAKPOINT = 768;

export default function VideoComingSoon() {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const railInset = glassNavRail(width, true).inset;

  const styles = useMemo(
    () => makeStyles(colors, isDesktop, railInset),
    [colors, isDesktop, railInset]
  );

  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(14)).current;
  const haloPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: D.duration.entrance,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: D.duration.entrance,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(haloPulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(haloPulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacity, translate, haloPulse]);

  const haloScale = haloPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const haloOpacity = haloPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.15] });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.navigate('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel={t('studio.back')}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.backButton,
            (pressed || hovered) && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text.secondary} />
          <Text style={styles.backText}>{t('studio.title')}</Text>
        </Pressable>
      </View>

      <View style={styles.centerOuter}>
        <Animated.View style={[styles.center, { opacity, transform: [{ translateY: translate }] }]}>
          <View style={styles.iconStack}>
            <Animated.View
              pointerEvents="none"
              style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
            />
            <View style={styles.iconTile}>
              <Ionicons name="film" size={40} color={colors.accent.primary} />
            </View>
          </View>

          <Text style={styles.title}>{t('studio.videoAdsTitle')}</Text>
          <Text style={styles.body}>{t('studio.video.comingSoonBody')}</Text>

          <View style={styles.pill}>
            <Ionicons name="time-outline" size={14} color={colors.accent.primary} />
            <Text style={styles.pillText}>{t('studio.comingSoon')}</Text>
          </View>

          <Text style={styles.hint}>{t('studio.video.comingSoonHint')}</Text>
        </Animated.View>
      </View>
    </ScrollView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDesktop: boolean,
  railInset: number
) {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingBottom: D.spacing['2xl'],
      paddingTop: isDesktop ? D.spacing.lg : D.spacing.md,
      alignItems: 'stretch',
    },
    topBar: {
      width: '100%',
      paddingHorizontal: railInset,
      paddingBottom: D.spacing.xl,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingRight: D.spacing.sm,
      ...(Platform.OS === 'web' ? ({ outlineWidth: 0, cursor: 'pointer' } as any) : {}),
    } as any,
    backText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    centerOuter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: D.spacing['2xl'],
      paddingHorizontal: D.spacing.lg,
    },
    center: {
      maxWidth: 520,
      width: '100%',
      alignItems: 'center',
    },
    iconStack: {
      width: 120,
      height: 120,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.xl,
    },
    halo: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.accent.dim,
    },
    iconTile: {
      width: 80,
      height: 80,
      borderRadius: D.radius.xl,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    body: {
      marginTop: D.spacing.md,
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    pill: {
      marginTop: D.spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary,
    },
    pillText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    hint: {
      marginTop: D.spacing.lg,
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
    },
  });
}
