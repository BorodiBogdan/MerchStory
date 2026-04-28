import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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

interface ProfileWalletChoiceModalProps {
  visible: boolean;
  coinBalance: number;
  onChooseProfile: () => void;
  onChooseWallet: () => void;
  onDismiss: () => void;
}

export function ProfileWalletChoiceModal({
  visible,
  coinBalance,
  onChooseProfile,
  onChooseWallet,
  onDismiss,
}: ProfileWalletChoiceModalProps) {
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

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  function tap(action: () => void) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    action();
  }

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, overlayAnimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>
      <View style={styles.centerAnchor} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardAnimStyle]}>
          <Text style={styles.title}>{t('wallet.choice.title')}</Text>
          <Text style={styles.subtitle}>{t('wallet.choice.body')}</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={() => tap(onChooseProfile)}
              style={({ pressed }) => [styles.choiceButton, pressed && styles.choicePressed]}
              accessibilityRole="button"
              accessibilityLabel={t('wallet.choice.profile')}
            >
              <Ionicons name="person-outline" size={22} color={colors.text.primary} />
              <Text style={styles.choiceLabel}>{t('wallet.choice.profile')}</Text>
            </Pressable>

            <Pressable
              onPress={() => tap(onChooseWallet)}
              style={({ pressed }) => [styles.choiceButton, pressed && styles.choicePressed]}
              accessibilityRole="button"
              accessibilityLabel={t('wallet.choice.wallet')}
            >
              <CoinIcon size={22} />
              <Text style={styles.choiceLabel}>{t('wallet.choice.wallet')}</Text>
              <Text style={styles.balanceBadge}>{coinBalance}</Text>
            </Pressable>
          </View>
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
      maxWidth: 400,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: D.spacing.lg,
      paddingTop: D.spacing.lg,
      paddingBottom: D.spacing.lg,
      ...D.shadow.modal,
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: D.spacing.xs,
    },
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: D.spacing.lg,
      lineHeight: 20,
    },
    actions: {
      gap: D.spacing.sm,
    },
    choiceButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: D.spacing.md,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.input,
    },
    choicePressed: {
      opacity: 0.75,
    },
    choiceLabel: {
      flex: 1,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    balanceBadge: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      backgroundColor: colors.accent.dim,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      overflow: 'hidden',
    },
  });
}
