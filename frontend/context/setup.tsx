import React, { createContext, useContext, useState } from 'react';

export interface SetupStep1Data {
  brandName: string;
  logoUri: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  slogan: string;
}

export interface SetupStep2Data {
  businessDomain: string;
  targetAudience: string;
  atmosphere: string;
  shopType: string;
  competitors: string;
}

export interface SetupData extends SetupStep1Data, SetupStep2Data {}

interface SetupContextValue {
  data: SetupData;
  updateStep1: (partial: Partial<SetupStep1Data>) => void;
  updateStep2: (partial: Partial<SetupStep2Data>) => void;
  reset: () => void;
}

const defaultData: SetupData = {
  brandName: '',
  logoUri: null,
  primaryColor: '',
  secondaryColor: '',
  accentColor: '',
  slogan: '',
  businessDomain: '',
  targetAudience: '',
  atmosphere: '',
  shopType: '',
  competitors: '',
};

const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SetupData>(defaultData);

  function updateStep1(partial: Partial<SetupStep1Data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function updateStep2(partial: Partial<SetupStep2Data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function reset() {
    setData(defaultData);
  }

  return (
    <SetupContext.Provider value={{ data, updateStep1, updateStep2, reset }}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error('useSetup must be used within SetupProvider');
  return ctx;
}
