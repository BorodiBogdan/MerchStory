import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { useAuth } from '@/context/auth';
import { SetupProvider } from '@/context/setup';
import { useTheme } from '@/context/theme';

export default function SetupLayout() {
  const { token, isShopSetupComplete, isLoading } = useAuth();
  const { colors } = useTheme();

  if (isLoading) {
    return <ActivityIndicator style={styles.loading} size="large" color={colors.accent.primary} />;
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  if (isShopSetupComplete) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SetupProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SetupProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
  },
});
