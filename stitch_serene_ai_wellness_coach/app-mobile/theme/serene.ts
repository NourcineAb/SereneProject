/**
 * Serene Design System — ported from serene_design_system/DESIGN.md.
 * "Minimalisme Doux" + organic tones: deep forest primary, sage, cream surfaces,
 * pill shapes, generous radii, soft ambient glow.
 */
export const colors = {
  surface: '#e8fff1',
  surfaceDim: '#c9dfd2',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#e2f9eb',
  surfaceContainer: '#ddf3e5',
  surfaceContainerHigh: '#d7eee0',
  surfaceContainerHighest: '#d1e8da',
  surfaceVariant: '#d1e8da',
  onSurface: '#0c1f17',
  onSurfaceVariant: '#404943',
  inverseSurface: '#21342b',
  outline: '#707973',
  outlineVariant: '#bfc9c1',
  primary: '#0f5238',
  onPrimary: '#ffffff',
  primaryContainer: '#2d6a4f',
  onPrimaryContainer: '#a8e7c5',
  primaryFixed: '#b1f0ce',
  primaryFixedDim: '#95d4b3',
  secondary: '#4e653f',
  secondaryContainer: '#d0ebbb',
  onSecondaryContainer: '#546b45',
  tertiary: '#484744',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  background: '#e8fff1',
  onBackground: '#0c1f17',
} as const;

export const radius = {
  sm: 8,
  base: 16,
  md: 24,
  lg: 32,
  xl: 48,
  full: 9999,
} as const;

export const spacing = {
  unit: 8,
  gutter: 16,
  containerMobile: 24,
  section: 40,
} as const;

export const fonts = {
  display: 'Quicksand_700Bold',
  headline: 'Quicksand_600SemiBold',
  title: 'PlusJakartaSans_600SemiBold',
  body: 'PlusJakartaSans_400Regular',
  label: 'PlusJakartaSans_600SemiBold',
} as const;

export const type = {
  displayLg: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -0.8 },
  headlineLg: { fontFamily: fonts.headline, fontSize: 26, lineHeight: 32 },
  titleMd: { fontFamily: fonts.title, fontSize: 20, lineHeight: 28 },
  bodyLg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  labelSm: { fontFamily: fonts.label, fontSize: 13, lineHeight: 16, letterSpacing: 0.65 },
} as const;

/** Ambient "soft glow" used for floating cards/buttons. */
export const softGlow = {
  shadowColor: '#0f5238',
  shadowOpacity: 0.12,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 6,
};

export const MOODS = [
  { label: 'Calme', icon: 'happy-outline', score: 9 },
  { label: 'Joyeux', icon: 'happy-outline', score: 8 },
  { label: 'Neutre', icon: 'remove-circle-outline', score: 6 },
  { label: 'Anxieux', icon: 'sad-outline', score: 3 },
  { label: 'Fatigué', icon: 'sad-outline', score: 4 },
] as const;

/** Free-tier session cap shown in the UI (mirrors backend default). */
export const FREE_SESSION_LIMIT = 3;

/** Onboarding "what brings you here" options. */
export const ONBOARDING_GOALS = [
  { id: 'stress', label: 'Gérer mon stress', icon: 'thunderstorm-outline' },
  { id: 'sleep', label: 'Mieux dormir', icon: 'moon-outline' },
  { id: 'anxiety', label: "Réduire l'anxiété", icon: 'heart-outline' },
  { id: 'focus', label: 'Mieux me concentrer', icon: 'bulb-outline' },
  { id: 'general', label: 'Prendre soin de moi', icon: 'leaf-outline' },
] as const;
