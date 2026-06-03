import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/context/theme';

export type BrandLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type BrandLogoVariant = 'mark' | 'horizontal' | 'stacked';

type SizeSpec = {
  mark: number;
  radius: number;
  sparkle: number;
  wordmark: number;
  gap: number;
  sparkleOffset: number;
  tagline: number;
};

const SIZES: Record<BrandLogoSize, SizeSpec> = {
  xs: { mark: 22, radius: 7, sparkle: 5, wordmark: 13, gap: 7, sparkleOffset: 2.5, tagline: 8 },
  sm: { mark: 32, radius: 10, sparkle: 7, wordmark: 17, gap: 10, sparkleOffset: 3, tagline: 10 },
  md: { mark: 44, radius: 13, sparkle: 9, wordmark: 22, gap: 12, sparkleOffset: 4, tagline: 11 },
  lg: { mark: 60, radius: 17, sparkle: 12, wordmark: 28, gap: 14, sparkleOffset: 5, tagline: 12 },
  xl: { mark: 84, radius: 22, sparkle: 16, wordmark: 36, gap: 18, sparkleOffset: 7, tagline: 13 },
};

interface BrandLogoProps {
  size?: BrandLogoSize;
  variant?: BrandLogoVariant;
  /** Show a single restrained spark accent on the mark (default: false) */
  sparkle?: boolean;
  /** Tagline shown only on the stacked variant */
  tagline?: string;
  /** Override theme colors when logo sits on a colored surface */
  monochrome?: 'light' | 'dark' | false;
  /** Optional wrapper style (e.g. margin) */
  style?: ViewStyle;
}

/**
 * MerchStory brand logo. A rounded-square ("squircle") mark carrying a custom
 * monoline geometric "M" letterform — drawn as a precise SVG stroke path rather
 * than a font glyph, so the proportions read as a designed mark, not type. The
 * tile uses a real diagonal gradient plus a soft top-down sheen for an Apple/
 * Google-style finish, with an optional, restrained single spark (AI cue). The
 * wordmark is split between text.primary and accent.primary colors.
 *
 * Renders identically on web and native.
 */
