import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

/**
 * Reusable top bar with a back button + title, used by pushed/stack screens
 * so the user can always navigate back. Falls back to the main tabs if there
 * is nothing to go back to (e.g. deep link / web refresh).
 */
export function ScreenHeader({
  title,
  showBack = true,
  onBack,
  right,
}: {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <View style={[styles.header, { paddingTop: 8 }]}>
      <View style={styles.side}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={[styles.backBtn, { backgroundColor: colors.surfaceContainerLow }]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
        )}
      </View>
      <Text
        style={[type.headlineLg, { color: colors.primary, flex: 1, textAlign: showBack ? 'left' : 'center' }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.containerMobile,
    paddingBottom: 8,
  },
  side: { width: 40, alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
