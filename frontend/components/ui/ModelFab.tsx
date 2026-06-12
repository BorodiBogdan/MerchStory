import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/context/theme';

const SIZE = 58;

interface ModelFabProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// Floating circular button that shows the active image model and opens the
// picker. Solid brand-accent fill (no gradient) with a soft glow.
export function ModelFab({ icon, onPress, containerStyle, accessibilityLabel }: ModelFabProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.fab, containerStyle, pressed && styles.pressed]}
    >
      <View style={styles.ring} pointerEvents="none" />
      <Ionicons name={icon} size={25} color="#fff" />
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    fab: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: `0 10px 26px -6px ${colors.accent.primary}b3, 0 2px 8px -2px ${colors.accent.primary}80`,
          } as unknown as ViewStyle)
        : {
            shadowColor: colors.accent.primary,
            shadowOpacity: 0.5,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }),
    },
    pressed: {
      transform: [{ scale: 0.94 }],
      opacity: 0.95,
    },
    // Thin top highlight for a crisp, dimensional edge.
    ring: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: SIZE / 2,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
    },
  });
}
