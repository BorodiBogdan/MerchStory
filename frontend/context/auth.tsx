import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string) {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const USER_KEY = 'auth_user';

interface AuthUser {
  email: string;
  userName: string;
  isShopSetupComplete: boolean;
  isAdmin: boolean;
  creditBalance: number;
}

interface AuthState {
  token: string | null;
  email: string | null;
  userName: string | null;
  isShopSetupComplete: boolean;
  isAdmin: boolean;
  creditBalance: number;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeShopSetup: () => Promise<void>;
  setCreditBalance: (balance: number) => Promise<void>;
  refreshCreditBalance: () => Promise<number | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    email: null,
    userName: null,
    isShopSetupComplete: false,
    isAdmin: false,
    creditBalance: 0,
    isLoading: true,
  });

  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        const userJson = await storage.getItem(USER_KEY);
        if (token && userJson) {
          const user: AuthUser = JSON.parse(userJson);
          setState({
            token,
            email: user.email,
            userName: user.userName,
            isShopSetupComplete: user.isShopSetupComplete ?? false,
            isAdmin: user.isAdmin ?? false,
            creditBalance: user.creditBalance ?? 0,
            isLoading: false,
          });
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
    const user: AuthUser = {
      email: data.email,
      userName: data.userName,
      isShopSetupComplete: data.isShopSetupComplete,
      isAdmin: data.isAdmin,
      creditBalance: data.creditBalance ?? 0,
    };
    await storage.setItem(TOKEN_KEY, data.token);
    await storage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    await storage.setItem(USER_KEY, JSON.stringify(user));
    await applyServerLanguage(data.preferredLanguage);
    setState({
      token: data.token,
      email: data.email,
      userName: data.userName,
      isShopSetupComplete: data.isShopSetupComplete,
      isAdmin: data.isAdmin,
      creditBalance: user.creditBalance,
      isLoading: false,
    });
  }

  async function signUp(email: string, password: string) {
    const { register } = await import('@/utils/api');
    const data = await register(email, password);
    const user: AuthUser = {
      email: data.email,
      userName: data.userName,
      isShopSetupComplete: data.isShopSetupComplete,
      isAdmin: data.isAdmin,
      creditBalance: data.creditBalance ?? 0,
    };
    await storage.setItem(TOKEN_KEY, data.token);
    await storage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    await storage.setItem(USER_KEY, JSON.stringify(user));
    await applyServerLanguage(data.preferredLanguage);
    setState({
      token: data.token,
      email: data.email,
      userName: data.userName,
      isShopSetupComplete: data.isShopSetupComplete,
      isAdmin: data.isAdmin,
      creditBalance: user.creditBalance,
      isLoading: false,
    });
  }

  async function applyServerLanguage(lang: string | undefined) {
    try {
      const { applyLanguageFromServer } = await import('@/i18n');
      await applyLanguageFromServer((lang ?? 'EN') as 'EN' | 'RO');
    } catch {
      // best-effort
    }
  }

  const clearSession = useCallback(async () => {
    await storage.deleteItem(TOKEN_KEY);
    await storage.deleteItem(REFRESH_TOKEN_KEY);
    await storage.deleteItem(USER_KEY);
    setState({
      token: null,
      email: null,
      userName: null,
      isShopSetupComplete: false,
      isAdmin: false,
      creditBalance: 0,
      isLoading: false,
    });
  }, []);

  async function signOut() {
    await clearSession();
  }

  // When a token refresh definitively fails (refresh token expired/revoked), the
  // API layer calls this so we clear the dead session. Setting token to null makes
  // the route guards redirect to login automatically.
  useEffect(() => {
    let active = true;
    import('@/utils/api').then(({ setSessionExpiredHandler }) => {
      if (!active) return;
      setSessionExpiredHandler(() => {
        void clearSession();
      });
    });
    return () => {
      active = false;
      import('@/utils/api').then(({ setSessionExpiredHandler }) => {
        setSessionExpiredHandler(null);
      });
    };
  }, [clearSession]);

  async function completeShopSetup() {
    const userJson = await storage.getItem(USER_KEY);
    if (!userJson) return;
    const user: AuthUser = JSON.parse(userJson);
    const updated: AuthUser = { ...user, isShopSetupComplete: true };
    await storage.setItem(USER_KEY, JSON.stringify(updated));
    setState((prev) => ({ ...prev, isShopSetupComplete: true }));
  }

  const setCreditBalance = useCallback(async (balance: number) => {
    const userJson = await storage.getItem(USER_KEY);
    if (userJson) {
      const user: AuthUser = JSON.parse(userJson);
      const updated: AuthUser = { ...user, creditBalance: balance };
      await storage.setItem(USER_KEY, JSON.stringify(updated));
    }
    setState((prev) => ({ ...prev, creditBalance: balance }));
  }, []);

  const refreshCreditBalance = useCallback(async (): Promise<number | null> => {
    try {
      const { getWallet } = await import('@/utils/api');
      const wallet = await getWallet();
      await setCreditBalance(wallet.balance);
      return wallet.balance;
    } catch {
      return null;
    }
  }, [setCreditBalance]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        completeShopSetup,
        setCreditBalance,
        refreshCreditBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
