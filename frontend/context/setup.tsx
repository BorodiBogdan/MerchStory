import React, { createContext, useContext, useState } from 'react';

import { type BrandColor } from '../utils/api';

export type Currency = 'USD' | 'EUR' | 'RON';
export type GenerationLanguage = 'EN' | 'RO';

export interface SetupStep1Data {
  brandName: string;
  logoUri: string | null;
  brandColors: BrandColor[];
  slogan: string;
  currency: Currency;
  generationLanguage: GenerationLanguage;
}

export interface SetupStep2Data {
  businessDomain: string;
  otherDomain: string;
  targetAudience: string;
  shopType: string;
  competitors: string;
  city: string;
  countryCode: string;
}

export interface SetupStep3Data {
  phoneNumber: string;
  email: string;
  addresses: string[];
  instagramHandle: string;
  facebookHandle: string;
  tikTokHandle: string;
}

export interface SetupData extends SetupStep1Data, SetupStep2Data, SetupStep3Data {}

interface SetupContextValue {
  data: SetupData;
  updateStep1: (partial: Partial<SetupStep1Data>) => void;
  updateStep2: (partial: Partial<SetupStep2Data>) => void;
  updateStep3: (partial: Partial<SetupStep3Data>) => void;
  reset: () => void;
}

const defaultData: SetupData = {
  brandName: '',
  logoUri: null,
  brandColors: [{ hex: '#6366F1', percentage: 100 }],
  slogan: '',
  currency: 'USD',
  generationLanguage: 'RO',
  businessDomain: '',
  otherDomain: '',
  targetAudience: '',
  shopType: '',
  competitors: '',
  city: '',
  countryCode: 'RO',
  phoneNumber: '',
  email: '',
  addresses: [''],
  instagramHandle: '',
  facebookHandle: '',
  tikTokHandle: '',
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

  function updateStep3(partial: Partial<SetupStep3Data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function reset() {
    setData(defaultData);
  }

  return (
    <SetupContext.Provider value={{ data, updateStep1, updateStep2, updateStep3, reset }}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error('useSetup must be used within SetupProvider');
  return ctx;
}
