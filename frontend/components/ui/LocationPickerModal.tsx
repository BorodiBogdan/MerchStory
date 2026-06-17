import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  DimensionValue,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

// Screen coordinates of the chip the popover hangs off of (web/desktop only).
export type AnchorRect = { x: number; y: number; width: number; height: number };

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  // The shop profile's saved addresses, in their stored order.
  addresses: string[];
  // Indices (into addresses) that are currently selected to appear on the graphic.
  selected: number[];
  onToggle: (index: number) => void;
  // When provided (desktop), the picker renders as a dropdown anchored under the chip
  // instead of a centered dialog.
  anchor?: AnchorRect | null;
  title?: string;
  subtitle?: string;
}

const DESKTOP_BREAKPOINT = 900;
const POPOVER_WIDTH = 340;

export function LocationPickerModal({
  visible,
  onClose,
  addresses,
  selected,
  onToggle,
  anchor,
  title,
  subtitle,
}: LocationPickerModalProps) {
  const { colors } = useTheme();
  const t = useT();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isDesktop = screenWidth >= DESKTOP_BREAKPOINT;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const resolvedTitle = title ?? t('locationPicker.title');
  const resolvedSubtitle = subtitle ?? t('locationPicker.subtitle');
  const selectedCount = selected.length;

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{resolvedTitle}</Text>
        {resolvedSubtitle ? <Text style={styles.subtitle}>{resolvedSubtitle}</Text> : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
        onPress={onClose}
        accessibilityLabel={t('common.close')}
        accessibilityRole="button"
      >
        <Ionicons name="close" size={18} color={colors.text.secondary} />
      </Pressable>
    </View>
  );

  const list = (scrollMaxHeight?: number) => (
    <ScrollView
      style={scrollMaxHeight ? { maxHeight: scrollMaxHeight } : undefined}
      contentContainerStyle={{ padding: D.spacing.md, gap: D.spacing.sm }}
    >
      {addresses.map((addr, i) => {
        const isSel = selected.includes(i);
        return (
          <Pressable
            key={i}
            onPress={() => onToggle(i)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSel }}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: isSel ? colors.accent.primary : colors.border.subtle,
                backgroundColor: isSel
                  ? colors.accent.dim
                  : pressed
                    ? colors.bg.elevated
                    : colors.bg.base,
              },
            ]}
          >
            <Ionicons
              name={isSel ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={isSel ? colors.accent.primary : colors.text.muted}
            />
            <Text
              style={[styles.rowText, { color: isSel ? colors.text.primary : colors.text.secondary }]}
            >
              {addr}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const footer = (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        {selectedCount > 0
          ? `${selectedCount} ${t('locationPicker.selected')}`
          : t('locationPicker.prompt')}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Text style={styles.doneBtnText}>{t('common.done')}</Text>
      </Pressable>
    </View>
  );

  // Desktop dropdown anchored to the chip the user tapped.
  if (isDesktop && anchor) {
    const GAP = 6;
    const MARGIN = 16;
    const left = Math.max(MARGIN, Math.min(anchor.x, screenWidth - POPOVER_WIDTH - MARGIN));

    const spaceBelow = screenHeight - (anchor.y + anchor.height);
    const spaceAbove = anchor.y;
    // Rough natural height so we can decide whether the card fits below the chip.
    const estimatedHeight = 64 + 60 + Math.min(addresses.length, 6) * 56 + 24;
    // When there is not enough room below and more room above, flip the card up.
    const placeAbove = spaceBelow < Math.min(estimatedHeight, 320) && spaceAbove > spaceBelow;

    const available = (placeAbove ? spaceAbove : spaceBelow) - GAP - MARGIN;
    const scrollMax = Math.max(100, available - 124);
    const positionStyle = placeAbove
      ? { left, bottom: screenHeight - anchor.y + GAP }
      : { left, top: anchor.y + anchor.height + GAP };

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.popoverBackdrop} onPress={onClose}>
          <Pressable
            style={[styles.popoverCard, { width: POPOVER_WIDTH }, positionStyle]}
            onPress={() => {}}
          >
            {header}
            {list(scrollMax)}
            {footer}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Mobile: full-screen sheet.
  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.fullscreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {header}
        {list()}
        {footer}
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    fullscreen: {
      flex: 1,
      backgroundColor: colors.bg.surface,
    },
    // Transparent click-catcher that closes the dropdown on outside press.
    popoverBackdrop: {
      flex: 1,
    },
    popoverCard: {
      position: 'absolute',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...D.shadow.modal,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: D.spacing.sm,
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.elevated,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: D.spacing.md,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.md,
      borderWidth: 1,
    },
    rowText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.surface,
    },
    footerText: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
    },
    doneBtn: {
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.sm,
    },
    doneBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
  });
}
