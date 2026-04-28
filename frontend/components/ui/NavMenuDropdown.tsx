import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

export interface NavMenuItem {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconOutline: React.ComponentProps<typeof Ionicons>['name'];
  isActive: boolean;
  onPress: () => void;
}

interface NavMenuDropdownProps {
  visible: boolean;
  items: NavMenuItem[];
  onDismiss: () => void;
}

export function NavMenuDropdown({ visible, items, onDismiss }: NavMenuDropdownProps) {
  const { colors } = useTheme();
  const [internalVisible, setInternalVisible] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-8);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      opacity.value = withTiming(1, {
        duration: D.duration.fast,
        easing: Easing.out(Easing.quad),
      });
      translateY.value = withTiming(0, {
        duration: D.duration.fast,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      opacity.value = withTiming(0, { duration: D.duration.fast });
      translateY.value = withTiming(-8, { duration: D.duration.fast }, (finished) => {
        if (finished) runOnJS(setInternalVisible)(false);
      });
    }
  }, [visible, opacity, translateY]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={internalVisible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View style={[styles.card, cardAnimStyle]}>
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.header}>
              <Text style={styles.headerLabel}>Menu</Text>
            </View>
            {items.map((item) => (
              <NavMenuRow key={item.key} item={item} colors={colors} />
            ))}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface NavMenuRowProps {
  item: NavMenuItem;
  colors: ReturnType<typeof useTheme>['colors'];
}

function NavMenuRow({ item, colors }: NavMenuRowProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={item.onPress}
      style={({ hovered, pressed }) => [
        styles.item,
        item.isActive && styles.itemActive,
        !item.isActive && (hovered || pressed) && styles.itemHover,
      ]}
      accessibilityRole="link"
      accessibilityState={{ selected: item.isActive }}
      accessibilityLabel={item.label}
    >
      <Ionicons
        name={item.isActive ? item.icon : item.iconOutline}
        size={18}
        color={item.isActive ? colors.accent.primary : colors.text.secondary}
      />
      <Text style={[styles.itemLabel, item.isActive && styles.itemLabelActive]}>{item.label}</Text>
      {item.isActive && <View style={styles.activeDot} />}
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    card: {
      position: 'absolute',
      top: 56,
      left: D.spacing.md,
      width: 240,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingVertical: D.spacing.xs,
      ...D.shadow.modal,
    },
    header: {
      paddingHorizontal: D.spacing.md,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.subtle,
      marginBottom: D.spacing.xs,
    },
    headerLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.sm,
      marginHorizontal: D.spacing.xs,
      ...(Platform.OS === 'web'
        ? ({ transitionDuration: '120ms', transitionProperty: 'background-color' } as object)
        : {}),
    },
    itemActive: {
      backgroundColor: colors.accent.dim,
    },
    itemHover: {
      backgroundColor: colors.bg.input,
    },
    itemLabel: {
      flex: 1,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    itemLabelActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
    activeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent.primary,
    },
  });
}