export function BrandLogo({
  size = 'md',
  variant = 'horizontal',
  sparkle = false,
  tagline,
  monochrome = false,
  style,
}: BrandLogoProps) {
  const { colors } = useTheme();
  const s = SIZES[size];

  // Wordmark face: use the loaded Montserrat-Bold on native (the TTF is already
  // bold, so no fontWeight) and a Montserrat-led stack on web. Keeps the
  // wordmark on-brand and geometric instead of falling back to the system font.
  const wordmarkType =
    Platform.OS === 'web'
      ? ({
          fontWeight: '700',
          fontFamily:
            "'Montserrat','Inter Tight','Inter','SF Pro Display','Segoe UI',system-ui,sans-serif",
        } as object)
      : { fontFamily: 'Montserrat-Bold' as const };

  const primary = monochrome === 'light' ? '#FFFFFF' : colors.accent.primary;
  const secondary = monochrome === 'light' ? '#FFFFFF' : colors.accent.secondary;
  const merchColor =
    monochrome === 'light' ? '#FFFFFF' : monochrome === 'dark' ? '#0F172A' : colors.text.primary;
  const storyColor = monochrome === 'light' ? 'rgba(255,255,255,0.75)' : colors.accent.primary;

  // Squircle corner radius as a fraction of the tile (iOS-ish ~26%), so the
  // mark stays proportional at every size. The glyph and spark live in a fixed
  // 100x100 viewBox and scale with the tile.
  const RX = 26;
  const squareSolid =
    monochrome === 'light' ? '#FFFFFF' : monochrome === 'dark' ? '#0F172A' : undefined;
  const glyphColor = monochrome === 'light' ? colors.accent.primary : '#FFFFFF';
  // Custom monoline "M": left stem up, dip to the optical centre, right stem up,
  // right stem down. Even stroke weight + round joins read as a designed mark.
  const mPath = 'M25 73 L25 27 L50 54 L75 27 L75 73';
  const sparkR = 7;
  const sparkX = 82;
  const sparkY = 18;

  const mark = (
    <View
      style={[
        {
          width: s.mark,
          height: s.mark,
          borderRadius: s.mark * (RX / 100),
        },
        Platform.OS === 'web'
          ? ({
              boxShadow: `0 ${s.mark * 0.14}px ${s.mark * 0.42}px -${s.mark * 0.2}px ${primary}99`,
            } as object)
          : {
              shadowColor: primary,
              shadowOpacity: 0.4,
              shadowRadius: s.mark * 0.3,
              shadowOffset: { width: 0, height: s.mark * 0.12 },
              elevation: 8,
            },
      ]}
      accessibilityRole="image"
      accessibilityLabel="MerchStory"
    >
      <Svg width={s.mark} height={s.mark} viewBox="0 0 100 100">
        <Defs>
          {/* Real diagonal brand gradient: light top-left to deep bottom-right */}
          <LinearGradient id="brandFill" x1="0" y1="0" x2="0.55" y2="1">
            <Stop offset="0" stopColor={secondary} />
            <Stop offset="1" stopColor={primary} />
          </LinearGradient>
          {/* Soft glassy sheen: bright top, fading to a faint dark base */}
          <LinearGradient id="brandSheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
            <Stop offset="0.46" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.14} />
          </LinearGradient>
        </Defs>

        {/* Tile */}
        <Rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx={RX}
          fill={squareSolid ?? 'url(#brandFill)'}
        />
        {!monochrome && (
          <Rect x="0" y="0" width="100" height="100" rx={RX} fill="url(#brandSheen)" />
        )}

        {/* Faint cast shadow under the glyph for a hint of depth */}
        <Path
          d={mPath}
          transform="translate(0,1.6)"
          fill="none"
          stroke="rgba(8,11,30,0.20)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The M */}
        <Path
          d={mPath}
          fill="none"
          stroke={glyphColor}
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Inner hairline bevel for a crisp edge */}
        <Rect
          x="0.9"
          y="0.9"
          width="98.2"
          height="98.2"
          rx={RX - 0.9}
          fill="none"
          stroke={monochrome === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)'}
          strokeWidth={1.4}
        />

        {/* Optional single restrained spark — concave 4-point star */}
        {sparkle && (
          <Path
            d={`M${sparkX} ${sparkY - sparkR} Q${sparkX} ${sparkY} ${sparkX + sparkR} ${sparkY} Q${sparkX} ${sparkY} ${sparkX} ${sparkY + sparkR} Q${sparkX} ${sparkY} ${sparkX - sparkR} ${sparkY} Q${sparkX} ${sparkY} ${sparkX} ${sparkY - sparkR} Z`}
            fill={glyphColor}
          />
        )}
      </Svg>
    </View>
  );

  if (variant === 'mark') {
    return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{mark}</View>;
  }

  if (variant === 'stacked') {
    return (
      <View style={[{ flexDirection: 'column', alignItems: 'center', gap: s.gap }, style]}>
        {mark}
        <View style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontSize: s.wordmark,
              letterSpacing: -s.wordmark * 0.02,
              lineHeight: s.wordmark * 1.1,
              ...wordmarkType,
            }}
          >
            <Text style={{ color: merchColor, ...wordmarkType }}>Merch</Text>
            <Text style={{ color: storyColor, ...wordmarkType }}>Story</Text>
          </Text>
          {tagline && (
            <Text
              style={{
                fontSize: s.tagline,
                fontWeight: '600',
                color: monochrome === 'light' ? 'rgba(255,255,255,0.7)' : colors.text.muted,
                letterSpacing: s.tagline * 0.12,
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              {tagline}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // horizontal — tighter mark-to-wordmark gap than the stacked layout so the
  // lockup reads as one unit instead of two separated pieces.
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: Math.round(s.mark * 0.2) }, style]}
    >
      {mark}
      <View style={{ flexShrink: 1 }}>
        <Text
          style={{
            fontSize: s.wordmark,
            letterSpacing: -s.wordmark * 0.02,
            lineHeight: s.wordmark * 1.15,
            ...wordmarkType,
          }}
        >
          <Text style={{ color: merchColor, ...wordmarkType }}>Merch</Text>
          <Text style={{ color: storyColor, ...wordmarkType }}>Story</Text>
        </Text>
        {tagline && (
          <Text
            style={{
              fontSize: s.tagline,
              fontWeight: '700',
              color: monochrome === 'light' ? 'rgba(255,255,255,0.7)' : colors.text.muted,
              letterSpacing: s.tagline * 0.18,
              textTransform: 'uppercase',
              marginTop: 1,
            }}
          >
            {tagline}
          </Text>
        )}
      </View>
    </View>
  );
}

// Re-export so consumers can align surrounding UI to the mark size.
export const BRAND_LOGO_SIZE_MAP = {
  xs: SIZES.xs.mark,
  sm: SIZES.sm.mark,
  md: SIZES.md.mark,
  lg: SIZES.lg.mark,
  xl: SIZES.xl.mark,
} as const;

// Avoid "unused import" warnings in consumers that import only the component.
StyleSheet.create({});
