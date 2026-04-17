import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { addReferenceImage } from '@/utils/api';

const isWeb = Platform.OS === 'web';

export default function AddProductsProfessionalScreen() {
  const { colors } = useTheme();
  const { isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.centerFill}>
        <View style={styles.lockIconCircle}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.text.muted} />
        </View>
        <Text style={styles.deniedTitle}>Admins only</Text>
        <Text style={styles.deniedBody}>You do not have access to this page.</Text>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  async function uriToBase64(uri: string): Promise<string> {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
        reader.readAsDataURL(blob);
      });
    }
    return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    const b64 = await uriToBase64(asset.uri);
    setImageBase64(b64);
  }

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!imageBase64) {
      setError('Please select an image.');
      return;
    }
    setIsSaving(true);
    try {
      await addReferenceImage({
        name: name.trim(),
        category: category.trim() || null,
        imageBase64,
      });
      setSuccessCount((c) => c + 1);
      setLastAddedName(name.trim());
      setName('');
      setCategory('');
      setImageUri(null);
      setImageBase64(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add reference image.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + D.spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconButton}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.title}>Add Professional Photo</Text>
          <View style={styles.iconButton} />
        </View>

        <Text style={styles.subtitle}>
          These photos become the reference library for similarity search.
        </Text>

        {successCount > 0 && lastAddedName && (
          <View style={styles.successBanner}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.accent.primary}
              style={{ marginRight: D.spacing.xs }}
            />
            <Text style={styles.successText}>
              Added “{lastAddedName}”. Total this session: {successCount}.
            </Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.imagePicker, pressed && { opacity: 0.8 }]}
          onPress={() => void pickImage()}
          accessibilityRole="button"
          accessibilityLabel="Pick reference photo"
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={36} color={colors.text.muted} />
              <Text style={styles.imagePlaceholderText}>Tap to choose photo</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Minimalist Coffee Mug — White"
            placeholderTextColor={colors.text.muted}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Category (optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. mug, bottle, shoe"
            placeholderTextColor={colors.text.muted}
            value={category}
            onChangeText={setCategory}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            isSaving && { opacity: 0.7 },
            pressed && !isSaving && { opacity: 0.85 },
          ]}
          onPress={() => void submit()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Add to library</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    scrollContent: {
      padding: D.spacing.md,
      maxWidth: isWeb ? 560 : undefined,
      width: '100%',
      alignSelf: 'center',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: D.spacing.sm,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: D.fontSize.xl,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginBottom: D.spacing.lg,
    },
    successBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.md,
      paddingVertical: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      marginBottom: D.spacing.md,
    },
    successText: {
      fontSize: D.fontSize.sm,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.medium,
      flex: 1,
    },
    imagePicker: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      marginBottom: D.spacing.md,
    },
    imagePreview: {
      width: '100%',
      height: '100%',
    },
    imagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
    },
    imagePlaceholderText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    fieldGroup: {
      marginBottom: D.spacing.md,
    },
    fieldLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
      marginBottom: D.spacing.xs,
    },
    textInput: {
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 12,
      fontSize: D.fontSize.base,
      color: colors.text.primary,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.error,
      marginBottom: D.spacing.sm,
    },
    saveButton: {
      paddingVertical: 14,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      marginTop: D.spacing.sm,
      ...D.shadow.glow,
    },
    saveButtonText: {
      color: '#fff',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
    },
    centerFill: {
      flex: 1,
      backgroundColor: colors.bg.base,
      alignItems: 'center',
      justifyContent: 'center',
      padding: D.spacing.xl,
    },
    lockIconCircle: {
      width: 88,
      height: 88,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
    },
    deniedTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    deniedBody: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: D.spacing.lg,
    },
    backButton: {
      paddingVertical: 11,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    backButtonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
  });
}
