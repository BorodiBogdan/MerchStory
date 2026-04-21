import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  DimensionValue,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { fetchProductCategories, ProductFilters, ProductItem } from '@/utils/api';
import * as productsCache from '@/utils/productsCache';

import { ProductFilterBar, ProductFilterState } from './ProductFilterBar';
import { ProductImage } from './ProductImage';

interface ProductPickerModalProps {
  visible: boolean;
  onClose: () => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  title?: string;
  subtitle?: string;
  onProductsLoaded?: (products: ProductItem[]) => void;
}

const DESKTOP_BREAKPOINT = 900;
const EMPTY_FILTERS: ProductFilterState = {
  search: '',
  categories: [],
  minPrice: '',
  maxPrice: '',
};

function toApiFilters(f: ProductFilterState): ProductFilters {
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
}

export function ProductPickerModal({
  visible,
  onClose,
  selected,
  onToggle,
  title = 'Choose Products',
  subtitle,
  onProductsLoaded,
}: ProductPickerModalProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= DESKTOP_BREAKPOINT;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const cache = productsCache.useProductsCache();
  const { items: products, loading, loadingMore, total } = cache;

  const [filters, setFilters] = useState<ProductFilterState>(EMPTY_FILTERS);
  const [categories, setCategories] = useState<string[]>([]);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchProductCategories();
      setCategories(cats);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadCategories();
    void productsCache.setFiltersAndReload(toApiFilters(filters));
  }, [visible, filters, loadCategories]);

  useEffect(() => {
    if (!visible) setFilters(EMPTY_FILTERS);
  }, [visible]);

  useEffect(() => {
    if (visible && !loading) onProductsLoaded?.(products);
  }, [visible, loading, products, onProductsLoaded]);

  const selectedCount = selected.size;

  const DIALOG_MAX = 960;
  const dialogWidth = Math.min(screenWidth - 96, DIALOG_MAX);
  const MODAL_COLS_DESKTOP = 4;
  const MODAL_COLS_MOBILE = 2;
  const modalCols = isDesktop ? MODAL_COLS_DESKTOP : MODAL_COLS_MOBILE;
  const modalPad = D.spacing.lg;
  const modalGap = D.spacing.sm;
  const modalThumbWidth = isDesktop
    ? Math.floor(
        (dialogWidth - modalPad * 2 - modalGap * (MODAL_COLS_DESKTOP - 1)) / MODAL_COLS_DESKTOP
      )
    : Math.floor(
        (screenWidth - modalPad * 2 - modalGap * (MODAL_COLS_MOBILE - 1)) / MODAL_COLS_MOBILE
      );

  const isFiltered = !!(
    filters.search ||
    filters.categories.length > 0 ||
    filters.minPrice ||
    filters.maxPrice
  );

  const body = (
    <>
      <View style={{ paddingHorizontal: modalPad, paddingTop: D.spacing.xs }}>
        <ProductFilterBar
          value={filters}
          onChange={setFilters}
          categories={categories}
          layout={isDesktop ? 'auto' : 'compact'}
          resultCount={loading ? undefined : total}
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="pricetag-outline" size={32} color={colors.text.muted} />
          <Text style={styles.emptyText}>
            {isFiltered ? 'No products match these filters.' : 'No products yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={modalCols}
          key={modalCols}
          contentContainerStyle={{ padding: modalPad, gap: modalGap }}
          columnWrapperStyle={{ gap: modalGap }}
          onEndReached={() => void productsCache.loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: D.spacing.md, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent.primary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isSel = selected.has(item.id);
            return (
              <Pressable
                style={({ pressed }) => ({
                  width: modalThumbWidth,
                  borderRadius: D.radius.md,
                  overflow: 'hidden',
                  borderWidth: 1.5,
                  borderColor: isSel ? colors.accent.primary : colors.border.subtle,
                  backgroundColor: isSel ? colors.accent.dim : colors.bg.base,
                  opacity: pressed ? 0.85 : 1,
                })}
                onPress={() => onToggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSel }}
              >
                <View style={{ width: '100%', aspectRatio: 1, position: 'relative' }}>
                  <ProductImage
                    id={item.id}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  {isSel && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                    </View>
                  )}
                </View>
                <View style={{ padding: D.spacing.sm }}>
                  {item.category ? (
                    <Text style={styles.cardCategory} numberOfLines={1}>
                      {item.category}
                    </Text>
                  ) : null}
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardPrice}>${item.price.toFixed(2)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View style={[styles.footer, { paddingHorizontal: modalPad }]}>
        <Text style={styles.footerText}>
          {selectedCount > 0
            ? `${selectedCount} product${selectedCount !== 1 ? 's' : ''} selected`
            : 'Tap products to select'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.doneBtnText}>
            {selectedCount > 0 ? `Done (${selectedCount})` : 'Done'}
          </Text>
        </Pressable>
      </View>
    </>
  );

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {selectedCount > 0 && (
        <View style={[styles.countBadge, { marginRight: D.spacing.sm }]}>
          <Text style={styles.countBadgeText}>{selectedCount} selected</Text>
        </View>
      )}
      <Pressable
        style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={18} color={colors.text.secondary} />
      </Pressable>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={isDesktop}
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      {isDesktop ? (
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.dialog, { width: dialogWidth, maxHeight: '90%' as DimensionValue }]}
            onPress={() => {}}
          >
            {header}
            {body}
          </Pressable>
        </Pressable>
      ) : (
        <View style={styles.fullscreen}>
          {header}
          {body}
        </View>
      )}
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: D.spacing.lg,
    },
    dialog: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      overflow: 'hidden',
      ...D.shadow.modal,
    },
    fullscreen: {
      flex: 1,
      backgroundColor: colors.bg.surface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: D.spacing.sm,
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.elevated,
    },
    countBadge: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
    },
    countBadgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    loadingWrap: {
      paddingVertical: D.spacing['2xl'],
      alignItems: 'center',
    },
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: D.spacing['2xl'],
      gap: D.spacing.sm,
    },
    emptyText: {
      color: colors.text.muted,
      fontSize: D.fontSize.sm,
    },
    checkBadge: {
      position: 'absolute',
      top: D.spacing.xs,
      right: D.spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: D.radius.pill,
    },
    cardCategory: {
      fontSize: 10,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    cardName: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    cardPrice: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
      marginTop: 2,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingVertical: D.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.surface,
    },
    footerText: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
    },
    doneBtn: {
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.sm,
    },
    doneBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
  });
}
