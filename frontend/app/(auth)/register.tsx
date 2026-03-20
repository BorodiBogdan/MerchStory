import { Link } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signUp(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.heading}>
          Create account
        </ThemedText>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9BA1A6"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#9BA1A6"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, (loading || !email.trim() || !password) && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading || !email.trim() || !password}
          accessibilityLabel="Create account"
        >
          <ThemedText style={styles.buttonText}>
            {loading ? 'Creating account...' : 'Sign up'}
          </ThemedText>
        </TouchableOpacity>

        <Link href="/(auth)/login" style={styles.link}>
          <ThemedText style={styles.linkText}>Already have an account? Log in</ThemedText>
        </Link>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
    justifyContent: 'center',
  },
  heading: {
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#687076',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#11181C',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 12,
  },
  link: {
    alignSelf: 'center',
  },
  linkText: {
    fontSize: 14,
    color: '#0a7ea4',
  },
});
