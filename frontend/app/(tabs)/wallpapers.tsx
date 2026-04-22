import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GalleryImage } from '@/components/ui/GalleryImage';
import { KeepImageModal } from '@/components/ui/KeepImageModal';
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  deleteGalleryItem,
  fetchGallery,
  type GalleryItem,
  type GenerateImageResponse,
  generateWallpaper,
  saveToGallery,
} from '@/utils/api';
import * as galleryCache from '@/utils/galleryCache';
import * as galleryImageCache from '@/utils/galleryImageCache';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1600;
const WEB_H_PADDING = 32;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.sm;

type GenerateStage = 'input' | 'result';

const FORMAT_OPTIONS = [
  { value: '9:16', label: 'Vertical' },
  { value: '1:1', label: 'Square' },
  { value: '16:9', label: 'Landscape' },
];

const BRAND_CONTEXT_OPTIONS = [
  { key: 'brandName', label: 'Brand Name' },
  { key: 'slogan', label: 'Slogan' },
  { key: 'brandColors', label: 'Brand Colors' },
  { key: 'businessDomain', label: 'Business Domain' },
  { key: 'shopType', label: 'Shop Type' },
  { key: 'targetAudience', label: 'Target Audience' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'email', label: 'Email' },
  { key: 'addresses', label: 'Address' },
  { key: 'instagramHandle', label: 'Instagram' },
  { key: 'facebookHandle', label: 'Facebook' },
  { key: 'tikTokHandle', label: 'TikTok' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function downloadImage(result: GenerateImageResponse, filename: string) {
  if (Platform.OS !== 'web') return;
  const ext = result.mimeType.split('/')[1] ?? 'png';
  const a = document.createElement('a');
  a.href = `data:${result.mimeType};base64,${result.imageBase64}`;
  a.download = `${filename}.${ext}`;
  a.click();
}

export default function WallpapersScreen() {
  const { colors } = useTheme();
  const t = useT();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Generate sheet state
  const [generateSheetVisible, setGenerateSheetVisible] = useState(false);
  const [generateStage, setGenerateStage] = useState<GenerateStage>('input');
  // Input stage
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState('9:16');
  const [includeLogo, setIncludeLogo] = useState(false);
  const [brandContextFields, setBrandContextFields] = useState<string[]>([]);
  // Generation
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Result stage
  const [generatedResult, setGeneratedResult] = useState<GenerateImageResponse | null>(null);
  const [isKept, setIsKept] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const [keepModalVisible, setKeepModalVisible] = useState(false);

  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  const numColumns = isWeb
    ? screenWidth < 600
      ? 2
      : screenWidth < 1024
        ? 3
        : screenWidth < 1500
          ? 4
          : 5
    : 2;
  const hPadding = isWeb ? WEB_H_PADDING : MOBILE_H_PADDING;
  const effectiveWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH) - hPadding * 2;
  const cardWidth = (effectiveWidth - GAP * (numColumns - 1)) / numColumns;

  const loadWallpapers = useCallback(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    fetchGallery({ types: ['wallpaper'], pageSize: 100 })
      .then((res) => {
        if (active) setItems(res.items);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load wallpapers.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadWallpapers);

  async function handleDelete(id: string) {
    if (lightboxItem?.id === id) setLightboxItem(null);
    setItems((prev) => prev.filter((item) => item.id !== id));
    galleryCache.removeItem(id);
    galleryImageCache.evict(id);
    try {
      await deleteGalleryItem(id);
    } catch {
      fetchGallery({ types: ['wallpaper'], pageSize: 100 })
        .then((res) => setItems(res.items))
        .catch(() => {});
    }
  }

  function toggleBrandField(key: string) {
    setBrandContextFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateWallpaper({
        prompt: promptRef.current.trim(),
        format,
        includeLogo,
        brandContextFields,
      });
      setGeneratedResult(result);
      setIsKept(false);
      setKeepError(null);
      setGenerateStage('result');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  function handleKeep() {
    if (!generatedResult || isKept) return;
    setKeepError(null);
    // Close the generate sheet before opening the Keep modal — react-native-web
    // doesn't reliably stack simultaneous Modals.
    setGenerateSheetVisible(false);
    setKeepModalVisible(true);
  }

  async function handleConfirmKeep(name: string) {
    if (!generatedResult) return;
    const saved = await saveToGallery(
      generatedResult.imageBase64,
      generatedResult.mimeType,
      'wallpaper',
      name
    );
    galleryImageCache.prime(saved.id, generatedResult.imageBase64, generatedResult.mimeType);
    galleryCache.addItem(saved);
    setItems((prev) => [saved, ...prev]);
    setIsKept(true);
    setKeepModalVisible(false);
    setGenerateStage('input');
    setGeneratedResult(null);
  }

  function handleCloseSheet() {
    if (generating) return;
    setGenerateSheetVisible(false);
    setGenerateStage('input');
    setGeneratedResult(null);
    setIsKept(false);
    setGenerateError(null);
    setKeepError(null);
    setKeepModalVisible(false);
  }

  const renderItem = ({ item }: { item: GalleryItem }) => (
    <Pressable
      style={({ pressed }) => [
        styles.photoCard,
        { width: cardWidth },
        pressed && styles.photoCardPressed,
      ]}
      onPress={() => setLightboxItem(item)}
      accessibilityRole="button"
      accessibilityLabel="View wallpaper"
    >
      <View style={[styles.photoImageArea, { height: cardWidth }]}>
        <GalleryImage id={item.id} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
          onPress={(e) => {
            e.stopPropagation?.();
            setConfirmDeleteId(item.id);
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete wallpaper"
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={13} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.photoMeta}>
        <Text style={styles.photoDate}>{formatDate(item.createdAt)}</Text>
      </View>
    </Pressable>
  );

  function renderContent() {
    if (isLoading) {
      return (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerFill}>
          <Ionicons
            name="cloud-offline-outline"
            size={40}
            color={colors.text.muted}
            style={{ marginBottom: D.spacing.sm }}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
            onPress={loadWallpapers}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (items.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="albums-outline" size={48} color={colors.accent.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('wallpapers.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>
            Generate an AI background to use in your product catalogs
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
            onPress={() => setGenerateSheetVisible(true)}
            accessibilityRole="button"
          >
            <Ionicons name="sparkles-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.emptyButtonText}>{t('wallpapers.modal.title')}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderItem}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  // Derive aspect ratio for result image preview
  const resultAspectRatio = format === '16:9' ? 16 / 9 : format === '1:1' ? 1 : 9 / 16;

  return (
    <View style={styles.root}>
      <View style={styles.pageContainer}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>{t('wallpapers.pageTitle')}</Text>
            <Text style={styles.pageSubtitle}>Your AI-generated backgrounds</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setGenerateSheetVisible(true)}
            accessibilityRole="button"
          >
            <Ionicons name="sparkles-outline" size={15} color="#fff" />
            <Text style={styles.generateBtnText}>{t('wallpapers.generateNew')}</Text>
          </Pressable>
        </View>

        {renderContent()}
      </View>

      {/* Generate sheet */}
      <Modal
        visible={generateSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseSheet}
      >
        <Pressable style={styles.sheetOverlay} onPress={handleCloseSheet}>
          <View
            style={styles.sheet}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => {}}
          >
            <View style={styles.sheetHandle} />

            {generateStage === 'input' ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.sheetTitle}>{t('wallpapers.modal.title')}</Text>
                <Text style={styles.sheetSubtitle}>{t('wallpapers.modal.subtitle')}</Text>

                {/* Format picker */}
                <Text style={styles.sectionLabel}>{t('wallpapers.modal.format')}</Text>
                <View style={styles.formatRow}>
                  {FORMAT_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[styles.formatPill, format === opt.value && styles.formatPillActive]}
                      onPress={() => setFormat(opt.value)}
                      disabled={generating}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.formatPillText,
                          format === opt.value && styles.formatPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text
                        style={[
                          styles.formatPillRatio,
                          format === opt.value && styles.formatPillTextActive,
                        ]}
                      >
                        {opt.value}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Prompt */}
                <Text style={styles.sectionLabel}>{t('wallpapers.modal.prompt')}</Text>
                <TextInput
                  style={styles.sheetInput}
                  placeholder={t('wallpapers.modal.promptPlaceholder')}
                  placeholderTextColor={colors.text.muted}
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  editable={!generating}
                />

                {/* Include logo */}
                <View style={styles.toggleRow}>
                  <View>
                    <Text style={styles.toggleLabel}>{t('wallpapers.modal.includeLogo')}</Text>
                    <Text style={styles.toggleHint}>Place your brand logo in the header</Text>
                  </View>
                  <Switch
                    value={includeLogo}
                    onValueChange={setIncludeLogo}
                    disabled={generating}
                    trackColor={{ true: colors.accent.primary }}
                  />
                </View>

                {/* Brand context fields */}
                <Text style={styles.sectionLabel}>{t('wallpapers.modal.includeBrand')}</Text>
                <View style={styles.checkGrid}>
                  {BRAND_CONTEXT_OPTIONS.map((opt) => {
                    const checked = brandContextFields.includes(opt.key);
                    return (
                      <Pressable
                        key={opt.key}
                        style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.7 }]}
                        onPress={() => toggleBrandField(opt.key)}
                        disabled={generating}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                      >
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={isWeb ? 18 : 24}
                          color={checked ? colors.accent.primary : colors.text.muted}
                        />
                        <Text style={styles.checkLabel}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {generateError && <Text style={styles.generateError}>{generateError}</Text>}

                <Pressable
                  style={({ pressed }) => [
                    styles.sheetGenerateBtn,
                    generating && { opacity: 0.6 },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={handleGenerate}
                  disabled={generating}
                  accessibilityRole="button"
                >
                  {generating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="sparkles-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.sheetGenerateBtnText}>
                    {generating ? t('wallpapers.modal.generating') : t('wallpapers.modal.generate')}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : (
              /* Result stage */
              <View style={styles.resultContainer}>
                <Text style={styles.sheetTitle}>{t('wallpapers.result.title')}</Text>
                <Text style={styles.sheetSubtitle}>{t('wallpapers.result.subtitle')}</Text>

                {generatedResult && (
                  <Image
                    source={{
                      uri: `data:${generatedResult.mimeType};base64,${generatedResult.imageBase64}`,
                    }}
                    style={[styles.resultImage, { aspectRatio: resultAspectRatio }]}
                    resizeMode="cover"
                    accessibilityLabel="Generated wallpaper"
                  />
                )}

                {keepError && <Text style={styles.generateError}>{keepError}</Text>}

                <View style={styles.resultActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { backgroundColor: isKept ? colors.accent.dim : colors.accent.primary },
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={handleKeep}
                    disabled={isKept}
                    accessibilityRole="button"
                    accessibilityLabel={isKept ? 'Image saved' : 'Keep image'}
                  >
                    <Ionicons
                      name={isKept ? 'checkmark-circle' : 'bookmark-outline'}
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.actionBtnText}>{isKept ? 'Saved' : 'Keep'}</Text>
                  </Pressable>

                  {isWeb && generatedResult && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: colors.accent.primary },
                        pressed && { opacity: 0.75 },
                      ]}
                      onPress={() => downloadImage(generatedResult, 'wallpaper')}
                      accessibilityRole="button"
                      accessibilityLabel="Download image"
                    >
                      <Ionicons name="download-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>{t('wallpapers.result.download')}</Text>
                    </Pressable>
                  )}
                </View>

                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    setGeneratedResult(null);
                    setGenerateStage('input');
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.text.secondary} />
                  <Text style={styles.secondaryBtnText}>{t('wallpapers.result.again')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      <KeepImageModal
        visible={keepModalVisible}
        defaultName={`Wallpaper ${new Date().toISOString().slice(0, 10)}`}
        onCancel={() => setKeepModalVisible(false)}
        onConfirm={handleConfirmKeep}
      />

      {/* Delete confirmation */}
      <Modal
        visible={confirmDeleteId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDeleteId(null)}
      >
        <Pressable style={styles.confirmOverlay} onPress={() => setConfirmDeleteId(null)}>
          <Pressable style={styles.confirmDialog} onPress={() => {}}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="trash-outline" size={28} color="#EF4444" />
            </View>
            <Text style={styles.confirmTitle}>{t('wallpapers.deleteConfirm.title')}</Text>
            <Text style={styles.confirmBody}>{t('wallpapers.deleteConfirm.body')}</Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.confirmCancel, pressed && { opacity: 0.7 }]}
                onPress={() => setConfirmDeleteId(null)}
              >
                <Text style={styles.confirmCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmDelete, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  if (id) void handleDelete(id);
                }}
              >
                <Text style={styles.confirmDeleteText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Lightbox */}
      <Modal
        visible={lightboxItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxItem(null)}
      >
        <Pressable style={styles.lightboxOverlay} onPress={() => setLightboxItem(null)}>
          <Pressable style={styles.lightboxContent} onPress={() => {}}>
            <View
              style={[styles.lightboxHeader, !isWeb && { paddingTop: insets.top + D.spacing.sm }]}
            >
              <Text style={styles.lightboxDate}>
                {lightboxItem ? formatDate(lightboxItem.createdAt) : ''}
              </Text>
              <View style={styles.lightboxActions}>
                <Pressable
                  style={({ pressed }) => [styles.lightboxIconBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => lightboxItem && setConfirmDeleteId(lightboxItem.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete wallpaper"
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.lightboxIconBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setLightboxItem(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
              </View>
            </View>
            {lightboxItem && (
              <View style={styles.lightboxImageWrapper}>
                <GalleryImage
                  id={lightboxItem.id}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                  accessibilityLabel="Full size wallpaper"
                />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
      alignItems: isWeb ? 'center' : 'stretch',
    },
    pageContainer: {
      flex: 1,
      width: '100%',
      maxWidth: isWeb ? MAX_CONTENT_WIDTH : undefined,
    },
    pageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingTop: D.spacing.lg,
      paddingBottom: D.spacing.md,
    },
    pageTitle: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    pageSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      backgroundColor: colors.accent.primary,
      paddingVertical: 9,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.pill,
      ...D.shadow.glow,
    },
    generateBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    grid: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingBottom: D.spacing.xl,
    },
    gridRow: {
      gap: GAP,
      marginBottom: GAP,
    },
    photoCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    photoCardPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    photoImageArea: {
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
      position: 'relative',
    },
    deleteButton: {
      position: 'absolute',
      top: D.spacing.xs,
      right: D.spacing.xs,
      width: 26,
      height: 26,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(239,68,68,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoMeta: {
      padding: D.spacing.sm,
    },
    photoDate: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: D.spacing['2xl'],
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: D.spacing.md,
    },
    retryButton: {
      paddingVertical: 9,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    retryText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.spacing.xl,
      paddingBottom: D.spacing['2xl'],
    },
    emptyIconCircle: {
      width: 88,
      height: 88,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
    },
    emptyTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: D.spacing.sm,
    },
    emptySubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: D.spacing.lg,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingVertical: 11,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      ...D.shadow.glow,
    },
    emptyButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    // ── Generate sheet ──────────────────────────────────────────────────────
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bg.surface,
      borderTopLeftRadius: D.radius.xl,
      borderTopRightRadius: D.radius.xl,
      paddingTop: D.spacing.md,
      paddingBottom: D.spacing['2xl'],
      maxHeight: '90%',
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginBottom: D.spacing.md,
    },
    sheetScrollContent: {
      paddingHorizontal: D.spacing.lg,
      gap: D.spacing.sm,
      paddingBottom: D.spacing.md,
    },
    sheetTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    sheetSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    // Format picker
    sectionLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: D.spacing.xs,
    },
    formatRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
    },
    formatPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    formatPillActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    formatPillText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    formatPillRatio: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 1,
    },
    formatPillTextActive: {
      color: '#fff',
    },
    // Prompt
    sheetInput: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      color: colors.text.primary,
      fontSize: D.fontSize.sm,
      padding: D.spacing.md,
      minHeight: 72,
      textAlignVertical: 'top',
    },
    // Toggle row
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: D.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle ?? colors.border.default,
    },
    toggleLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    toggleHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    // Brand context checkboxes
    checkGrid: {
      gap: 2,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: isWeb ? D.spacing.sm : D.spacing.md,
      paddingVertical: isWeb ? 7 : 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle ?? colors.border.default,
    },
    checkLabel: {
      fontSize: isWeb ? D.fontSize.sm : D.fontSize.base,
      color: colors.text.primary,
    },
    // Error
    generateError: {
      fontSize: D.fontSize.xs,
      color: '#EF4444',
    },
    // Generate button
    sheetGenerateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      backgroundColor: colors.accent.primary,
      paddingVertical: 13,
      borderRadius: D.radius.pill,
      marginTop: D.spacing.sm,
      ...D.shadow.glow,
    },
    sheetGenerateBtnText: {
      color: '#fff',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
    },
    // ── Result stage ──────────────────────────────────────────────────────────
    resultContainer: {
      paddingHorizontal: D.spacing.lg,
      gap: D.spacing.sm,
    },
    resultImage: {
      width: '100%',
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      marginTop: D.spacing.xs,
    },
    resultActions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      ...D.shadow.glow,
    },
    actionBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      paddingVertical: 11,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    secondaryBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    // ── Lightbox ────────────────────────────────────────────────────────────
    lightboxOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    lightboxContent: {
      width: '100%',
      maxWidth: isWeb ? 880 : undefined,
      flex: 1,
      paddingHorizontal: isWeb ? D.spacing.lg : 0,
      paddingBottom: isWeb ? D.spacing.md : 0,
    },
    lightboxImageWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    lightboxHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: isWeb ? 0 : D.spacing.md,
      paddingVertical: D.spacing.sm,
    },
    lightboxDate: {
      fontSize: D.fontSize.sm,
      color: 'rgba(255,255,255,0.6)',
    },
    lightboxActions: {
      flexDirection: 'row',
      gap: D.spacing.xs,
    },
    lightboxIconBtn: {
      width: 40,
      height: 40,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxImage: {
      width: '100%',
      aspectRatio: isWeb ? undefined : 1,
      flex: isWeb ? 1 : undefined,
      borderRadius: isWeb ? D.radius.lg : 0,
    },
    // ── Confirm delete ───────────────────────────────────────────────────────
    confirmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: D.spacing.lg,
    },
    confirmDialog: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      padding: D.spacing.lg,
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      ...D.shadow.modal,
    },
    confirmIconWrap: {
      width: 56,
      height: 56,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(239,68,68,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
    },
    confirmTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.sm,
    },
    confirmBody: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: D.spacing.lg,
    },
    confirmActions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      width: '100%',
    },
    confirmCancel: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    confirmCancelText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    confirmDelete: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      backgroundColor: '#EF4444',
      alignItems: 'center',
    },
    confirmDeleteText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
  });
}
