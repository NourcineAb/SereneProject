import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, softGlow, type } from '../theme/serene';

export function PillButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'tonal' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'tonal' ? colors.surfaceContainerHighest : 'transparent';
  const fg = variant === 'primary' ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        variant === 'outline' && { borderWidth: 1.5, borderColor: colors.outlineVariant },
        variant === 'primary' && softGlow,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[type.titleMd, { color: fg, textAlign: 'center' }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, softGlow, style]}>{children}</View>;
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <View style={styles.tag}>
      <Text style={[type.labelSm, { color: colors.secondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
