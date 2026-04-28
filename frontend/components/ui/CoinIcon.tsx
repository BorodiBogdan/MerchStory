import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

interface CoinIconProps {
  size?: number;
  style?: ViewStyle;
}

export function CoinIcon({ size = 18, style }: CoinIconProps) {
  const borderWidth = Math.max(1, size * 0.08);
  const innerSize = size * 0.62;
  const innerStroke = Math.max(1, size * 0.06);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#FBBF24',
          borderWidth,
          borderColor: '#B45309',
          alignItems: 'center',
          justifyContent: 'center',
        },
        styles.shadow,
        style,
      ]}
    >
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          borderWidth: innerStroke,
          borderColor: 'rgba(124,45,18,0.55)',
          backgroundColor: '#FCD34D',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#92400E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 1.5,
  },
});
