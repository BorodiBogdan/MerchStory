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
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { deleteWallpaper, fetchWallpapers, type GalleryItem, generateWallpaper } from '@/utils/api';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1200;
const WEB_H_PADDING = 32;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.sm;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WallpapersScreen() {
  const { colors } = useTheme();
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
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  const numColumns = isWeb ? (screenWidth < 600 ? 2 : screenWidth < 1024 ? 3 : 4) : 2;
  const hPadding = isWeb ? WEB_H_PADDING : MOBILE_H_PADDING;
  const effectiveWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH) - hPadding * 2;
  const cardWidth = (effectiveWidth - GAP * (numColumns - 1)) / numColumns;

  const loadWallpapers = useCallback(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    fetchWallpapers()
      .then((data) => {
        if (active) setItems(data);
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
    try {
      await deleteWallpaper(id);
    } catch {
      fetchWallpapers()
        .then(setItems)
        .catch(() => {});
    }
  }

  async function handleGenerate() {
    const p = promptRef.current.trim();
    if (!p) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      await generateWallpaper({ prompt: p });
      setGenerateSheetVisible(false);
      setPrompt('');
      // Refresh the list to pick up the newly saved wallpaper
      fetchWallpapers()
        .then(setItems)
        .catch(() => {});
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
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
        <Image
          source={{ uri: `data:${item.mimeType};base64,${item.imageBase64}` }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
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
          <Text style={styles.emptyTitle}>No wallpapers yet</Text>
          <Text style={styles.emptySubtitle}>
            Generate an AI background to use in your product catalogs
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
            onPress={() => setGenerateSheetVisible(true)}
            accessibilityRole="button"
          >
            <Ionicons name="sparkles-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.emptyButtonText}>Generate Wallpaper</Text>
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

  return (
    <View style={styles.root}>
      <View style={styles.pageContainer}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Wallpapers</Text>
            <Text style={styles.pageSubtitle}>Your AI-generated backgrounds</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setGenerateSheetVisible(true)}
            accessibilityRole="button"
          >
            <Ionicons name="sparkles-outline" size={15} color="#fff" />
            <Text style={styles.generateBtnText}>Generate New</Text>
          </Pressable>
        </View>

        {renderContent()}
      </View>

      {/* Generate sheet */}
      <Modal
        visible={generateSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!generating) setGenerateSheetVisible(false);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            if (!generating) setGenerateSheetVisible(false);
          }}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Generate Wallpaper</Text>
            <Text style={styles.sheetSubtitle}>Describe the background style you want</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g. warm sunset bokeh, soft pastel bakery, dark wood texture…"
              placeholderTextColor={colors.text.muted}
              value={prompt}
              onChangeText={setPrompt}
              multiline
              editable={!generating}
            />
            {generateError && <Text style={styles.generateError}>{generateError}</Text>}
            <Pressable
              style={({ pressed }) => [
                styles.sheetGenerateBtn,
                (!prompt.trim() || generating) && { opacity: 0.45 },
                pressed && { opacity: 0.8 },
              ]}
              onPress={handleGenerate}
              disabled={!prompt.trim() || generating}
              accessibilityRole="button"
            >
              {generating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="sparkles-outline" size={16} color="#fff" />
              )}
              <Text style={styles.sheetGenerateBtnText}>
                {generating ? 'Generating…' : 'Generate'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
            <Text style={styles.confirmTitle}>Delete wallpaper?</Text>
            <Text style={styles.confirmBody}>This wallpaper will be permanently removed.</Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.confirmCancel, pressed && { opacity: 0.7 }]}
                onPress={() => setConfirmDeleteId(null)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmDelete, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  if (id) void handleDelete(id);
                }}
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
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
                <Image
                  source={{
                    uri: `data:${lightboxItem.mimeType};base64,${lightboxItem.imageBase64}`,
                  }}
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
      padding: D.spacing.lg,
      paddingBottom: D.spacing['2xl'],
      gap: D.spacing.sm,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginBottom: D.spacing.sm,
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
    sheetInput: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      color: colors.text.primary,
      fontSize: D.fontSize.sm,
      padding: D.spacing.md,
      minHeight: 80,
      textAlignVertical: 'top',
      marginTop: D.spacing.xs,
    },
    generateError: {
      fontSize: D.fontSize.xs,
      color: '#EF4444',
    },
    sheetGenerateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      backgroundColor: colors.accent.primary,
      paddingVertical: 13,
      borderRadius: D.radius.pill,
      marginTop: D.spacing.xs,
      ...D.shadow.glow,
    },
    sheetGenerateBtnText: {
      color: '#fff',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
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
