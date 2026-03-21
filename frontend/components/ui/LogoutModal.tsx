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

interface LogoutModalProps {
  visible: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function LogoutModal({ visible, onConfirm, onDismiss }: LogoutModalProps) {
  const { colors } = useTheme();
  const [internalVisible, setInternalVisible] = useState(false);
  const translateY = useSharedValue(500);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      translateY.value = withTiming(0, {
        duration: D.duration.slow,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateY.value = withTiming(500, { duration: D.duration.normal }, (finished) => {
        if (finished) {
          runOnJS(setInternalVisible)(false);
        }
      });
    }
  }, [visible, translateY]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
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
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <View style={styles.overlayFill} />
      </Pressable>
      <View style={styles.sheetAnchor} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardAnimStyle]}>
          <View style={styles.handle} />

          <Text style={styles.title}>Sign out?</Text>
          <Text style={styles.subtitle}>
            You&apos;ll need to sign in again to access your account.
          </Text>

          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.confirmButton, pressed && styles.confirmPressed]}
            accessibilityLabel="Confirm sign out"
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>Sign out</Text>
          </Pressable>

          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelPressed]}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    overlayFill: {
      flex: 1,
    },
    sheetAnchor: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    card: {
      backgroundColor: colors.bg.elevated,
      borderTopLeftRadius: D.radius.xl,
      borderTopRightRadius: D.radius.xl,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: D.spacing.lg,
      paddingTop: D.spacing.md,
      paddingBottom: 40,
      overflow: 'visible',
      ...D.shadow.modal,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.text.muted,
      alignSelf: 'center',
      marginBottom: D.spacing.lg,
    },
    title: {
      fontSize: D.fontSize.xl,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      marginBottom: D.spacing.lg,
      lineHeight: 20,
    },
    confirmButton: {
      height: 52,
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
      height: 52,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: D.spacing.sm,
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
