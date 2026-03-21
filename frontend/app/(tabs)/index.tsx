import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth';
import { generateImage, type GenerateImageResponse } from '@/utils/api';
import { formatMessage } from '@/utils/formatMessage';

export default function HomeScreen() {
  const { userName } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<GenerateImageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    const trimmed = formatMessage(prompt);
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await generateImage(trimmed);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const imageUri = result ? `data:${result.mimeType};base64,${result.imageBase64}` : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle" style={styles.greeting}>
            Hello, {userName ?? 'there'}
          </ThemedText>
        </ThemedView>

        <ThemedText type="title" style={styles.heading}>
          Generate an Ad Image
        </ThemedText>

        <TextInput
          style={styles.input}
          placeholder="Describe the image you want..."
          placeholderTextColor="#9BA1A6"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          editable={!loading}
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (loading || !prompt.trim()) && styles.buttonDisabled,
            pressed && !(loading || !prompt.trim()) && styles.buttonPressed,
          ]}
          onPress={handleGenerate}
          disabled={loading || !prompt.trim()}
          accessibilityLabel="Generate image"
          accessibilityRole="button"
        >
          <ThemedText style={styles.buttonText}>
            {loading ? 'Generating...' : 'Generate'}
          </ThemedText>
        </Pressable>

        {loading && <ActivityIndicator size="large" style={styles.spinner} />}

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Generated ad image"
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    alignItems: 'stretch',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 16,
  },
  heading: {
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#687076',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    color: '#11181C',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  spinner: {
    marginVertical: 16,
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    marginTop: 8,
  },
});
