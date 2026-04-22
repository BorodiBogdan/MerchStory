import { useEffect } from 'react';
import { Platform, StyleSheet, type ViewProps, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

type HeroFrameProps = ViewProps & {
  revealKey?: string | number | null;
  minHeight?: number;
  children: React.ReactNode;
};

/**
 * Clean frame for the generated image. Subtle border + soft neutral shadow,
 * with a gentle fade/scale entrance when revealKey changes.
 */
export function HeroFrame({
  revealKey,
  minHeight = 300,
  style,
  children,
  ...rest
}: HeroFrameProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.99);

  useEffect(() => {
    opacity.value = 0;
    scale.value = 0.99;
    opacity.value = withTiming(1, {
      duration: D.duration.entrance,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withTiming(1, {
      duration: D.duration.entrance,
      easing: Easing.out(Easing.cubic),
    });
  }, [revealKey, opacity, scale]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.outer,
        {
          minHeight,
          backgroundColor: colors.bg.surface,
          borderColor: colors.border.subtle,
          borderRadius: D.radius.xl,
          ...(Platform.OS === 'web'
            ? ({
                boxShadow: `0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12)`,
              } as unknown as ViewStyle)
            : D.shadow.sm),
        },
        animStyle,
        style as ViewStyle,
      ]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
