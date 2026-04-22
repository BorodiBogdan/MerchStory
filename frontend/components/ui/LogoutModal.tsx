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

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

interface LogoutModalProps {
  visible: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function LogoutModal({ visible, onConfirm, onDismiss }: LogoutModalProps) {
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

  function handleConfirm() {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    onConfirm();
  }

  function handleDismiss() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onDismiss();
  }

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, overlayAnimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>
      <View style={styles.centerAnchor} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardAnimStyle]}>
          <View style={styles.iconCircle}>
            <Ionicons name="log-out-outline" size={26} color={colors.destructive} />
          </View>

          <Text style={styles.title}>{t('logout.title')}</Text>
          <Text style={styles.subtitle}>{t('logout.body')}</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={handleDismiss}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelPressed]}
              accessibilityLabel={t('common.cancel')}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>

            <Pressable
              onPress={handleConfirm}
              style={({ pressed }) => [styles.confirmButton, pressed && styles.confirmPressed]}
              accessibilityLabel={t('logout.confirm')}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{t('logout.confirm')}</Text>
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
      alignItems: 'center',
      ...D.shadow.modal,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
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
    confirmButton: {
      flex: 1,
      height: 48,
      borderRadius: D.radius.md,
      backgroundColor: colors.destructive,
      alignItems: 'center',
      justifyContent: 'center',
      outlineWidth: 0,
      ...D.shadow.sm,
    },
    confirmPressed: {
      opacity: 0.85,
    },
    confirmText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
      letterSpacing: 0.2,
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
      outlineWidth: 0,
    },
    cancelPressed: {
      opacity: 0.7,
    },
    cancelText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
  });
}
