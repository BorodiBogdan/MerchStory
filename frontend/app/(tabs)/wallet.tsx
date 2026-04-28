import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoinIcon } from '@/components/ui/CoinIcon';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import { getWallet, type WalletTransaction } from '@/utils/api';

const isWeb = Platform.OS === 'web';

export default function WalletScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { coinBalance, setCoinBalance } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const summary = await getWallet();
      setTransactions(summary.recentTransactions);
      await setCoinBalance(summary.balance);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load wallet');
    }
  }, [setCoinBalance]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <View style={styles.eyebrowRow}>
            <CoinIcon size={14} />
            <Text style={styles.eyebrow}>{t('wallet.eyebrow')}</Text>
          </View>
          <Text style={styles.title}>{t('wallet.title')}</Text>
        </View>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t('wallet.balance.label')}</Text>
        <View style={styles.balanceValueRow}>
          <CoinIcon size={32} />
          <Text style={styles.balanceValue}>{coinBalance}</Text>
          <Text style={styles.balanceUnit}>{t('wallet.balance.unit')}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('wallet.costs.title')}</Text>
        <View style={styles.costsList}>
          <CostRow label={t('wallet.costs.announcement')} value={`1 ${t('wallet.balance.unit')}`} />
          <CostRow label={t('wallet.costs.catalog')} value={`1 ${t('wallet.balance.unit')}`} />
          <CostRow label={t('wallet.costs.wallpaper')} value={`1 ${t('wallet.balance.unit')}`} />
          <CostRow
            label={t('wallet.costs.catalogOnWallpaper')}
            value={t('wallet.costs.free')}
            highlight
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('wallet.transactions.title')}</Text>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : loading ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={colors.accent.primary} />
          </View>
        ) : transactions && transactions.length > 0 ? (
          <View style={styles.txnList}>
            {transactions.map((txn) => (
              <TransactionRow key={txn.id} txn={txn} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t('wallet.transactions.empty')}</Text>
        )}
      </View>
    </ScrollView>
  );
}

function CostRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.costRow}>
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
  const dateLabel = `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  return (
    <View style={styles.txnRow}>
      <View
        style={[
          styles.txnIcon,
          { backgroundColor: isCredit ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' },
        ]}
      >
        <Ionicons
          name={isCredit ? 'arrow-down' : 'arrow-up'}
          size={16}
          color={isCredit ? '#22c55e' : '#ef4444'}
        />
      </View>
      <View style={styles.txnTextWrap}>
        <Text style={styles.txnDescription} numberOfLines={1}>
          {txn.description ?? (isCredit ? 'Grant' : 'Spend')}
        </Text>
        <Text style={styles.txnDate}>{dateLabel}</Text>
      </View>
      <View style={styles.txnAmountWrap}>
        <Text style={[styles.txnAmount, { color: isCredit ? '#22c55e' : '#ef4444' }]}>
          {isCredit ? `+${txn.amount}` : `${txn.amount}`}
        </Text>
        <Text style={styles.txnBalance}>= {txn.balanceAfter}</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    scrollContent: {
      padding: D.spacing.md,
      maxWidth: isWeb ? 720 : undefined,
      width: '100%',
      alignSelf: 'center',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: D.spacing.sm,
      gap: D.spacing.sm,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleBlock: {
      flex: 1,
      alignItems: 'center',
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
      fontSize: D.fontSize.xl,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    balanceCard: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.focus,
      padding: D.spacing.lg,
      alignItems: 'center',
      marginBottom: D.spacing.lg,
      ...D.shadow.sm,
    },
    balanceLabel: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginBottom: D.spacing.xs,
    },
    balanceValueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: D.spacing.xs,
    },
    balanceValue: {
      fontSize: D.fontSize['3xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    balanceUnit: {
      fontSize: D.fontSize.base,
      color: colors.text.muted,
      paddingBottom: 6,
    },
    section: {
      marginBottom: D.spacing.lg,
    },
    sectionTitle: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: D.spacing.sm,
    },
    costsList: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
    },
    costRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: D.spacing.sm + 2,
      paddingHorizontal: D.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.subtle,
    },
    costLabel: {
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
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
    },
    txnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: D.spacing.sm + 2,
      paddingHorizontal: D.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.subtle,
    },
    txnIcon: {
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txnTextWrap: {
      flex: 1,
    },
    txnDescription: {
      fontSize: D.fontSize.base,
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
    },
    txnBalance: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
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
  });
}
