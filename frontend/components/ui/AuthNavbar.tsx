import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

const ACCENT = '#6366F1';

interface AuthNavbarProps {
  /** Label for the right-side CTA button */
  ctaLabel: string;
  /** Route to push when the CTA is pressed */
  ctaHref: '/(auth)/login' | '/(auth)/register' | '/';
}

export function AuthNavbar({ ctaLabel, ctaHref }: AuthNavbarProps) {
  const { colors, colorScheme, toggleTheme } = useTheme();
  const router = useRouter();
  const isDark = colorScheme === 'dark';
  const s = makeStyles(colors, isDark);

  return (
    <View style={s.outer}>
      <View style={s.inner}>
        {/* Logo — matches post-login header */}
        <Pressable
          style={({ pressed }) => [s.logoBtn, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/')}
          accessibilityRole="button"
          accessibilityLabel="MerchStory home"
        >
          <View style={s.logoMark}>
            <Ionicons name="color-wand" size={13} color="#fff" />
          </View>
          <Text style={s.logoWordmark}>
            <Text style={s.logoWordmarkBold}>Merch</Text>
            <Text style={s.logoWordmarkAccent}>Story</Text>
          </Text>
        </Pressable>

        <View style={s.right}>
          {/* Theme toggle */}
          <Pressable
            onPress={toggleTheme}
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            accessibilityRole="button"
          >
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={19}
              color={colors.text.secondary}
            />
          </Pressable>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(ctaHref)}
          >
            <Text style={s.ctaText}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    outer: {
      // @ts-ignore — web-only
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: isDark ? 'rgba(15,17,23,0.85)' : 'rgba(248,250,252,0.88)',
      // @ts-ignore
      backdropFilter: 'blur(12px)',
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    inner: {
      maxWidth: 1100,
      // @ts-ignore
      marginHorizontal: 'auto',
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: D.spacing.xl,
      paddingVertical: D.spacing.md,
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
    right: {
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
    ctaBtn: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm - 2,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      // @ts-ignore
      outlineWidth: 0,
    },
    ctaText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
  });
}
