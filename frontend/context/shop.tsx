import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { fetchProductCategories, getShopProfile, ShopProfileResponse } from '@/utils/api';

import { useAuth } from './auth';

interface ShopContextValue {
  profile: ShopProfileResponse | null;
  isProfileLoading: boolean;
  setProfile: (p: ShopProfileResponse | null) => void;
  refreshProfile: () => Promise<void>;

  categories: string[];
  isCategoriesLoading: boolean;
  refreshCategories: () => Promise<void>;
}

const ShopContext = createContext<ShopContextValue>({
  profile: null,
  isProfileLoading: false,
  setProfile: () => {},
  refreshProfile: async () => {},
  categories: [],
  isCategoriesLoading: false,
  refreshCategories: async () => {},
});

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [profile, setProfile] = useState<ShopProfileResponse | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(false);

  const refreshProfile = useCallback(async () => {
    setIsProfileLoading(true);
    try {
      const p = await getShopProfile();
      setProfile(p);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    setIsCategoriesLoading(true);
    try {
      const cats = await fetchProductCategories();
      setCategories(cats);
    } finally {
      setIsCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      setCategories([]);
      return;
    }
    void refreshProfile().catch(() => {});
    void refreshCategories().catch(() => {});
  }, [token, refreshProfile, refreshCategories]);

  return (
    <ShopContext.Provider
      value={{
        profile,
        isProfileLoading,
        setProfile,
        refreshProfile,
        categories,
        isCategoriesLoading,
        refreshCategories,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
