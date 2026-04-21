import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipSelector } from '@/components/ui/ChipSelector';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { RgbColorPicker } from '@/components/ui/RgbColorPicker';
import { SetupShell } from '@/components/ui/SetupShell';
import { StepProgress } from '@/components/ui/StepProgress';
import { D } from '@/constants/design';
import { type Currency, type GenerationLanguage, useSetup } from '@/context/setup';
import { useTheme } from '@/context/theme';
import { type BrandColor } from '@/utils/api';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'RON', label: 'RON (lei)' },
];

const GENERATION_LANGUAGE_OPTIONS = [
  { value: 'EN', label: 'English' },
  { value: 'RO', label: 'Română' },
];

export default function Step1Screen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, updateStep1 } = useSetup();

  const [brandName, setBrandName] = useState(data.brandName);
  const [slogan, setSlogan] = useState(data.slogan);
  const [brandColors, setBrandColors] = useState<BrandColor[]>(data.brandColors);
  const [logoUri, setLogoUri] = useState<string | null>(data.logoUri);
  const [currency, setCurrency] = useState<Currency>(data.currency);
  const [generationLanguage, setGenerationLanguage] = useState<GenerationLanguage>(
    data.generationLanguage
  );
  const [brandNameError, setBrandNameError] = useState<string | null>(null);

  const totalPct = brandColors.reduce((sum, c) => sum + c.percentage, 0);
  const canProceed = brandName.trim().length > 0 && brandColors.length > 0 && totalPct === 100;

  function addColor() {
    setBrandColors((prev) => [...prev, { hex: '#6366F1', percentage: 0 }]);
  }

  function removeColor(index: number) {
    setBrandColors((prev) => prev.filter((_, i) => i !== index));
  }

  function updateColor(index: number, patch: Partial<BrandColor>) {
    setBrandColors((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.base64
        ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;
      setLogoUri(uri);
    }
  }

  function handleNext() {
    if (!brandName.trim()) {
      setBrandNameError('Brand name is required');
      return;
    }
    updateStep1({
      brandName: brandName.trim(),
      slogan,
      brandColors,
      logoUri,
      currency,
      generationLanguage,
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.navigate('/(setup)/step2');
  }

  return (
    <SetupShell>
      <StepProgress
        currentStep={1}
        stepLabels={['Visual Identity', 'Business DNA', 'Contact & Social']}
      />

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{"Your Brand's Look"}</Text>
        <Text style={styles.subtitle}>These details shape every ad we generate for you.</Text>
      </View>

      <FloatingInput
        label="Brand Name"
        value={brandName}
        onChangeText={(v) => {
          setBrandName(v);
          if (v.trim()) setBrandNameError(null);
        }}
        error={brandNameError}
        accessibilityLabel="Brand name"
        autoCapitalize="words"
      />

      <FloatingInput
        label="Slogan / Motto (optional)"
        value={slogan}
        onChangeText={setSlogan}
        accessibilityLabel="Brand slogan"
        autoCapitalize="sentences"
      />

      {/* Logo upload */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Logo</Text>
        <Pressable
          onPress={pickLogo}
          style={[styles.logoButton, logoUri ? styles.logoButtonFilled : null]}
          accessibilityRole="button"
          accessibilityLabel="Upload logo"
        >
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoPreview} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoIcon}>↑</Text>
              <Text style={styles.logoLabel}>Upload Logo</Text>
              <Text style={styles.logoHint}>PNG, JPG · recommended 512×512</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Brand Colors */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Brand Colors</Text>

        {brandColors.map((color, index) => (
          <View key={index} style={styles.colorRow}>
            <View style={styles.colorPickerWrapper}>
              <RgbColorPicker
                label={`Color ${index + 1}`}
                value={color.hex}
                onChange={(hex) => updateColor(index, { hex })}
              />
            </View>
            <View style={styles.pctInputWrapper}>
              <FloatingInput
                label="%"
                value={String(color.percentage)}
                onChangeText={(v) => {
                  const n = parseInt(v, 10);
                  updateColor(index, { percentage: isNaN(n) ? 0 : Math.min(100, Math.max(0, n)) });
                }}
                keyboardType="numeric"
                accessibilityLabel={`Percentage for color ${index + 1}`}
              />
            </View>
            {brandColors.length > 1 && (
              <Pressable
                onPress={() => removeColor(index)}
                style={styles.removeColorButton}
                accessibilityRole="button"
                accessibilityLabel={`Remove color ${index + 1}`}
              >
                <Ionicons name="trash-outline" size={18} color={colors.text.muted} />
              </Pressable>
            )}
          </View>
        ))}

        <Text style={[styles.totalIndicator, totalPct !== 100 && styles.totalIndicatorError]}>
          Total: {totalPct}% / 100%
        </Text>

        {brandColors.length < 5 && (
          <Pressable
            onPress={addColor}
            style={styles.addColorButton}
            accessibilityRole="button"
            accessibilityLabel="Add a brand color"
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.accent.primary} />
            <Text style={styles.addColorText}>Add color</Text>
          </Pressable>
        )}
      </View>

      {/* Default currency */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Default Currency</Text>
        <ChipSelector
          options={CURRENCY_OPTIONS}
          selected={currency}
          onSelect={(v) => setCurrency((v || 'USD') as Currency)}
          accessibilityLabel="Default currency"
        />
      </View>

      {/* Generation language */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Language of Generated Ads & Catalogs</Text>
        <ChipSelector
          options={GENERATION_LANGUAGE_OPTIONS}
          selected={generationLanguage}
          onSelect={(v) => setGenerationLanguage((v || 'EN') as GenerationLanguage)}
          accessibilityLabel="Language of generated content"
        />
      </View>

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
    logoButton: {
      height: 90,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      width: '100%',
    },
    logoButtonFilled: {
      borderStyle: 'solid',
      borderColor: colors.accent.primary,
    },
    logoPreview: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
    },
    logoPlaceholder: {
      alignItems: 'center',
      gap: 2,
    },
    logoIcon: {
      fontSize: D.fontSize.lg,
      color: colors.text.muted,
      marginBottom: 2,
    },
    logoLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    logoHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    colorRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: D.spacing.sm,
      marginBottom: D.spacing.sm,
    },
    colorPickerWrapper: {
      flex: 1,
    },
    pctInputWrapper: {
      width: 72,
    },
    removeColorButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: D.spacing.sm,
    },
    totalIndicator: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      textAlign: 'right',
      marginBottom: D.spacing.xs,
    },
    totalIndicatorError: {
      color: colors.text.error,
    },
    addColorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingVertical: D.spacing.xs,
    },
    addColorText: {
      fontSize: D.fontSize.sm,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.medium,
    },
    nextButton: {
      marginTop: D.spacing.sm,
      height: 52,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
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
