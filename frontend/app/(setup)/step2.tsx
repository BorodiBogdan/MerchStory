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

const STEP_LABELS = ['Visual Identity', 'Business DNA', 'Contact & Social'];

const DOMAIN_OPTIONS = [
  { value: 'Fashion', label: 'Fashion' },
  { value: 'Tech', label: 'Tech' },
  { value: 'Food', label: 'Food' },
  { value: 'Beauty', label: 'Beauty' },
  { value: 'Other', label: 'Other' },
];

const ATMOSPHERE_OPTIONS = [
  { value: 'Urban', label: 'Urban' },
  { value: 'Nature', label: 'Nature' },
  { value: 'MinimalInterior', label: 'Minimal Interior' },
  { value: 'ProfessionalStudio', label: 'Studio' },
];

const SHOP_TYPE_OPTIONS = [
  { value: 'Luxury', label: 'Luxury' },
  { value: 'DiscountOutlet', label: 'Discount / Outlet' },
  { value: 'ArtisanalHandmade', label: 'Artisanal / Handmade' },
];

export default function Step2Screen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, updateStep2 } = useSetup();

  const [domain, setDomain] = useState(data.businessDomain);
  const [audience, setAudience] = useState(data.targetAudience);
  const [atmosphere, setAtmosphere] = useState(data.atmosphere);
  const [shopType, setShopType] = useState(data.shopType);
  const [competitors, setCompetitors] = useState(data.competitors);

  const [audienceError, setAudienceError] = useState<string | null>(null);

  const canProceed = domain.length > 0 && audience.trim().length > 0 && shopType.length > 0;

  function handleNext() {
    if (!audience.trim()) {
      setAudienceError('Please describe your target audience');
      return;
    }
    updateStep2({
      businessDomain: domain,
      targetAudience: audience,
      atmosphere,
      shopType,
      competitors,
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
        <Text style={styles.title}>Your Business DNA</Text>
        <Text style={styles.subtitle}>
          Helps our AI choose the right scenes and mood for your ads.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Business Domain</Text>
        <ChipSelector
          options={DOMAIN_OPTIONS}
          selected={domain}
          onSelect={setDomain}
          accessibilityLabel="Select your business domain"
        />
      </View>

      <FloatingInput
        label="Target Audience"
        value={audience}
        onChangeText={(v) => {
          setAudience(v);
          if (v.trim()) setAudienceError(null);
        }}
        error={audienceError}
        accessibilityLabel="Target audience"
        accessibilityHint="e.g. Women 25-40 interested in wellness"
        autoCapitalize="sentences"
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Atmosphere (optional)</Text>
        <ChipSelector
          options={ATMOSPHERE_OPTIONS}
          selected={atmosphere}
          onSelect={setAtmosphere}
          accessibilityLabel="Select location atmosphere"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Shop Type</Text>
        <ChipSelector
          options={SHOP_TYPE_OPTIONS}
          selected={shopType}
          onSelect={setShopType}
          accessibilityLabel="Select shop type"
        />
      </View>

      <FloatingInput
        label="Competitors (optional)"
        value={competitors}
        onChangeText={setCompetitors}
        accessibilityLabel="Competitors"
        accessibilityHint="Brand names similar to yours"
        autoCapitalize="words"
      />

      <View style={styles.buttons}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Pressable
          onPress={handleNext}
          disabled={!canProceed}
          style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Next step"
          accessibilityState={{ disabled: !canProceed }}
        >
          <Text style={[styles.nextButtonText, !canProceed && styles.nextButtonTextDisabled]}>
            Next step →
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
