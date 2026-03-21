import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { FloatingInput } from '@/components/ui/FloatingInput';
import { RgbColorPicker } from '@/components/ui/RgbColorPicker';
import { SetupShell } from '@/components/ui/SetupShell';
import { StepProgress } from '@/components/ui/StepProgress';
import { D } from '@/constants/design';
import { useSetup } from '@/context/setup';
import { useTheme } from '@/context/theme';

export default function Step1Screen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, updateStep1 } = useSetup();

  const [brandName, setBrandName] = useState(data.brandName);
  const [slogan, setSlogan] = useState(data.slogan);
  const [primaryColor, setPrimaryColor] = useState(data.primaryColor || '#6366F1');
  const [secondaryColor, setSecondaryColor] = useState(data.secondaryColor || '#818CF8');
  const [accentColor, setAccentColor] = useState(data.accentColor || '#A5B4FC');
  const [logoUri, setLogoUri] = useState<string | null>(data.logoUri);
  const [brandNameError, setBrandNameError] = useState<string | null>(null);

  const canProceed = brandName.trim().length > 0;

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setLogoUri(result.assets[0].uri);
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
      primaryColor,
      secondaryColor,
      accentColor,
      logoUri,
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/(setup)/step2');
  }

  return (
    <SetupShell>
      <StepProgress currentStep={1} stepLabels={['Visual Identity', 'Business DNA']} />

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

      {/* RGB colour pickers */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Colour Palette (optional)</Text>
        <RgbColorPicker label="Primary" value={primaryColor} onChange={setPrimaryColor} />
        <RgbColorPicker label="Secondary" value={secondaryColor} onChange={setSecondaryColor} />
        <RgbColorPicker label="Accent" value={accentColor} onChange={setAccentColor} />
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
