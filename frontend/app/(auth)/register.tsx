import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { AuthShell, makeAuthFormStyles, useAuthPalette, webAttrs } from '@/components/ui/AuthShell';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { SocialButton } from '@/components/ui/SocialButton';
import { useAuth } from '@/context/auth';
import { useT } from '@/i18n';

const STRENGTH_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E'];

function getPasswordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function validate(
  email: string,
  password: string,
  confirmPassword: string,
  t: ReturnType<typeof useT>
) {
  const errors: { email?: string; password?: string; confirm?: string } = {};
  if (!email.trim()) {
    errors.email = t('auth.register.emailRequired');
  } else if (!email.includes('@') || !email.includes('.')) {
    errors.email = t('auth.register.emailInvalid');
  }
  if (!password) {
    errors.password = t('auth.register.passwordRequired');
  } else if (password.length < 6) {
    errors.password = t('auth.register.passwordTooShort');
  }
  if (!confirmPassword) {
    errors.confirm = t('auth.register.confirmRequired');
  } else if (password !== confirmPassword) {
    errors.confirm = t('auth.register.passwordMismatch');
  }
  return errors;
}

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const t = useT();
  const strengthLabels = [
    t('auth.register.strengthWeak'),
    t('auth.register.strengthFair'),
    t('auth.register.strengthGood'),
    t('auth.register.strengthStrong'),
  ];
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
  const P = useAuthPalette();
  const f = useMemo(() => makeAuthFormStyles(P), [P]);

  async function handleRegister() {
    const errors = validate(email, password, confirmPassword, t);
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
      const msg = err instanceof Error ? err.message : t('auth.register.failed');
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
    Alert.alert(t('auth.login.socialComingSoonTitle'), t('auth.login.socialComingSoonBody'));
  }

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && confirmPassword.length > 0 && !loading;

  return (
    <AuthShell ctaLabel={t('auth.register.signInLink')} ctaHref="/(auth)/login">
      {/* Logo mark (wordmark lives in the navbar, avoid duplicate titles here) */}
      <View style={f.logoContainer}>
        <BrandLogo size="lg" variant="mark" />
      </View>

      {/* Heading */}
      <Text style={f.heading}>{t('auth.register.heading')}</Text>
      <Text style={f.subheading}>{t('auth.register.subheading')}</Text>

      {/* Social row */}
      <View style={f.socialRow}>
        <SocialButton
          provider="google"
          onPress={handleSocialPress}
          accessibilityLabel="Sign up with Google"
          style={f.socialBtn}
        />
        <SocialButton
          provider="apple"
          onPress={handleSocialPress}
          accessibilityLabel="Sign up with Apple"
          style={f.socialBtn}
        />
      </View>

      {/* OR divider */}
      <View style={f.orRow}>
        <View style={f.orLine} />
        <Text style={f.orText}>{t('common.or')}</Text>
        <View style={f.orLine} />
      </View>

      {/* Form */}
      <FloatingInput
        key={`email-${emailErrorKey.current}`}
        label={t('auth.register.emailLabel')}
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
        label={t('auth.register.passwordLabel')}
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
        <View style={f.strengthContainer}>
          <View style={f.strengthBar}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  f.strengthSegment,
                  {
                    backgroundColor: i < strength ? STRENGTH_COLORS[strength - 1] : P.hairline,
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[f.strengthLabel, { color: STRENGTH_COLORS[strength - 1] ?? P.muted }]}>
            {strength > 0 ? strengthLabels[strength - 1] : ''}
          </Text>
        </View>
      )}

      <FloatingInput
        key={`confirm-${confirmErrorKey.current}`}
        label={t('auth.register.confirmLabel')}
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
        <View style={f.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={P.dangerText} />
          <Text style={f.errorBannerText}>{apiError}</Text>
        </View>
      )}

      {/* Submit button */}
      <Pressable
        onPress={handleRegister}
        disabled={!canSubmit}
        {...webAttrs({ msBtn: '1' })}
        style={({ pressed }) => [
          f.primaryButton,
          !canSubmit && f.primaryButtonDisabled,
          pressed && canSubmit && f.primaryButtonPressed,
        ]}
        accessibilityLabel={t('auth.register.submit')}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit, busy: loading }}
      >
        <Text style={f.primaryButtonText}>
          {loading ? t('auth.register.submitting') : t('auth.register.submit')}
        </Text>
        {!loading && <Ionicons name="arrow-forward" size={16} color={P.btnPrimaryText} />}
      </Pressable>

      {/* Footer */}
      <View style={f.footer}>
        <Text style={f.footerText}>{t('auth.register.hasAccount')}&nbsp;</Text>
        <Link href="/(auth)/login" asChild>
          <Pressable
            {...webAttrs({ msTap: '1' })}
            accessibilityRole="link"
            accessibilityLabel={t('auth.register.signInLink')}
          >
            <Text style={f.footerLink}>{t('auth.register.signInLink')}</Text>
          </Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}
