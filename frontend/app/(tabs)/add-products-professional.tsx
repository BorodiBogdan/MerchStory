import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
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

import { CategoryPathPicker } from '@/components/ui/CategoryPathPicker';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  addReferenceImage,
  fetchReferenceCategories,
  importReferenceZip,
  type ImportReferenceZipResult,
  type ReferenceCategoryNode,
} from '@/utils/api';

const isWeb = Platform.OS === 'web';

export default function AddProductsProfessionalScreen() {
  const { colors } = useTheme();
  const { isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const t = useT();

  const [name, setName] = useState('');
  const [categoryPath, setCategoryPath] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [categoryTree, setCategoryTree] = useState<ReferenceCategoryNode[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [zipUploading, setZipUploading] = useState(false);
  const [zipResult, setZipResult] = useState<ImportReferenceZipResult | null>(null);
  const [pendingZipFile, setPendingZipFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setIsLoadingCategories(true);
    fetchReferenceCategories()
      .then((tree) => {
        if (active) setCategoryTree(tree);
      })
      .catch(() => {
        // Picker just shows an empty tree + the user can still type new ones.
      })
      .finally(() => {
        if (active) setIsLoadingCategories(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, successCount]);

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
        <Text style={styles.deniedTitle}>{t('addProfessional.adminOnly.title')}</Text>
        <Text style={styles.deniedBody}>{t('addProfessional.adminOnly.body')}</Text>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          onPress={() => router.replace('/admin')}
        >
          <Text style={styles.backButtonText}>{t('addProfessional.adminOnly.back')}</Text>
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

  function openZipPicker() {
    fileInputRef.current?.click();
  }

  function handleZipChange(e: { target: { files: FileList | null; value: string } }) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingZipFile(file);
    setZipResult(null);
    setError(null);
    e.target.value = '';
  }

  function clearPendingZip() {
    setPendingZipFile(null);
    setZipResult(null);
  }

  async function submitZip() {
    if (!pendingZipFile) return;
    setError(null);
    setZipUploading(true);
    try {
      const result = await importReferenceZip(pendingZipFile);
      setZipResult(result);
      setSuccessCount((c) => c + result.imported);
      setPendingZipFile(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('addProfessional.errors.zipFailed'));
    } finally {
      setZipUploading(false);
    }
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
      setError(t('addProfessional.errors.nameRequired'));
      return;
    }
    if (!imageBase64) {
      setError(t('addProfessional.errors.imageRequired'));
      return;
    }
    setIsSaving(true);
    try {
      await addReferenceImage({
        name: name.trim(),
        categoryPath: categoryPath.trim() || null,
        imageBase64,
      });
      setSuccessCount((c) => c + 1);
      setLastAddedName(name.trim());
      setName('');
      setCategoryPath('');
      setImageUri(null);
      setImageBase64(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('addProfessional.errors.addFailed'));
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
            onPress={() => router.replace('/admin')}
            style={styles.iconButton}
            accessibilityLabel={t('addProfessional.a11y.back')}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.title}>{t('addProfessional.title')}</Text>
          <View style={styles.iconButton} />
        </View>

        <Text style={styles.subtitle}>{t('addProfessional.subtitle')}</Text>

        {successCount > 0 && lastAddedName && (
          <View style={styles.successBanner}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.accent.primary}
              style={{ marginRight: D.spacing.xs }}
            />
            <Text style={styles.successText}>
              {t('addProfessional.success')
                .replace('{name}', lastAddedName)
                .replace('{count}', String(successCount))}
            </Text>
          </View>
        )}

        {isWeb && (
          <View style={styles.zipSection}>
            <Text style={styles.zipTitle}>{t('addProfessional.zip.title')}</Text>
            <Text style={styles.zipSubtitle}>
              {t('addProfessional.zip.subtitle')
                .split('{pattern}')
                .flatMap((part, i) =>
                  i === 0
                    ? [part]
                    : [
                        <Text key={i} style={styles.zipMono}>
                          {t('addProfessional.zip.pattern')}
                        </Text>,
                        part,
                      ]
                )}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.zipChooseBtn,
                zipUploading && { opacity: 0.6 },
                pressed && !zipUploading && { opacity: 0.85 },
              ]}
              onPress={openZipPicker}
              disabled={zipUploading}
            >
              <Ionicons
                name="folder-open-outline"
                size={18}
                color={colors.accent.primary}
                style={{ marginRight: D.spacing.xs }}
              />
              <Text style={styles.zipChooseBtnText}>{t('addProfessional.zip.choose')}</Text>
            </Pressable>
            {pendingZipFile && (
              <View style={styles.zipFileRow}>
                <Ionicons
                  name="document-attach-outline"
                  size={18}
                  color={colors.text.secondary}
                  style={{ marginRight: D.spacing.xs }}
                />
                <Text style={styles.zipFileNameText} numberOfLines={1}>
                  {pendingZipFile.name} · {(pendingZipFile.size / (1024 * 1024)).toFixed(1)} MB
                </Text>
                <Pressable
                  onPress={clearPendingZip}
                  hitSlop={8}
                  disabled={zipUploading}
                  accessibilityLabel="Remove selected zip"
                >
                  <Ionicons name="close-circle" size={18} color={colors.text.muted} />
                </Pressable>
              </View>
            )}
            {pendingZipFile && (
              <Pressable
                style={({ pressed }) => [
                  styles.zipSubmitBtn,
                  zipUploading && { opacity: 0.6 },
                  pressed && !zipUploading && { opacity: 0.85 },
                ]}
                onPress={() => void submitZip()}
                disabled={zipUploading}
              >
                {zipUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name="cloud-upload-outline"
                      size={18}
                      color="#fff"
                      style={{ marginRight: D.spacing.xs }}
                    />
                    <Text style={styles.zipSubmitBtnText}>{t('addProfessional.submit')}</Text>
                  </>
                )}
              </Pressable>
            )}
            {zipResult && (
              <View style={styles.zipResultBox}>
                <Text style={styles.zipResultText}>
                  {t('addProfessional.zip.result')
                    .replace('{imported}', String(zipResult.imported))
                    .replace('{skipped}', String(zipResult.skipped))
                    .replace('{failed}', String(zipResult.failed))}
                </Text>
                {zipResult.errors.slice(0, 5).map((err, i) => (
                  <Text key={i} style={styles.zipResultError} numberOfLines={2}>
                    • {err}
                  </Text>
                ))}
              </View>
            )}
            {createElement('input', {
              ref: fileInputRef,
              type: 'file',
              accept: '.zip,application/zip,application/x-zip-compressed',
              style: { display: 'none' },
              onChange: handleZipChange,
            })}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.imagePicker, pressed && { opacity: 0.8 }]}
          onPress={() => void pickImage()}
          accessibilityRole="button"
          accessibilityLabel={t('addProfessional.a11y.pickReference')}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={36} color={colors.text.muted} />
              <Text style={styles.imagePlaceholderText}>
                {t('addProfessional.imagePlaceholder')}
              </Text>
            </View>
          )}
        </Pressable>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('addProfessional.nameLabel')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={t('addProfessional.namePlaceholder')}
            placeholderTextColor={colors.text.muted}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('addProfessional.categoryLabel')}</Text>
          <CategoryPathPicker
            categories={categoryTree}
            value={categoryPath}
            onChange={setCategoryPath}
            isLoading={isLoadingCategories}
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
            <Text style={styles.saveButtonText}>{t('addProfessional.submit')}</Text>
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
    zipSection: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg,
      padding: D.spacing.md,
      marginBottom: D.spacing.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    zipTitle: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    zipSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginBottom: D.spacing.md,
      lineHeight: 18,
    },
    zipMono: {
      fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
      color: colors.text.secondary,
    },
    zipChooseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.accent.primary,
      borderRadius: D.radius.pill,
      paddingVertical: 12,
      paddingHorizontal: D.spacing.md,
    },
    zipChooseBtnText: {
      color: colors.accent.primary,
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    zipFileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.input,
      borderRadius: D.radius.md,
      paddingVertical: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      marginTop: D.spacing.sm,
      gap: D.spacing.xs,
    },
    zipFileNameText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
    },
    zipSubmitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.pill,
      paddingVertical: 12,
      paddingHorizontal: D.spacing.md,
      marginTop: D.spacing.sm,
      ...D.shadow.glow,
    },
    zipSubmitBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    zipResultBox: {
      marginTop: D.spacing.md,
      padding: D.spacing.sm,
      backgroundColor: colors.bg.input,
      borderRadius: D.radius.md,
    },
    zipResultText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    zipResultError: {
      fontSize: D.fontSize.xs,
      color: colors.text.error,
      marginTop: 2,
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
