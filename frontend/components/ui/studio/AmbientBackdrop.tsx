import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/context/theme';

/**
 * Very subtle decorative backdrop. No-op on web (the web aesthetic stays
 * clean and flat). On native, two soft translucent circles for depth.
 */
export function AmbientBackdrop() {
  const { colors } = useTheme();

  if (Platform.OS === 'web') return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View
        style={{
          position: 'absolute',
          top: -220,
          left: -140,
          width: 460,
          height: 460,
          borderRadius: 230,
          backgroundColor: colors.accent.primary,
          opacity: 0.35,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -260,
          right: -160,
          width: 460,
          height: 460,
          borderRadius: 230,
          backgroundColor: colors.accent.dim,
          opacity: 0.3,
        }}
      />
    </View>
  );
}
