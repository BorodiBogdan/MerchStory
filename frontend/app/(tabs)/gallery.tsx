import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GalleryFilterBar, type GalleryFilterState } from '@/components/ui/GalleryFilterBar';
import { GalleryImage } from '@/components/ui/GalleryImage';
import { KeepImageModal } from '@/components/ui/KeepImageModal';
import { Pagination } from '@/components/ui/Pagination';
import { D } from '@/constants/design';
import { GENERATION_TYPE_I18N_KEYS } from '@/constants/generationTypes';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import { deleteGalleryItem, type GalleryItem, updateGalleryItemName } from '@/utils/api';
import * as galleryCache from '@/utils/galleryCache';
import * as galleryImageCache from '@/utils/galleryImageCache';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1200;
const WEB_H_PADDING = 32;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.md;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const EMPTY_FILTERS: GalleryFilterState = { search: '', types: [], from: '', to: '' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type GalleryTab = 'photos' | 'videos';

function toApiFilters(f: GalleryFilterState) {
  return {
    types: f.types,
    search: f.search,
    from: DATE_RE.test(f.from) ? f.from : undefined,
    to: DATE_RE.test(f.to) ? f.to : undefined,
  };
}

export default function GalleryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors, screenHeight), [colors, screenHeight]);
  const t = useT();

  const insets = useSafeAreaInsets();

  const cache = galleryCache.useGalleryCache();
  const { items, total, page, pageSize, loading, loadingMore, error } = cache;

  const [activeTab, setActiveTab] = useState<GalleryTab>('photos');
  const slideAnim = useMemo(() => new Animated.Value(0), []);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [filters, setFilters] = useState<GalleryFilterState>(EMPTY_FILTERS);

  const listRef = useRef<FlatList<GalleryItem>>(null);

  const numColumns = isWeb ? (screenWidth < 600 ? 2 : screenWidth < 1024 ? 3 : 4) : 2;

  const useSidebar = isWeb && screenWidth >= 900;
  const hPadding = isWeb ? WEB_H_PADDING : MOBILE_H_PADDING;
  const sidebarReserved = useSidebar ? 272 + D.spacing.lg : 0;
  const effectiveWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH) - hPadding * 2 - sidebarReserved;
  const cardWidth = (effectiveWidth - GAP * (numColumns - 1)) / numColumns;

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'photos') {
        void galleryCache.ensureLoaded(toApiFilters(filters));
      }
    }, [activeTab, filters])
  );

  function handleFiltersChange(next: GalleryFilterState) {
    setFilters(next);
    if (activeTab === 'photos') {
      void galleryCache.setFiltersAndReload(toApiFilters(next));
    }
  }

  function switchTab(tab: GalleryTab) {
    setActiveTab(tab);
    Animated.timing(slideAnim, {
      toValue: tab === 'photos' ? 0 : 1,
      duration: D.duration.normal,
      useNativeDriver: false,
    }).start();
    if (tab === 'photos') {
      void galleryCache.ensureLoaded(toApiFilters(filters));
    }
  }

  function scrollListTop() {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    if (isWeb && typeof window !== 'undefined') {
      const doScroll = () => {
        window.scrollTo(0, 0);
        document.documentElement?.scrollTo?.(0, 0);
        document.body?.scrollTo?.(0, 0);
      };
      doScroll();
      // Re-scroll after the new page's items render so any layout shift can't land us back at the bottom.
      requestAnimationFrame(() => {
        doScroll();
        requestAnimationFrame(doScroll);
      });
    }
  }

  async function handleDelete(id: string) {
    if (lightboxItem?.id === id) setLightboxItem(null);
    galleryCache.removeItem(id);
    galleryImageCache.evict(id);
    try {
      await deleteGalleryItem(id);
    } catch {
      void galleryCache.refresh();
    }
  }

  async function handleRename(newName: string) {
    if (!editingItem) return;
    const updated = await updateGalleryItemName(editingItem.id, newName);
    galleryCache.upsertItem(updated);
    if (lightboxItem?.id === updated.id) setLightboxItem(updated);
    setEditingItem(null);
  }

  async function handleDownload() {
    if (!lightboxItem) return;
    try {
      const entry = await galleryImageCache.load(lightboxItem.id);
      const match = entry.uri.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = match?.[1] ?? 'image/png';
      const ext = mimeType.split('/')[1] ?? 'png';
      const safeName =
        (lightboxItem.name || 'image').replace(/[^a-z0-9_\-. ]+/gi, '_').trim() || 'image';
      const fileName = `${safeName}.${ext}`;

      if (isWeb) {
        const a = document.createElement('a');
        a.href = entry.uri;
        a.download = fileName;
        a.click();
        return;
      }

      const base64 = match?.[2];
      if (!base64) return;
      const dir = FileSystem.cacheDirectory;
      if (!dir) return;
      const filePath = `${dir}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType,
          dialogTitle: lightboxItem.name || 'Save image',
          UTI: mimeType === 'image/png' ? 'public.png' : 'public.jpeg',
        });
      }
    } catch {
      // image failed to load or user dismissed the share sheet — no-op
    }
  }

  const renderPhoto = ({ item }: { item: GalleryItem }) => (
    <Pressable
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.photoCard,
        { width: cardWidth },
        hovered && styles.photoCardHovered,
        pressed && styles.photoCardPressed,
      ]}
      onPress={() => setLightboxItem(item)}
      accessibilityRole="button"
      accessibilityLabel={`View ${item.name || 'image'}`}
    >
      <View style={[styles.photoImageArea, { height: cardWidth }]}>
        <View style={styles.photoImageInset} pointerEvents="none">
          <GalleryImage id={item.id} style={styles.photoImageFit} resizeMode="contain" />
        </View>

        {item.generationType && (
          <View style={styles.typeBadge}>
            <Ionicons name="sparkles" size={9} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.typeBadgeText} numberOfLines={1}>
              {t(GENERATION_TYPE_I18N_KEYS[item.generationType])}
            </Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <Pressable
            style={({ pressed }) => [styles.editButton, pressed && styles.actionButtonPressed]}
            onPress={(e) => {
              e.stopPropagation?.();
              setEditingItem(item);
            }}
            accessibilityRole="button"
            accessibilityLabel="Rename image"
            hitSlop={8}
          >
            <Ionicons name="pencil-outline" size={13} color="#fff" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.deleteButton, pressed && styles.actionButtonPressed]}
            onPress={(e) => {
              e.stopPropagation?.();
              setConfirmDeleteId(item.id);
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete image"
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={13} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.viewHint}>
          <Ionicons name="expand-outline" size={12} color="#fff" />
        </View>
      </View>
      <View style={styles.photoMeta}>
        <Text style={styles.photoName} numberOfLines={1}>
          {item.name || t('gallery.untitled')}
        </Text>
        <View style={styles.photoMetaRow}>
          <Ionicons name="calendar-outline" size={11} color={colors.text.muted} />
          <Text style={styles.photoDate}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );

  const hasActiveFilters =
    filters.types.length > 0 || !!filters.from || !!filters.to || !!filters.search;

  const emptyState = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <View style={styles.emptyIconInner}>
          <Ionicons name="images-outline" size={40} color={colors.accent.primary} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>
        {hasActiveFilters ? t('gallery.filteredEmptyTitle') : t('gallery.emptyTitle')}
      </Text>
      <Text style={styles.emptySubtitle}>
        {hasActiveFilters ? t('gallery.filteredEmptySubtitle') : t('gallery.emptySubtitle')}
      </Text>
      {hasActiveFilters ? (
        <Pressable
          style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
          onPress={() => handleFiltersChange(EMPTY_FILTERS)}
          accessibilityRole="button"
          accessibilityLabel="Clear filters"
        >
          <Ionicons name="refresh-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.emptyButtonText}>{t('gallery.clearFilters')}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
          onPress={() => router.navigate('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Go to Studio"
        >
          <Ionicons name="sparkles-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.emptyButtonText}>{t('gallery.openStudio')}</Text>
        </Pressable>
      )}
    </View>
  );

  const videosContent = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <View style={styles.emptyIconInner}>
          <Ionicons name="videocam-outline" size={40} color={colors.accent.primary} />
        </View>
      </View>
      <View style={styles.comingSoonBadge}>
        <Ionicons
          name="time-outline"
          size={11}
          color={colors.accent.secondary}
          style={{ marginRight: 5 }}
        />
        <Text style={styles.comingSoonBadgeText}>{t('gallery.videoBadge')}</Text>
      </View>
      <Text style={styles.emptyTitle}>{t('gallery.videoTitle')}</Text>
      <Text style={styles.emptySubtitle}>{t('gallery.videoSubtitle')}</Text>
    </View>
  );

  const listFooter = isWeb ? (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={(p) => {
        void galleryCache.goToPage(p);
        scrollListTop();
      }}
      disabled={loading}
    />
  ) : loadingMore ? (
    <View style={styles.footerLoader}>
      <ActivityIndicator size="small" color={colors.accent.primary} />
    </View>
  ) : null;

  const photosContent = () => {
    if (loading && items.length === 0) {
      return (
        <View style={styles.centerFill}>
          <View style={styles.loaderHalo}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
          </View>
          <Text style={[styles.emptySubtitle, { marginTop: D.spacing.md }]}>Loading gallery…</Text>
        </View>
      );
    }
    if (error && items.length === 0) {
      return (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconCircle}>
            <View style={styles.emptyIconInner}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.accent.primary} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>Couldn&apos;t load gallery</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
            onPress={() => void galleryCache.refresh()}
          >
            <Ionicons
              name="refresh"
              size={15}
              color={colors.text.secondary}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (items.length === 0) return emptyState;
    return (
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderPhoto}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
        showsVerticalScrollIndicator={false}
        onEndReached={!isWeb ? () => void galleryCache.loadMore() : undefined}
        onEndReachedThreshold={0.4}
        ListFooterComponent={listFooter}
      />
    );
  };

  const segmentIndicatorLeft = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['1%', '51%'],
  });

  const photosCount = activeTab === 'photos' ? total : 0;

  return (
    <View style={styles.root}>
      {/* Ambient accent glows */}
      <View pointerEvents="none" style={styles.ambientGlow} />
      <View pointerEvents="none" style={styles.ambientGlow2} />

      <View style={styles.pageContainer}>
        <View style={styles.pageHeader}>
          <View style={styles.headerTextBlock}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>Gallery</Text>
            </View>
            <Text style={styles.pageTitle}>{t('gallery.pageTitle')}</Text>
            <View style={styles.subtitleRow}>
              {activeTab === 'photos' ? (
                <View style={styles.countChip}>
                  <Ionicons name="images-outline" size={12} color={colors.accent.primary} />
                  <Text style={styles.countChipText}>
                    {photosCount} {photosCount === 1 ? 'image' : 'images'}
                  </Text>
                </View>
              ) : (
                <View style={[styles.countChip, styles.countChipAlt]}>
                  <Ionicons name="time-outline" size={12} color={colors.accent.secondary} />
                  <Text style={[styles.countChipText, { color: colors.accent.secondary }]}>
                    Soon
                  </Text>
                </View>
              )}
              <Text style={styles.pageSubtitle}>{t('gallery.pageSubtitle')}</Text>
            </View>
          </View>

          {/* Photos / Videos segmented switcher — lives in the header */}
          <View style={styles.segmentTrack}>
            <Animated.View style={[styles.segmentIndicator, { left: segmentIndicatorLeft }]} />
            <Pressable
              style={styles.segmentButton}
              onPress={() => switchTab('photos')}
              accessibilityRole="button"
              accessibilityLabel="Photos tab"
            >
              <Ionicons
                name={activeTab === 'photos' ? 'images' : 'images-outline'}
                size={15}
                color={activeTab === 'photos' ? '#fff' : colors.text.secondary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[styles.segmentLabel, activeTab === 'photos' && styles.segmentLabelActive]}
              >
                {t('gallery.photosTab')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.segmentButton}
              onPress={() => switchTab('videos')}
              accessibilityRole="button"
              accessibilityLabel="Videos tab"
            >
              <Ionicons
                name={activeTab === 'videos' ? 'videocam' : 'videocam-outline'}
                size={15}
                color={activeTab === 'videos' ? '#fff' : colors.text.secondary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[styles.segmentLabel, activeTab === 'videos' && styles.segmentLabelActive]}
              >
                {t('gallery.videosTab')}
              </Text>
              {activeTab !== 'videos' && <View style={styles.segmentSoonDot} />}
            </Pressable>
          </View>
        </View>

        {activeTab === 'videos' ? (
          videosContent
        ) : useSidebar ? (
          <View style={styles.sidebarLayout}>
            <View style={styles.sidebar}>
              <GalleryFilterBar
                value={filters}
                onChange={handleFiltersChange}
                layout="vertical"
                resultCount={loading ? undefined : total}
              />
            </View>
            <View style={styles.sidebarContent}>{photosContent()}</View>
          </View>
        ) : (
          <>
            <View style={styles.filterBarWrap}>
              <GalleryFilterBar
                value={filters}
                onChange={handleFiltersChange}
                resultCount={loading ? undefined : total}
              />
            </View>
            {photosContent()}
          </>
        )}
      </View>

      <KeepImageModal
        visible={editingItem !== null}
        defaultName={editingItem?.name ?? ''}
        onCancel={() => setEditingItem(null)}
        onConfirm={handleRename}
        title="Rename image"
        body="Change the name used to search for and identify this image."
        icon="pencil-outline"
        submitLabel="Save"
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
              <View style={styles.confirmIconInner}>
                <Ionicons name="trash-outline" size={26} color={colors.destructive} />
              </View>
            </View>
            <Text style={styles.confirmTitle}>{t('gallery.deleteConfirm.title')}</Text>
            <Text style={styles.confirmBody}>{t('gallery.deleteConfirm.body')}</Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.confirmCancel, pressed && { opacity: 0.75 }]}
                onPress={() => setConfirmDeleteId(null)}
              >
                <Text style={styles.confirmCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmDelete, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  if (id) void handleDelete(id);
                }}
              >
                <Ionicons name="trash" size={14} color="#fff" style={{ marginRight: 6 }} />
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
              <View style={styles.lightboxHeaderIcon}>
                <Ionicons name="image-outline" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lightboxName} numberOfLines={1}>
                  {lightboxItem?.name || 'Untitled'}
                </Text>
                <View style={styles.lightboxMetaRow}>
                  <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.65)" />
                  <Text style={styles.lightboxDate}>
                    {lightboxItem ? formatDate(lightboxItem.createdAt) : ''}
                  </Text>
                  {lightboxItem?.generationType ? (
                    <>
                      <View style={styles.lightboxMetaDivider} />
                      <Ionicons name="sparkles-outline" size={11} color="rgba(255,255,255,0.65)" />
                      <Text style={styles.lightboxDate}>
                        {t(GENERATION_TYPE_I18N_KEYS[lightboxItem.generationType])}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
              <View style={styles.lightboxActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.lightboxIconBtn,
                    styles.lightboxIconBtnAccent,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => void handleDownload()}
                  accessibilityRole="button"
                  accessibilityLabel={t('studio.a11y.downloadImage')}
                >
                  <Ionicons
                    name={isWeb ? 'download-outline' : 'share-outline'}
                    size={18}
                    color="#fff"
                  />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.lightboxIconBtn,
                    styles.lightboxIconBtnDanger,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => lightboxItem && setConfirmDeleteId(lightboxItem.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete image"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.lightboxIconBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => setLightboxItem(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>

            {lightboxItem && (
              <View style={styles.lightboxImageWrapper}>
                <GalleryImage
                  id={lightboxItem.id}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                  accessibilityLabel="Full size image"
                />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], _windowHeight: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
      alignItems: isWeb ? 'center' : 'stretch',
    },
    ambientGlow: {
      position: 'absolute',
      top: -140,
      right: -80,
      width: 360,
      height: 360,
      borderRadius: 360,
      backgroundColor: colors.accent.primary,
      opacity: 0.08,
    },
    ambientGlow2: {
      position: 'absolute',
      top: 120,
      left: -120,
      width: 280,
      height: 280,
      borderRadius: 280,
      backgroundColor: colors.accent.secondary,
      opacity: 0.05,
    },
    pageContainer: {
      flex: 1,
      width: '100%',
      maxWidth: isWeb ? MAX_CONTENT_WIDTH : undefined,
    },

    // ── Header ───────────────────────────────────────────────────────────
    pageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingTop: D.spacing.xl,
      paddingBottom: D.spacing.lg,
      gap: D.spacing.md,
    },
    headerTextBlock: {
      flex: 1,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 220,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    eyebrowDot: {
      width: 6,
      height: 6,
      borderRadius: 6,
      backgroundColor: colors.accent.primary,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    pageTitle: {
      fontSize: isWeb ? D.fontSize['3xl'] : D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.8,
      marginBottom: 6,
    },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    countChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 3,
      paddingHorizontal: 10,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    countChipAlt: {
      backgroundColor: 'transparent',
    },
    countChipText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    pageSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },

    // ── Segmented switcher ───────────────────────────────────────────────
    segmentTrack: {
      flexDirection: 'row',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.pill,
      padding: 4,
      position: 'relative',
      height: 42,
      width: 260,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...D.shadow.sm,
    },
    segmentIndicator: {
      position: 'absolute',
      top: 4,
      width: '48%',
      height: 32,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      borderWidth: 1,
      borderColor: colors.accent.secondary,
      ...D.shadow.glow,
    },
    segmentButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    segmentLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
      letterSpacing: 0.2,
    },
    segmentLabelActive: {
      color: '#fff',
      fontWeight: D.fontWeight.bold,
    },
    segmentSoonDot: {
      marginLeft: 5,
      width: 6,
      height: 6,
      borderRadius: 6,
      backgroundColor: colors.accent.secondary,
    },

    // ── Filter bar / sidebar ─────────────────────────────────────────────
    filterBarWrap: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingBottom: D.spacing.sm,
    },
    sidebarLayout: {
      flex: 1,
      flexDirection: 'row',
      paddingHorizontal: WEB_H_PADDING,
      gap: D.spacing.lg,
      paddingBottom: D.spacing.lg,
    },
    sidebar: {
      width: 272,
      flexShrink: 0,
    },
    sidebarContent: {
      flex: 1,
      minWidth: 0,
    },

    // ── Grid ─────────────────────────────────────────────────────────────
    grid: {
      paddingHorizontal: isWeb ? 0 : MOBILE_H_PADDING,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.xl,
    },
    gridRow: {
      gap: GAP,
      marginBottom: GAP,
    },

    // ── Photo card ───────────────────────────────────────────────────────
    photoCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    photoCardHovered: {
      borderColor: colors.accent.primary,
      transform: [{ translateY: -2 }],
      ...D.shadow.glow,
    },
    photoCardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.985 }],
    },
    photoImageArea: {
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
      position: 'relative',
    },
    photoImageInset: {
      ...StyleSheet.absoluteFillObject,
      padding: D.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoImageFit: {
      width: '100%',
      height: '100%',
    },
    typeBadge: {
      position: 'absolute',
      bottom: D.spacing.sm,
      left: D.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.72)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      maxWidth: '82%',
    },
    typeBadgeText: {
      fontSize: 10,
      fontWeight: D.fontWeight.bold,
      color: '#fff',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    cardActions: {
      position: 'absolute',
      top: D.spacing.sm,
      right: D.spacing.sm,
      flexDirection: 'row',
      gap: 5,
    },
    editButton: {
      width: 28,
      height: 28,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      ...D.shadow.sm,
    },
    deleteButton: {
      width: 28,
      height: 28,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(239,68,68,0.9)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      ...D.shadow.sm,
    },
    actionButtonPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.94 }],
    },
    viewHint: {
      position: 'absolute',
      top: D.spacing.sm,
      left: D.spacing.sm,
      width: 26,
      height: 26,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoMeta: {
      padding: D.spacing.md,
      gap: 4,
    },
    photoName: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    photoMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    photoDate: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
    },

    // ── Loading / empty / error ─────────────────────────────────────────
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: D.spacing['2xl'],
    },
    loaderHalo: {
      width: 84,
      height: 84,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: D.spacing.md,
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
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
      width: 104,
      height: 104,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    emptyIconInner: {
      width: 76,
      height: 76,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: D.spacing.xs,
      letterSpacing: -0.3,
    },
    emptySubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: D.spacing.lg,
      maxWidth: 360,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingVertical: 12,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.accent.secondary,
      ...D.shadow.glow,
    },
    emptyButtonPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
    emptyButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      letterSpacing: 0.2,
    },
    comingSoonBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingVertical: 5,
      paddingHorizontal: D.spacing.md,
      marginBottom: D.spacing.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    comingSoonBadgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.secondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    footerLoader: {
      paddingVertical: D.spacing.md,
      alignItems: 'center',
    },

    // ── Lightbox ─────────────────────────────────────────────────────────
    lightboxOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.94)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    lightboxContent: {
      width: '100%',
      maxWidth: isWeb ? 960 : undefined,
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
      paddingVertical: D.spacing.md,
      gap: D.spacing.sm,
    },
    lightboxHeaderIcon: {
      width: 36,
      height: 36,
      borderRadius: D.radius.md,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxName: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: '#fff',
      letterSpacing: -0.2,
    },
    lightboxMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 3,
      flexWrap: 'wrap',
    },
    lightboxDate: {
      fontSize: D.fontSize.xs,
      color: 'rgba(255,255,255,0.65)',
      fontWeight: D.fontWeight.medium,
    },
    lightboxMetaDivider: {
      width: 3,
      height: 3,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.35)',
      marginHorizontal: 3,
    },
    lightboxActions: {
      flexDirection: 'row',
      gap: D.spacing.xs,
    },
    lightboxIconBtn: {
      width: 40,
      height: 40,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxIconBtnDanger: {
      backgroundColor: 'rgba(239,68,68,0.15)',
      borderColor: 'rgba(239,68,68,0.32)',
    },
    lightboxIconBtnAccent: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.secondary,
    },
    lightboxImage: {
      width: '100%',
      aspectRatio: isWeb ? undefined : 1,
      flex: isWeb ? 1 : undefined,
      borderRadius: isWeb ? D.radius.lg : 0,
    },

    // ── Confirm delete ───────────────────────────────────────────────────
    confirmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: D.spacing.lg,
    },
    confirmDialog: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      padding: D.spacing.xl,
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...D.shadow.modal,
    },
    confirmIconWrap: {
      width: 72,
      height: 72,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(239,68,68,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.22)',
    },
    confirmIconInner: {
      width: 52,
      height: 52,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.32)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
      textAlign: 'center',
      letterSpacing: -0.3,
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
      backgroundColor: colors.bg.elevated,
    },
    confirmCancelText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    confirmDelete: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      backgroundColor: colors.destructive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmDeleteText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: '#fff',
      letterSpacing: 0.2,
    },
  });
}
