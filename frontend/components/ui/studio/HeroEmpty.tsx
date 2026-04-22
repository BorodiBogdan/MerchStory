import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

type Props = {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  hint: string;
  minHeight?: number;
};

/**
 * Clean empty state for the hero canvas. No halos, no gradients —
 * dashed outline + centered icon + title + hint.
 */
export function HeroEmpty({ icon = 'sparkles-outline', title, hint, minHeight = 280 }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        {
          minHeight,
          backgroundColor: colors.bg.surface,
          borderColor: colors.border.subtle,
          borderRadius: D.radius.xl,
        },
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: colors.accent.dim,
          },
        ]}
      >
        <Ionicons name={icon} size={22} color={colors.accent.primary} />
      </View>
      <Text
        style={{
          color: colors.text.primary,
          fontSize: D.fontSize.base,
          fontWeight: D.fontWeight.semibold,
          letterSpacing: -0.1,
          marginTop: D.spacing.md,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.text.muted,
          fontSize: D.fontSize.sm,
          marginTop: 4,
          maxWidth: 360,
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: D.spacing.xl,
    paddingHorizontal: D.spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: D.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
