import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipSelectorProps {
  options: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
  accessibilityLabel: string;
}

function Chip({
  option,
  isSelected,
  onSelect,
}: {
  option: ChipOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function handlePress() {
    scale.value = withSpring(1.06, { damping: 10, stiffness: 200 }, () => {
      scale.value = withSpring(1);
    });
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    onSelect();
  }

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        style={[styles.chip, isSelected && styles.chipSelected]}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={option.label}
      >
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{option.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ChipSelector({
  options,
  selected,
  onSelect,
  accessibilityLabel,
}: ChipSelectorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          option={option}
          isSelected={selected === option.value}
          onSelect={() => onSelect(option.value)}
        />
      ))}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      paddingVertical: D.spacing.xs,
      paddingHorizontal: 2,
    },
    chip: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.pill,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    chipSelected: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
      ...D.shadow.glow,
    },
    chipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.muted,
    },
    chipTextSelected: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
  });
}
