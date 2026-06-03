export type DesignColors = {
  bg: {
    base: string;
    surface: string;
    elevated: string;
    input: string;
    inputFocus: string;
  };
  border: {
    default: string;
    focus: string;
    error: string;
    subtle: string;
    strong: string;
  };
  accent: {
    primary: string;
    secondary: string;
    dim: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    error: string;
    labelActive: string;
  };
  social: {
    border: string;
  };
  destructive: string;
};

export const darkColors: DesignColors = {
  bg: {
    base: '#0B0E14',
    surface: '#11151F',
    elevated: '#1A2030',
    input: 'rgba(255,255,255,0.08)',
    inputFocus: 'rgba(129,140,248,0.14)',
  },
  border: {
    default: 'rgba(255,255,255,0.16)',
    focus: '#818CF8',
    error: '#F87171',
    subtle: 'rgba(255,255,255,0.08)',
    strong: 'rgba(255,255,255,0.30)',
  },
  accent: {
    primary: '#818CF8',
    secondary: '#A5B4FC',
    dim: 'rgba(129,140,248,0.22)',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    error: '#F87171',
    labelActive: '#A5B4FC',
  },
  social: {
    border: 'rgba(255,255,255,0.20)',
  },
  destructive: '#F87171',
};

export const lightColors: DesignColors = {
  bg: {
    base: '#F8FAFC',
    surface: '#FFFFFF',
    elevated: '#F1F5F9',
    input: 'rgba(0,0,0,0.04)',
    inputFocus: 'rgba(99,102,241,0.06)',
  },
  border: {
    default: 'rgba(0,0,0,0.10)',
    focus: '#6366F1',
    error: '#DC2626',
    subtle: 'rgba(0,0,0,0.05)',
    strong: 'rgba(0,0,0,0.20)',
  },
  accent: {
    primary: '#6366F1',
    secondary: '#4F46E5',
    dim: 'rgba(99,102,241,0.10)',
  },
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    muted: '#94A3B8',
    error: '#DC2626',
    labelActive: '#6366F1',
  },
  social: {
    border: 'rgba(0,0,0,0.12)',
  },
  destructive: '#EF4444',
};

export const D = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    pill: 999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 34,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 3,
    },
    glow: {
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 10,
    },
    modal: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.55,
      shadowRadius: 32,
      elevation: 24,
    },
  },
  duration: {
    fast: 150,
    normal: 250,
    slow: 400,
    entrance: 450,
    shimmer: 1200,
  },
} as const;
