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
import { useTheme } from '@/context/theme';
import { generateImage, type GenerateImageResponse } from '@/utils/api';
import { formatMessage } from '@/utils/formatMessage';

const isWeb = Platform.OS === 'web';

export default function HomeScreen() {
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
        {/* Centered content card */}
        <View style={styles.inner}>
          <Text style={styles.heading}>Generate an Ad Image</Text>
          <Text style={styles.subheading}>
            Describe your product or scene and let AI create a professional ad image for you.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="e.g. A luxury watch on a marble surface with soft golden light…"
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
            <Text style={styles.buttonText}>{loading ? 'Generating…' : 'Generate Image'}</Text>
          </Pressable>

          {loading && (
            <ActivityIndicator size="large" color={colors.accent.primary} style={styles.spinner} />
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {imageUri && (
            <View style={styles.resultCard}>
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel="Generated ad image"
              />
            </View>
          )}
        </View>
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
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    container: {
      flexGrow: 1,
      alignItems: 'center',
      paddingVertical: isWeb ? 48 : 24,
      paddingHorizontal: isWeb ? 24 : 0,
    },
    inner: {
      width: '100%',
      maxWidth: isWeb ? 720 : undefined,
      paddingHorizontal: isWeb ? 0 : D.spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: D.spacing.sm,
    },
    greeting: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
    },
    heading: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.sm,
      textAlign: isWeb ? 'left' : 'center',
      letterSpacing: -0.5,
    },
    subheading: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      lineHeight: 20,
      marginBottom: D.spacing.lg,
      textAlign: isWeb ? 'left' : 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      padding: 14,
      fontSize: D.fontSize.base,
      minHeight: isWeb ? 120 : 80,
      maxHeight: isWeb ? 240 : undefined,
      textAlignVertical: 'top',
      color: colors.text.primary,
      backgroundColor: colors.bg.surface,
      marginBottom: D.spacing.md,
      outlineStyle: 'none' as never,
    },
    button: {
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: D.spacing.lg,
      ...D.shadow.glow,
    },
    buttonDisabled: {
      opacity: 0.45,
      shadowOpacity: 0,
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
      marginVertical: D.spacing.md,
    },
    error: {
      color: colors.text.error,
      textAlign: 'center',
      marginBottom: D.spacing.md,
      fontSize: D.fontSize.sm,
    },
    resultCard: {
      borderRadius: D.radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
      marginTop: D.spacing.sm,
    },
    image: {
      width: '100%',
      aspectRatio: 1,
    },
  });
}
