import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import type { ReferenceCategoryNode } from '@/utils/api';

interface Props {
  categories: ReferenceCategoryNode[];
  value: string;
  onChange: (path: string) => void;
  isLoading?: boolean;
}

const LEVEL_KEYS = [
  'categoryPicker.levelTop',
  'categoryPicker.levelSub',
  'categoryPicker.levelSubSub',
] as const;

function findChildrenAt(roots: ReferenceCategoryNode[], path: string[]): ReferenceCategoryNode[] {
  let level = roots;
  for (const segment of path) {
    const match = level.find((n) => n.name === segment);
    if (!match) return [];
    level = match.children;
  }
  return level;
}

export function CategoryPathPicker({ categories, value, onChange, isLoading }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const t = useT();

  const [segments, setSegments] = useState<string[]>([]);
  const [creatingAtLevel, setCreatingAtLevel] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');

  // Sync external `value` → internal segments (e.g. when parent resets).
  useEffect(() => {
    const next = value
      ? value
          .split('/')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    setSegments((prev) => (prev.join('/') === next.join('/') ? prev : next));
  }, [value]);

  function emit(next: string[]) {
    setSegments(next);
    onChange(next.join('/'));
  }

  function pickExisting(level: number, name: string) {
    emit([...segments.slice(0, level), name]);
    setCreatingAtLevel(null);
    setDraftName('');
  }

  function startCreate(level: number) {
    setCreatingAtLevel(level);
    setDraftName('');
  }

  function confirmCreate(level: number) {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    emit([...segments.slice(0, level), trimmed]);
    setCreatingAtLevel(null);
    setDraftName('');
  }

  function cancelCreate() {
    setCreatingAtLevel(null);
    setDraftName('');
  }

  function clear() {
    emit([]);
    setCreatingAtLevel(null);
    setDraftName('');
  }

  // Build the rows to render: one row per existing segment plus the next level (if not at max depth).
  const rows: number[] = [];
  for (let i = 0; i <= segments.length; i++) {
    if (i >= LEVEL_KEYS.length) break;
    rows.push(i);
  }

  return (
    <View>
      {segments.length > 0 && (
        <View style={styles.breadcrumbRow}>
          <Text style={styles.breadcrumbText} numberOfLines={2}>
            {segments.join(' › ')}
          </Text>
          <Pressable onPress={clear} hitSlop={8} accessibilityLabel={t('categoryPicker.clearA11y')}>
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </Pressable>
        </View>
      )}

      {isLoading && <Text style={styles.helperText}>{t('categoryPicker.loading')}</Text>}

      {rows.map((level) => {
        const options = findChildrenAt(categories, segments.slice(0, level));
        const selectedHere = segments[level];
        const isCreating = creatingAtLevel === level;

        return (
          <View key={level} style={styles.levelGroup}>
            <Text style={styles.levelLabel}>{t(LEVEL_KEYS[level])}</Text>
            {isCreating ? (
              <View style={styles.createRow}>
                <TextInput
                  style={styles.createInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                  placeholder={t('categoryPicker.newPlaceholder')}
                  placeholderTextColor={colors.text.muted}
                  onSubmitEditing={() => confirmCreate(level)}
                />
                <Pressable
                  onPress={() => confirmCreate(level)}
                  style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.85 }]}
                  accessibilityLabel={t('categoryPicker.addA11y')}
                >
                  <Text style={styles.createBtnText}>{t('categoryPicker.addBtn')}</Text>
                </Pressable>
                <Pressable
                  onPress={cancelCreate}
                  style={styles.cancelBtn}
                  accessibilityLabel={t('categoryPicker.cancelA11y')}
                >
                  <Ionicons name="close" size={18} color={colors.text.muted} />
                </Pressable>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {options.map((opt) => {
                  const active = selectedHere === opt.name;
                  return (
                    <Pressable
                      key={opt.name}
                      onPress={() => pickExisting(level, opt.name)}
                      style={[styles.chip, active && styles.chipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={opt.name}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {opt.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => startCreate(level)}
                  style={styles.addChip}
                  accessibilityRole="button"
                  accessibilityLabel={t('categoryPicker.addA11y')}
                >
                  <Ionicons
                    name="add"
                    size={14}
                    color={colors.accent.primary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.addChipText}>{t('categoryPicker.newChip')}</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    breadcrumbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      paddingVertical: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      marginBottom: D.spacing.sm,
      gap: D.spacing.sm,
    },
    breadcrumbText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      fontWeight: D.fontWeight.medium,
    },
    helperText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginBottom: D.spacing.sm,
    },
    levelGroup: {
      marginBottom: D.spacing.sm,
    },
    levelLabel: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
      marginBottom: D.spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chipRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      paddingVertical: 2,
      paddingHorizontal: 2,
    },
    chip: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.pill,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    chipActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    chipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.muted,
    },
    chipTextActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
    addChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.pill,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.accent.primary,
      backgroundColor: 'transparent',
    },
    addChipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.accent.primary,
    },
    createRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    createInput: {
      flex: 1,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 10,
      fontSize: D.fontSize.base,
      color: colors.text.primary,
    },
    createBtn: {
      backgroundColor: colors.accent.primary,
      paddingVertical: 10,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.md,
    },
    createBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    cancelBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
