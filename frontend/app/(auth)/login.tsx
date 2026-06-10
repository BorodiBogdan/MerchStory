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

function validate(email: string, password: string, t: ReturnType<typeof useT>) {
  const errors: { email?: string; password?: string } = {};
  if (!email.trim()) {
    errors.email = t('auth.login.emailRequired');
  } else if (!email.includes('@') || !email.includes('.')) {
    errors.email = t('auth.login.emailInvalid');
  }
  if (!password) {
    errors.password = t('auth.login.passwordRequired');
  }
  return errors;
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const emailErrorKey = useRef(0);
  const passwordErrorKey = useRef(0);

  const P = useAuthPalette();
  const f = useMemo(() => makeAuthFormStyles(P), [P]);

  async function handleLogin() {
    const errors = validate(email, password, t);
    if (Object.keys(errors).length > 0) {
      // Bump keys to re-trigger shake on each attempt
      if (errors.email) emailErrorKey.current += 1;
      if (errors.password) passwordErrorKey.current += 1;
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setApiError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.login.failed');
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
  }

  function handleSocialPress() {
    Alert.alert(t('auth.login.socialComingSoonTitle'), t('auth.login.socialComingSoonBody'));
  }

  function handleForgotPassword() {
    Alert.alert(t('auth.login.forgotTitle'), t('auth.login.forgotBody'));
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <AuthShell ctaLabel={t('auth.login.createLink')} ctaHref="/(auth)/register">
      {/* Logo mark (wordmark lives in the navbar, avoid duplicate titles here) */}
      <View style={f.logoContainer}>
        <BrandLogo size="lg" variant="mark" />
      </View>

      {/* Heading */}
      <Text style={f.heading}>{t('auth.login.heading')}</Text>
      <Text style={f.subheading}>{t('auth.login.subheading')}</Text>

      {/* Social row */}
      <View style={f.socialRow}>
        <SocialButton
          provider="google"
          onPress={handleSocialPress}
          accessibilityLabel="Continue with Google"
          style={f.socialBtn}
        />
        <SocialButton
          provider="apple"
          onPress={handleSocialPress}
          accessibilityLabel="Continue with Apple"
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
        label={t('auth.login.emailLabel')}
        value={email}
        onChangeText={handleEmailChange}
        error={fieldErrors.email}
        leftIcon="mail-outline"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
        returnKeyType="next"
        accessibilityLabel="Email address input"
        accessibilityHint="Enter your registered email address"
      />

      <FloatingInput
        key={`password-${passwordErrorKey.current}`}
        label={t('auth.login.passwordLabel')}
        value={password}
        onChangeText={handlePasswordChange}
        error={fieldErrors.password}
        leftIcon="lock-closed-outline"
        secureEntry
        editable={!loading}
        returnKeyType="done"
        onSubmitEditing={handleLogin}
        accessibilityLabel="Password input"
        accessibilityHint="Enter your account password"
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
        onPress={handleLogin}
        disabled={!canSubmit}
        {...webAttrs({ msBtn: '1' })}
        style={({ pressed }) => [
          f.primaryButton,
          !canSubmit && f.primaryButtonDisabled,
          pressed && canSubmit && f.primaryButtonPressed,
        ]}
        accessibilityLabel={t('auth.login.submit')}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit, busy: loading }}
      >
        <Text style={f.primaryButtonText}>
          {loading ? t('auth.login.submitting') : t('auth.login.submit')}
        </Text>
        {!loading && <Ionicons name="arrow-forward" size={16} color={P.btnPrimaryText} />}
      </Pressable>

      {/* Forgot password */}
      <Pressable
        onPress={handleForgotPassword}
        {...webAttrs({ msTap: '1' })}
        style={f.forgotButton}
        accessibilityRole="button"
        accessibilityLabel={t('auth.login.forgotLink')}
      >
        <Text style={f.forgotText}>{t('auth.login.forgotLink')}</Text>
      </Pressable>

      {/* Footer */}
      <View style={f.footer}>
        <Text style={f.footerText}>{t('auth.login.noAccount')}&nbsp;</Text>
        <Link href="/(auth)/register" asChild>
          <Pressable
            {...webAttrs({ msTap: '1' })}
            accessibilityRole="link"
            accessibilityLabel={t('auth.register.submit')}
          >
            <Text style={f.footerLink}>{t('auth.register.submit')}</Text>
          </Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}
