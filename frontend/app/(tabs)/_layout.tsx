import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LogoutModal } from '@/components/ui/LogoutModal';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';

export default function TabLayout() {
  const { token, isLoading, signOut } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);

  if (isLoading) {
    return <ActivityIndicator style={styles.loading} size="large" color={D.colors.accent.primary} />;
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  async function handleSignOut() {
    setModalVisible(false);
    await signOut();
  }

  const headerRight = () => (
    <Pressable
      onPress={() => setModalVisible(true)}
      style={styles.avatarButton}
      accessibilityLabel="Open account menu"
      accessibilityRole="button"
      accessibilityHint="Opens sign out options"
    >
      <View style={styles.avatarChip}>
        <Ionicons name="person-circle-outline" size={22} color={D.colors.text.secondary} />
      </View>
    </Pressable>
  );

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: D.colors.accent.primary,
          tabBarInactiveTintColor: D.colors.text.muted,
          headerShown: true,
          headerStyle: { backgroundColor: D.colors.bg.surface },
          headerTintColor: D.colors.text.primary,
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: D.colors.bg.surface,
            borderTopColor: D.colors.border.default,
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
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: D.colors.bg.base,
  },
  avatarButton: {
    marginRight: D.spacing.md,
    outlineWidth: 0,
  },
  avatarChip: {
    width: 34,
    height: 34,
    borderRadius: D.radius.pill,
    backgroundColor: D.colors.accent.dim,
    borderWidth: 1,
    borderColor: D.colors.border.focus,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
