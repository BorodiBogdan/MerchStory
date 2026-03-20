import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5257';

const TOKEN_KEY = 'auth_token';

async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export interface GenerateImageResponse {
  imageBase64: string;
  mimeType: string;
}

export interface AuthResponse {
  token: string;
  email: string;
  userName: string;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Invalid email or password.');
  }

  return response.json() as Promise<AuthResponse>;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errors = await response.json().catch(() => []);
    const message = Array.isArray(errors) && errors.length > 0
      ? (errors as string[]).join(' ')
      : 'Registration failed.';
    throw new Error(message);
  }

  return response.json() as Promise<AuthResponse>;
}

export async function generateImage(prompt: string): Promise<GenerateImageResponse> {
  const token = await getToken();

  const response = await fetch(`${API_URL}/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<GenerateImageResponse>;
}
