import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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

interface InsufficientCoinsModalProps {
  visible: boolean;
  cost?: number;
  onDismiss: () => void;
}

export function InsufficientCoinsModal({
  visible,
  cost = 1,
  onDismiss,
}: InsufficientCoinsModalProps) {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
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

  function openWallet() {
    onDismiss();
    router.push('/wallet');
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
          <View style={styles.iconCircle}>
            <CoinIcon size={32} />
          </View>
          <Text style={styles.title}>{t('wallet.insufficient.title')}</Text>
          <Text style={styles.subtitle}>
            {t('wallet.insufficient.body').replace('{cost}', String(cost))}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{t('wallet.insufficient.dismiss')}</Text>
            </Pressable>
            <Pressable
              onPress={openWallet}
              style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{t('wallet.insufficient.openWallet')}</Text>
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
      padding: D.spacing.lg,
      alignItems: 'center',
      ...D.shadow.modal,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
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
      flexDirection: 'row',
      gap: D.spacing.sm,
      width: '100%',
    },
    cancelButton: {
      flex: 1,
      height: 48,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    confirmButton: {
      flex: 1,
      height: 48,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...D.shadow.sm,
    },
    confirmText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
    pressed: {
      opacity: 0.85,
    },
  });
}
