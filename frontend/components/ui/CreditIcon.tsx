import React from 'react';
import { type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

interface CreditIconProps {
  size?: number;
  style?: ViewStyle;
}

export function CreditIcon({ size = 18, style }: CreditIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} fill="none">
      <Defs>
        <LinearGradient
          id="creditGrad"
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#A5B4FC" />
          <Stop offset="1" stopColor="#6366F1" />
        </LinearGradient>
      </Defs>
      {/* squircle token */}
      <Rect x="1.5" y="1.5" width="21" height="21" rx="7" fill="url(#creditGrad)" />
      {/* main 4-point spark */}
      <Path
        d="M12 5.5c.55 4.2 1.8 5.45 6.5 6.5-4.7 1.05-5.95 2.3-6.5 6.5-.55-4.2-1.8-5.45-6.5-6.5 4.7-1.05 5.95-2.3 6.5-6.5Z"
        fill="#FFFFFF"
        fillOpacity={0.95}
      />
      {/* small secondary spark, top-right */}
      <Path
        d="M17.7 4.4c.2 1.3.6 1.7 1.9 1.9-1.3.2-1.7.6-1.9 1.9-.2-1.3-.6-1.7-1.9-1.9 1.3-.2 1.7-.6 1.9-1.9Z"
        fill="#FFFFFF"
        fillOpacity={0.85}
      />
    </Svg>
  );
}
