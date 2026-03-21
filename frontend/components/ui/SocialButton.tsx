import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

type SocialProvider = 'google' | 'apple';

interface SocialButtonProps {
  provider: SocialProvider;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: object;
}

const PROVIDER_CONFIG = {
  google: {
    icon: 'logo-google' as const,
    iconSize: 18,
    label: 'Google',
  },
  apple: {
    icon: 'logo-apple' as const,
    iconSize: 20,
    label: 'Apple',
  },
};

export function SocialButton({
  provider,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  style,
}: SocialButtonProps) {
  const { colors } = useTheme();
  const config = PROVIDER_CONFIG[provider];
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function handlePress() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.inner}>
        <Ionicons name={config.icon} size={config.iconSize} color={colors.text.primary} />
        <Text style={styles.label}>{config.label}</Text>
      </View>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      height: 52,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.social.border,
      backgroundColor: colors.bg.input,
      justifyContent: 'center',
      alignItems: 'center',
      outlineWidth: 0,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    label: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    pressed: {
      opacity: 0.7,
      backgroundColor: colors.accent.dim,
    },
    disabled: {
      opacity: 0.4,
    },
  });
}
