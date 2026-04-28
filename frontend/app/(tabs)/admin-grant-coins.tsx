import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import { type AdminUserLookup, grantCoins, lookupAdminUsers } from '@/utils/api';

const isWeb = Platform.OS === 'web';

export default function AdminGrantCoinsScreen() {
  const { colors } = useTheme();
  const { isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [emailQuery, setEmailQuery] = useState('');
  const [matches, setMatches] = useState<AdminUserLookup[]>([]);
  const [selected, setSelected] = useState<AdminUserLookup | null>(null);
  const [searching, setSearching] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (emailQuery.trim().length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await lookupAdminUsers(emailQuery.trim());
        setMatches(results);
      } catch {
        setMatches([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [emailQuery]);

  if (isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.centerFill}>
        <View style={styles.lockIconCircle}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.text.muted} />
        </View>
        <Text style={styles.deniedTitle}>{t('admin.adminOnly.title')}</Text>
        <Text style={styles.deniedBody}>{t('admin.adminOnly.body')}</Text>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          onPress={() => router.replace('/admin')}
        >
          <Text style={styles.backButtonText}>{t('admin.adminOnly.back')}</Text>
        </Pressable>
      </View>
    );
  }

  function pickUser(user: AdminUserLookup) {
    setSelected(user);
    setEmailQuery(user.email);
    setMatches([]);
  }

  async function handleSubmit() {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!selected) {
      setErrorMessage(t('adminGrant.error.email'));
      return;
    }
    const amount = Number.parseInt(amountText, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      setErrorMessage(t('adminGrant.error.amount'));
      return;
    }

    setSubmitting(true);
    try {
      const trimmedNote = note.trim();
      const result = await grantCoins(selected.email, amount, trimmedNote || undefined);
      setSuccessMessage(
        t('adminGrant.success')
          .replace('{amount}', String(amount))
          .replace('{email}', result.userEmail)
          .replace('{balance}', String(result.balance))
      );
      setAmountText('');
      setNote('');
      // Update inline display so admin sees the new balance.
      setSelected({ ...selected, coinBalance: result.balance });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('adminGrant.error.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + D.spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.replace('/admin')}
            style={styles.iconButton}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <View style={styles.eyebrowRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.eyebrow}>{t('admin.eyebrow')}</Text>
            </View>
            <Text style={styles.title}>{t('adminGrant.title')}</Text>
          </View>
          <View style={styles.iconButton} />
        </View>

        <Text style={styles.subtitle}>{t('adminGrant.subtitle')}</Text>

        <Text style={styles.label}>{t('adminGrant.email.label')}</Text>
        <TextInput
          value={emailQuery}
          onChangeText={(v) => {
            setEmailQuery(v);
            setSelected(null);
          }}
          placeholder={t('adminGrant.email.placeholder')}
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
        />

        {emailQuery.trim().length >= 2 && !selected && (
          <View style={styles.lookupCard}>
            {searching ? (
              <View style={styles.lookupCenter}>
                <ActivityIndicator color={colors.accent.primary} />
              </View>
            ) : matches.length === 0 ? (
              <Text style={styles.lookupEmpty}>{t('adminGrant.lookup.empty')}</Text>
            ) : (
              matches.map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => pickUser(u)}
                  style={({ pressed }) => [styles.lookupRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.lookupTextWrap}>
                    <Text style={styles.lookupEmail}>{u.email}</Text>
                    <Text style={styles.lookupBalance}>{u.coinBalance} coins</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                </Pressable>
              ))
            )}
          </View>
        )}

        {selected && (
          <View style={styles.selectedCard}>
            <Ionicons name="person-circle-outline" size={20} color={colors.accent.primary} />
            <Text style={styles.selectedEmail}>{selected.email}</Text>
            <Text style={styles.selectedBalance}>{selected.coinBalance} coins</Text>
          </View>
        )}

        <Text style={styles.label}>{t('adminGrant.amount.label')}</Text>
        <TextInput
          value={amountText}
          onChangeText={setAmountText}
          placeholder={t('adminGrant.amount.placeholder')}
          placeholderTextColor={colors.text.muted}
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.label}>{t('adminGrant.note.label')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('adminGrant.note.placeholder')}
          placeholderTextColor={colors.text.muted}
          style={[styles.input, { height: 80 }]}
          multiline
          textAlignVertical="top"
        />

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        {successMessage && <Text style={styles.successText}>{successMessage}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitButton,
            (submitting || pressed) && { opacity: 0.85 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.submitText}>
                {submitting ? t('adminGrant.submitting') : t('adminGrant.submit')}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: D.spacing.lg,
    },
    label: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
      marginBottom: D.spacing.xs,
      marginTop: D.spacing.sm,
    },
    input: {
      backgroundColor: colors.bg.input,
      borderColor: colors.border.default,
      borderWidth: 1,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 12,
      color: colors.text.primary,
      fontSize: D.fontSize.base,
    },
    lookupCard: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      marginTop: D.spacing.xs,
      overflow: 'hidden',
    },
    lookupCenter: {
      paddingVertical: D.spacing.md,
      alignItems: 'center',
    },
    lookupEmpty: {
      paddingVertical: D.spacing.md,
      textAlign: 'center',
      color: colors.text.muted,
      fontSize: D.fontSize.sm,
    },
    lookupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: D.spacing.sm + 2,
      paddingHorizontal: D.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.subtle,
    },
    lookupTextWrap: {
      flex: 1,
    },
    lookupEmail: {
      fontSize: D.fontSize.base,
      color: colors.text.primary,
    },
    lookupBalance: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    selectedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.focus,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 2,
      marginTop: D.spacing.sm,
    },
    selectedEmail: {
      flex: 1,
      fontSize: D.fontSize.base,
      color: colors.text.primary,
      fontWeight: D.fontWeight.semibold,
    },
    selectedBalance: {
      fontSize: D.fontSize.sm,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.bold,
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.pill,
      paddingVertical: 14,
      marginTop: D.spacing.lg,
      ...D.shadow.sm,
    },
    submitText: {
      color: '#fff',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
    },
    errorText: {
      color: colors.destructive,
      fontSize: D.fontSize.sm,
      marginTop: D.spacing.sm,
      textAlign: 'center',
    },
    successText: {
      color: '#22c55e',
      fontSize: D.fontSize.sm,
      marginTop: D.spacing.sm,
      textAlign: 'center',
    },
    centerFill: {
      flex: 1,
      backgroundColor: colors.bg.base,
      alignItems: 'center',
      justifyContent: 'center',
      padding: D.spacing.xl,
    },
    lockIconCircle: {
      width: 88,
      height: 88,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
    },
    deniedTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    deniedBody: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: D.spacing.lg,
    },
    backButton: {
      paddingVertical: 11,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    backButtonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
  });
}
