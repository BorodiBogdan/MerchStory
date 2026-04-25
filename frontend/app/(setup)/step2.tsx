import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipSelector } from '@/components/ui/ChipSelector';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { SetupShell } from '@/components/ui/SetupShell';
import { StepProgress } from '@/components/ui/StepProgress';
import { D } from '@/constants/design';
import { useSetup } from '@/context/setup';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

export default function Step2Screen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, updateStep2 } = useSetup();
  const t = useT();
  const STEP_LABELS = [
    t('setup.stepLabel.visual'),
    t('setup.stepLabel.business'),
    t('setup.stepLabel.contact'),
  ];
  const DOMAIN_OPTIONS = [
    { value: 'Market', label: t('setup.step2.domainMarket') },
    { value: 'Food', label: t('setup.step2.domainFood') },
    { value: 'Retail', label: t('setup.step2.domainRetail') },
    { value: 'Fashion', label: t('setup.step2.domainFashion') },
    { value: 'Other', label: t('setup.step2.domainOther') },
  ];
  const SHOP_TYPE_OPTIONS = [
    { value: 'Luxury', label: t('setup.step2.shopTypeLuxury') },
    { value: 'MidRange', label: t('setup.step2.shopTypeMidRange') },
    { value: 'Budget', label: t('setup.step2.shopTypeBudget') },
  ];
  const COUNTRY_OPTIONS = [
    { value: 'RO', label: t('setup.step2.countryRO') },
    { value: 'MD', label: t('setup.step2.countryMD') },
    { value: 'HU', label: t('setup.step2.countryHU') },
    { value: 'BG', label: t('setup.step2.countryBG') },
    { value: 'Other', label: t('setup.step2.countryOther') },
  ];
  const KNOWN_COUNTRY_CODES = ['RO', 'MD', 'HU', 'BG'];

  const [domain, setDomain] = useState(data.businessDomain);
  const [otherDomain, setOtherDomain] = useState(data.otherDomain);
  const [audience, setAudience] = useState(data.targetAudience);
  const [shopType, setShopType] = useState(data.shopType);
  const [competitors, setCompetitors] = useState(data.competitors);
  const [city, setCity] = useState(data.city);
  const initialCountry = data.countryCode || 'RO';
  const [countryChip, setCountryChip] = useState(
    KNOWN_COUNTRY_CODES.includes(initialCountry) ? initialCountry : 'Other'
  );
  const [otherCountry, setOtherCountry] = useState(
    KNOWN_COUNTRY_CODES.includes(initialCountry) ? '' : initialCountry
  );

  const canProceed = domain.length > 0 && (domain !== 'Other' || otherDomain.trim().length > 0);

  function resolveCountryCode(): string {
    if (countryChip === 'Other') {
      const code = otherCountry.trim().toUpperCase().slice(0, 2);
      return code.length === 2 ? code : 'RO';
    }
    return countryChip;
  }

  function handleNext() {
    updateStep2({
      businessDomain: domain,
      otherDomain,
      targetAudience: audience,
      shopType,
      competitors,
      city: city.trim(),
      countryCode: resolveCountryCode(),
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.navigate('/(setup)/step3');
  }

  return (
    <SetupShell>
      <StepProgress currentStep={2} stepLabels={STEP_LABELS} />

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{t('setup.step2.title')}</Text>
        <Text style={styles.subtitle}>{t('setup.step2.subtitle')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('setup.step2.domain')}</Text>
        <ChipSelector
          options={DOMAIN_OPTIONS}
          selected={domain}
          onSelect={setDomain}
          accessibilityLabel={t('setup.step2.domain')}
        />
        {domain === 'Other' && (
          <View style={styles.otherInput}>
            <FloatingInput
              label={t('setup.step2.otherDomain')}
              value={otherDomain}
              onChangeText={setOtherDomain}
              accessibilityLabel="Specify your business domain"
              autoCapitalize="sentences"
            />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('setup.step2.shopType')}</Text>
        <ChipSelector
          options={SHOP_TYPE_OPTIONS}
          selected={shopType}
          onSelect={setShopType}
          accessibilityLabel={t('setup.step2.shopType')}
          deselectable
        />
      </View>

      <FloatingInput
        label={t('setup.step2.audience')}
        value={audience}
        onChangeText={setAudience}
        accessibilityLabel={t('setup.step2.audience')}
        accessibilityHint={t('setup.step2.audienceHint')}
        autoCapitalize="sentences"
      />

      <FloatingInput
        label={t('setup.step2.competitors')}
        value={competitors}
        onChangeText={setCompetitors}
        accessibilityLabel={t('setup.step2.competitors')}
        accessibilityHint={t('setup.step2.competitorsHint')}
        autoCapitalize="words"
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('setup.step2.location')}</Text>
        <Text style={styles.locationHint}>{t('setup.step2.locationHint')}</Text>
        <FloatingInput
          label={t('setup.step2.city')}
          value={city}
          onChangeText={setCity}
          accessibilityLabel={t('setup.step2.city')}
          accessibilityHint={t('setup.step2.cityHint')}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('setup.step2.country')}</Text>
        <ChipSelector
          options={COUNTRY_OPTIONS}
          selected={countryChip}
          onSelect={setCountryChip}
          accessibilityLabel={t('setup.step2.country')}
        />
        {countryChip === 'Other' && (
          <View style={styles.otherInput}>
            <FloatingInput
              label={t('setup.step2.otherCountry')}
              value={otherCountry}
              onChangeText={(v) => setOtherCountry(v.toUpperCase().slice(0, 2))}
              accessibilityLabel={t('setup.step2.otherCountry')}
              autoCapitalize="characters"
            />
          </View>
        )}
      </View>

      <View style={styles.buttons}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.backButtonText}>{t('common.backButton')}</Text>
        </Pressable>
        <Pressable
          onPress={handleNext}
          disabled={!canProceed}
          style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('common.nextStep')}
          accessibilityState={{ disabled: !canProceed }}
        >
          <Text style={[styles.nextButtonText, !canProceed && styles.nextButtonTextDisabled]}>
            {t('common.nextStep')}
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
    locationHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginBottom: D.spacing.sm,
      lineHeight: 16,
    },
    otherInput: {
      marginTop: D.spacing.sm,
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
    nextButton: {
      height: 50,
      flex: 2,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...D.shadow.glow,
    },
    nextButtonDisabled: {
      backgroundColor: colors.bg.elevated,
      shadowOpacity: 0,
      elevation: 0,
    },
    nextButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    nextButtonTextDisabled: {
      color: colors.text.muted,
    },
  });
}
