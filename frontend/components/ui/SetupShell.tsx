import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

interface SetupShellProps {
  children: React.ReactNode;
}

export function SetupShell({ children }: SetupShellProps) {
  const { colors, colorScheme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const t = useT();

  if (Platform.OS === 'web') {
    const isDark = colorScheme === 'dark';

    const pageStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: isDark ? '#080B12' : '#F0F2F8',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    };

    const topBarStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 60,
      padding: '0 40px',
      backgroundColor: isDark ? '#0F1117' : '#FFFFFF',
      borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
      position: 'sticky' as const,
      top: 0,
      zIndex: 10,
    };

    const brandStyle: React.CSSProperties = {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: '-0.5px',
      color: colors.accent.primary,
      textDecoration: 'none',
    };

    const actionsStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    };

    const iconButtonStyle: React.CSSProperties = {
      width: 34,
      height: 34,
      borderRadius: 17,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      padding: 0,
      color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
    };

    const scrollerStyle: React.CSSProperties = {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflowY: 'auto',
      padding: '52px 20px 80px',
    };

    const cardStyle: React.CSSProperties = {
      width: '100%',
      maxWidth: 540,
      backgroundColor: isDark ? '#161B27' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
      borderRadius: 20,
      padding: '40px 44px',
      boxShadow: isDark
        ? '0 8px 48px rgba(0,0,0,0.5)'
        : '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06)',
    };

    return (
      <div style={pageStyle}>
        <div style={topBarStyle}>
          <span style={brandStyle}>MerchStory</span>
          <div style={actionsStyle}>
            <button
              style={iconButtonStyle}
              onClick={toggleTheme}
              aria-label={colorScheme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
            >
              <Ionicons
                name={colorScheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
                size={18}
                color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'}
              />
            </button>
            <button
              style={iconButtonStyle}
              onClick={() => signOut()}
              aria-label={t('common.signOut')}
            >
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            </button>
          </div>
        </div>
        <div style={scrollerStyle}>
          <div style={cardStyle}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nativeHeader}>
        <Pressable
          onPress={toggleTheme}
          style={styles.iconButton}
          accessibilityLabel={colorScheme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
          accessibilityRole="button"
        >
          <Ionicons
            name={colorScheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={colors.text.secondary}
          />
        </Pressable>
        <Pressable
          onPress={() => signOut()}
          style={styles.iconButton}
          accessibilityLabel={t('common.signOut')}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    flex: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: D.spacing.lg,
      paddingBottom: D.spacing['2xl'],
    },
    nativeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      gap: D.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
