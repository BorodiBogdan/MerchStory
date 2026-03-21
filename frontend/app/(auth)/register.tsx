import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const isWeb = Platform.OS === 'web';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingInput } from '@/components/ui/FloatingInput';
import { SocialButton } from '@/components/ui/SocialButton';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';

const STRENGTH_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E'];
const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

function getPasswordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function validate(email: string, password: string, confirmPassword: string) {
  const errors: { email?: string; password?: string; confirm?: string } = {};
  if (!email.trim()) {
    errors.email = 'Email is required.';
  } else if (!email.includes('@') || !email.includes('.')) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }
  if (!confirmPassword) {
    errors.confirm = 'Please confirm your password.';
  } else if (password !== confirmPassword) {
    errors.confirm = 'Passwords do not match.';
  }
  return errors;
}

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const emailErrorKey = useRef(0);
  const passwordErrorKey = useRef(0);
  const confirmErrorKey = useRef(0);

  const strength = getPasswordStrength(password);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: D.duration.slow });
    translateY.value = withTiming(0, {
      duration: D.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  async function handleRegister() {
    const errors = validate(email, password, confirmPassword);
    if (Object.keys(errors).length > 0) {
      if (errors.email) emailErrorKey.current += 1;
      if (errors.password) passwordErrorKey.current += 1;
      if (errors.confirm) confirmErrorKey.current += 1;
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setApiError(null);
    setLoading(true);
    try {
      await signUp(email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setApiError(msg);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleEmailChange(text: string) {
    setEmail(text);
    if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: undefined }));
  }

  function handlePasswordChange(text: string) {
    setPassword(text);
    if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
    if (fieldErrors.confirm && text === confirmPassword)
      setFieldErrors((e) => ({ ...e, confirm: undefined }));
  }

  function handleConfirmChange(text: string) {
    setConfirmPassword(text);
    if (fieldErrors.confirm) setFieldErrors((e) => ({ ...e, confirm: undefined }));
  }

  function handleSocialPress() {
    Alert.alert('Coming Soon', 'Social login is not available yet. Stay tuned!');
  }

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && confirmPassword.length > 0 && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[animStyle, styles.card]}>
            {/* Logo mark */}
            <View style={styles.logoContainer}>
              <View style={styles.logoMark}>
                <Text style={styles.logoGlyph}>M</Text>
              </View>
              <Text style={styles.logoText}>MerchStory</Text>
            </View>

            {/* Heading */}
            <Text style={styles.heading}>Create account</Text>
            <Text style={styles.subheading}>Start turning photos into ads</Text>

            {/* Social row */}
            <View style={styles.socialRow}>
              <SocialButton
                provider="google"
                onPress={handleSocialPress}
                accessibilityLabel="Sign up with Google"
                style={styles.socialFlex}
              />
              <SocialButton
                provider="apple"
                onPress={handleSocialPress}
                accessibilityLabel="Sign up with Apple"
                style={styles.socialFlex}
              />
            </View>

            {/* OR divider */}
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>

            {/* Form */}
            <FloatingInput
              key={`email-${emailErrorKey.current}`}
              label="Email address"
              value={email}
              onChangeText={handleEmailChange}
              error={fieldErrors.email}
              leftIcon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
              returnKeyType="next"
              accessibilityLabel="Email address input"
              accessibilityHint="Enter your email address"
            />

            <FloatingInput
              key={`password-${passwordErrorKey.current}`}
              label="Password"
              value={password}
              onChangeText={handlePasswordChange}
              error={fieldErrors.password}
              leftIcon="lock-closed-outline"
              secureEntry
              editable={!loading}
              returnKeyType="next"
              accessibilityLabel="Password input"
              accessibilityHint="Choose a secure password"
            />

            {/* Password strength bar */}
            {password.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBar}>
                  {[0, 1, 2, 3].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        {
                          backgroundColor:
                            i < strength
                              ? STRENGTH_COLORS[strength - 1]
                              : D.colors.border.default,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: STRENGTH_COLORS[strength - 1] ?? D.colors.text.muted }]}>
                  {strength > 0 ? STRENGTH_LABELS[strength - 1] : ''}
                </Text>
              </View>
            )}

            <FloatingInput
              key={`confirm-${confirmErrorKey.current}`}
              label="Confirm password"
              value={confirmPassword}
              onChangeText={handleConfirmChange}
              error={fieldErrors.confirm}
              leftIcon="shield-checkmark-outline"
              secureEntry
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              accessibilityLabel="Confirm password input"
              accessibilityHint="Re-enter your password to confirm"
            />

            {/* API error banner */}
            {!!apiError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={D.colors.text.error} />
                <Text style={styles.errorBannerText}>{apiError}</Text>
              </View>
            )}

            {/* Submit button */}
            <Pressable
              onPress={handleRegister}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSubmit && styles.primaryButtonDisabled,
                pressed && canSubmit && styles.primaryButtonPressed,
              ]}
              accessibilityLabel="Create account"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: loading }}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Creating account…' : 'Create account'}
              </Text>
            </Pressable>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account?&nbsp;</Text>
              <Link href="/(auth)/login" asChild>
                <Pressable accessibilityRole="link" accessibilityLabel="Sign in">
                  <Text style={styles.footerLink}>Sign in</Text>
                </Pressable>
              </Link>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: D.colors.bg.base,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: D.spacing.lg,
    paddingTop: isWeb ? D.spacing['2xl'] : D.spacing.xl,
    paddingBottom: D.spacing.lg,
    justifyContent: 'center',
    alignItems: isWeb ? 'center' : 'stretch',
  },
  card: {
    width: '100%',
    ...(isWeb
      ? {
          maxWidth: 440,
          backgroundColor: D.colors.bg.surface,
          borderRadius: D.radius.xl,
          borderWidth: 1,
          borderColor: D.colors.border.default,
          paddingHorizontal: D.spacing.xl,
          paddingVertical: D.spacing['2xl'],
          ...D.shadow.modal,
        }
      : {}),
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: D.spacing.xl,
    gap: D.spacing.sm,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: D.radius.lg,
    backgroundColor: D.colors.accent.dim,
    borderWidth: 1.5,
    borderColor: D.colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {
    fontSize: D.fontSize['2xl'],
    fontWeight: D.fontWeight.bold,
    color: D.colors.accent.secondary,
  },
  logoText: {
    fontSize: D.fontSize.sm,
    fontWeight: D.fontWeight.semibold,
    color: D.colors.text.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: D.fontSize['2xl'],
    fontWeight: D.fontWeight.bold,
    color: D.colors.text.primary,
    textAlign: 'center',
    marginBottom: D.spacing.xs,
  },
  subheading: {
    fontSize: D.fontSize.sm,
    color: D.colors.text.secondary,
    textAlign: 'center',
    marginBottom: D.spacing.xl,
  },
  socialRow: {
    flexDirection: 'row',
    gap: D.spacing.sm,
    marginBottom: D.spacing.lg,
  },
  socialFlex: {
    flex: 1,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.spacing.sm,
    marginBottom: D.spacing.lg,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: D.colors.border.default,
  },
  orText: {
    fontSize: D.fontSize.xs,
    color: D.colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.spacing.sm,
    marginTop: -D.spacing.sm,
    marginBottom: D.spacing.md,
    paddingHorizontal: 2,
  },
  strengthBar: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  strengthSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: D.fontSize.xs,
    fontWeight: D.fontWeight.medium,
    minWidth: 40,
    textAlign: 'right',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.spacing.sm,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: D.radius.sm,
    paddingHorizontal: D.spacing.md,
    paddingVertical: D.spacing.sm,
    marginBottom: D.spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: D.fontSize.sm,
    color: D.colors.text.error,
    lineHeight: 18,
  },
  primaryButton: {
    height: 54,
    borderRadius: D.radius.md,
    backgroundColor: D.colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: D.spacing.sm,
    marginBottom: D.spacing.sm,
    outlineWidth: 0,
    ...D.shadow.glow,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonPressed: {
    opacity: 0.88,
    backgroundColor: D.colors.accent.secondary,
  },
  primaryButtonText: {
    fontSize: D.fontSize.base,
    fontWeight: D.fontWeight.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: D.spacing.sm,
  },
  footerText: {
    fontSize: D.fontSize.sm,
    color: D.colors.text.muted,
  },
  footerLink: {
    fontSize: D.fontSize.sm,
    color: D.colors.accent.secondary,
    fontWeight: D.fontWeight.semibold,
    outlineWidth: 0,
  },
});
