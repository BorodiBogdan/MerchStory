import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { AUTH_MAXW, AUTH_SANS, AuthPalette, useAuthPalette, webAttrs } from '@/constants/authTheme';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

interface AuthNavbarProps {
  /** Label for the right-side CTA button */
  ctaLabel: string;
  /** Route to push when the CTA is pressed */
  ctaHref: '/(auth)/login' | '/(auth)/register' | '/';
}

/**
 * Floating glass pill navbar for the auth screens (web), matching the landing
 * page's nav: glass surface, hairline border, theme toggle and an indigo CTA.
 */
export function AuthNavbar({ ctaLabel, ctaHref }: AuthNavbarProps) {
  const { colorScheme, toggleTheme } = useTheme();
  const router = useRouter();
  const t = useT();
  const { width } = useWindowDimensions();

  const isDark = colorScheme === 'dark';
  const isMobile = width < 560;
  const hPad = isMobile ? 20 : width < 900 ? 28 : 40;
  const P = useAuthPalette();
  const s = useMemo(() => makeStyles(P, isMobile, hPad), [P, isMobile, hPad]);

  return (
    <View style={s.navWrap}>
      <View style={s.nav}>
        {/* Logo, back to the landing page */}
        <Pressable
          onPress={() => router.push('/')}
          {...webAttrs({ msTap: '1' })}
          style={({ pressed }) => [s.navLogo, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="MerchStory"
        >
          <BrandLogo size="sm" variant="horizontal" />
        </Pressable>

        <View style={s.navRight}>
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
            style={({ pressed }) => [s.navCta, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text style={s.navCtaText}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(P: AuthPalette, isMobile: boolean, hPad: number) {
  return StyleSheet.create({
    navWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      paddingHorizontal: hPad,
      paddingTop: isMobile ? 8 : 12,
      alignItems: 'center',
    },
    nav: {
      maxWidth: AUTH_MAXW,
      width: '100%',
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
    navLogo: { flexDirection: 'row', alignItems: 'center', outlineWidth: 0 },
    navRight: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? 4 : 8 },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      outlineWidth: 0,
    },
    navCta: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: P.btnPrimaryBg,
      outlineWidth: 0,
      // @ts-ignore web-only
      boxShadow: P.shadowBtn,
    },
    navCtaText: {
      fontFamily: AUTH_SANS,
      fontSize: 14,
      fontWeight: '600',
      color: P.btnPrimaryText,
    },
  });
}
