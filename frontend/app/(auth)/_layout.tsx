import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/auth';

export default function AuthLayout() {
  const { token, isLoading } = useAuth();

  if (!isLoading && token) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
