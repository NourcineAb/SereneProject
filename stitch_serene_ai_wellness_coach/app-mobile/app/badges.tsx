import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BadgeDefinition, getAllBadges } from '../lib/badges';
import { Card } from '../components/ui';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

export default function BadgesScreen() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const [badges, setBadges] = useState<BadgeDefinition[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      getAllBadges().then(setBadges).catch(() => {});
    }, []),
  );

  const earnedCount = badges.filter((b) => b.earned).length;
  const totalCount = badges.length || 10;
  const progressPct = earnedCount / totalCount;

  const onBadgeTap = (badge: BadgeDefinition) => {
    if (!badge.earned) return;
    setSelectedBadge(badge.id);
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.2, useNativeDriver: true, friction: 4 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 6 }),
    ]).start();
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.containerMobile, paddingTop: insets.top + 16, gap: spacing.section }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Retour" accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </Pressable>
        <Text style={[type.headlineLg, { color: colors.primary }]}>Mes Récompenses</Text>
        <View style={{ width: 28 }} />
      </View>

      <Card style={{ gap: 12 }}>
        <View style={styles.statsRow}>
          <Ionicons name="trophy" size={22} color={colors.primary} />
          <Text style={[type.titleMd, { color: colors.primary }]}>
            {earnedCount}/{totalCount} badges obtenus
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainer }]}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%`, backgroundColor: colors.primary }]} />
        </View>
      </Card>

      <View style={styles.grid}>
        {badges.map((badge) => (
          <Pressable
            key={badge.id}
            style={styles.badgeCell}
            onPress={() => onBadgeTap(badge)}
            accessibilityLabel={`${badge.name}, ${badge.earned ? 'obtenu' : 'non obtenu'}`}
            accessibilityRole="button"
          >
            <Animated.View
              style={[
                styles.badgeIcon,
                badge.earned
                  ? { backgroundColor: colors.primaryFixed, shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
                  : { backgroundColor: colors.surfaceContainerHigh },
                selectedBadge === badge.id && { transform: [{ scale: scaleAnim }] },
              ]}
            >
              <Ionicons
                name={badge.icon as any}
                size={32}
                color={badge.earned ? colors.primary : colors.outlineVariant}
              />
              {!badge.earned && (
                <View style={[styles.lockOverlay, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <Ionicons name="lock-closed" size={12} color={colors.outline} />
                </View>
              )}
            </Animated.View>
            <Text
              style={[
                type.labelSm,
                { color: badge.earned ? colors.onSurface : colors.outline, textAlign: 'center' },
              ]}
            >
              {badge.name}
            </Text>
            <Text
              style={[
                type.labelSm,
                {
                  color: colors.onSurfaceVariant,
                  textAlign: 'center',
                  fontSize: 10,
                },
              ]}
              numberOfLines={2}
            >
              {badge.description}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: radius.full,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCell: {
    width: '30%',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  badgeIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderRadius: radius.full,
    padding: 4,
  },
});
