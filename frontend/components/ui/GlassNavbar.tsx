import { useRouter } from 'expo-router';
import { ReactNode, useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BrandLogo, type BrandLogoSize } from '@/components/ui/BrandLogo';
import { AUTH_MAXW, AuthPalette, useAuthPalette, webAttrs } from '@/constants/authTheme';

/**
 * Shared glass pill navbar (web): the brand logo on the left, an optional
 * centered slot (e.g. nav tabs) and a right-side actions slot. Used by the
 * auth screens and the logged-in app shell so the whole app has one navbar
 * design, matching the landing page's floating glass nav.
 */
interface GlassNavbarProps {
  /** Pressing the logo navigates here ('/' by default) */
  onLogoPress?: () => void;
  logoSize?: BrandLogoSize;
  /** Rendered before the logo (e.g. a hamburger button) */
  leftExtra?: ReactNode;
  /** Centered content (e.g. desktop nav tabs) */
  center?: ReactNode;
  /** Right-side actions (theme toggle, CTA, avatar...) */
  right?: ReactNode;
  /** Overlay the page (auth/landing style) instead of sitting in the layout flow */
  floating?: boolean;
  /** Match the logged-in app's wide content rail (gallery/products grids) */
  wide?: boolean;
}

/** Pill geometry, shared with popovers that anchor to the navbar's edges. */
export function glassNavRail(width: number, wide: boolean) {
  const hPad = wide
    ? width < 600
      ? 16
      : width < 1100
        ? 32
        : 80
    : width < 560
      ? 20
      : width < 900
        ? 28
        : 40;
  const maxW = wide ? 1440 : AUTH_MAXW;
  const pillWidth = Math.min(width - hPad * 2, maxW);
  // Distance from the viewport edge to the pill's edge
  const inset = Math.max((width - pillWidth) / 2, hPad);
  return { hPad, maxW, inset };
}

export function GlassNavbar({
  onLogoPress,
  logoSize = 'sm',
  leftExtra,
  center,
  right,
  floating = false,
  wide = false,
}: GlassNavbarProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const isMobile = width < 560;
  const { hPad, maxW } = glassNavRail(width, wide);
  const P = useAuthPalette();
  const s = useMemo(() => makeStyles(P, isMobile, hPad, maxW), [P, isMobile, hPad, maxW]);

  return (
    <View style={[s.wrap, floating && s.wrapFloating]}>
      <View style={s.nav}>
        <View style={s.left}>
          {leftExtra}
          <Pressable
            onPress={onLogoPress ?? (() => router.push('/'))}
            {...webAttrs({ msTap: '1' })}
            style={({ pressed }) => [s.logoBtn, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel="MerchStory"
          >
            <BrandLogo size={logoSize} variant="horizontal" />
          </Pressable>
        </View>

        {center ? <View style={s.center}>{center}</View> : null}

        <View style={s.right}>{right}</View>
      </View>
    </View>
  );
}

function makeStyles(P: AuthPalette, isMobile: boolean, hPad: number, maxW: number) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      paddingHorizontal: hPad,
      paddingTop: isMobile ? 8 : 12,
      paddingBottom: 8,
      alignItems: 'center',
      zIndex: 100,
    },
    wrapFloating: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingBottom: 0,
    },
    nav: {
      maxWidth: maxW,
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
    left: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    logoBtn: { flexDirection: 'row', alignItems: 'center', outlineWidth: 0 },
    center: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    right: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? 4 : 8, flexShrink: 0 },
  });
}
