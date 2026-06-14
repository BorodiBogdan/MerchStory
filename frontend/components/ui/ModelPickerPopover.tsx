import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { ModelPickerOption } from '@/components/ui/ModelPickerModal';
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

interface ModelPickerPopoverProps {
  visible: boolean;
  models: ModelPickerOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  // Positions the card (right/bottom) relative to the screen, anchored to the FAB.
  cardStyle?: StyleProp<ViewStyle>;
}

// Web/desktop presentation of the model picker: an in-page dropdown that expands
// from the floating button (no dimming overlay), rather than a centered modal.
export function ModelPickerPopover({
  visible,
  models,
  selected,
  onSelect,
  onClose,
  cardStyle,
}: ModelPickerPopoverProps) {
  const { colors } = useTheme();
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const progress = useSharedValue(0);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: D.duration.normal,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progress.value = withTiming(0, { duration: D.duration.fast }, (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
        }
      });
    }
  }, [visible, progress]);

  // Expand upward from the button: fade + small rise + subtle scale.
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  if (!mounted) {
    return null;
  }

  function handleSelect(value: string) {
    onSelect(value);
    onClose();
  }

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.card, cardStyle, cardAnimStyle]}>
        <Text style={styles.heading}>{t('studio.model.pickerTitle')}</Text>
        {models.map((model) => {
          const isActive = model.value === selected;
          return (
            <Pressable
              key={model.value}
              onPress={() => handleSelect(model.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.row,
                isActive && styles.rowActive,
                (pressed || hovered) && !isActive && styles.rowHover,
              ]}
            >
              <View style={[styles.iconChip, isActive && styles.iconChipActive]}>
                <Ionicons
                  name={model.icon}
                  size={18}
                  color={isActive ? '#fff' : colors.text.secondary}
                />
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]}>{model.label}</Text>
              {isActive ? (
                <Ionicons name="checkmark-circle" size={21} color={colors.accent.primary} />
              ) : (
                <View style={styles.radioEmpty} />
              )}
            </Pressable>
          );
        })}
      </Animated.View>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    // Transparent click-catcher — closes on outside click without dimming the page.
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 100,
    },
    card: {
      position: 'absolute',
      zIndex: 101,
      width: 264,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg + 2,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 6,
      gap: 2,
      ...D.shadow.modal,
    },
    heading: {
      fontSize: 11,
      fontWeight: D.fontWeight.bold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingHorizontal: D.spacing.sm,
      paddingTop: D.spacing.sm,
      paddingBottom: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      paddingVertical: D.spacing.sm + 1,
      paddingHorizontal: D.spacing.sm,
      borderRadius: D.radius.md + 2,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    rowActive: {
      backgroundColor: colors.accent.dim,
      borderColor: colors.accent.primary,
    },
    rowHover: {
      backgroundColor: colors.bg.input,
    },
    iconChip: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconChipActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    label: {
      flex: 1,
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    labelActive: {
      color: colors.text.primary,
      fontWeight: D.fontWeight.bold,
    },
    radioEmpty: {
      width: 21,
      height: 21,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border.default,
    },
  });
}
