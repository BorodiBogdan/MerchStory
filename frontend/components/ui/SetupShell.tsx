import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassNavbar } from '@/components/ui/GlassNavbar';
import { AuthPalette, useAuthPalette, webAttrs } from '@/constants/authTheme';
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

  const isDark = colorScheme === 'dark';
  const P = useAuthPalette();
  const { width } = useWindowDimensions();
  const isMobile = width < 560;
  const webStyles = useMemo(() => makeWebStyles(P, isMobile), [P, isMobile]);

  if (Platform.OS === 'web') {
    return (
      <View style={webStyles.page}>
        {/* Shared glass navbar, same design as landing/auth/app */}
        <GlassNavbar
          right={
            <>
              <Pressable
                onPress={toggleTheme}
                {...webAttrs({ msTap: '1' })}
                style={({ pressed }) => [webStyles.iconBtn, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={isDark ? t('common.lightMode') : t('common.darkMode')}
              >
                <Ionicons
                  name={isDark ? 'sunny-outline' : 'moon-outline'}
                  size={18}
                  color={P.body}
                />
              </Pressable>
              <Pressable
                onPress={() => signOut()}
                {...webAttrs({ msTap: '1' })}
                style={({ pressed }) => [webStyles.iconBtn, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={t('common.signOut')}
              >
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              </Pressable>
            </>
          }
        />
        <ScrollView
          style={webStyles.flex}
          contentContainerStyle={webStyles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={webStyles.card}>{children}</View>
        </ScrollView>
      </View>
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

function makeWebStyles(P: AuthPalette, isMobile: boolean) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: P.canvas },
    flex: { flex: 1 },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      outlineWidth: 0,
    },
    scroll: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: isMobile ? 20 : 28,
      paddingTop: isMobile ? 28 : 44,
      paddingBottom: 80,
    },
    card: {
      width: '100%',
      maxWidth: 540,
      backgroundColor: P.card,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: P.hairline,
      paddingHorizontal: isMobile ? 24 : 44,
      paddingVertical: isMobile ? 28 : 40,
      // @ts-ignore web-only
      boxShadow: P.shadowCard,
    },
  });
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
