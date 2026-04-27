import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { ProfileWalletChoiceModal } from '@/components/ui/ProfileWalletChoiceModal';
import { ProfileWalletDropdown } from '@/components/ui/ProfileWalletDropdown';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

export default function TabLayout() {
  const { token, isLoading, isShopSetupComplete, coinBalance, email, isAdmin, signOut } = useAuth();
  const [showChoice, setShowChoice] = useState(false);
  const { colors, colorScheme, toggleTheme } = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const insets = useSafeAreaInsets();
  const mobileTopPad = !isDesktop ? insets.top : 0;

  const styles = useMemo(() => makeStyles(colors, insets.bottom), [colors, insets.bottom]);
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
      <BrandLogo size="sm" variant="horizontal" />
    </Pressable>
  );

  const headerRight = () => (
    <View style={styles.headerActions}>
      <Pressable
        onPress={() => router.push('/wallet')}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.balancePill,
          (pressed || hovered) && { backgroundColor: colors.bg.input },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${t('wallet.title')}: ${coinBalance}`}
      >
        <CoinIcon size={16} />
        <Text style={styles.balancePillText}>{coinBalance}</Text>
      </Pressable>

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
        onPress={() => setShowChoice(true)}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.profile')}
      >
        <View style={styles.avatarChip}>
          <Ionicons name="person" size={18} color={colors.accent.primary} />
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
          name="wallet"
          options={{
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="studio"
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
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setShowChoice(true);
            },
          }}
        />
      </Tabs>
      {isDesktop ? (
        <ProfileWalletDropdown
          visible={showChoice}
          email={email}
          coinBalance={coinBalance}
          isAdmin={isAdmin}
          onChooseProfile={() => {
            setShowChoice(false);
            router.navigate('/(tabs)/profile');
          }}
          onChooseWallet={() => {
            setShowChoice(false);
            router.push('/wallet');
          }}
          onChooseAdmin={() => {
            setShowChoice(false);
            router.push('/admin');
          }}
          onSignOut={async () => {
            setShowChoice(false);
            await signOut();
          }}
          onDismiss={() => setShowChoice(false)}
        />
      ) : (
        <ProfileWalletChoiceModal
          visible={showChoice}
          coinBalance={coinBalance}
          onChooseProfile={() => {
            setShowChoice(false);
            router.navigate('/(tabs)/profile');
          }}
          onChooseWallet={() => {
            setShowChoice(false);
            router.push('/wallet');
          }}
          onDismiss={() => setShowChoice(false)}
        />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], bottomInset: number) {
  return StyleSheet.create({
    loading: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    logoButton: {
      marginLeft: D.spacing.md,
      outlineWidth: 0,
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
    balancePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 32,
      paddingHorizontal: 12,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: 'transparent',
      outlineWidth: 0,
      ...(Platform.OS === 'web'
        ? ({ transitionDuration: '120ms', transitionProperty: 'background-color' } as object)
        : {}),
    },
    balancePillText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: 0.2,
    },
    tabBar: {
      backgroundColor: colors.bg.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      height: (Platform.OS === 'ios' ? 64 : 56) + bottomInset,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.sm + bottomInset,
    },
    tabBarLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.medium,
      marginTop: 2,
    },
  });
}
