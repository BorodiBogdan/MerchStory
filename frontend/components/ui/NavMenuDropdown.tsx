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

import { AuthPalette, useAuthPalette } from '@/constants/authTheme';
import { D } from '@/constants/design';

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
  /** Distance from the left viewport edge, so the card anchors under the
   *  hamburger button inside the navbar pill instead of the screen corner. */
  anchorLeft?: number;
  onDismiss: () => void;
}

export function NavMenuDropdown({ visible, items, anchorLeft, onDismiss }: NavMenuDropdownProps) {
  const P = useAuthPalette();
  const [internalVisible, setInternalVisible] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-8);
  const styles = useMemo(() => makeStyles(P, anchorLeft ?? D.spacing.md), [P, anchorLeft]);

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
              <NavMenuRow key={item.key} item={item} palette={P} />
            ))}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface NavMenuRowProps {
  item: NavMenuItem;
  palette: AuthPalette;
}

function NavMenuRow({ item, palette }: NavMenuRowProps) {
  const styles = useMemo(() => makeStyles(palette), [palette]);
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
        color={item.isActive ? palette.accent : palette.body}
      />
      <Text style={[styles.itemLabel, item.isActive && styles.itemLabelActive]}>{item.label}</Text>
      {item.isActive && <View style={styles.activeDot} />}
    </Pressable>
  );
}

function makeStyles(P: AuthPalette, anchorLeft: number = D.spacing.md) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    card: {
      position: 'absolute',
      top: 74,
      left: anchorLeft,
      width: 240,
      // Match the glass navbar pill: translucent surface, light highlight
      // border, blur and the same layered nav shadow.
      backgroundColor: P.glassBg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: P.glassBorder,
      paddingVertical: D.spacing.xs,
      ...(Platform.OS === 'web'
        ? ({
            backdropFilter: 'blur(18px)',
            boxShadow: P.shadowNav,
          } as object)
        : D.shadow.modal),
    },
    header: {
      paddingHorizontal: D.spacing.md,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: P.hairline,
      marginBottom: D.spacing.xs,
    },
    headerLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: P.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.md,
      marginHorizontal: D.spacing.xs,
      ...(Platform.OS === 'web'
        ? ({ transitionDuration: '120ms', transitionProperty: 'background-color' } as object)
        : {}),
    },
    itemActive: {
      backgroundColor: P.accentSoft,
    },
    itemHover: {
      backgroundColor: P.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(22,21,30,0.04)',
    },
    itemLabel: {
      flex: 1,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: P.ink,
    },
    itemLabelActive: {
      color: P.accentText,
      fontWeight: D.fontWeight.semibold,
    },
    activeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: P.accent,
    },
  });
}
