import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipSelectorProps {
  options: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
  accessibilityLabel: string;
  deselectable?: boolean;
  /** Text shown in the dropdown trigger when nothing is selected. */
  placeholder?: string;
}

// Below this width (and on every native phone) the selector collapses from a row
// of chips into a tap-to-open dropdown — chips wrap awkwardly and eat vertical
// space on small screens, where a single select control reads far cleaner.
const DROPDOWN_MAX_WIDTH = 768;

export function ChipSelector(props: ChipSelectorProps) {
  const { width } = useWindowDimensions();
  const asDropdown = Platform.OS !== 'web' || width < DROPDOWN_MAX_WIDTH;
  return asDropdown ? <DropdownSelector {...props} /> : <ChipRow {...props} />;
}

// ─── Dropdown (small screens / native) ────────────────────────────────────────
function DropdownSelector({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  deselectable = false,
  placeholder,
}: ChipSelectorProps) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { height: screenHeight } = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const selectedOption = options.find((o) => o.value === selected) ?? null;

  function openMenu() {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, width: w, height: h });
      setOpen(true);
    });
  }

  function choose(value: string) {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    if (deselectable && selected === value) {
      onSelect('');
    } else {
      onSelect(value);
    }
    setOpen(false);
  }

  // Open downward by default; flip above the trigger when there isn't enough
  // room below (e.g. the control sits near the bottom of the screen).
  const ITEM_HEIGHT = 46;
  const MAX_MENU_HEIGHT = 280;
  const estMenuHeight = Math.min(options.length * ITEM_HEIGHT + 8, MAX_MENU_HEIGHT);
  const spaceBelow = screenHeight - (anchor.y + anchor.height);
  const dropUp = spaceBelow < estMenuHeight + 16 && anchor.y > spaceBelow;
  const menuTop = dropUp ? anchor.y - estMenuHeight - 6 : anchor.y + anchor.height + 6;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        style={[styles.trigger, open && styles.triggerOpen]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
      >
        <Text
          numberOfLines={1}
          style={[styles.triggerText, !selectedOption && styles.triggerPlaceholder]}
        >
          {selectedOption ? selectedOption.label : (placeholder ?? t('common.select'))}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.menu,
              {
                top: menuTop,
                left: anchor.x,
                width: anchor.width,
                maxHeight: estMenuHeight,
              },
            ]}
          >
            {/* Swallow presses on the menu so they don't close the backdrop. */}
            <Pressable onPress={(e) => e.stopPropagation?.()} style={{ flexShrink: 1 }}>
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                accessibilityRole="radiogroup"
                accessibilityLabel={accessibilityLabel}
              >
                {options.map((option) => {
                  const isSelected = option.value === selected;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => choose(option.value)}
                      style={({ pressed }) => [
                        styles.menuItem,
                        pressed && { backgroundColor: colors.bg.elevated },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={option.label}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.menuItemText, isSelected && styles.menuItemTextSelected]}
                      >
                        {option.label}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={18} color={colors.accent.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Horizontal chips (wide-screen web) ───────────────────────────────────────
function ChipRow({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  deselectable = false,
}: ChipSelectorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A horizontal ScrollView has no intrinsic height; on iOS, nested inside
      // a vertical ScrollView it expands to fill the column's vertical slack and
      // pushes sibling content off-screen. Pin it to its content height.
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          option={option}
          isSelected={selected === option.value}
          onSelect={() => {
            if (deselectable && selected === option.value) {
              onSelect('');
            } else {
              onSelect(option.value);
            }
          }}
        />
      ))}
    </ScrollView>
  );
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

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
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
    // ── Dropdown trigger ──
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: D.spacing.sm,
      marginTop: D.spacing.xs,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 3,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    triggerOpen: {
      borderColor: colors.accent.primary,
    },
    triggerText: {
      flex: 1,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    triggerPlaceholder: {
      color: colors.text.muted,
      fontWeight: D.fontWeight.regular,
    },
    // ── Dropdown menu ──
    backdrop: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    menu: {
      position: 'absolute',
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
      paddingVertical: D.spacing.xs,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({ boxShadow: '0 12px 32px -12px rgba(0,0,0,0.45)' } as object)
        : D.shadow.modal),
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 2,
    },
    menuItemText: {
      flex: 1,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    menuItemTextSelected: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
  });
}
