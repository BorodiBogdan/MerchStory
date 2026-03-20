import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import React, { createContext, useContext, useEffect, useState } from 'react';

const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string) {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    return SecureStore.deleteItemAsync(key);
  },
};

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

interface AuthUser {
  email: string;
  userName: string;
}

interface AuthState {
  token: string | null;
  email: string | null;
  userName: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    email: null,
    userName: null,
    isLoading: true,
  });

  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        const userJson = await storage.getItem(USER_KEY);
        if (token && userJson) {
          const user: AuthUser = JSON.parse(userJson);
          setState({ token, email: user.email, userName: user.userName, isLoading: false });
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    }
    loadStoredAuth();
  }, []);

  async function signIn(email: string, password: string) {
    const { login } = await import('@/utils/api');
    const data = await login(email, password);
    await storage.setItem(TOKEN_KEY, data.token);
    await storage.setItem(USER_KEY, JSON.stringify({ email: data.email, userName: data.userName }));
    setState({ token: data.token, email: data.email, userName: data.userName, isLoading: false });
  }

  async function signUp(email: string, password: string) {
    const { register } = await import('@/utils/api');
    const data = await register(email, password);
    await storage.setItem(TOKEN_KEY, data.token);
    await storage.setItem(USER_KEY, JSON.stringify({ email: data.email, userName: data.userName }));
    setState({ token: data.token, email: data.email, userName: data.userName, isLoading: false });
  }

  async function signOut() {
    await storage.deleteItem(TOKEN_KEY);
    await storage.deleteItem(USER_KEY);
    setState({ token: null, email: null, userName: null, isLoading: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
