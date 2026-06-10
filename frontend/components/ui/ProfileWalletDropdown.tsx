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

import { CreditIcon } from '@/components/ui/CreditIcon';
import { AuthPalette, useAuthPalette } from '@/constants/authTheme';
import { D } from '@/constants/design';
import { useT } from '@/i18n';

interface ProfileWalletDropdownProps {
  visible: boolean;
  email: string | null;
  creditBalance: number;
  isAdmin: boolean;
  /** Distance from the right viewport edge, so the card anchors under the
   *  avatar button inside the navbar pill instead of the screen corner. */
  anchorRight?: number;
  onChooseProfile: () => void;
  onChooseWallet: () => void;
  onChooseAdmin?: () => void;
  onSignOut: () => void;
  onDismiss: () => void;
}

export function ProfileWalletDropdown({
  visible,
  email,
  creditBalance,
  isAdmin,
  anchorRight,
  onChooseProfile,
  onChooseWallet,
  onChooseAdmin,
  onSignOut,
  onDismiss,
}: ProfileWalletDropdownProps) {
  const P = useAuthPalette();
  const t = useT();
  const [internalVisible, setInternalVisible] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-8);
  const styles = useMemo(() => makeStyles(P, anchorRight ?? D.spacing.md), [P, anchorRight]);

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
          {/* Pressable wrapper prevents click-through to backdrop */}
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.headerSection}>
              <Text style={styles.signedInLabel}>{t('wallet.choice.title')}</Text>
              {email && (
                <Text style={styles.email} numberOfLines={1}>
                  {email}
                </Text>
              )}
            </View>

            <DropdownItem
              icon="person-outline"
              label={t('wallet.choice.profile')}
              onPress={onChooseProfile}
              palette={P}
            />

            <DropdownItem
              icon="wallet-outline"
              label={t('wallet.choice.wallet')}
              trailing={
                <View style={styles.balancePill}>
                  <CreditIcon size={12} />
                  <Text style={styles.balancePillText}>{creditBalance}</Text>
                </View>
              }
              onPress={onChooseWallet}
              palette={P}
            />

            {isAdmin && onChooseAdmin && (
              <DropdownItem
                icon="shield-checkmark-outline"
                label={t('admin.openButton')}
                onPress={onChooseAdmin}
                palette={P}
              />
            )}

            <View style={styles.divider} />

            <DropdownItem
              icon="log-out-outline"
              label={t('logout.confirm')}
              onPress={onSignOut}
              destructive
              palette={P}
            />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface DropdownItemProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  label: string;
  trailing?: React.ReactNode;
  destructive?: boolean;
  onPress: () => void;
  palette: AuthPalette;
}

function DropdownItem({
  icon,
  iconColor,
  label,
  trailing,
  destructive,
  onPress,
  palette,
}: DropdownItemProps) {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const labelColor = destructive ? palette.dangerText : palette.ink;
  const resolvedIconColor = iconColor ?? (destructive ? palette.dangerText : palette.body);
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.item,
        (hovered || pressed) && {
          backgroundColor: destructive ? palette.dangerBg : hoverFill(palette),
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={resolvedIconColor} />
      <Text style={[styles.itemLabel, { color: labelColor }]}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

/** Subtle neutral hover tint that reads against the glass card in both modes. */
function hoverFill(P: AuthPalette) {
  return P.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(22,21,30,0.04)';
}

function makeStyles(P: AuthPalette, anchorRight: number = D.spacing.md) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    card: {
      position: 'absolute',
      top: 74,
      right: anchorRight,
      width: 280,
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
    headerSection: {
      paddingHorizontal: D.spacing.md,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: P.hairline,
      marginBottom: D.spacing.xs,
    },
    signedInLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: P.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    email: {
      fontSize: D.fontSize.sm,
      color: P.ink,
      fontWeight: D.fontWeight.medium,
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
    itemLabel: {
      flex: 1,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
    },
    balancePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 3,
      borderRadius: D.radius.pill,
      backgroundColor: P.accentSoft,
      borderWidth: 1,
      borderColor: P.accentRing,
    },
    balancePillText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: P.accentText,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: P.hairline,
      marginVertical: D.spacing.xs,
      marginHorizontal: D.spacing.sm,
    },
  });
}
