import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LogoutModal } from '@/components/ui/LogoutModal';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';

export default function TabLayout() {
  const { token, isLoading, isShopSetupComplete, signOut } = useAuth();
  const { colors, colorScheme, toggleTheme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (isLoading) {
    return <ActivityIndicator style={styles.loading} size="large" color={colors.accent.primary} />;
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!isShopSetupComplete) {
    return <Redirect href="/(setup)/step1" />;
  }

  async function handleSignOut() {
    setModalVisible(false);
    await signOut();
  }

  const headerRight = () => (
    <View style={styles.headerActions}>
      <Pressable
        onPress={toggleTheme}
        style={styles.themeButton}
        accessibilityLabel={colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        accessibilityRole="button"
      >
        <Ionicons
          name={colorScheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
          size={20}
          color={colors.text.secondary}
        />
      </Pressable>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={styles.avatarButton}
        accessibilityLabel="Open account menu"
        accessibilityRole="button"
        accessibilityHint="Opens sign out options"
      >
        <View style={styles.avatarChip}>
          <Ionicons name="person-circle-outline" size={22} color={colors.text.secondary} />
        </View>
      </Pressable>
    </View>
  );

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.accent.primary,
          tabBarInactiveTintColor: colors.text.muted,
          headerShown: true,
          headerStyle: { backgroundColor: colors.bg.surface },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: colors.bg.surface,
            borderTopColor: colors.border.default,
            borderTopWidth: 1,
          },
          tabBarButton: HapticTab,
          headerRight,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="paperplane.fill" color={color} />
            ),
          }}
        />
      </Tabs>

      <LogoutModal
        visible={modalVisible}
        onConfirm={handleSignOut}
        onDismiss={() => setModalVisible(false)}
      />
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    loading: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: D.spacing.md,
      gap: D.spacing.sm,
    },
    themeButton: {
      width: 34,
      height: 34,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      outlineWidth: 0,
    },
    avatarButton: {
      outlineWidth: 0,
    },
    avatarChip: {
      width: 34,
      height: 34,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
