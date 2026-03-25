import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useShop } from '@/context/shop';
import { useTheme } from '@/context/theme';

export default function TabLayout() {
  const { token, isLoading, isShopSetupComplete, signOut } = useAuth();
  const { colors, colorScheme, toggleTheme } = useTheme();
  const { shopLogoUri } = useShop();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  if (isLoading) {
    return <ActivityIndicator style={styles.loading} size="large" color={colors.accent.primary} />;
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!isShopSetupComplete) {
    return <Redirect href="/(setup)/step1" />;
  }

  const headerLeft = () => (
    <Pressable
      onPress={() => router.navigate('/(tabs)')}
      style={styles.logoButton}
      accessibilityRole="button"
      accessibilityLabel="MerchStory home"
    >
      <Text style={styles.logoText}>MerchStory</Text>
    </Pressable>
  );

  const headerRight = () => (
    <View style={styles.headerActions}>
      <Pressable
        onPress={toggleTheme}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel={colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Ionicons
          name={colorScheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
          size={20}
          color={colors.text.secondary}
        />
      </Pressable>

      <Pressable
        onPress={() => router.navigate('/(tabs)/profile')}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Go to profile"
      >
        <View style={styles.avatarChip}>
          {shopLogoUri ? (
            <Image source={{ uri: shopLogoUri }} style={styles.avatarLogo} />
          ) : (
            <Ionicons name="person-circle-outline" size={22} color={colors.text.secondary} />
          )}
        </View>
      </Pressable>

      <Pressable
        onPress={() => void signOut()}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
      </Pressable>
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent.primary,
        tabBarInactiveTintColor: colors.text.muted,
        headerShown: true,
        headerStyle: { backgroundColor: colors.bg.surface },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        tabBarStyle: styles.tabBar,
        tabBarButton: HapticTab,
        tabBarLabelStyle: styles.tabBarLabel,
        headerLeft,
        headerRight,
        headerTitle: () => null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Studio',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          tabBarLabel: 'Gallery',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'images' : 'images-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          tabBarLabel: 'Products',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pricetag' : 'pricetag-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarItemStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    loading: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    logoButton: {
      marginLeft: D.spacing.md,
      outlineWidth: 0,
    },
    logoText: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: -0.3,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: D.spacing.md,
      gap: D.spacing.xs,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
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
      overflow: 'hidden',
    },
    avatarLogo: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
    },
    tabBar: {
      backgroundColor: colors.bg.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      height: Platform.OS === 'ios' ? 84 : 64,
      paddingTop: D.spacing.sm,
      paddingBottom: Platform.OS === 'ios' ? D.spacing.lg : D.spacing.sm,
    },
    tabBarLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.medium,
      marginTop: 2,
    },
  });
}
