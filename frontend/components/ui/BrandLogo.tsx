import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
  /** Show the sparkle accent on the mark (default: true) */
  sparkle?: boolean;
  /** Tagline shown only on the stacked variant */
  tagline?: string;
  /** Override theme colors when logo sits on a colored surface */
  monochrome?: 'light' | 'dark' | false;
  /** Optional wrapper style (e.g. margin) */
  style?: ViewStyle;
}

/**
 * MerchStory brand logo. A gradient-feel rounded-square mark — built by layering
 * tinted views so no SVG / linear-gradient dependency is required — with a
 * spark accent (AI / generation cue) and a wordmark split between text.primary
 * and accent.primary colors.
 *
 * Renders identically on web and native.
 */
export function BrandLogo({
  size = 'md',
  variant = 'horizontal',
  sparkle = true,
  tagline,
  monochrome = false,
  style,
}: BrandLogoProps) {
  const { colors } = useTheme();
  const s = SIZES[size];

  const primary = monochrome === 'light' ? '#FFFFFF' : colors.accent.primary;
  const secondary = monochrome === 'light' ? '#FFFFFF' : colors.accent.secondary;
  const merchColor =
    monochrome === 'light' ? '#FFFFFF' : monochrome === 'dark' ? '#0F172A' : colors.text.primary;
  const storyColor = monochrome === 'light' ? 'rgba(255,255,255,0.75)' : colors.accent.primary;

  const mark = (
    <View
      style={[
        {
          width: s.mark,
          height: s.mark,
          borderRadius: s.radius,
          backgroundColor: primary,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        },
        Platform.OS === 'web'
          ? ({
              boxShadow: `0 ${s.mark * 0.16}px ${s.mark * 0.5}px -${s.mark * 0.22}px ${primary}BF, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)`,
            } as object)
          : {
              shadowColor: primary,
              shadowOpacity: 0.55,
              shadowRadius: s.mark * 0.35,
              shadowOffset: { width: 0, height: s.mark * 0.14 },
              elevation: 10,
            },
      ]}
      accessibilityRole="image"
      accessibilityLabel="MerchStory"
    >
      {/* Layer 1: top-right light blob — fakes a diagonal gradient highlight */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -s.mark * 0.55,
          right: -s.mark * 0.45,
          width: s.mark * 1.5,
          height: s.mark * 1.5,
          borderRadius: s.mark * 0.75,
          backgroundColor: secondary,
          opacity: 0.55,
        }}
      />
      {/* Layer 2: bottom-left dark blob — deepens the lower corner */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -s.mark * 0.55,
          left: -s.mark * 0.45,
          width: s.mark * 1.4,
          height: s.mark * 1.4,
          borderRadius: s.mark * 0.7,
          backgroundColor: '#0B0821',
          opacity: 0.28,
        }}
      />
      {/* Layer 3: diagonal shine stripe */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -s.mark * 0.35,
          left: -s.mark * 0.15,
          width: s.mark * 0.35,
          height: s.mark * 1.7,
          backgroundColor: 'rgba(255,255,255,0.16)',
          transform: [{ rotate: '-28deg' }],
        }}
      />
      {/* Layer 4: inner crisp hairline — bevel */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 1,
          left: 1,
          right: 1,
          bottom: 1,
          borderRadius: s.radius - 1,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.16)',
        }}
      />
      {/* Layer 5: the "M" glyph — center, heavy-weight, crisp white */}
      <Text
        style={{
          fontSize: s.mark * 0.62,
          lineHeight: s.mark * 0.62,
          fontWeight: '900',
          color: '#FFFFFF',
          letterSpacing: -s.mark * 0.03,
          includeFontPadding: false,
          textAlign: 'center',
          ...(Platform.OS === 'web'
            ? ({
                textShadow: `0 1px 2px rgba(0,0,0,0.25)`,
                fontFamily:
                  "'Inter Tight','Inter','SF Pro Display','Segoe UI',system-ui,sans-serif",
              } as object)
            : {}),
        }}
      >
        M
      </Text>
      {/* Layer 6: sparkle accent — top-right dot with white glow */}
      {sparkle && (
        <View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: s.sparkleOffset,
              right: s.sparkleOffset,
              width: s.sparkle,
              height: s.sparkle,
              borderRadius: s.sparkle / 2,
              backgroundColor: '#FFFFFF',
            },
            Platform.OS === 'web'
              ? ({
                  boxShadow:
                    '0 0 6px 1px rgba(255,255,255,0.9), 0 0 14px 3px rgba(255,255,255,0.45)',
                } as object)
              : {
                  shadowColor: '#FFFFFF',
                  shadowOpacity: 0.9,
                  shadowRadius: s.sparkle,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 4,
                },
          ]}
        />
      )}
      {/* Layer 7: small secondary spark (bottom-left) — balances the composition */}
      {sparkle && size !== 'xs' && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: s.mark * 0.18,
            left: s.mark * 0.12,
            width: Math.max(2, s.sparkle * 0.45),
            height: Math.max(2, s.sparkle * 0.45),
            borderRadius: s.sparkle,
            backgroundColor: 'rgba(255,255,255,0.9)',
          }}
        />
      )}
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
              fontWeight: '800',
              letterSpacing: -s.wordmark * 0.025,
              lineHeight: s.wordmark * 1.1,
              ...(Platform.OS === 'web'
                ? ({
                    fontFamily:
                      "'Inter Tight','Inter','SF Pro Display','Segoe UI',system-ui,sans-serif",
                  } as object)
                : {}),
            }}
          >
            <Text style={{ color: merchColor }}>Merch</Text>
            <Text style={{ color: storyColor }}>Story</Text>
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

  // horizontal
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: s.gap }, style]}>
      {mark}
      <View style={{ flexShrink: 1 }}>
        <Text
          style={{
            fontSize: s.wordmark,
            fontWeight: '800',
            letterSpacing: -s.wordmark * 0.025,
            lineHeight: s.wordmark * 1.15,
            ...(Platform.OS === 'web'
              ? ({
                  fontFamily:
                    "'Inter Tight','Inter','SF Pro Display','Segoe UI',system-ui,sans-serif",
                } as object)
              : {}),
          }}
        >
          <Text style={{ color: merchColor }}>Merch</Text>
          <Text style={{ color: storyColor }}>Story</Text>
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
