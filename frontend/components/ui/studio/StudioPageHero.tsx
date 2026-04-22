import { StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

type Props = {
  title: string;
  subtitle?: string;
  eyebrow?: string; // accepted but ignored — kept for call-site compat
  icon?: string; // accepted but ignored — kept for call-site compat
};

/**
 * Clean page header — title + subtitle. Typography does the work; no
 * decorative chips, halos, or underlines. Linear/Vercel-style restraint.
 */
export function StudioPageHero({ title, subtitle }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text
        style={{
          fontSize: D.fontSize['2xl'],
          fontWeight: D.fontWeight.bold,
          color: colors.text.primary,
          letterSpacing: -0.8,
          lineHeight: D.fontSize['2xl'] * 1.15,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontSize: D.fontSize.base,
            color: colors.text.secondary,
            marginTop: 6,
            maxWidth: 640,
            lineHeight: 22,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: D.spacing.md,
  },
});
