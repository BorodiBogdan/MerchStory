import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import React, { ComponentProps, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { D } from '@/constants/design';

const LEFT_ICON_OFFSET = 28; // icon(20) + gap(8)

// Inline web-only style: suppress the browser focus ring on the <input> element.
// Autofill background is handled globally in app/+html.tsx via :-webkit-autofill CSS.
const WEB_NO_OUTLINE = Platform.OS === 'web'
  ? ({ outline: 'none', outlineWidth: 0 } as object)
  : {};

interface FloatingInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  leftIcon?: ComponentProps<typeof Ionicons>['name'];
  secureEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  editable?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

export function FloatingInput({
  label,
  value,
  onChangeText,
  error,
  leftIcon,
  secureEntry,
  keyboardType,
  autoCapitalize,
  editable = true,
  returnKeyType,
  onSubmitEditing,
  accessibilityLabel,
  accessibilityHint,
}: FloatingInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isFocused = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const prevError = useRef<string | null | undefined>(null);

  const shouldFloat = value.length > 0;
  const labelLeft = leftIcon ? LEFT_ICON_OFFSET : 0;

  useEffect(() => {
    if (error && error !== prevError.current) {
      shakeX.value = withSequence(
        withTiming(-8, { duration: 60 }),
        withTiming(8, { duration: 60 }),
        withTiming(-5, { duration: 60 }),
        withTiming(5, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      );
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
    prevError.current = error;
  }, [error]);

  const containerAnimStyle = useAnimatedStyle(() => {
    const borderColor = error
      ? D.colors.border.error
      : interpolateColor(isFocused.value, [0, 1], [D.colors.border.default, D.colors.border.focus]);
    const backgroundColor = interpolateColor(
      isFocused.value,
      [0, 1],
      [D.colors.bg.input, D.colors.bg.inputFocus],
    );
    return { borderColor, backgroundColor };
  });

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const labelAnimStyle = useAnimatedStyle(() => {
    const floated = isFocused.value === 1 || shouldFloat;
    const color = interpolateColor(
      isFocused.value,
      [0, 1],
      [D.colors.text.muted, D.colors.text.labelActive],
    );
    return {
      // Label starts at top:0 of the 58px inputWrapper.
      // translateY:20 centers it visually; translateY:6 floats it near the top.
      color: shouldFloat ? D.colors.text.labelActive : color,
      transform: [
        { translateY: withTiming(floated ? 6 : 19, { duration: D.duration.normal, easing: Easing.out(Easing.cubic) }) },
        { scale: withTiming(floated ? 0.75 : 1, { duration: D.duration.normal, easing: Easing.out(Easing.cubic) }) },
      ],
    };
  });

  function handleFocus() {
    isFocused.value = withTiming(1, { duration: D.duration.normal });
  }

  function handleBlur() {
    isFocused.value = withTiming(0, { duration: D.duration.normal });
  }

  function togglePassword() {
    setShowPassword((v) => !v);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  return (
    <View style={styles.wrapper}>
      <Animated.View style={shakeStyle}>
        <Pressable onPress={() => inputRef.current?.focus()} accessibilityRole="none">
          <Animated.View style={[styles.container, containerAnimStyle]}>
            {leftIcon && (
              <Ionicons
                name={leftIcon}
                size={20}
                color={D.colors.text.muted}
                style={styles.leftIcon}
              />
            )}
            <View style={styles.inputWrapper}>
              <Animated.Text
                style={[styles.label, { left: labelLeft }, labelAnimStyle]}
                pointerEvents="none"
              >
                {label}
              </Animated.Text>
              <TextInput
                ref={inputRef}
                style={[styles.textInput, WEB_NO_OUTLINE]}
                value={value}
                onChangeText={onChangeText}
                secureTextEntry={secureEntry && !showPassword}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize ?? 'none'}
                editable={editable}
                returnKeyType={returnKeyType}
                onSubmitEditing={onSubmitEditing}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholderTextColor="transparent"
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={accessibilityHint}
              />
            </View>
            {secureEntry && (
              <Pressable
                onPress={togglePassword}
                style={styles.eyeButton}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                accessibilityRole="button"
                accessibilityHint="Double tap to toggle password visibility"
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={D.colors.text.muted}
                />
              </Pressable>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
      {!!error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color={D.colors.text.error} />
          <Animated.Text style={styles.errorText}>{error}</Animated.Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: D.spacing.md,
  },
  container: {
    height: 58,
    borderWidth: 1.5,
    borderRadius: D.radius.md,
    paddingHorizontal: D.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftIcon: {
    marginRight: D.spacing.md,
    alignSelf: 'flex-end',
    marginBottom: 18,
  },
  inputWrapper: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    position: 'relative',
  },
  label: {
    position: 'absolute',
    top: 0,
    fontSize: D.fontSize.base,
    transformOrigin: 'left center',
  },
  textInput: {
    // No flex:1 — let the TextInput be its natural single-line height (~21px),
    // centered by the wrapper's justifyContent:'center' + paddingTop:16
    fontSize: D.fontSize.base,
    color: D.colors.text.primary,
    backgroundColor: 'transparent',
    paddingVertical: 0,
  },
  eyeButton: {
    paddingLeft: D.spacing.sm,
    outlineWidth: 0,
    alignSelf: 'flex-end',
    marginBottom: 18,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginLeft: D.spacing.md,
  },
  errorText: {
    fontSize: D.fontSize.xs,
    color: D.colors.text.error,
  },
});
