import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

function buildPageList(current: number, last: number): (number | 'gap')[] {
  if (last <= 7) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }
  const pages: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(last - 1, current + 1);
  if (start > 2) pages.push('gap');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < last - 1) pages.push('gap');
  pages.push(last);
  return pages;
}

export function Pagination({ page, pageSize, total, onPageChange, disabled }: PaginationProps) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  const pages = buildPageList(page, lastPage);

  const canPrev = page > 1 && !disabled;
  const canNext = page < lastPage && !disabled;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => canPrev && onPageChange(page - 1)}
        disabled={!canPrev}
        style={({ pressed }) => [
          styles.navBtn,
          !canPrev && styles.btnDisabled,
          pressed && canPrev && styles.pressed,
        ]}
        accessibilityLabel={t('pagination.prev')}
        accessibilityRole="button"
      >
        <Ionicons
          name="chevron-back"
          size={16}
          color={canPrev ? colors.text.primary : colors.text.muted}
        />
      </Pressable>

      {pages.map((p, i) =>
        p === 'gap' ? (
          <Text key={`gap-${i}`} style={styles.gap}>
            …
          </Text>
        ) : (
          <Pressable
            key={p}
            onPress={() => !disabled && p !== page && onPageChange(p)}
            disabled={disabled || p === page}
            style={({ pressed }) => [
              styles.pageBtn,
              p === page && styles.pageBtnActive,
              pressed && p !== page && !disabled && styles.pressed,
            ]}
            accessibilityLabel={`Page ${p}`}
            accessibilityRole="button"
          >
            <Text style={[styles.pageText, p === page && styles.pageTextActive]}>{p}</Text>
          </Pressable>
        )
      )}

      <Pressable
        onPress={() => canNext && onPageChange(page + 1)}
        disabled={!canNext}
        style={({ pressed }) => [
          styles.navBtn,
          !canNext && styles.btnDisabled,
          pressed && canNext && styles.pressed,
        ]}
        accessibilityLabel={t('pagination.next')}
        accessibilityRole="button"
      >
        <Ionicons
          name="chevron-forward"
          size={16}
          color={canNext ? colors.text.primary : colors.text.muted}
        />
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: D.spacing.sm,
      justifyContent: 'center',
    },
    navBtn: {
      width: 32,
      height: 32,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageBtn: {
      minWidth: 32,
      height: 32,
      paddingHorizontal: 10,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageBtnActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.primary,
    },
    pageText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    pageTextActive: {
      color: '#fff',
      fontWeight: D.fontWeight.semibold,
    },
    gap: {
      paddingHorizontal: 4,
      color: colors.text.muted,
      fontSize: D.fontSize.sm,
    },
    pressed: { opacity: 0.7 },
    btnDisabled: { opacity: 0.4 },
  });
}
