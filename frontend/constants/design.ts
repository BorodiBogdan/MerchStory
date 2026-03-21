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
    base: '#0F1117',
    surface: '#161B27',
    elevated: '#1E2535',
    input: 'rgba(255,255,255,0.05)',
    inputFocus: 'rgba(99,102,241,0.08)',
  },
  border: {
    default: 'rgba(255,255,255,0.08)',
    focus: '#6366F1',
    error: '#EF4444',
    subtle: 'rgba(255,255,255,0.04)',
  },
  accent: {
    primary: '#6366F1',
    secondary: '#818CF8',
    dim: 'rgba(99,102,241,0.15)',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#475569',
    error: '#EF4444',
    labelActive: '#818CF8',
  },
  social: {
    border: 'rgba(255,255,255,0.12)',
  },
  destructive: '#EF4444',
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
  },
} as const;
