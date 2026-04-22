import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { FloatingInput } from '@/components/ui/FloatingInput';
import { SetupShell } from '@/components/ui/SetupShell';
import { StepProgress } from '@/components/ui/StepProgress';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useSetup } from '@/context/setup';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import { submitShopProfile } from '@/utils/api';

export default function Step3Screen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, updateStep3 } = useSetup();
  const { completeShopSetup } = useAuth();
  const t = useT();
  const STEP_LABELS = [
    t('setup.stepLabel.visual'),
    t('setup.stepLabel.business'),
    t('setup.stepLabel.contact'),
  ];

  const [phoneNumber, setPhoneNumber] = useState(data.phoneNumber);
  const [email, setEmail] = useState(data.email);
  const [addresses, setAddresses] = useState<string[]>(
    data.addresses.length > 0 ? data.addresses : ['']
  );
  const [instagramHandle, setInstagramHandle] = useState(data.instagramHandle);
  const [facebookHandle, setFacebookHandle] = useState(data.facebookHandle);
  const [tikTokHandle, setTikTokHandle] = useState(data.tikTokHandle);

  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasValidAddress = addresses.some((a) => a.trim().length > 0);
  const canSubmit =
    phoneNumber.trim().length > 0 && email.trim().includes('@') && hasValidAddress && !isSubmitting;

  function updateAddress(index: number, value: string) {
    setAddresses((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  function addAddress() {
    setAddresses((prev) => [...prev, '']);
  }

  function removeAddress(index: number) {
    setAddresses((prev) => prev.filter((_, i) => i !== index));
  }

  function handleBack() {
    updateStep3({
      phoneNumber,
      email,
      addresses: addresses.filter((a) => a.trim().length > 0).length > 0 ? addresses : [''],
      instagramHandle,
      facebookHandle,
      tikTokHandle,
    });
    router.back();
  }

  async function handleComplete() {
    let valid = true;
    if (!phoneNumber.trim()) {
      setPhoneError(t('setup.step3.phoneRequired'));
      valid = false;
    }
    if (!email.trim().includes('@')) {
      setEmailError(t('setup.step3.emailInvalid'));
      valid = false;
    }
    if (!valid) return;

    const cleanAddresses = addresses.filter((a) => a.trim().length > 0);
    updateStep3({
      phoneNumber: phoneNumber.trim(),
      email: email.trim(),
      addresses: cleanAddresses,
      instagramHandle,
      facebookHandle,
      tikTokHandle,
    });

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // logoUri is already a data URI (base64) captured at pick time — send directly
      const logoBase64: string | null = data.logoUri ?? null;
      await submitShopProfile({
        brandName: data.brandName,
        logoBase64,
        brandColors: data.brandColors,
        slogan: data.slogan || null,
        businessDomain: data.businessDomain,
        otherDomain: data.otherDomain || null,
        targetAudience: data.targetAudience || null,
        shopType: data.shopType || null,
        competitors: data.competitors || null,
        phoneNumber: phoneNumber.trim(),
        email: email.trim(),
        addresses: cleanAddresses,
        instagramHandle: instagramHandle.trim() || null,
        facebookHandle: facebookHandle.trim() || null,
        tikTokHandle: tikTokHandle.trim() || null,
        currency: data.currency,
        generationLanguage: data.generationLanguage,
      });
      await completeShopSetup();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace('/(tabs)');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('setup.step3.failed'));
      setIsSubmitting(false);
    }
  }

  return (
    <SetupShell>
      <StepProgress currentStep={3} stepLabels={STEP_LABELS} />

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{t('setup.step3.title')}</Text>
        <Text style={styles.subtitle}>{t('setup.step3.subtitle')}</Text>
      </View>

      <FloatingInput
        label={t('setup.step3.phone')}
        value={phoneNumber}
        onChangeText={(v) => {
          setPhoneNumber(v);
          if (v.trim()) setPhoneError(null);
        }}
        error={phoneError}
        keyboardType="phone-pad"
        leftIcon="call-outline"
        accessibilityLabel="Phone number"
        autoCapitalize="none"
      />

      <FloatingInput
        label={t('setup.step3.email')}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (v.includes('@')) setEmailError(null);
        }}
        error={emailError}
        keyboardType="email-address"
        leftIcon="mail-outline"
        autoCapitalize="none"
        accessibilityLabel="Business email"
      />

      {/* Addresses */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {addresses.length > 1 ? t('setup.step3.addressesPlural') : t('setup.step3.address')}
        </Text>
        {addresses.map((addr, index) => (
          <View key={index} style={styles.addressRow}>
            <View style={styles.addressInput}>
              <FloatingInput
                label={
                  addresses.length > 1
                    ? `${t('setup.step3.addressNumbered')} ${index + 1}`
                    : t('setup.step3.address')
                }
                value={addr}
                onChangeText={(v) => updateAddress(index, v)}
                accessibilityLabel={`Address ${index + 1}`}
                autoCapitalize="words"
              />
            </View>
            {addresses.length > 1 && (
              <Pressable
                onPress={() => removeAddress(index)}
                style={styles.removeButton}
                accessibilityRole="button"
                accessibilityLabel={`Remove address ${index + 1}`}
              >
                <Ionicons name="trash-outline" size={18} color={colors.text.muted} />
              </Pressable>
            )}
          </View>
        ))}
        <Pressable
          onPress={addAddress}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel={t('setup.step3.addAddress')}
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.accent.primary} />
          <Text style={styles.addButtonText}>{t('setup.step3.addAddress')}</Text>
        </Pressable>
      </View>

      {/* Social media */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {`${t('setup.step3.instagram')} · ${t('setup.step3.facebook')} · ${t('setup.step3.tiktok')}`}
        </Text>
        <FloatingInput
          label={t('setup.step3.instagram')}
          value={instagramHandle}
          onChangeText={setInstagramHandle}
          leftIcon="logo-instagram"
          accessibilityLabel="Instagram handle"
          accessibilityHint="@handle"
          autoCapitalize="none"
        />
        <FloatingInput
          label={t('setup.step3.facebook')}
          value={facebookHandle}
          onChangeText={setFacebookHandle}
          leftIcon="logo-facebook"
          accessibilityLabel="Facebook page"
          accessibilityHint="@page"
          autoCapitalize="none"
        />
        <FloatingInput
          label={t('setup.step3.tiktok')}
          value={tikTokHandle}
          onChangeText={setTikTokHandle}
          leftIcon="logo-tiktok"
          accessibilityLabel="TikTok handle"
          accessibilityHint="@handle"
          autoCapitalize="none"
        />
      </View>

      {submitError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      )}

      <View style={styles.buttons}>
        <Pressable
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.backButtonText}>{t('common.backButton')}</Text>
        </Pressable>
        <Pressable
          onPress={handleComplete}
          disabled={!canSubmit}
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('setup.step3.submit')}
          accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
        >
          <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
            {isSubmitting ? t('setup.step3.submitting') : t('setup.step3.submit')}
          </Text>
        </Pressable>
      </View>
    </SetupShell>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    titleBlock: {
      marginBottom: D.spacing.lg,
    },
    title: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      lineHeight: 20,
    },
    section: {
      marginBottom: D.spacing.md,
    },
    sectionLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: D.spacing.sm,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    addressInput: {
      flex: 1,
    },
    removeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.sm,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingVertical: D.spacing.xs,
    },
    addButtonText: {
      fontSize: D.fontSize.sm,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.medium,
    },
    errorBox: {
      backgroundColor: `${colors.destructive}18`,
      borderRadius: D.radius.sm,
      padding: D.spacing.sm,
      marginBottom: D.spacing.md,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.error,
      textAlign: 'center',
    },
    buttons: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      marginTop: D.spacing.xs,
    },
    backButton: {
      height: 50,
      flex: 1,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    submitButton: {
      height: 50,
      flex: 2,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...D.shadow.glow,
    },
    submitButtonDisabled: {
      backgroundColor: colors.bg.elevated,
      shadowOpacity: 0,
      elevation: 0,
    },
    submitButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
    },
    submitButtonTextDisabled: {
      color: colors.text.muted,
    },
  });
}
