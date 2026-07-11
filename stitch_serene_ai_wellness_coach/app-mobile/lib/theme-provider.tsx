import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as serene from '../theme/serene';
import * as dark from '../theme/dark';

type ThemeTokens = typeof serene;
type TextSize = 'small' | 'medium' | 'large';

const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.2,
};

type ThemeState = {
  theme: ThemeTokens;
  isDark: boolean;
  toggleDarkMode: () => void;
  textSize: TextSize;
  setTextSize: (s: TextSize) => void;
  /** Typography styles with text-size scaling applied */
  type: typeof serene.type;
};

const ThemeContext = createContext<ThemeState | undefined>(undefined);

const DARK_KEY = 'serene.setting.dark_mode';
const SIZE_KEY = 'serene.setting.text_size';

function applyTextSizeScale(baseType: typeof serene.type, scale: number): typeof serene.type {
  return {
    displayLg: { ...baseType.displayLg, fontSize: Math.round(baseType.displayLg.fontSize * scale), lineHeight: Math.round(baseType.displayLg.lineHeight * scale) },
    headlineLg: { ...baseType.headlineLg, fontSize: Math.round(baseType.headlineLg.fontSize * scale), lineHeight: Math.round(baseType.headlineLg.lineHeight * scale) },
    titleMd: { ...baseType.titleMd, fontSize: Math.round(baseType.titleMd.fontSize * scale), lineHeight: Math.round(baseType.titleMd.lineHeight * scale) },
    bodyLg: { ...baseType.bodyLg, fontSize: Math.round(baseType.bodyLg.fontSize * scale), lineHeight: Math.round(baseType.bodyLg.lineHeight * scale) },
    bodyMd: { ...baseType.bodyMd, fontSize: Math.round(baseType.bodyMd.fontSize * scale), lineHeight: Math.round(baseType.bodyMd.lineHeight * scale) },
    labelSm: { ...baseType.labelSm, fontSize: Math.round(baseType.labelSm.fontSize * scale), lineHeight: Math.round(baseType.labelSm.lineHeight * scale) },
  } as typeof serene.type;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [textSize, setTextSizeState] = useState<TextSize>('medium');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [dm, ts] = await AsyncStorage.multiGet([DARK_KEY, SIZE_KEY]);
        if (dm[1]) setIsDark(dm[1] === 'true');
        if (ts[1] && ['small', 'medium', 'large'].includes(ts[1])) setTextSizeState(ts[1] as TextSize);
      } catch {
        // defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleDarkMode = async () => {
    setIsDark((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(DARK_KEY, String(next));
      return next;
    });
  };

  const setTextSize = async (s: TextSize) => {
    setTextSizeState(s);
    await AsyncStorage.setItem(SIZE_KEY, s);
  };

  if (!loaded) return null;

  const baseTheme = isDark ? (dark as unknown as typeof serene) : serene;
  const scale = TEXT_SIZE_SCALE[textSize];

  const value: ThemeState = {
    theme: baseTheme,
    isDark,
    toggleDarkMode,
    textSize,
    setTextSize,
    type: applyTextSizeScale(baseTheme.type, scale),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Convenience hook — returns the current theme's `colors` object. */
export function useColors() {
  return useTheme().theme.colors;
}

/** Convenience hook — returns scaled typography styles. */
export function useType() {
  return useTheme().type;
}
