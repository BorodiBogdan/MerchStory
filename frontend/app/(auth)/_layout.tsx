import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth';

export default function AuthLayout() {
  const { token, isShopSetupComplete, isLoading } = useAuth();

  if (!isLoading && token) {
    if (!isShopSetupComplete) {
      return <Redirect href="/(setup)/step1" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
