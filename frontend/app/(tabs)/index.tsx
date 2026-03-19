import { useEffect, useState } from 'react';
import { StyleSheet, ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5257';

export default function HomeScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/hello`)
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setError('Failed to reach the backend'));
  }, []);

  return (
    <ThemedView style={styles.container}>
      {message ? (
        <ThemedText type="title">{message}</ThemedText>
      ) : error ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : (
        <ActivityIndicator size="large" />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: 'red',
  },
});