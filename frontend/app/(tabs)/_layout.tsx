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
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useShop } from '@/context/shop';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

export default function TabLayout() {
  const { token, isLoading, isShopSetupComplete } = useAuth();
  const { colors, colorScheme, toggleTheme } = useTheme();
  const { profile } = useShop();
  const t = useT();
  const shopLogoUri = profile?.logoBase64 ?? null;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const insets = useSafeAreaInsets();
  const mobileTopPad = !isDesktop ? insets.top : 0;

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
      accessibilityLabel={t('tabs.home')}
    >
      <View style={styles.logoMark}>
        <Ionicons name="color-wand" size={13} color="#fff" />
      </View>
      <Text style={styles.logoWordmark}>
        <Text style={styles.logoWordmarkBold}>Merch</Text>
        <Text style={styles.logoWordmarkAccent}>Story</Text>
      </Text>
    </Pressable>
  );

  const headerRight = () => (
    <View style={styles.headerActions}>
      <Pressable
        onPress={toggleTheme}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel={colorScheme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
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
        accessibilityLabel={t('tabs.profile')}
      >
        <View style={styles.avatarChip}>
          {shopLogoUri ? (
            <Image source={{ uri: shopLogoUri }} style={styles.avatarLogo} />
          ) : (
            <Ionicons name="person-circle-outline" size={22} color={colors.text.secondary} />
          )}
        </View>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, paddingTop: mobileTopPad, backgroundColor: colors.bg.surface }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.accent.primary,
          tabBarInactiveTintColor: colors.text.muted,
          headerShown: isDesktop,
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
            tabBarLabel: t('tabs.studio'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="wallpapers"
          options={{
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="gallery"
          options={{
            tabBarLabel: t('tabs.gallery'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'images' : 'images-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="products"
          options={{
            tabBarLabel: t('tabs.products'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'pricetag' : 'pricetag-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            tabBarLabel: t('tabs.analytics'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'bar-chart' : 'bar-chart-outline'}
                size={22}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={
            isDesktop
              ? { tabBarItemStyle: { display: 'none' } }
              : {
                  tabBarLabel: t('tabs.profile'),
                  tabBarIcon: ({ color, focused }) => (
                    <Ionicons
                      name={focused ? 'person' : 'person-outline'}
                      size={22}
                      color={color}
                    />
                  ),
                }
          }
        />
      </Tabs>
    </View>
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    logoMark: {
      width: 26,
      height: 26,
      borderRadius: D.radius.sm,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoWordmark: {
      fontSize: D.fontSize.lg,
      letterSpacing: -0.5,
    },
    logoWordmarkBold: {
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    logoWordmarkAccent: {
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
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
