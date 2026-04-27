import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

const isWeb = Platform.OS === 'web';

type AdminOption = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  onPress: () => void;
};

export default function AdminScreen() {
  const { colors } = useTheme();
  const { isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const t = useT();

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
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t('admin.adminOnly.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const options: AdminOption[] = [
    {
      key: 'add-professional',
      icon: 'image-outline',
      title: t('admin.options.addProfessional.title'),
      description: t('admin.options.addProfessional.description'),
      onPress: () => router.push('/add-products-professional'),
    },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + D.spacing.xl },
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityLabel={t('admin.a11y.back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent.primary} />
            <Text style={styles.eyebrow}>{t('admin.eyebrow')}</Text>
          </View>
          <Text style={styles.title}>{t('admin.title')}</Text>
        </View>
        <View style={styles.iconButton} />
      </View>

      <Text style={styles.subtitle}>{t('admin.subtitle')}</Text>

      <View style={styles.optionsList}>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={opt.onPress}
            style={({ pressed }) => [styles.optionCard, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={opt.title}
          >
            <View style={styles.optionIconWrap}>
              <Ionicons name={opt.icon} size={22} color={colors.accent.primary} />
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>{opt.title}</Text>
              <Text style={styles.optionDescription}>{opt.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
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
    optionsList: {
      gap: D.spacing.sm,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.md,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.md,
    },
    optionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
    },
    optionTextWrap: {
      flex: 1,
    },
    optionTitle: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: 2,
    },
    optionDescription: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      lineHeight: 18,
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
