import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
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
import { NavMenuDropdown, type NavMenuItem } from '@/components/ui/NavMenuDropdown';
import { ProfileWalletChoiceModal } from '@/components/ui/ProfileWalletChoiceModal';
import { ProfileWalletDropdown } from '@/components/ui/ProfileWalletDropdown';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';

export default function TabLayout() {
  const { token, isLoading, isShopSetupComplete, coinBalance, email, isAdmin, signOut } = useAuth();
  const [showChoice, setShowChoice] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const { colors, colorScheme, toggleTheme } = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const useTopNav = isWeb;
  const useHamburger = useTopNav && width < 768;
  const isCompactNav = useTopNav && width >= 768 && width < 1024;
  const isVeryNarrow = useTopNav && width < 480;
  const insets = useSafeAreaInsets();
  const mobileTopPad = !useTopNav ? insets.top : 0;

  const styles = useMemo(() => makeStyles(colors, insets.bottom), [colors, insets.bottom]);
  const router = useRouter();
  const pathname = usePathname();

  const navItems: NavMenuItem[] = useMemo(
    () => [
      {
        key: 'studio',
        label: t('tabs.studio'),
        icon: 'sparkles',
        iconOutline: 'sparkles-outline',
        isActive: pathname === '/' || pathname.startsWith('/studio'),
        onPress: () => router.navigate('/(tabs)'),
      },
      {
        key: 'gallery',
        label: t('tabs.gallery'),
        icon: 'images',
        iconOutline: 'images-outline',
        isActive: pathname.startsWith('/gallery') || pathname.startsWith('/wallpapers'),
        onPress: () => router.navigate('/(tabs)/gallery'),
      },
      {
        key: 'products',
        label: t('tabs.products'),
        icon: 'pricetag',
        iconOutline: 'pricetag-outline',
        isActive: pathname.startsWith('/products'),
        onPress: () => router.navigate('/(tabs)/products'),
      },
      {
        key: 'analytics',
        label: t('tabs.analytics'),
        icon: 'bar-chart',
        iconOutline: 'bar-chart-outline',
        isActive: pathname.startsWith('/analytics'),
        onPress: () => router.navigate('/(tabs)/analytics'),
      },
      {
        key: 'print',
        label: t('tabs.print'),
        icon: 'print',
        iconOutline: 'print-outline',
        isActive: pathname.startsWith('/print'),
        onPress: () => router.navigate('/(tabs)/print'),
      },
    ],
    [pathname, t, router]
  );

  const menuNavItems: NavMenuItem[] = useMemo(
    () =>
      navItems.map((item) => ({
        ...item,
        onPress: () => {
          setShowNavMenu(false);
          item.onPress();
        },
      })),
    [navItems]
  );

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
    <View style={styles.headerLeftGroup}>
      {useHamburger && (
        <Pressable
          onPress={() => setShowNavMenu(true)}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.iconButton,
            (pressed || hovered) && { backgroundColor: colors.bg.input },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.home')}
        >
          <Ionicons name="menu" size={24} color={colors.text.primary} />
        </Pressable>
      )}
      <Pressable
        onPress={() => router.navigate('/(tabs)')}
        style={styles.logoButton}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.home')}
      >
        <BrandLogo size={isVeryNarrow ? 'xs' : 'sm'} variant="horizontal" />
      </Pressable>
    </View>
  );

  const headerTitle = () => (
    <DesktopNavTabs colors={colors} items={navItems} compact={isCompactNav} />
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
        tabBar={useTopNav ? () => null : undefined}
        screenOptions={{
          tabBarActiveTintColor: colors.accent.primary,
          tabBarInactiveTintColor: colors.text.muted,
          headerShown: useTopNav,
          headerStyle: styles.header,
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          headerTitleContainerStyle: styles.headerTitleContainer,
          tabBarStyle: styles.tabBar,
          tabBarButton: HapticTab,
          tabBarLabelStyle: styles.tabBarLabel,
          headerLeft,
          headerRight,
          headerTitle: useTopNav && !useHamburger ? headerTitle : () => null,
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
          name="print"
          options={{
            tabBarLabel: t('tabs.print'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'print' : 'print-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={
            useTopNav
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
      {useTopNav && (
        <NavMenuDropdown
          visible={showNavMenu}
          items={menuNavItems}
          onDismiss={() => setShowNavMenu(false)}
        />
      )}
      {useTopNav ? (
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
    header: {
      backgroundColor: colors.bg.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      height: 64,
    },
    headerTitleContainer: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      marginLeft: D.spacing.sm,
      flexShrink: 0,
    },
    logoButton: {
      outlineWidth: 0,
      flexShrink: 0,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: D.spacing.md,
      gap: D.spacing.xs,
      flexShrink: 0,
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

interface DesktopNavTabsProps {
  colors: ReturnType<typeof useTheme>['colors'];
  items: NavMenuItem[];
  compact?: boolean;
}

function DesktopNavTabs({ colors, items, compact = false }: DesktopNavTabsProps) {
  const styles = useMemo(() => makeDesktopNavStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
            styles.navItem,
            compact && styles.navItemCompact,
            item.isActive && styles.navItemActive,
            !item.isActive && (hovered || pressed) && styles.navItemHover,
          ]}
          accessibilityRole="link"
          accessibilityState={{ selected: item.isActive }}
          accessibilityLabel={item.label}
        >
          <Ionicons
            name={item.isActive ? item.icon : item.iconOutline}
            size={18}
            color={item.isActive ? colors.accent.primary : colors.text.secondary}
          />
          {!compact && (
            <Text style={[styles.navLabel, item.isActive && styles.navLabelActive]}>
              {item.label}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function makeDesktopNavStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
      minWidth: 0,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 36,
      paddingHorizontal: 14,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: 'transparent',
      outlineWidth: 0,
      ...(Platform.OS === 'web'
        ? ({
            transitionDuration: '140ms',
            transitionProperty: 'background-color, color, border-color',
            cursor: 'pointer',
          } as object)
        : {}),
    },
    navItemCompact: {
      width: 38,
      height: 38,
      paddingHorizontal: 0,
      gap: 0,
      justifyContent: 'center',
      borderRadius: D.radius.pill,
    },
    navItemActive: {
      backgroundColor: colors.accent.dim,
      borderColor: colors.border.focus,
    },
    navItemHover: {
      backgroundColor: colors.bg.input,
    },
    navLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
      letterSpacing: 0.2,
    },
    navLabelActive: {
      color: colors.accent.primary,
    },
  });
}
