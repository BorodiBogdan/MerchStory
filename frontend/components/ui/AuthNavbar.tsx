import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { GlassNavbar } from '@/components/ui/GlassNavbar';
import { AUTH_SANS, AuthPalette, useAuthPalette, webAttrs } from '@/constants/authTheme';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

interface AuthNavbarProps {
  /** Label for the right-side CTA button */
  ctaLabel: string;
  /** Route to push when the CTA is pressed */
  ctaHref: '/(auth)/login' | '/(auth)/register' | '/';
}

/**
 * Auth flavor of the shared GlassNavbar: floating overlay with a theme toggle
 * and an indigo CTA pill (sign in / create account).
 */
export function AuthNavbar({ ctaLabel, ctaHref }: AuthNavbarProps) {
  const { colorScheme, toggleTheme } = useTheme();
  const router = useRouter();
  const t = useT();

  const isDark = colorScheme === 'dark';
  const P = useAuthPalette();
  const s = useMemo(() => makeStyles(P), [P]);

  return (
    <GlassNavbar
      floating
      onLogoPress={() => router.push('/')}
      right={
        <>
          {/* Theme toggle */}
          <Pressable
            onPress={toggleTheme}
            {...webAttrs({ msTap: '1' })}
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={isDark ? t('common.lightMode') : t('common.darkMode')}
          >
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={P.body} />
          </Pressable>

          {/* CTA */}
          <Pressable
            onPress={() => router.push(ctaHref)}
            {...webAttrs({ msBtn: '1' })}
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text style={s.ctaText}>{ctaLabel}</Text>
          </Pressable>
        </>
      }
    />
  );
}

function makeStyles(P: AuthPalette) {
  return StyleSheet.create({
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      outlineWidth: 0,
    },
    cta: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: P.btnPrimaryBg,
      outlineWidth: 0,
      // @ts-ignore web-only
      boxShadow: P.shadowBtn,
    },
    ctaText: {
      fontFamily: AUTH_SANS,
      fontSize: 14,
      fontWeight: '600',
      color: P.btnPrimaryText,
    },
  });
}
