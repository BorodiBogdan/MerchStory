import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { Pagination } from '@/components/ui/Pagination';
import { D } from '@/constants/design';
import { GENERATION_TYPE_LABELS } from '@/constants/generationTypes';
import { useTheme } from '@/context/theme';
import { deleteGalleryItem, type GalleryItem } from '@/utils/api';
import * as galleryCache from '@/utils/galleryCache';
import * as galleryImageCache from '@/utils/galleryImageCache';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1200;
const WEB_H_PADDING = 32;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.sm;

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
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const insets = useSafeAreaInsets();

  const cache = galleryCache.useGalleryCache();
  const { items, total, page, pageSize, loading, loadingMore, error } = cache;

  const [activeTab, setActiveTab] = useState<GalleryTab>('photos');
  const slideAnim = useMemo(() => new Animated.Value(0), []);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filters, setFilters] = useState<GalleryFilterState>(EMPTY_FILTERS);

  const numColumns = isWeb ? (screenWidth < 600 ? 2 : screenWidth < 1024 ? 3 : 4) : 2;

  const useSidebar = isWeb && screenWidth >= 900;
  const hPadding = isWeb ? WEB_H_PADDING : MOBILE_H_PADDING;
  const sidebarReserved = useSidebar ? 260 + D.spacing.lg : 0;
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

  const renderPhoto = ({ item }: { item: GalleryItem }) => (
    <Pressable
      style={({ pressed }) => [
        styles.photoCard,
        { width: cardWidth },
        pressed && styles.photoCardPressed,
      ]}
      onPress={() => setLightboxItem(item)}
      accessibilityRole="button"
      accessibilityLabel={`View ${item.name || 'image'}`}
    >
      <View style={[styles.photoImageArea, { height: cardWidth }]}>
        <GalleryImage id={item.id} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {item.generationType && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText} numberOfLines={1}>
              {GENERATION_TYPE_LABELS[item.generationType]}
            </Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
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
      <View style={styles.photoMeta}>
        <Text style={styles.photoName} numberOfLines={1}>
          {item.name || 'Untitled'}
        </Text>
        <Text style={styles.photoDate}>{formatDate(item.createdAt)}</Text>
      </View>
    </Pressable>
  );

  const hasActiveFilters =
    filters.types.length > 0 || !!filters.from || !!filters.to || !!filters.search;

  const emptyState = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="images-outline" size={48} color={colors.accent.primary} />
      </View>
      <Text style={styles.emptyTitle}>
        {hasActiveFilters ? 'No images match your filters' : 'No generated images yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {hasActiveFilters
          ? 'Try clearing some filters or adjusting your search.'
          : 'Head to Studio to create your first AI-generated ad'}
      </Text>
      {hasActiveFilters ? (
        <Pressable
          style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
          onPress={() => handleFiltersChange(EMPTY_FILTERS)}
          accessibilityRole="button"
          accessibilityLabel="Clear filters"
        >
          <Ionicons name="refresh-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.emptyButtonText}>Clear filters</Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
          onPress={() => router.navigate('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Go to Studio"
        >
          <Ionicons name="sparkles-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.emptyButtonText}>Open Studio</Text>
        </Pressable>
      )}
    </View>
  );

  const videosContent = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="videocam-outline" size={48} color={colors.accent.primary} />
      </View>
      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonBadgeText}>In Development</Text>
      </View>
      <Text style={styles.emptyTitle}>Video Generation</Text>
      <Text style={styles.emptySubtitle}>Coming soon — AI-powered video ads are on the way</Text>
    </View>
  );

  const listFooter = isWeb ? (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={(p) => void galleryCache.goToPage(p)}
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
          <ActivityIndicator size="large" color={colors.accent.primary} />
        </View>
      );
    }
    if (error && items.length === 0) {
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
            onPress={() => void galleryCache.refresh()}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (items.length === 0) return emptyState;
    return (
      <FlatList
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

  return (
    <View style={styles.root}>
      <View style={styles.pageContainer}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Gallery</Text>
            <Text style={styles.pageSubtitle}>Your generated assets</Text>
          </View>
        </View>

        {/* Photos / Videos toggle */}
        <View style={styles.segmentWrapper}>
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
                style={{ marginRight: 5 }}
              />
              <Text
                style={[styles.segmentLabel, activeTab === 'photos' && styles.segmentLabelActive]}
              >
                Photos
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
                style={{ marginRight: 5 }}
              />
              <Text
                style={[styles.segmentLabel, activeTab === 'videos' && styles.segmentLabelActive]}
              >
                Videos
              </Text>
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
            <Text style={styles.confirmTitle}>Delete image?</Text>
            <Text style={styles.confirmBody}>
              This image will be permanently removed from your gallery.
            </Text>
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
              <View style={{ flex: 1 }}>
                <Text style={styles.lightboxName} numberOfLines={1}>
                  {lightboxItem?.name || 'Untitled'}
                </Text>
                <Text style={styles.lightboxDate}>
                  {lightboxItem ? formatDate(lightboxItem.createdAt) : ''}
                  {lightboxItem?.generationType
                    ? ` · ${GENERATION_TYPE_LABELS[lightboxItem.generationType]}`
                    : ''}
                </Text>
              </View>
              <View style={styles.lightboxActions}>
                <Pressable
                  style={({ pressed }) => [styles.lightboxIconBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => lightboxItem && setConfirmDeleteId(lightboxItem.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete image"
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
    segmentWrapper: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      marginBottom: D.spacing.md,
    },
    segmentTrack: {
      flexDirection: 'row',
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.pill,
      padding: 3,
      position: 'relative',
      height: 40,
      maxWidth: isWeb ? 320 : undefined,
    },
    segmentIndicator: {
      position: 'absolute',
      top: 3,
      width: '48%',
      height: 34,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
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
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    segmentLabelActive: {
      color: '#fff',
      fontWeight: D.fontWeight.semibold,
    },
    filterBarWrap: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
    },
    sidebarLayout: {
      flex: 1,
      flexDirection: 'row',
      paddingHorizontal: WEB_H_PADDING,
      gap: D.spacing.lg,
      paddingBottom: D.spacing.lg,
    },
    sidebar: {
      width: 260,
      flexShrink: 0,
    },
    sidebarContent: {
      flex: 1,
      minWidth: 0,
    },
    grid: {
      paddingHorizontal: isWeb ? 0 : MOBILE_H_PADDING,
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
    typeBadge: {
      position: 'absolute',
      top: D.spacing.xs,
      left: D.spacing.xs,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.65)',
      maxWidth: '70%',
    },
    typeBadgeText: {
      fontSize: 10,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
      letterSpacing: 0.3,
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
    photoName: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: 2,
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
    emptyButtonPressed: {
      opacity: 0.85,
    },
    emptyButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    comingSoonBadge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingVertical: 4,
      paddingHorizontal: D.spacing.md,
      marginBottom: D.spacing.md,
    },
    comingSoonBadgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.secondary,
      letterSpacing: 0.5,
    },
    footerLoader: {
      paddingVertical: D.spacing.md,
      alignItems: 'center',
    },
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
      gap: D.spacing.sm,
    },
    lightboxName: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
    lightboxDate: {
      fontSize: D.fontSize.xs,
      color: 'rgba(255,255,255,0.6)',
      marginTop: 2,
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
