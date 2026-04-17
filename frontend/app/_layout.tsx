import 'react-native-reanimated';

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/auth';
import { ShopProvider } from '@/context/shop';
import { ThemeProvider, useTheme } from '@/context/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { colorScheme } = useTheme();
  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(setup)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen
          name="add-products-professional"
          options={{ title: 'Add Professional Products' }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ShopProvider>
          <RootLayoutNav />
        </ShopProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
