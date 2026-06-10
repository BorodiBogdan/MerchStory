import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

export interface ProductFilterState {
  search: string;
  categories: string[];
  minPrice: string;
  maxPrice: string;
}

interface ProductFilterBarProps {
  value: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
  categories: string[];
  /**
   * 'auto'     — horizontal on wide screens, compact (mobile collapsible) otherwise
   * 'compact'  — always compact horizontal (for modals / narrow layouts)
   * 'vertical' — stacked sidebar layout (for left-column filter panels)
   */
  layout?: 'auto' | 'compact' | 'vertical';
  resultCount?: number;
}

const DESKTOP_BREAKPOINT = 900;

export function ProductFilterBar({
  value,
  onChange,
  categories,
  layout = 'auto',
  resultCount,
}: ProductFilterBarProps) {
  const { colors } = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const isVertical = layout === 'vertical';
  const isDesktop = layout === 'auto' && width >= DESKTOP_BREAKPOINT;
  const isCompact = layout === 'compact' || (layout === 'auto' && !isDesktop);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [searchLocal, setSearchLocal] = useState(value.search);
  const searchRef = useRef(value.search);
  const [expanded, setExpanded] = useState(!isCompact);
  const [categoryOpen, setCategoryOpen] = useState(false);

  useEffect(() => {
    if (!isCompact) setExpanded(true);
  }, [isCompact]);

  useEffect(() => {
    if (value.search !== searchRef.current) {
      searchRef.current = value.search;
      setSearchLocal(value.search);
    }
  }, [value.search]);

  useEffect(() => {
    if (searchLocal === value.search) return;
    const t = setTimeout(() => {
      searchRef.current = searchLocal;
      onChange({ ...value, search: searchLocal });
    }, 300);
    return () => clearTimeout(t);
  }, [searchLocal, value, onChange]);

  const hasActiveFilters =
    value.categories.length > 0 || !!value.minPrice || !!value.maxPrice || !!value.search;

  function sanitizePrice(input: string): string {
    const cleaned = input.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length <= 1) return cleaned;
    return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
  }

  function toggleCategory(c: string) {
    const cLower = c.toLowerCase();
    const isOn = value.categories.some((x) => x.toLowerCase() === cLower);
    const next = isOn
      ? value.categories.filter((x) => x.toLowerCase() !== cLower)
      : [...value.categories, c];
    onChange({ ...value, categories: next });
  }

  function resetAll() {
    setSearchLocal('');
    searchRef.current = '';
    onChange({ search: '', categories: [], minPrice: '', maxPrice: '' });
  }

  const searchField = (
    <View style={styles.searchWrapper}>
      <Ionicons name="search-outline" size={16} color={colors.text.muted} />
      <TextInput
        style={styles.searchInput as any}
        placeholder={t('filters.searchPlaceholder')}
        placeholderTextColor={colors.text.muted}
        value={searchLocal}
        onChangeText={setSearchLocal}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {searchLocal.length > 0 && (
        <Pressable onPress={() => setSearchLocal('')} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={16} color={colors.text.muted} />
        </Pressable>
      )}
    </View>
  );

  const selectedCount = value.categories.length;
  const dropdownLabel =
    selectedCount === 0
      ? t('filters.allCategories')
      : selectedCount === 1
        ? value.categories[0]
        : `${selectedCount} ${t('filters.category').toLowerCase()}`;

  const verticalCategoryList = (
    <View>
      <Pressable
        onPress={() => setCategoryOpen((v) => !v)}
        style={({ pressed }) => [
          styles.dropdownBtn,
          categoryOpen && styles.dropdownBtnOpen,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: categoryOpen }}
      >
        <Text
          style={[styles.dropdownBtnText, selectedCount === 0 && styles.dropdownBtnPlaceholder]}
          numberOfLines={1}
        >
          {dropdownLabel}
        </Text>
        <Ionicons
          name={categoryOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.text.secondary}
        />
      </Pressable>
      {categoryOpen && (
        <View style={styles.dropdownPanel}>
          {categories.length === 0 ? (
            <Text style={styles.emptyChipsHint}>{t('filters.noCategoriesHint')}</Text>
          ) : (
            <ScrollView
              style={{ maxHeight: 240 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {categories.map((c) => {
                const isSel = value.categories.some((x) => x.toLowerCase() === c.toLowerCase());
                return (
                  <Pressable
                    key={c}
                    onPress={() => toggleCategory(c)}
                    style={({ pressed }) => [
                      styles.dropdownItem,
                      pressed && { backgroundColor: colors.bg.elevated },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSel }}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        isSel && {
                          backgroundColor: colors.accent.primary,
                          borderColor: colors.accent.primary,
                        },
                      ]}
                    >
                      {isSel && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <Text
                      style={[
                        styles.dropdownItemText,
                        isSel && {
                          color: colors.accent.primary,
                          fontWeight: D.fontWeight.semibold,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {selectedCount > 0 && (
            <Pressable
              onPress={() => onChange({ ...value, categories: [] })}
              style={({ pressed }) => [styles.dropdownFooter, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close-circle-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.dropdownFooterText}>{t('filters.clearAll')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

  const priceRange = (
    <View style={styles.priceRow}>
      <View style={styles.priceInputWrapper}>
        <Text style={styles.priceLabel}>{t('filters.min')}</Text>
        <Text style={styles.priceCurrency}>$</Text>
        <TextInput
          style={styles.priceInput as any}
          placeholder="0"
          placeholderTextColor={colors.text.muted}
          value={value.minPrice}
          onChangeText={(t) => onChange({ ...value, minPrice: sanitizePrice(t) })}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
      </View>
      <View style={styles.priceDash} />
      <View style={styles.priceInputWrapper}>
        <Text style={styles.priceLabel}>{t('filters.max')}</Text>
        <Text style={styles.priceCurrency}>$</Text>
        <TextInput
          style={styles.priceInput as any}
          placeholder="∞"
          placeholderTextColor={colors.text.muted}
          value={value.maxPrice}
          onChangeText={(t) => onChange({ ...value, maxPrice: sanitizePrice(t) })}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
      </View>
    </View>
  );

  if (isVertical) {
    return (
      <View style={styles.verticalContainer}>
        <View style={styles.verticalHeader}>
          <Text style={styles.verticalTitle}>{t('filters.title')}</Text>
          {hasActiveFilters && (
            <Pressable
              onPress={resetAll}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityLabel={t('filters.clearAll')}
            >
              <Text style={styles.clearLink}>{t('filters.clearAll')}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.verticalSection}>
          <Text style={styles.verticalLabel}>{t('filters.search')}</Text>
          {searchField}
        </View>

        <View style={styles.verticalSection}>
          <Text style={styles.verticalLabel}>{t('filters.category')}</Text>
          {verticalCategoryList}
        </View>

        <View style={styles.verticalSection}>
          <Text style={styles.verticalLabel}>{t('filters.priceRange')}</Text>
          {priceRange}
        </View>

        {typeof resultCount === 'number' && (
          <View style={styles.resultPill}>
            <Text style={styles.resultPillText}>
              {resultCount} {resultCount === 1 ? 'result' : 'results'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (isDesktop) {
    return (
      <View style={styles.desktopContainer}>
        <View style={styles.desktopRow}>
          <View style={styles.desktopSearch}>{searchField}</View>
          <View style={styles.desktopPrice}>{priceRange}</View>
          {hasActiveFilters && (
            <Pressable
              onPress={resetAll}
              style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.clearBtnText}>{t('filters.clearAll')}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.desktopChipsRow}>{verticalCategoryList}</View>
        {typeof resultCount === 'number' && (
          <Text style={styles.resultCount}>
            {resultCount} {resultCount === 1 ? t('filters.resultOne') : t('filters.resultOther')}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mobileContainer}>
      <View style={styles.mobileTopRow}>
        <View style={{ flex: 1 }}>{searchField}</View>
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          style={({ pressed }) => [
            styles.filterToggle,
            expanded && styles.filterToggleActive,
            pressed && styles.pressed,
          ]}
          accessibilityLabel={t('filters.toggle')}
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={expanded ? colors.accent.primary : colors.text.secondary}
          />
          <Text style={[styles.filterToggleText, expanded && styles.filterToggleTextActive]}>
            {t('filters.title')}
          </Text>
          {hasActiveFilters && !expanded && <View style={styles.filterDot} />}
        </Pressable>
      </View>
      {expanded && (
        <View style={styles.mobileExpanded}>
          {verticalCategoryList}
          {priceRange}
          {hasActiveFilters && (
            <Pressable
              onPress={resetAll}
              style={({ pressed }) => [styles.clearBtnMobile, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.clearBtnText}>{t('filters.clearAll')}</Text>
            </Pressable>
          )}
        </View>
      )}
      {typeof resultCount === 'number' && (
        <Text style={styles.resultCount}>
          {resultCount} {resultCount === 1 ? 'product' : 'products'}
        </Text>
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    desktopContainer: { gap: D.spacing.sm, paddingVertical: D.spacing.sm },
    desktopRow: { flexDirection: 'row', alignItems: 'center', gap: D.spacing.sm },
    desktopSearch: { flex: 1, minWidth: 220 },
    desktopPrice: { flexShrink: 0 },
    desktopChipsRow: {},
    mobileContainer: { gap: D.spacing.sm, paddingVertical: D.spacing.sm },
    mobileTopRow: { flexDirection: 'row', alignItems: 'center', gap: D.spacing.sm },
    mobileExpanded: { gap: D.spacing.sm },

    verticalContainer: {
      gap: D.spacing.md,
      padding: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 40px -28px rgba(0,0,0,0.22)',
          } as object)
        : {}),
    },
    verticalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    verticalTitle: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    verticalSection: {
      gap: D.spacing.xs,
    },
    verticalLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    clearLink: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
    resultPill: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accent.dim,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
    },
    resultPillText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },

    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.input,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: D.spacing.md,
      gap: D.spacing.sm,
      height: 40,
    },
    searchInput: {
      flex: 1,
      color: colors.text.primary,
      fontSize: D.fontSize.sm,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    filterToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingHorizontal: D.spacing.md,
      height: 40,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
    },
    filterToggleActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    filterToggleText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    filterToggleTextActive: { color: colors.accent.primary },
    filterDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent.primary,
      marginLeft: 2,
    },
    chipsRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      paddingVertical: 2,
      alignItems: 'center',
    },
    chipsCol: {
      gap: D.spacing.xs,
    },
    dropdownBtn: {
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
    dropdownBtnOpen: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.bg.inputFocus,
    },
    dropdownBtnText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      fontWeight: D.fontWeight.medium,
    },
    dropdownBtnPlaceholder: {
      color: colors.text.muted,
      fontWeight: D.fontWeight.regular,
    },
    dropdownPanel: {
      marginTop: D.spacing.xs,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.surface,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: 8,
      paddingHorizontal: D.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    dropdownItemText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
    },
    checkbox: {
      width: 16,
      height: 16,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.surface,
    },
    dropdownFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingVertical: 8,
      paddingHorizontal: D.spacing.md,
      backgroundColor: colors.bg.elevated,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
    },
    dropdownFooterText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: D.spacing.md,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
    },
    chipVertical: {
      alignSelf: 'flex-start',
      paddingVertical: 8,
    },
    chipSelected: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    chipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
      maxWidth: 200,
    },
    chipTextSelected: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
    emptyChipsHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontStyle: 'italic',
      paddingVertical: 6,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    priceInputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 40,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.input,
      paddingHorizontal: D.spacing.md,
      gap: D.spacing.xs,
    },
    priceLabel: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    priceCurrency: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      fontWeight: D.fontWeight.semibold,
    },
    priceInput: {
      flex: 1,
      color: colors.text.primary,
      fontSize: D.fontSize.sm,
      paddingVertical: 0,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    priceDash: { width: 8, height: 1, backgroundColor: colors.border.default },
    clearBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingHorizontal: D.spacing.md,
      height: 40,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
    },
    clearBtnMobile: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 8,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
    },
    clearBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.accent.primary,
    },
    pressed: { opacity: 0.7 },
    resultCount: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      paddingHorizontal: 2,
    },
  });
}
