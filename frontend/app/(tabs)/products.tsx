import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pagination } from '@/components/ui/Pagination';
import { ProductFilterBar, ProductFilterState } from '@/components/ui/ProductFilterBar';
import { ProductImage } from '@/components/ui/ProductImage';
import { D } from '@/constants/design';
import { useShop } from '@/context/shop';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  createProduct,
  type Currency,
  currencySymbol,
  deleteProduct,
  formatPrice,
  type ProductDetail,
  type ProductFilters,
  type ProductItem,
  type ReferenceImage,
  removeBackground,
  searchReferenceImages,
  updateProduct,
} from '@/utils/api';
import * as productImageCache from '@/utils/productImageCache';
import * as productsCache from '@/utils/productsCache';

function toMetadata(detail: ProductDetail): ProductItem {
  return {
    id: detail.id,
    name: detail.name,
    price: detail.price,
    currency: detail.currency,
    category: detail.category,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    mimeType: 'image/png',
    imageUrl: detail.imageUrl,
  };
}

const CURRENCY_CHOICES: Currency[] = ['USD', 'EUR', 'RON'];

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1600;
const WEB_H_PADDING = 80;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.md;

type SectionLabelProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  color: string;
  mutedColor: string;
};

function SectionLabel({ icon, text, color, mutedColor }: SectionLabelProps) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: D.spacing.xs }}
    >
      <Ionicons name={icon} size={13} color={color} />
      <Text
        style={{
          fontSize: 11,
          fontWeight: D.fontWeight.semibold,
          color: mutedColor,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export default function ProductsScreen() {
  const { colors } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const insets = useSafeAreaInsets();

  const cache = productsCache.useProductsCache();
  const {
    items: products,
    total: totalProducts,
    page: currentPage,
    pageSize: currentPageSize,
    loading: isLoading,
    loadingMore,
    error,
  } = cache;

  const [filters, setFilters] = useState<ProductFilterState>({
    search: '',
    categories: [],
    minPrice: '',
    maxPrice: '',
  });
  const { profile: shopProfile, categories, refreshCategories } = useShop();
  const t = useT();

  const [modalVisible, setModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [draftCurrency, setDraftCurrency] = useState<Currency>('USD');
  const [draftCategory, setDraftCategory] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [addingNewCategory, setAddingNewCategory] = useState(false);
  const [draftImageUri, setDraftImageUri] = useState<string | null>(null);
  const [draftImageBase64, setDraftImageBase64] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');

  // Image preview / background-removal step (rendered inside the same modal)
  const [showPreview, setShowPreview] = useState(false);
  const [previewOriginalUri, setPreviewOriginalUri] = useState<string | null>(null);
  const [previewOriginalB64, setPreviewOriginalB64] = useState<string | null>(null);
  const [previewProcessedB64, setPreviewProcessedB64] = useState<string | null>(null);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [removeBgError, setRemoveBgError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const listRef = useRef<FlatList<ProductItem>>(null);

  // Reference image similarity search
  const [isFindingSimilar, setIsFindingSimilar] = useState(false);
  const [similarResults, setSimilarResults] = useState<ReferenceImage[] | null>(null);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const [similarPage, setSimilarPage] = useState(0);
  const SIMILAR_PAGE_SIZE = 4;

  const useSidebar = isWeb && screenWidth >= 900;
  const SIDEBAR_WIDTH = 272;
  const SIDEBAR_GAP = D.spacing.lg;

  // Responsive column count
  const baseWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH);
  const hPadding = !isWeb
    ? MOBILE_H_PADDING
    : screenWidth < 600
      ? MOBILE_H_PADDING
      : screenWidth < 1100
        ? D.spacing.xl
        : WEB_H_PADDING;
  const gridInnerWidth = useSidebar
    ? baseWidth - hPadding * 2 - SIDEBAR_WIDTH - SIDEBAR_GAP
    : baseWidth - hPadding * 2;
  const numColumns = isWeb ? (gridInnerWidth < 420 ? 2 : gridInnerWidth < 720 ? 3 : 4) : 2;
  const cardWidth = (gridInnerWidth - GAP * (numColumns - 1)) / numColumns;

  const styles = useMemo(
    () => makeStyles(colors, screenHeight, hPadding),
    [colors, screenHeight, hPadding]
  );

  const toApiFilters = useCallback((f: ProductFilterState): ProductFilters => {
    const apiFilters: ProductFilters = {};
    if (f.search) apiFilters.search = f.search;
    if (f.categories.length > 0) apiFilters.categories = f.categories;
    if (f.minPrice) {
      const n = Number(f.minPrice);
      if (!Number.isNaN(n)) apiFilters.minPrice = n;
    }
    if (f.maxPrice) {
      const n = Number(f.maxPrice);
      if (!Number.isNaN(n)) apiFilters.maxPrice = n;
    }
    return apiFilters;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void productsCache.ensureLoaded(toApiFilters(filters));
    }, [filters, toApiFilters])
  );

  function handleFiltersChange(next: ProductFilterState) {
    setFilters(next);
    void productsCache.setFiltersAndReload(toApiFilters(next));
  }

  const shopCurrency = (shopProfile?.currency ?? 'USD') as Currency;

  function openAddModal() {
    setEditingProduct(null);
    setDraftName('');
    setDraftPrice('');
    setDraftCurrency(shopCurrency);
    setDraftCategory('');
    setCategoryDropdownOpen(false);
    setAddingNewCategory(false);
    setDraftImageUri(null);
    setDraftImageBase64(null);
    setNameError('');
    setPriceError('');
    setModalVisible(true);
  }

  function openEditModal(product: ProductItem) {
    setEditingProduct(product);
    setDraftName(product.name);
    setDraftPrice(String(product.price));
    setDraftCurrency((product.currency ?? shopCurrency) as Currency);
    setDraftCategory(product.category ?? '');
    setCategoryDropdownOpen(false);
    setAddingNewCategory(false);
    setDraftImageUri(null);
    setDraftImageBase64(null);
    setNameError('');
    setPriceError('');
    setModalVisible(true);

    productImageCache
      .load(product.id)
      .then((entry) => {
        setDraftImageUri(entry.uri);
        const comma = entry.uri.indexOf(',');
        setDraftImageBase64(comma >= 0 ? entry.uri.slice(comma + 1) : null);
      })
      .catch(() => {});
  }

  function closeModal() {
    setModalVisible(false);
    setEditingProduct(null);
    setShowPreview(false);
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

  async function openImagePreview(uri: string) {
    setPreviewOriginalUri(uri);
    setPreviewOriginalB64(null);
    setPreviewProcessedB64(null);
    setRemoveBgError(null);
    setShowPreview(true);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    await openImagePreview(result.assets[0].uri);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    await openImagePreview(result.assets[0].uri);
  }

  function showPhotoSourcePicker() {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: () => void takePhoto() },
      { text: 'Choose from Library', onPress: () => void pickImage() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleRemoveBackground() {
    if (!previewOriginalUri) return;
    setIsRemovingBg(true);
    setRemoveBgError(null);
    try {
      const b64 = previewOriginalB64 ?? (await uriToBase64(previewOriginalUri));
      if (!previewOriginalB64) setPreviewOriginalB64(b64);
      const result = await removeBackground(b64);
      setPreviewProcessedB64(result.imageBase64);
    } catch (err: unknown) {
      setRemoveBgError(err instanceof Error ? err.message : 'Background removal failed.');
    } finally {
      setIsRemovingBg(false);
    }
  }

  async function handleFindSimilar() {
    if (!previewOriginalUri) return;
    setIsFindingSimilar(true);
    setSimilarError(null);
    try {
      const b64 = previewOriginalB64 ?? (await uriToBase64(previewOriginalUri));
      if (!previewOriginalB64) setPreviewOriginalB64(b64);
      const results = await searchReferenceImages(b64);
      setSimilarResults(results);
      setSimilarPage(0);
      setShowSimilarModal(true);
    } catch (err: unknown) {
      setSimilarError(err instanceof Error ? err.message : 'Similarity search failed.');
    } finally {
      setIsFindingSimilar(false);
    }
  }

  async function selectReferenceImage(ref: ReferenceImage) {
    if (!ref.imageUrl) return;
    setDraftImageUri(ref.imageUrl);
    // Reference search now returns blob URLs. We need base64 to send the bytes
    // back as a product image — fetch+encode lazily, only when the user actually
    // picks a reference (search result selection is rare).
    try {
      const base64 = await uriToBase64(ref.imageUrl);
      setDraftImageBase64(base64);
    } catch {
      setDraftImageBase64(null);
    }
    setShowSimilarModal(false);
    setShowPreview(false);
  }

  function confirmImageChoice(useProcessed: boolean) {
    if (useProcessed && previewProcessedB64) {
      setDraftImageUri(`data:image/png;base64,${previewProcessedB64}`);
      setDraftImageBase64(previewProcessedB64);
    } else {
      setDraftImageUri(previewOriginalUri);
      setDraftImageBase64(null);
    }
    setShowPreview(false);
  }

  function validate(): boolean {
    let valid = true;
    if (!draftName.trim()) {
      setNameError('Product name is required');
      valid = false;
    } else {
      setNameError('');
    }
    const priceNum = parseFloat(draftPrice);
    if (!draftPrice.trim() || isNaN(priceNum) || priceNum < 0) {
      setPriceError('Enter a valid price');
      valid = false;
    } else {
      setPriceError('');
    }
    return valid;
  }

  async function saveProduct() {
    if (!validate()) return;
    setIsSaving(true);
    try {
      let imageBase64 = draftImageBase64;
      if (!imageBase64 && draftImageUri && !draftImageUri.startsWith('data:')) {
        imageBase64 = await uriToBase64(draftImageUri);
      }
      const trimmedCategory = draftCategory.trim();
      const payload = {
        name: draftName.trim(),
        price: parseFloat(draftPrice),
        currency: draftCurrency,
        imageBase64,
        category: trimmedCategory.length > 0 ? trimmedCategory : null,
      };
      if (editingProduct) {
        const updated = await updateProduct(editingProduct.id, payload);
        if (updated.imageUrl) {
          productImageCache.primeUrl(updated.id, updated.imageUrl);
        } else {
          productImageCache.evict(updated.id);
        }
        productsCache.upsertItem(toMetadata(updated));
      } else {
        const created = await createProduct(payload);
        if (created.imageUrl) {
          productImageCache.primeUrl(created.id, created.imageUrl);
        }
        productsCache.addItem(toMetadata(created));
      }
      void refreshCategories();
      closeModal();
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    productsCache.removeItem(id);
    productImageCache.evict(id);
    try {
      await deleteProduct(id);
      void refreshCategories();
    } catch {
      void productsCache.refresh();
    }
  }

  const renderProduct = ({ item }: { item: ProductItem }) => (
    <Pressable
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.productCard,
        { width: cardWidth },
        hovered && styles.cardHovered,
        pressed && styles.cardPressed,
      ]}
      onPress={() => openEditModal(item)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
    >
      <View style={[styles.productImageArea, { height: cardWidth }]}>
        <View style={styles.productImageInset} pointerEvents="none">
          <ProductImage id={item.id} style={styles.productImageFit} resizeMode="contain" />
        </View>

        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
          onPress={(e) => {
            e.stopPropagation?.();
            setConfirmDeleteId(item.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={13} color="#fff" />
        </Pressable>

        <View style={styles.editHint}>
          <Ionicons name="create-outline" size={12} color="#fff" />
        </View>
      </View>
      <View style={styles.productInfo}>
        {item.category ? (
          <View style={styles.categoryPillWrap}>
            <Text style={styles.categoryPill} numberOfLines={1}>
              {item.category}
            </Text>
          </View>
        ) : (
          <View style={{ height: 14 }} />
        )}
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>{formatPrice(item.price, item.currency)}</Text>
        </View>
      </View>
    </Pressable>
  );

  const listContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerFill}>
          <View style={styles.loaderHalo}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
          </View>
          <Text style={[styles.emptySubtitle, { marginTop: D.spacing.md }]}>Loading catalog…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.accent.primary} />
          </View>
          <Text style={styles.emptyTitle}>Couldn&apos;t load catalog</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
            onPress={() => void productsCache.refresh()}
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
    if (products.length === 0) {
      const isFiltered = !!(
        filters.search ||
        filters.categories.length > 0 ||
        filters.minPrice ||
        filters.maxPrice
      );
      if (isFiltered) {
        return (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <View style={styles.emptyIconInner}>
                <Ionicons name="search-outline" size={40} color={colors.accent.primary} />
              </View>
            </View>
            <Text style={styles.emptyTitle}>{t('products.filteredEmptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('products.filteredEmptySubtitle')}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
              onPress={() =>
                handleFiltersChange({ search: '', categories: [], minPrice: '', maxPrice: '' })
              }
            >
              <Ionicons
                name="close-circle-outline"
                size={15}
                color={colors.text.secondary}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.retryText}>Clear filters</Text>
            </Pressable>
          </View>
        );
      }
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <View style={styles.emptyIconInner}>
              <Ionicons name="pricetag-outline" size={40} color={colors.accent.primary} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>{t('products.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('products.emptySubtitle')}</Text>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            onPress={openAddModal}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.addButtonText}>{t('products.addButton')}</Text>
          </Pressable>
        </View>
      );
    }
    const scrollListTop = () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      if (isWeb && typeof window !== 'undefined') {
        const doScroll = () => {
          window.scrollTo(0, 0);
          document.documentElement?.scrollTo?.(0, 0);
          document.body?.scrollTo?.(0, 0);
        };
        doScroll();
        requestAnimationFrame(() => {
          doScroll();
          requestAnimationFrame(doScroll);
        });
      }
    };
    const footer = isWeb ? (
      <Pagination
        page={currentPage}
        pageSize={currentPageSize}
        total={totalProducts}
        onPageChange={(p) => {
          void productsCache.goToPage(p);
          scrollListTop();
        }}
        disabled={isLoading}
      />
    ) : loadingMore ? (
      <View style={{ paddingVertical: D.spacing.md, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.accent.primary} />
      </View>
    ) : null;

    return (
      <FlatList
        ref={listRef}
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderProduct}
        contentContainerStyle={[styles.grid, useSidebar && { paddingHorizontal: 0 }]}
        columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
        showsVerticalScrollIndicator={false}
        onEndReached={!isWeb ? () => void productsCache.loadMore() : undefined}
        onEndReachedThreshold={0.4}
        ListFooterComponent={footer}
      />
    );
  };

  // Page entrance: hero fades/slides in, content follows with a small delay
  const heroOpacity = useSharedValue(0);
  const heroTranslate = useSharedValue(12);
  const gridOpacity = useSharedValue(0);
  const gridTranslate = useSharedValue(16);
  useEffect(() => {
    heroOpacity.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
    heroTranslate.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
    gridOpacity.value = withDelay(120, withTiming(1, { duration: 450 }));
    gridTranslate.value = withDelay(120, withTiming(0, { duration: 500 }));
  }, [heroOpacity, heroTranslate, gridOpacity, gridTranslate]);
  const heroAnimStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroTranslate.value }],
  }));
  const gridAnimStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: gridOpacity.value,
    transform: [{ translateY: gridTranslate.value }],
  }));

  return (
    <View style={styles.root}>
      {/* Ambient accent glow (behind content, desaturated) */}
      <View pointerEvents="none" style={styles.ambientGlow} />
      <View pointerEvents="none" style={styles.ambientGlow2} />

      <View style={styles.pageContainer}>
        <Animated.View style={[styles.pageHeader, heroAnimStyle]}>
          <View style={styles.headerTextBlock}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>Catalog</Text>
            </View>
            <Text style={styles.pageTitle}>{t('products.pageTitle')}</Text>
            <View style={styles.subtitleRow}>
              <View style={styles.countChip}>
                <Ionicons name="cube-outline" size={12} color={colors.accent.primary} />
                <Text style={styles.countChipText}>
                  {totalProducts} {totalProducts === 1 ? 'item' : 'items'}
                </Text>
              </View>
              <Text style={styles.pageSubtitle}>in your catalog</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              onPress={openAddModal}
              accessibilityRole="button"
              accessibilityLabel="Add product"
            >
              <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.addButtonText}>{t('products.addButton')}</Text>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View style={gridAnimStyle}>
          {(() => {
            const showFilter =
              totalProducts > 0 ||
              filters.search ||
              filters.categories.length > 0 ||
              filters.minPrice ||
              filters.maxPrice;
            const useSidebarLayout = isWeb && screenWidth >= 900;
            if (!showFilter) return listContent();
            if (useSidebarLayout) {
              return (
                <View style={styles.sidebarLayout}>
                  <View style={styles.sidebar}>
                    <ProductFilterBar
                      value={filters}
                      onChange={handleFiltersChange}
                      categories={categories}
                      layout="vertical"
                      resultCount={isLoading ? undefined : totalProducts}
                    />
                  </View>
                  <View style={styles.sidebarContent}>{listContent()}</View>
                </View>
              );
            }
            return (
              <>
                <View style={styles.filterBarWrap}>
                  <ProductFilterBar
                    value={filters}
                    onChange={handleFiltersChange}
                    categories={categories}
                    resultCount={isLoading ? undefined : totalProducts}
                  />
                </View>
                {listContent()}
              </>
            );
          })()}
        </Animated.View>
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
              <View style={styles.confirmIconInner}>
                <Ionicons name="trash-outline" size={26} color={colors.destructive} />
              </View>
            </View>
            <Text style={styles.confirmTitle}>{t('products.deleteConfirm.title')}</Text>
            <Text style={styles.confirmBody}>{t('products.deleteConfirm.body')}</Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.confirmCancel, pressed && { opacity: 0.7 }]}
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

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKAV}
          >
            <Pressable
              style={[styles.modalSheet, !isWeb && { paddingBottom: insets.bottom + D.spacing.md }]}
              onPress={() => {}}
            >
              {!isWeb && <View style={styles.modalHandle} />}

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={!isWeb && styles.modalScrollContent}
              >
                {showSimilarModal ? (
                  <>
                    <View style={styles.modalHeaderRow}>
                      <View style={styles.modalHeaderIcon}>
                        <Ionicons name="sparkles-outline" size={18} color={colors.accent.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle}>Professional References</Text>
                        <Text style={styles.modalSubtitle}>
                          Tap a photo to use it as your product reference image.
                        </Text>
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.6 }]}
                        onPress={() => setShowSimilarModal(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={18} color={colors.text.secondary} />
                      </Pressable>
                    </View>

                    {similarResults?.length === 0 ? (
                      <View style={styles.similarEmpty}>
                        <View style={styles.emptyIconCircle}>
                          <View style={styles.emptyIconInner}>
                            <Ionicons
                              name="search-outline"
                              size={34}
                              color={colors.accent.primary}
                            />
                          </View>
                        </View>
                        <Text style={styles.emptyTitle}>No matches</Text>
                        <Text style={styles.emptySubtitle}>
                          No similar products found in the reference library.
                        </Text>
                      </View>
                    ) : (
                      (() => {
                        const all = similarResults ?? [];
                        const totalPages = Math.max(1, Math.ceil(all.length / SIMILAR_PAGE_SIZE));
                        const page = Math.min(similarPage, totalPages - 1);
                        const pageItems = all.slice(
                          page * SIMILAR_PAGE_SIZE,
                          page * SIMILAR_PAGE_SIZE + SIMILAR_PAGE_SIZE
                        );
                        const numCols = isWeb ? 4 : 2;
                        return (
                          <>
                            <View style={styles.similarGrid}>
                              {pageItems.map((item) => (
                                <Pressable
                                  key={item.id}
                                  style={({ pressed }) => [
                                    styles.similarCard,
                                    {
                                      flexBasis: `${100 / numCols}%`,
                                      maxWidth: `${100 / numCols}%`,
                                    },
                                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                                  ]}
                                  onPress={() => selectReferenceImage(item)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Use ${item.name}`}
                                >
                                  <View style={styles.similarCardInner}>
                                    <View style={styles.similarImageWrap}>
                                      <Image
                                        source={{ uri: item.imageUrl ?? undefined }}
                                        style={styles.similarImage}
                                        resizeMode="contain"
                                      />
                                      <View style={styles.similarMatchBadge}>
                                        <Ionicons
                                          name="flash"
                                          size={10}
                                          color="#fff"
                                          style={{ marginRight: 3 }}
                                        />
                                        <Text style={styles.similarMatchText}>
                                          {Math.round(item.similarity * 100)}%
                                        </Text>
                                      </View>
                                    </View>
                                    <View style={styles.similarCardBody}>
                                      <Text style={styles.similarCardName} numberOfLines={2}>
                                        {item.name}
                                      </Text>
                                      {item.categoryPath && (
                                        <Text style={styles.similarCardCategory} numberOfLines={1}>
                                          {item.categoryPath}
                                        </Text>
                                      )}
                                    </View>
                                  </View>
                                </Pressable>
                              ))}
                            </View>

                            {totalPages > 1 && (
                              <View style={styles.paginationBar}>
                                <Pressable
                                  style={({ pressed }) => [
                                    styles.pageButton,
                                    page === 0 && styles.pageButtonDisabled,
                                    pressed && page !== 0 && { opacity: 0.7 },
                                  ]}
                                  disabled={page === 0}
                                  onPress={() => setSimilarPage((p) => Math.max(0, p - 1))}
                                  accessibilityLabel="Previous page"
                                >
                                  <Ionicons
                                    name="chevron-back"
                                    size={18}
                                    color={page === 0 ? colors.text.muted : colors.text.primary}
                                  />
                                </Pressable>

                                <View style={styles.pageDots}>
                                  {Array.from({ length: totalPages }).map((_, i) => (
                                    <Pressable
                                      key={i}
                                      onPress={() => setSimilarPage(i)}
                                      style={[styles.pageDot, i === page && styles.pageDotActive]}
                                      accessibilityLabel={`Go to page ${i + 1}`}
                                    />
                                  ))}
                                </View>

                                <Text style={styles.pageIndicator}>
                                  {page + 1} / {totalPages}
                                </Text>

                                <Pressable
                                  style={({ pressed }) => [
                                    styles.pageButton,
                                    page >= totalPages - 1 && styles.pageButtonDisabled,
                                    pressed && page < totalPages - 1 && { opacity: 0.7 },
                                  ]}
                                  disabled={page >= totalPages - 1}
                                  onPress={() =>
                                    setSimilarPage((p) => Math.min(totalPages - 1, p + 1))
                                  }
                                  accessibilityLabel="Next page"
                                >
                                  <Ionicons
                                    name="chevron-forward"
                                    size={18}
                                    color={
                                      page >= totalPages - 1
                                        ? colors.text.muted
                                        : colors.text.primary
                                    }
                                  />
                                </Pressable>
                              </View>
                            )}
                          </>
                        );
                      })()
                    )}
                  </>
                ) : showPreview ? (
                  <>
                    <View style={styles.modalHeaderRow}>
                      <View style={styles.modalHeaderIcon}>
                        <Ionicons name="image-outline" size={18} color={colors.accent.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle}>Preview Photo</Text>
                        <Text style={styles.modalSubtitle}>
                          Enhance your photo before using it.
                        </Text>
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.6 }]}
                        onPress={() => setShowPreview(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        hitSlop={8}
                      >
                        <Ionicons name="arrow-back" size={18} color={colors.text.secondary} />
                      </Pressable>
                    </View>

                    {/* Step indicator */}
                    <View style={styles.stepIndicator}>
                      <View style={[styles.stepPill, styles.stepPillActive]}>
                        <Text style={styles.stepPillTextActive}>1 · Preview</Text>
                      </View>
                      <View style={styles.stepConnector} />
                      <View style={[styles.stepPill, previewProcessedB64 && styles.stepPillActive]}>
                        <Text
                          style={
                            previewProcessedB64 ? styles.stepPillTextActive : styles.stepPillText
                          }
                        >
                          2 · Enhance
                        </Text>
                      </View>
                      <View style={styles.stepConnector} />
                      <View style={styles.stepPill}>
                        <Text style={styles.stepPillText}>3 · Confirm</Text>
                      </View>
                    </View>

                    <View style={styles.previewImageWrap}>
                      <Image
                        source={{
                          uri: previewProcessedB64
                            ? `data:image/png;base64,${previewProcessedB64}`
                            : (previewOriginalUri ?? undefined),
                        }}
                        style={styles.previewImage}
                        resizeMode="contain"
                      />
                      {previewProcessedB64 && (
                        <View style={styles.previewBadge}>
                          <Ionicons name="checkmark-circle" size={12} color="#fff" />
                          <Text style={styles.previewBadgeText}>Background removed</Text>
                        </View>
                      )}
                    </View>

                    {removeBgError && (
                      <View style={styles.inlineErrorBanner}>
                        <Ionicons name="alert-circle-outline" size={14} color={colors.text.error} />
                        <Text style={styles.inlineErrorText}>{removeBgError}</Text>
                      </View>
                    )}

                    <Pressable
                      style={({ pressed }) => [
                        styles.enhanceButton,
                        isRemovingBg && { opacity: 0.7 },
                        pressed && !isRemovingBg && { opacity: 0.88 },
                      ]}
                      onPress={() => void handleRemoveBackground()}
                      disabled={isRemovingBg}
                    >
                      {isRemovingBg ? (
                        <ActivityIndicator size="small" color={colors.accent.primary} />
                      ) : (
                        <>
                          <View style={styles.enhanceIconWrap}>
                            <Ionicons name="cut-outline" size={14} color={colors.accent.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.enhanceButtonTitle}>
                              {previewProcessedB64
                                ? 'Remove Background Again'
                                : 'Remove Background'}
                            </Text>
                            <Text style={styles.enhanceButtonSubtitle}>
                              AI-powered, one-tap cleanup
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.enhanceButton,
                        styles.enhanceButtonAlt,
                        isFindingSimilar && { opacity: 0.7 },
                        pressed && !isFindingSimilar && { opacity: 0.88 },
                      ]}
                      onPress={() => void handleFindSimilar()}
                      disabled={isFindingSimilar}
                    >
                      {isFindingSimilar ? (
                        <ActivityIndicator size="small" color={colors.accent.secondary} />
                      ) : (
                        <>
                          <View style={[styles.enhanceIconWrap, styles.enhanceIconWrapAlt]}>
                            <Ionicons
                              name="sparkles-outline"
                              size={14}
                              color={colors.accent.secondary}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.enhanceButtonTitle}>
                              Find Professional Reference
                            </Text>
                            <Text style={styles.enhanceButtonSubtitle}>
                              Swap in a studio-quality match
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
                        </>
                      )}
                    </Pressable>

                    {similarError && (
                      <View style={styles.inlineErrorBanner}>
                        <Ionicons name="alert-circle-outline" size={14} color={colors.text.error} />
                        <Text style={styles.inlineErrorText}>{similarError}</Text>
                      </View>
                    )}

                    <View style={styles.modalActions}>
                      <Pressable
                        style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.75 }]}
                        onPress={() => confirmImageChoice(false)}
                      >
                        <Text style={styles.cancelButtonText}>Use Original</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.saveButton,
                          !previewProcessedB64 && styles.saveButtonDisabled,
                          pressed && !!previewProcessedB64 && { opacity: 0.88 },
                        ]}
                        onPress={() => confirmImageChoice(true)}
                        disabled={!previewProcessedB64}
                      >
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color="#fff"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.saveButtonText}>Use Processed</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.modalHeaderRow}>
                      <View style={styles.modalHeaderIcon}>
                        <Ionicons
                          name={editingProduct ? 'pencil-outline' : 'add-circle-outline'}
                          size={18}
                          color={colors.accent.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle}>
                          {editingProduct
                            ? t('products.modal.editTitle')
                            : t('products.modal.newTitle')}
                        </Text>
                        <Text style={styles.modalSubtitle}>
                          {editingProduct
                            ? 'Update the details of this product.'
                            : 'Add a new item to your catalog.'}
                        </Text>
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.6 }]}
                        onPress={closeModal}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={18} color={colors.text.secondary} />
                      </Pressable>
                    </View>

                    {/* Photo picker */}
                    <SectionLabel
                      icon="camera-outline"
                      text="Photo"
                      color={colors.accent.primary}
                      mutedColor={colors.text.muted}
                    />
                    <Pressable
                      style={({ pressed }) => [
                        styles.imagePicker,
                        draftImageUri && styles.imagePickerFilled,
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => (isWeb ? void pickImage() : showPhotoSourcePicker())}
                      accessibilityRole="button"
                      accessibilityLabel="Pick product photo"
                    >
                      {draftImageUri ? (
                        <Image
                          source={{ uri: draftImageUri }}
                          style={styles.imagePickerPreview}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={styles.imagePickerPlaceholder}>
                          <View style={styles.imagePickerIconBadge}>
                            <Ionicons
                              name="camera-outline"
                              size={22}
                              color={colors.accent.primary}
                            />
                          </View>
                          <Text style={styles.imagePickerLabel}>
                            {t('products.modal.photoPlaceholder')}
                          </Text>
                          <Text style={styles.imagePickerHint}>PNG or JPG, up to 10 MB</Text>
                        </View>
                      )}
                      {draftImageUri && (
                        <View style={styles.imagePickerOverlay}>
                          <Ionicons name="camera-reverse-outline" size={16} color="#fff" />
                          <Text style={styles.imagePickerOverlayText}>Change</Text>
                        </View>
                      )}
                    </Pressable>

                    {/* Name */}
                    <View style={styles.fieldGroup}>
                      <SectionLabel
                        icon="text-outline"
                        text={t('products.modal.nameLabel')}
                        color={colors.accent.primary}
                        mutedColor={colors.text.muted}
                      />
                      <TextInput
                        style={[styles.textInput, nameError ? styles.textInputError : null]}
                        placeholder="e.g. Artisan Coffee Blend"
                        placeholderTextColor={colors.text.muted}
                        value={draftName}
                        onChangeText={(txt) => {
                          setDraftName(txt);
                          if (nameError) setNameError('');
                        }}
                        autoCorrect={false}
                      />
                      {nameError ? (
                        <View style={styles.inlineErrorBanner}>
                          <Ionicons
                            name="alert-circle-outline"
                            size={13}
                            color={colors.text.error}
                          />
                          <Text style={styles.inlineErrorText}>{nameError}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Category */}
                    <View style={styles.fieldGroup}>
                      <SectionLabel
                        icon="pricetags-outline"
                        text={t('products.modal.categoryLabel')}
                        color={colors.accent.primary}
                        mutedColor={colors.text.muted}
                      />
                      {addingNewCategory ? (
                        <View style={styles.categoryInputRow}>
                          <TextInput
                            style={[styles.textInput, { flex: 1 }]}
                            placeholder="Type a new category"
                            placeholderTextColor={colors.text.muted}
                            value={draftCategory}
                            onChangeText={setDraftCategory}
                            autoCorrect={false}
                            autoCapitalize="words"
                            autoFocus
                            maxLength={100}
                          />
                          <Pressable
                            onPress={() => {
                              setAddingNewCategory(false);
                              setDraftCategory('');
                            }}
                            style={({ pressed }) => [
                              styles.categoryCancelBtn,
                              pressed && { opacity: 0.7 },
                            ]}
                            accessibilityLabel="Cancel new category"
                          >
                            <Ionicons name="close" size={18} color={colors.text.secondary} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => setCategoryDropdownOpen((v) => !v)}
                          style={({ pressed }) => [
                            styles.categorySelectBtn,
                            categoryDropdownOpen && styles.categorySelectBtnOpen,
                            pressed && { opacity: 0.85 },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: categoryDropdownOpen }}
                        >
                          <Text
                            style={[
                              styles.categorySelectText,
                              !draftCategory && styles.categorySelectPlaceholder,
                            ]}
                            numberOfLines={1}
                          >
                            {draftCategory || t('products.modal.categoryPlaceholder')}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {draftCategory ? (
                              <Pressable
                                onPress={() => setDraftCategory('')}
                                hitSlop={6}
                                accessibilityLabel="Clear category"
                              >
                                <Ionicons name="close-circle" size={16} color={colors.text.muted} />
                              </Pressable>
                            ) : null}
                            <Ionicons
                              name={categoryDropdownOpen ? 'chevron-up' : 'chevron-down'}
                              size={16}
                              color={colors.text.secondary}
                            />
                          </View>
                        </Pressable>
                      )}

                      {categoryDropdownOpen && !addingNewCategory && (
                        <View style={styles.categoryDropdown}>
                          <ScrollView
                            style={{ maxHeight: 200 }}
                            nestedScrollEnabled
                            keyboardShouldPersistTaps="handled"
                          >
                            {categories.length === 0 ? (
                              <Text style={styles.categoryDropdownEmpty}>
                                No categories yet — add your first below.
                              </Text>
                            ) : (
                              categories.map((c) => {
                                const isSel =
                                  c.toLowerCase() === draftCategory.trim().toLowerCase();
                                return (
                                  <Pressable
                                    key={c}
                                    onPress={() => {
                                      setDraftCategory(c);
                                      setCategoryDropdownOpen(false);
                                    }}
                                    style={({ pressed }) => [
                                      styles.categoryDropdownItem,
                                      isSel && styles.categoryDropdownItemSelected,
                                      pressed && { backgroundColor: colors.bg.elevated },
                                    ]}
                                    accessibilityRole="menuitem"
                                  >
                                    <Text
                                      style={[
                                        styles.categoryDropdownItemText,
                                        isSel && { color: colors.accent.primary },
                                      ]}
                                    >
                                      {c}
                                    </Text>
                                    {isSel && (
                                      <Ionicons
                                        name="checkmark"
                                        size={16}
                                        color={colors.accent.primary}
                                      />
                                    )}
                                  </Pressable>
                                );
                              })
                            )}
                          </ScrollView>
                          <Pressable
                            onPress={() => {
                              setCategoryDropdownOpen(false);
                              setDraftCategory('');
                              setAddingNewCategory(true);
                            }}
                            style={({ pressed }) => [
                              styles.categoryAddNewRow,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <Ionicons
                              name="add-circle-outline"
                              size={16}
                              color={colors.accent.primary}
                            />
                            <Text style={styles.categoryAddNewText}>
                              {t('products.modal.newCategory')}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {/* Currency */}
                    <View style={styles.fieldGroup}>
                      <SectionLabel
                        icon="swap-horizontal-outline"
                        text={t('products.modal.currencyLabel')}
                        color={colors.accent.primary}
                        mutedColor={colors.text.muted}
                      />
                      <View style={styles.currencyRow}>
                        {CURRENCY_CHOICES.map((c) => {
                          const selected = draftCurrency === c;
                          return (
                            <Pressable
                              key={c}
                              onPress={() => setDraftCurrency(c)}
                              style={({ pressed }) => [
                                styles.currencyChip,
                                selected && styles.currencyChipSelected,
                                pressed && { opacity: 0.85 },
                              ]}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              accessibilityLabel={`Currency ${c}`}
                            >
                              <Text style={styles.currencySymbol}>{currencySymbol(c)}</Text>
                              <Text
                                style={[
                                  styles.currencyChipText,
                                  selected && { color: colors.accent.primary },
                                ]}
                              >
                                {c}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* Price */}
                    <View style={styles.fieldGroup}>
                      <SectionLabel
                        icon="cash-outline"
                        text={`${t('products.modal.priceLabel')} (${draftCurrency})`}
                        color={colors.accent.primary}
                        mutedColor={colors.text.muted}
                      />
                      <View style={styles.priceInputRow}>
                        <View style={styles.priceCurrencyBadge}>
                          <Text style={styles.priceCurrencyText}>
                            {currencySymbol(draftCurrency)}
                          </Text>
                        </View>
                        <TextInput
                          style={[
                            styles.textInput,
                            styles.priceInput,
                            priceError ? styles.textInputError : null,
                          ]}
                          placeholder="0.00"
                          placeholderTextColor={colors.text.muted}
                          value={draftPrice}
                          onChangeText={(txt) => {
                            setDraftPrice(txt);
                            if (priceError) setPriceError('');
                          }}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      {priceError ? (
                        <View style={styles.inlineErrorBanner}>
                          <Ionicons
                            name="alert-circle-outline"
                            size={13}
                            color={colors.text.error}
                          />
                          <Text style={styles.inlineErrorText}>{priceError}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Actions */}
                    <View style={styles.modalActions}>
                      <Pressable
                        style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.75 }]}
                        onPress={closeModal}
                        accessibilityRole="button"
                        disabled={isSaving}
                      >
                        <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.saveButton,
                          isSaving && { opacity: 0.7 },
                          pressed && !isSaving && { opacity: 0.88 },
                        ]}
                        onPress={() => void saveProduct()}
                        accessibilityRole="button"
                        accessibilityLabel="Save product"
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons
                              name={editingProduct ? 'checkmark' : 'arrow-forward'}
                              size={16}
                              color="#fff"
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.saveButtonText}>{t('products.modal.save')}</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  windowHeight: number,
  hPadding: number
) {
  const modalMaxHeight = Math.round(windowHeight * (isWeb ? 0.9 : 0.92));
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
      paddingHorizontal: hPadding,
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
    countChipText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    pageSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingVertical: 11,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.accent.secondary,
      ...D.shadow.glow,
    },
    addButtonPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
    addButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      letterSpacing: 0.2,
    },

    // ── Grid ─────────────────────────────────────────────────────────────
    grid: {
      paddingHorizontal: hPadding,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.xl,
    },
    gridRow: {
      gap: GAP,
      marginBottom: GAP,
    },

    // ── Product card ─────────────────────────────────────────────────────
    productCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    cardHovered: {
      borderColor: colors.accent.primary,
      transform: [{ translateY: -2 }],
      ...D.shadow.glow,
    },
    cardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.985 }],
    },
    productImageArea: {
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
      position: 'relative',
    },
    productImageInset: {
      ...StyleSheet.absoluteFillObject,
      padding: D.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    productImageFit: {
      width: '100%',
      height: '100%',
    },
    deleteButton: {
      position: 'absolute',
      top: D.spacing.sm,
      right: D.spacing.sm,
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
    deleteButtonPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.94 }],
    },
    editHint: {
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
    productInfo: {
      padding: D.spacing.md,
      gap: D.spacing.xs,
    },
    categoryPillWrap: {
      alignSelf: 'flex-start',
    },
    categoryPill: {
      fontSize: 10,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    productName: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      lineHeight: 20,
      letterSpacing: -0.2,
    },
    priceBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingVertical: 4,
      paddingHorizontal: D.spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginTop: 2,
    },
    priceText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.1,
    },

    // ── Filter bar / sidebar ─────────────────────────────────────────────
    filterBarWrap: {
      paddingHorizontal: hPadding,
      paddingBottom: D.spacing.sm,
    },
    sidebarLayout: {
      flex: 1,
      flexDirection: 'row',
      paddingHorizontal: hPadding,
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

    // ── Category dropdown (used in modal) ────────────────────────────────
    categorySelectBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 10,
      gap: D.spacing.sm,
    },
    categorySelectBtnOpen: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.bg.inputFocus,
    },
    categorySelectText: {
      flex: 1,
      fontSize: D.fontSize.base,
      color: colors.text.primary,
    },
    categorySelectPlaceholder: {
      color: colors.text.muted,
    },
    categoryDropdown: {
      marginTop: D.spacing.xs,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.surface,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    categoryDropdownEmpty: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      fontStyle: 'italic',
      padding: D.spacing.md,
    },
    categoryDropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      paddingHorizontal: D.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    categoryDropdownItemSelected: {
      backgroundColor: colors.accent.dim,
    },
    categoryDropdownItemText: {
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      fontWeight: D.fontWeight.medium,
    },
    categoryAddNewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: 11,
      paddingHorizontal: D.spacing.md,
      backgroundColor: colors.bg.elevated,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
    },
    categoryAddNewText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    categoryInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    categoryCancelBtn: {
      width: 44,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
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

    // ── Modal shell ──────────────────────────────────────────────────────
    modalScrollContent: {
      flexGrow: 1,
      paddingVertical: D.spacing.md,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.66)',
      justifyContent: isWeb ? 'center' : 'flex-end',
      alignItems: 'center',
      paddingHorizontal: isWeb ? D.spacing.md : 0,
      paddingVertical: isWeb ? D.spacing.md : 0,
    },
    modalKAV: {
      width: '100%',
      maxWidth: isWeb ? 560 : undefined,
      alignSelf: 'center',
    },
    modalSheet: {
      backgroundColor: colors.bg.surface,
      borderRadius: isWeb ? D.radius.xl : undefined,
      borderTopLeftRadius: isWeb ? undefined : D.radius.xl,
      borderTopRightRadius: isWeb ? undefined : D.radius.xl,
      paddingHorizontal: D.spacing.md,
      paddingTop: D.spacing.md,
      maxHeight: modalMaxHeight,
      width: '100%',
      alignSelf: 'stretch',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...D.shadow.modal,
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginBottom: D.spacing.md,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: D.spacing.sm,
      marginBottom: D.spacing.md,
    },
    modalHeaderIcon: {
      width: 40,
      height: 40,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginTop: 2,
    },
    modalTitle: {
      fontSize: D.fontSize.xl,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.4,
    },
    modalSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      lineHeight: 19,
      marginTop: 2,
    },
    modalCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Modal content ────────────────────────────────────────────────────
    imagePicker: {
      width: '100%',
      aspectRatio: 2.2,
      maxHeight: 220,
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderStyle: 'dashed',
      overflow: 'hidden',
      marginBottom: D.spacing.md,
    },
    imagePickerFilled: {
      borderStyle: 'solid',
      borderColor: colors.border.subtle,
    },
    imagePickerPreview: {
      width: '100%',
      height: '100%',
    },
    imagePickerPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.md,
    },
    imagePickerIconBadge: {
      width: 48,
      height: 48,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    imagePickerLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    imagePickerHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    imagePickerOverlay: {
      position: 'absolute',
      bottom: D.spacing.sm,
      right: D.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    imagePickerOverlayText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
    fieldGroup: {
      marginBottom: D.spacing.sm,
    },
    textInput: {
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 10,
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      flex: 1,
    },
    textInputError: {
      borderColor: colors.border.error,
    },
    inlineErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: D.radius.sm,
      backgroundColor: 'rgba(248,113,113,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(248,113,113,0.28)',
    },
    inlineErrorText: {
      flex: 1,
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.medium,
      color: colors.text.error,
    },
    fieldError: {
      fontSize: D.fontSize.xs,
      color: colors.text.error,
      marginTop: 4,
    },

    // Currency chips
    currencyRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      flexWrap: 'wrap',
    },
    currencyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.input,
    },
    currencyChipSelected: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    currencySymbol: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: colors.text.secondary,
    },
    currencyChipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
      letterSpacing: 0.3,
    },

    // Price input
    priceInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    priceCurrencyBadge: {
      width: 46,
      height: 42,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    priceCurrencyText: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
    },
    priceInput: {
      flex: 1,
    },

    modalActions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      marginTop: D.spacing.md,
      marginBottom: D.spacing.sm,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.elevated,
    },
    cancelButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 2,
      flexDirection: 'row',
      paddingVertical: 11,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.accent.secondary,
      ...D.shadow.glow,
    },
    saveButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: '#fff',
      letterSpacing: 0.2,
    },
    saveButtonDisabled: {
      opacity: 0.4,
      shadowOpacity: 0,
      elevation: 0,
    },

    // ── Confirm delete dialog ────────────────────────────────────────────
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

    // ── Preview / enhance ────────────────────────────────────────────────
    stepIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginBottom: D.spacing.md,
      flexWrap: 'wrap',
    },
    stepPill: {
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    stepPillActive: {
      backgroundColor: colors.accent.dim,
      borderColor: colors.accent.primary,
    },
    stepPillText: {
      fontSize: 10,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      letterSpacing: 0.4,
    },
    stepPillTextActive: {
      fontSize: 10,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.4,
    },
    stepConnector: {
      width: 12,
      height: 1,
      backgroundColor: colors.border.default,
    },
    previewImageWrap: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      marginBottom: D.spacing.md,
      position: 'relative',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewBadge: {
      position: 'absolute',
      top: D.spacing.sm,
      left: D.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(16,185,129,0.92)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    previewBadgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: '#fff',
    },
    enhanceButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: 14,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.accent.primary,
      backgroundColor: colors.bg.inputFocus,
      marginBottom: D.spacing.sm,
    },
    enhanceButtonAlt: {
      borderColor: colors.accent.secondary,
    },
    enhanceIconWrap: {
      width: 34,
      height: 34,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    enhanceIconWrapAlt: {
      backgroundColor: colors.accent.dim,
    },
    enhanceButtonTitle: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.1,
    },
    enhanceButtonSubtitle: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 1,
    },

    // ── Similar references grid ─────────────────────────────────────────
    similarEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: D.spacing['2xl'],
      gap: D.spacing.sm,
    },
    similarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -D.spacing.xs,
      marginBottom: D.spacing.md,
    },
    similarCard: {
      padding: D.spacing.xs,
    },
    similarCardInner: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    similarImageWrap: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    similarImage: {
      width: '100%',
      height: '100%',
    },
    similarMatchBadge: {
      position: 'absolute',
      top: D.spacing.sm,
      right: D.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      ...D.shadow.sm,
    },
    similarMatchText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: '#fff',
      letterSpacing: 0.2,
    },
    similarCardBody: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: D.spacing.sm,
      gap: 2,
    },
    similarCardName: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      lineHeight: 18,
    },
    similarCardCategory: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      textTransform: 'capitalize',
    },
    paginationBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
      paddingTop: D.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    pageButton: {
      width: 38,
      height: 38,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.elevated,
    },
    pageButtonDisabled: {
      opacity: 0.4,
    },
    pageDots: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      paddingHorizontal: D.spacing.sm,
    },
    pageDot: {
      width: 7,
      height: 7,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
    },
    pageDotActive: {
      backgroundColor: colors.accent.primary,
      width: 22,
    },
    pageIndicator: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.medium,
      color: colors.text.muted,
      minWidth: 40,
      textAlign: 'center',
    },
  });
}
