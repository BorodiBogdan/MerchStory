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

import { DateField } from '@/components/ui/DateField';
import { D } from '@/constants/design';
import {
  GENERATION_TYPE_LABELS,
  GENERATION_TYPES,
  type GenerationType,
} from '@/constants/generationTypes';
import { useTheme } from '@/context/theme';

export interface GalleryFilterState {
  search: string;
  types: GenerationType[];
  from: string; // ISO date YYYY-MM-DD or ''
  to: string;
}

interface GalleryFilterBarProps {
  value: GalleryFilterState;
  onChange: (next: GalleryFilterState) => void;
  layout?: 'auto' | 'compact' | 'vertical';
  resultCount?: number;
}

const DESKTOP_BREAKPOINT = 900;

export function GalleryFilterBar({
  value,
  onChange,
  layout = 'auto',
  resultCount,
}: GalleryFilterBarProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isVertical = layout === 'vertical';
  const isDesktop = layout === 'auto' && width >= DESKTOP_BREAKPOINT;
  const isCompact = layout === 'compact' || (layout === 'auto' && !isDesktop);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [searchLocal, setSearchLocal] = useState(value.search);
  const searchRef = useRef(value.search);
  const [expanded, setExpanded] = useState(!isCompact);
  const [typeOpen, setTypeOpen] = useState(false);

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

  const hasActiveFilters = value.types.length > 0 || !!value.from || !!value.to || !!value.search;

  function toggleType(t: GenerationType) {
    const isOn = value.types.includes(t);
    const next = isOn ? value.types.filter((x) => x !== t) : [...value.types, t];
    onChange({ ...value, types: next });
  }

  function resetAll() {
    setSearchLocal('');
    searchRef.current = '';
    onChange({ search: '', types: [], from: '', to: '' });
  }

  const searchField = (
    <View style={styles.searchWrapper}>
      <Ionicons name="search-outline" size={16} color={colors.text.muted} />
      <TextInput
        style={styles.searchInput as any}
        placeholder="Search by name…"
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

  const selectedCount = value.types.length;
  const dropdownLabel =
    selectedCount === 0
      ? 'All types'
      : selectedCount === 1
        ? GENERATION_TYPE_LABELS[value.types[0]]
        : `${selectedCount} types`;

  const typeList = (
    <View>
      <Pressable
        onPress={() => setTypeOpen((v) => !v)}
        style={({ pressed }) => [
          styles.dropdownBtn,
          typeOpen && styles.dropdownBtnOpen,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: typeOpen }}
      >
        <Text
          style={[styles.dropdownBtnText, selectedCount === 0 && styles.dropdownBtnPlaceholder]}
          numberOfLines={1}
        >
          {dropdownLabel}
        </Text>
        <Ionicons
          name={typeOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.text.secondary}
        />
      </Pressable>
      {typeOpen && (
        <View style={styles.dropdownPanel}>
          <ScrollView
            style={{ maxHeight: 260 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {GENERATION_TYPES.map((t) => {
              const isSel = value.types.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleType(t)}
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
                    {GENERATION_TYPE_LABELS[t]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {selectedCount > 0 && (
            <Pressable
              onPress={() => onChange({ ...value, types: [] })}
              style={({ pressed }) => [styles.dropdownFooter, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close-circle-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.dropdownFooterText}>Clear selection</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

  const dateRange = (
    <View style={styles.dateRow}>
      <DateField
        label="From"
        value={value.from}
        onChange={(next) => onChange({ ...value, from: next })}
        maxDate={value.to || undefined}
      />
      <DateField
        label="To"
        value={value.to}
        onChange={(next) => onChange({ ...value, to: next })}
        minDate={value.from || undefined}
      />
    </View>
  );

  if (isVertical) {
    return (
      <View style={styles.verticalContainer}>
        <View style={styles.verticalHeader}>
          <Text style={styles.verticalTitle}>Filters</Text>
          {hasActiveFilters && (
            <Pressable
              onPress={resetAll}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityLabel="Clear all filters"
            >
              <Text style={styles.clearLink}>Clear all</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.verticalSection}>
          <Text style={styles.verticalLabel}>Search</Text>
          {searchField}
        </View>

        <View style={styles.verticalSection}>
          <Text style={styles.verticalLabel}>Type</Text>
          {typeList}
        </View>

        <View style={styles.verticalSection}>
          <Text style={styles.verticalLabel}>Generated</Text>
          {dateRange}
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
          <View style={styles.desktopDates}>{dateRange}</View>
          {hasActiveFilters && (
            <Pressable
              onPress={resetAll}
              style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.desktopChipsRow}>{typeList}</View>
        {typeof resultCount === 'number' && (
          <Text style={styles.resultCount}>
            {resultCount} {resultCount === 1 ? 'image' : 'images'}
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
          accessibilityLabel="Toggle filters"
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={expanded ? colors.accent.primary : colors.text.secondary}
          />
          <Text style={[styles.filterToggleText, expanded && styles.filterToggleTextActive]}>
            Filters
          </Text>
          {hasActiveFilters && !expanded && <View style={styles.filterDot} />}
        </Pressable>
      </View>
      {expanded && (
        <View style={styles.mobileExpanded}>
          {typeList}
          {dateRange}
          {hasActiveFilters && (
            <Pressable
              onPress={resetAll}
              style={({ pressed }) => [styles.clearBtnMobile, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.clearBtnText}>Clear all filters</Text>
            </Pressable>
          )}
        </View>
      )}
      {typeof resultCount === 'number' && (
        <Text style={styles.resultCount}>
          {resultCount} {resultCount === 1 ? 'image' : 'images'}
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
    desktopDates: { flexShrink: 0, minWidth: 300 },
    desktopChipsRow: {},
    mobileContainer: { gap: D.spacing.sm, paddingVertical: D.spacing.sm },
    mobileTopRow: { flexDirection: 'row', alignItems: 'center', gap: D.spacing.sm },
    mobileExpanded: { gap: D.spacing.sm },

    verticalContainer: {
      gap: D.spacing.md,
      padding: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
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
    verticalSection: { gap: D.spacing.xs },
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

    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
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
