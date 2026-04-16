import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import LandingPage from '@/components/ui/LandingPage';
import { useAuth } from '@/context/auth';

export default function Index() {
  const { token, isShopSetupComplete, isLoading } = useAuth();

  if (!isLoading && token) {
    if (!isShopSetupComplete) {
      return <Redirect href="/(setup)/step1" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  if (Platform.OS !== 'web') {
    return <Redirect href="/(auth)/login" />;
  }

  if (isLoading) return null;

  return <LandingPage />;
}
