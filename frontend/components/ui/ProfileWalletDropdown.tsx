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

import { CoinIcon } from '@/components/ui/CoinIcon';
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

interface ProfileWalletDropdownProps {
  visible: boolean;
  email: string | null;
  coinBalance: number;
  isAdmin: boolean;
  onChooseProfile: () => void;
  onChooseWallet: () => void;
  onChooseAdmin?: () => void;
  onSignOut: () => void;
  onDismiss: () => void;
}

export function ProfileWalletDropdown({
  visible,
  email,
  coinBalance,
  isAdmin,
  onChooseProfile,
  onChooseWallet,
  onChooseAdmin,
  onSignOut,
  onDismiss,
}: ProfileWalletDropdownProps) {
  const { colors } = useTheme();
  const t = useT();
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
              colors={colors}
            />

            <DropdownItem
              icon="wallet-outline"
              label={t('wallet.choice.wallet')}
              trailing={
                <View style={styles.balancePill}>
                  <CoinIcon size={12} />
                  <Text style={styles.balancePillText}>{coinBalance}</Text>
                </View>
              }
              onPress={onChooseWallet}
              colors={colors}
            />

            {isAdmin && onChooseAdmin && (
              <DropdownItem
                icon="shield-checkmark-outline"
                label={t('admin.openButton')}
                onPress={onChooseAdmin}
                colors={colors}
              />
            )}

            <View style={styles.divider} />

            <DropdownItem
              icon="log-out-outline"
              label={t('logout.confirm')}
              onPress={onSignOut}
              destructive
              colors={colors}
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
  colors: ReturnType<typeof useTheme>['colors'];
}

function DropdownItem({
  icon,
  iconColor,
  label,
  trailing,
  destructive,
  onPress,
  colors,
}: DropdownItemProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const labelColor = destructive ? colors.destructive : colors.text.primary;
  const resolvedIconColor = iconColor ?? (destructive ? colors.destructive : colors.text.secondary);
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.item,
        (hovered || pressed) && {
          backgroundColor: destructive ? 'rgba(239,68,68,0.08)' : colors.bg.input,
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

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    card: {
      position: 'absolute',
      top: 56,
      right: D.spacing.md,
      width: 280,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingVertical: D.spacing.xs,
      ...D.shadow.modal,
    },
    headerSection: {
      paddingHorizontal: D.spacing.md,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.subtle,
      marginBottom: D.spacing.xs,
    },
    signedInLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    email: {
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      fontWeight: D.fontWeight.medium,
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
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
    },
    balancePillText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border.subtle,
      marginVertical: D.spacing.xs,
      marginHorizontal: D.spacing.sm,
    },
  });
}
