import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { generateImage, type GenerateImageResponse } from '@/utils/api';
import { formatMessage } from '@/utils/formatMessage';

export default function HomeScreen() {
  const { userName } = useAuth();
  const { colors } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<GenerateImageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
      <ScrollView
        style={styles.scrollBg}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {userName ?? 'there'}</Text>
        </View>

        <Text style={styles.heading}>Generate an Ad Image</Text>

        <TextInput
          style={styles.input}
          placeholder="Describe the image you want..."
          placeholderTextColor={colors.text.muted}
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
          <Text style={styles.buttonText}>
            {loading ? 'Generating...' : 'Generate'}
          </Text>
        </Pressable>

        {loading && <ActivityIndicator size="large" color={colors.accent.primary} style={styles.spinner} />}

        {error && <Text style={styles.error}>{error}</Text>}

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

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    scrollBg: {
      backgroundColor: colors.bg.base,
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
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
    },
    heading: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: 24,
      textAlign: 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      padding: 14,
      fontSize: D.fontSize.base,
      minHeight: 80,
      textAlignVertical: 'top',
      color: colors.text.primary,
      backgroundColor: colors.bg.surface,
      marginBottom: 16,
    },
    button: {
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.md,
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
      color: '#FFFFFF',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
    },
    spinner: {
      marginVertical: 16,
    },
    error: {
      color: colors.text.error,
      textAlign: 'center',
      marginBottom: 16,
      fontSize: D.fontSize.sm,
    },
    image: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: D.radius.md,
      marginTop: 8,
    },
  });
}
