import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

export interface ModelPickerOption {
  value: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  // Credits one generation with this model costs. Not surfaced in the UI today
  // (all models cost the same), kept so a future per-model cost can be shown.
  credits: number;
}

interface ModelPickerModalProps {
  visible: boolean;
  models: ModelPickerOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function ModelPickerModal({
  visible,
  models,
  selected,
  onSelect,
  onClose,
}: ModelPickerModalProps) {
  const { colors } = useTheme();
  const t = useT();
  const [internalVisible, setInternalVisible] = useState(false);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      opacity.value = withTiming(1, {
        duration: D.duration.normal,
        easing: Easing.out(Easing.quad),
      });
      scale.value = withTiming(1, {
        duration: D.duration.normal,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      opacity.value = withTiming(0, { duration: D.duration.fast });
      scale.value = withTiming(0.92, { duration: D.duration.fast }, (finished) => {
        if (finished) {
          runOnJS(setInternalVisible)(false);
        }
      });
    }
  }, [visible, opacity, scale]);

  const overlayAnimStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  function handleSelect(value: string) {
    onSelect(value);
  }

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, overlayAnimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View style={styles.centerAnchor} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardAnimStyle]}>
          <Text style={styles.title}>{t('studio.model.pickerTitle')}</Text>
          <Text style={styles.subtitle}>{t('studio.model.pickerSubtitle')}</Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {models.map((model) => {
              const isActive = model.value === selected;
              return (
                <Pressable
                  key={model.value}
                  onPress={() => handleSelect(model.value)}
                  style={({ pressed }) => [
                    styles.row,
                    isActive && styles.rowActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={[styles.iconChip, isActive && styles.iconChipActive]}>
                    <Ionicons
                      name={model.icon}
                      size={20}
                      color={isActive ? '#fff' : colors.text.secondary}
                    />
                  </View>
                  <Text style={[styles.label, isActive && styles.labelActive]}>{model.label}</Text>
                  {isActive ? (
                    <Ionicons name="checkmark-circle" size={24} color={colors.accent.primary} />
                  ) : (
                    <View style={styles.radioEmpty} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    centerAnchor: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.lg,
      ...D.shadow.modal,
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      marginBottom: D.spacing.md,
      lineHeight: 20,
    },
    list: {
      maxHeight: 340,
    },
    listContent: {
      gap: D.spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      padding: D.spacing.sm + 2,
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    rowActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    pressed: {
      opacity: 0.85,
    },
    iconChip: {
      width: 44,
      height: 44,
      borderRadius: 15,
      backgroundColor: colors.bg.elevated,
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
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    labelActive: {
      color: colors.text.primary,
      fontWeight: D.fontWeight.bold,
    },
    radioEmpty: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border.default,
    },
  });
}
