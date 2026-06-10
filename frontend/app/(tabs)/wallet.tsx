import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreditIcon } from '@/components/ui/CreditIcon';
import { glassNavRail } from '@/components/ui/GlassNavbar';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import { getWallet, getWalletTransactions, type WalletTransaction } from '@/utils/api';

const isWeb = Platform.OS === 'web';
// Activity page size: full on big screens, trimmed on compact layouts where
// the stacked column would otherwise get very long.
const PAGE_SIZE_WIDE = 10;
const PAGE_SIZE_COMPACT = 7;

export default function WalletScreen() {
  const { colors, colorScheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { creditBalance, setCreditBalance } = useAuth();
  const { width } = useWindowDimensions();
  const isDark = colorScheme === 'dark';
  // Align the page with the glass navbar pill's rail (web); on big screens the
  // content splits into two columns (balance + costs left, activity right).
  const railInset = glassNavRail(width, true).inset;
  const isWide = isWeb && width >= 1024;
  const pageSize = isWide ? PAGE_SIZE_WIDE : PAGE_SIZE_COMPACT;
  const styles = useMemo(
    () => makeStyles(colors, isDark, railInset, isWide),
    [colors, isDark, railInset, isWide]
  );

  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasMore = transactions != null && transactions.length < total;

  const load = useCallback(async () => {
    try {
      setError(null);
      const [summary, firstPage] = await Promise.all([
        getWallet(),
        getWalletTransactions(0, pageSize),
      ]);
      setTransactions(firstPage.items);
      setTotal(firstPage.total);
      setPage(1);
      await setCreditBalance(summary.balance);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load wallet');
    }
  }, [setCreditBalance, pageSize]);

  const goToPage = useCallback(
    async (next: number) => {
      const target = Math.min(Math.max(1, next), totalPages);
      if (target === page) return;
      setLoadingMore(true);
      try {
        const result = await getWalletTransactions((target - 1) * pageSize, pageSize);
        setTransactions(result.items);
        setTotal(result.total);
        setPage(target);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load transactions');
      } finally {
        setLoadingMore(false);
      }
    },
    [page, totalPages, pageSize]
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !transactions) return;
    setLoadingMore(true);
    try {
      const next = await getWalletTransactions(transactions.length, pageSize);
      setTransactions((prev) => {
        const base = prev ?? [];
        const seen = new Set(base.map((t) => t.id));
        return [...base, ...next.items.filter((t) => !seen.has(t.id))];
      });
      setTotal(next.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, transactions, pageSize]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Group the (already date-sorted) transactions by calendar day, so the
  // activity list reads as a feed with day headers instead of a flat table.
  const txnGroups = useMemo(() => {
    if (!transactions) return [];
    const groups: { key: string; label: string; items: WalletTransaction[] }[] = [];
    for (const txn of transactions) {
      const d = new Date(txn.createdAt);
      const key = d.toDateString();
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(txn);
      } else {
        groups.push({
          key,
          label: d.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }),
          items: [txn],
        });
      }
    }
    return groups;
  }, [transactions]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + D.spacing.xl },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent.primary}
        />
      }
    >
      <View style={styles.column}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <View style={styles.eyebrowRow}>
              <CreditIcon size={13} />
              <Text style={styles.eyebrow}>{t('wallet.eyebrow')}</Text>
            </View>
            <Text style={styles.title}>{t('wallet.title')}</Text>
          </View>
        </View>

        <View style={styles.columnsRow}>
          <View style={styles.leftCol}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('wallet.balance.label')}</Text>
              </View>
              <View style={styles.balanceCard}>
                <View style={styles.balanceValueRow}>
                  <Text style={styles.balanceValue}>{creditBalance}</Text>
                  <Text style={styles.balanceUnit}>{t('wallet.balance.unit')}</Text>
                </View>
                <View style={styles.balanceTile}>
                  <CreditIcon size={24} />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('wallet.costs.title')}</Text>
              </View>
              <View style={styles.costsList}>
                <CostRow
                  icon="megaphone-outline"
                  label={t('wallet.costs.announcement')}
                  value={`1 ${t('wallet.balance.unit')}`}
                />
                <CostRow
                  icon="grid-outline"
                  label={t('wallet.costs.catalog')}
                  value={`1 ${t('wallet.balance.unit')}`}
                />
                <CostRow
                  icon="image-outline"
                  label={t('wallet.costs.wallpaper')}
                  value={`1 ${t('wallet.balance.unit')}`}
                />
                <CostRow
                  icon="sparkles-outline"
                  label={t('wallet.costs.catalogOnWallpaper')}
                  value={t('wallet.costs.free')}
                  highlight
                  isLast
                />
              </View>
            </View>
          </View>

          <View style={styles.rightCol}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('wallet.transactions.title')}</Text>
                {isWeb &&
                !loading &&
                !error &&
                transactions &&
                transactions.length > 0 &&
                totalPages > 1 ? (
                  <View style={styles.pager}>
                    <Pressable
                      onPress={() => goToPage(page - 1)}
                      disabled={loadingMore || page <= 1}
                      style={({ pressed }) => [
                        styles.pagerArrow,
                        (page <= 1 || loadingMore) && styles.pagerDisabled,
                        pressed && styles.pagerPressed,
                      ]}
                      accessibilityLabel="Previous page"
                    >
                      <Ionicons name="chevron-back" size={16} color={colors.text.primary} />
                    </Pressable>
                    {getPageNumbers(page, totalPages).map((p, i) =>
                      p === '…' ? (
                        <Text key={`ellipsis-${i}`} style={styles.pagerEllipsis}>
                          …
                        </Text>
                      ) : (
                        <Pressable
                          key={p}
                          onPress={() => goToPage(p)}
                          disabled={loadingMore || p === page}
                          style={({ pressed }) => [
                            styles.pagerNum,
                            p === page && styles.pagerNumActive,
                            pressed && styles.pagerPressed,
                          ]}
                        >
                          <Text
                            style={[styles.pagerNumText, p === page && styles.pagerNumTextActive]}
                          >
                            {p}
                          </Text>
                        </Pressable>
                      )
                    )}
                    <Pressable
                      onPress={() => goToPage(page + 1)}
                      disabled={loadingMore || page >= totalPages}
                      style={({ pressed }) => [
                        styles.pagerArrow,
                        (page >= totalPages || loadingMore) && styles.pagerDisabled,
                        pressed && styles.pagerPressed,
                      ]}
                      accessibilityLabel="Next page"
                    >
                      <Ionicons name="chevron-forward" size={16} color={colors.text.primary} />
                    </Pressable>
                    {loadingMore ? (
                      <ActivityIndicator
                        color={colors.accent.primary}
                        style={styles.pagerSpinner}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : loading ? (
                <View style={styles.centerRow}>
                  <ActivityIndicator color={colors.accent.primary} />
                </View>
              ) : transactions && transactions.length > 0 ? (
                <>
                  <View style={styles.txnList}>
                    {txnGroups.map((group, gi) => (
                      <View key={group.key}>
                        <View
                          style={[styles.txnGroupHeader, gi === 0 && styles.txnGroupHeaderFirst]}
                        >
                          <Text style={styles.txnGroupLabel}>{group.label}</Text>
                        </View>
                        {group.items.map((txn) => (
                          <TransactionRow key={txn.id} txn={txn} />
                        ))}
                      </View>
                    ))}
                  </View>
                  {!isWeb && hasMore ? (
                    <Pressable
                      onPress={loadMore}
                      disabled={loadingMore}
                      style={({ pressed }) => [
                        styles.loadMoreButton,
                        (pressed || loadingMore) && styles.loadMoreButtonPressed,
                      ]}
                    >
                      {loadingMore ? (
                        <ActivityIndicator color={colors.accent.primary} />
                      ) : (
                        <Text style={styles.loadMoreText}>{t('wallet.transactions.loadMore')}</Text>
                      )}
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Text style={styles.emptyText}>{t('wallet.transactions.empty')}</Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('…');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

function CostRow({
  icon,
  label,
  value,
  highlight,
  isLast,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  highlight?: boolean;
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.costRow, isLast && styles.rowLast]}>
      <View style={styles.costIcon}>
        <Ionicons name={icon} size={15} color={colors.accent.primary} />
      </View>
      <Text style={styles.costLabel}>{label}</Text>
      <Text style={[styles.costValue, highlight && styles.costValueFree]}>{value}</Text>
    </View>
  );
}

function TransactionRow({ txn }: { txn: WalletTransaction }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isCredit = txn.amount > 0;
  const date = new Date(txn.createdAt);
  // The day lives in the group header; rows only need the time.
  const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.txnRow}>
      <View style={[styles.txnIcon, isCredit ? styles.txnIconCredit : styles.txnIconDebit]}>
        <Ionicons
          name={isCredit ? 'gift-outline' : 'sparkles-outline'}
          size={16}
          color={isCredit ? '#22c55e' : colors.accent.primary}
        />
      </View>
      <View style={styles.txnTextWrap}>
        <Text style={styles.txnDescription} numberOfLines={1}>
          {txn.description ?? (isCredit ? 'Grant' : 'Spend')}
        </Text>
        <Text style={styles.txnDate}>{timeLabel}</Text>
      </View>
      <View style={styles.txnAmountWrap}>
        <Text style={[styles.txnAmount, isCredit && styles.txnAmountCredit]}>
          {isCredit ? `+${txn.amount}` : `${txn.amount}`}
        </Text>
        <View style={styles.txnBalanceRow}>
          <Ionicons name="wallet-outline" size={11} color={colors.text.muted} />
          <Text style={styles.txnBalance}>{txn.balanceAfter}</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark = false,
  railInset: number = D.spacing.md,
  isWide = false
) {
  // Card language shared with the rest of the app: white surface, hairline
  // border, soft layered shadow in light mode (dark stays flat).
  const cardShadow =
    isWeb && !isDark
      ? ({
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 40px -28px rgba(0,0,0,0.22)',
        } as object)
      : {};

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    scrollContent: {
      // Same side insets as the glass navbar pill, with the content column
      // centered inside the rail so the whitespace is balanced on both sides.
      paddingHorizontal: isWeb ? railInset : D.spacing.md,
      paddingTop: isWeb ? D.spacing.lg : D.spacing.md,
      width: '100%',
      alignItems: 'center',
    },
    column: {
      width: '100%',
      maxWidth: !isWeb ? undefined : isWide ? 1080 : 760,
    },
    columnsRow: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'flex-start' : 'stretch',
      gap: isWide ? D.spacing.lg : 0,
    },
    leftCol: {
      width: isWide ? 340 : '100%',
      flexShrink: 0,
    },
    rightCol: {
      flex: isWide ? 1 : undefined,
      minWidth: 0,
      width: isWide ? undefined : '100%',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.md,
      marginBottom: D.spacing.lg,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...(isWeb ? ({ outlineWidth: 0, cursor: 'pointer' } as object) : {}),
    },
    headerTitleBlock: {
      flex: 1,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    eyebrow: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: isWeb ? D.fontSize['3xl'] : D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.8,
    },
    balanceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.lg,
      ...cardShadow,
    },
    balanceValueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: D.spacing.sm,
    },
    balanceValue: {
      fontSize: 32,
      lineHeight: 36,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.8,
    },
    balanceUnit: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      paddingBottom: 4,
    },
    balanceTile: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      marginBottom: D.spacing.xl,
    },
    // Fixed-height header on every section, so cards in adjacent columns stay
    // flush even when one header carries extra controls (the activity pager).
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: D.spacing.sm,
      minHeight: 28,
      marginBottom: D.spacing.sm,
    },
    sectionTitle: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    costsList: {
      backgroundColor: colors.bg.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...cardShadow,
    },
    costRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      paddingVertical: D.spacing.sm + 4,
      paddingHorizontal: D.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.subtle,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    costIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    costLabel: {
      flex: 1,
      fontSize: D.fontSize.base,
      color: colors.text.primary,
    },
    costValue: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    costValueFree: {
      color: '#22c55e',
    },
    txnList: {
      backgroundColor: colors.bg.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      paddingBottom: D.spacing.xs,
      ...cardShadow,
    },
    txnGroupHeader: {
      paddingHorizontal: D.spacing.md,
      paddingTop: D.spacing.md,
      paddingBottom: D.spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border.subtle,
    },
    txnGroupHeaderFirst: {
      borderTopWidth: 0,
      paddingTop: D.spacing.sm + 2,
    },
    txnGroupLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    txnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      paddingVertical: D.spacing.sm + 2,
      paddingHorizontal: D.spacing.md,
    },
    txnIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txnIconCredit: {
      backgroundColor: 'rgba(34,197,94,0.12)',
    },
    txnIconDebit: {
      backgroundColor: colors.accent.dim,
    },
    txnTextWrap: {
      flex: 1,
    },
    txnDescription: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    txnDate: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    txnAmountWrap: {
      alignItems: 'flex-end',
    },
    txnAmount: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    txnAmountCredit: {
      color: '#22c55e',
    },
    txnBalanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2,
    },
    txnBalance: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    centerRow: {
      paddingVertical: D.spacing.lg,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      paddingVertical: D.spacing.lg,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.destructive,
      textAlign: 'center',
      paddingVertical: D.spacing.md,
    },
    loadMoreButton: {
      marginTop: D.spacing.sm,
      paddingVertical: D.spacing.sm + 2,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadMoreButtonPressed: {
      opacity: 0.6,
    },
    loadMoreText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: 6,
      flexShrink: 1,
    },
    pagerArrow: {
      minWidth: 28,
      height: 28,
      paddingHorizontal: 6,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pagerNum: {
      minWidth: 28,
      height: 28,
      paddingHorizontal: 6,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pagerNumActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    pagerNumText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    pagerNumTextActive: {
      color: '#FFFFFF',
    },
    pagerEllipsis: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      paddingHorizontal: 4,
    },
    pagerDisabled: {
      opacity: 0.4,
    },
    pagerPressed: {
      opacity: 0.7,
    },
    pagerSpinner: {
      marginLeft: D.spacing.xs,
    },
  });
}
