import React, { createContext, useContext, useState } from 'react';

interface ShopContextValue {
  shopLogoUri: string | null;
  setShopLogoUri: (uri: string | null) => void;
}

const ShopContext = createContext<ShopContextValue>({
  shopLogoUri: null,
  setShopLogoUri: () => {},
});

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [shopLogoUri, setShopLogoUri] = useState<string | null>(null);
  return (
    <ShopContext.Provider value={{ shopLogoUri, setShopLogoUri }}>{children}</ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
