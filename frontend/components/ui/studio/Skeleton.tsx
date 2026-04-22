import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

type Props = {
  style?: ViewStyle | ViewStyle[];
  radius?: number;
  height?: number | string;
};

/**
 * Shimmer placeholder used while a generated image is loading.
 * Pure presentational — no data deps.
 */
export function Skeleton({ style, radius = D.radius.lg, height }: Props) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: D.duration.shimmer, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [progress]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 0]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-220, 220]) }],
  }));

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.bg.elevated,
          borderColor: colors.border.subtle,
          borderRadius: radius,
          height: height as number | undefined,
        },
        style as ViewStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          shimmerStyle,
          {
            backgroundColor: colors.bg.surface,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    width: '100%',
    borderWidth: 1,
  },
});
