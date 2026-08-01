import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth';
import { Card } from '../components/ui';
import { useColors, useType } from '../lib/theme-provider';
import { radius, softGlow, spacing } from '../theme/serene';

type Exercise = {
  id: string;
  name: string;
  icon: string;
  category: string;
  duration: string;
  difficulty: 'Facile' | 'Moyen';
  description: string;
  route: string;
  premium?: boolean;
};

type HistoryItem = {
  id: string;
  name: string;
  completedAt: string;
};

const CATEGORIES = ['Tous', 'Respiration', 'Ancrage', 'Relaxation', 'Reframing'] as const;

const EXERCISES: Exercise[] = [
  {
    id: 'square-breathing',
    name: 'Respiration carré',
    icon: 'fitness',
    category: 'Respiration',
    duration: '2 min',
    difficulty: 'Facile',
    description: 'Cycle 4-4-4-4 pour calmer l\'esprit',
    route: '/breathing',
  },
  {
    id: 'grounding-54321',
    name: 'Ancrage 5-4-3-2-1',
    icon: 'earth',
    category: 'Ancrage',
    duration: '5 min',
    difficulty: 'Facile',
    description: 'Ancrage sensoriel complet',
    route: '/grounding',
  },
  {
    id: 'pmr',
    name: 'Relaxation musculaire',
    icon: 'body',
    category: 'Relaxation',
    duration: '8 min',
    difficulty: 'Moyen',
    description: 'PMR pour relâcher les tensions',
    route: '/pmr',
  },
  {
    id: 'reframing',
    name: 'Reprogrammation cognitive',
    icon: 'bulb',
    category: 'Reframing',
    duration: '10 min',
    difficulty: 'Moyen',
    description: 'Transformez vos pensées négatives',
    route: '/reframing',
  },
  {
    id: 'meditation',
    name: 'Méditation ventilateur',
    icon: 'leaf',
    category: 'Ancrage',
    duration: '5 min',
    difficulty: 'Facile',
    description: 'Méditation guidée apaisante',
    route: '/meditation',
    premium: true,
  },
  {
    id: 'journal',
    name: 'Journaling apaisant',
    icon: 'book',
    category: 'Reframing',
    duration: '10 min',
    difficulty: 'Facile',
    description: 'Exprimez-vous librement',
    route: '/journal',
  },
];

const HISTORY_KEY = 'serene.exerciseHistory';

async function getHistory(): Promise<HistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Exercises() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('Tous');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const isPremium = user?.is_premium ?? false;

  useFocusEffect(
    useCallback(() => {
      getHistory().then(setHistory);
    }, []),
  );

  const filtered = activeCategory === 'Tous'
    ? EXERCISES
    : EXERCISES.filter((e) => e.category === activeCategory);

  const handlePress = (exercise: Exercise) => {
    if (exercise.premium && !isPremium) {
      router.push('/paywall');
      return;
    }
    router.push(exercise.route as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainerHigh }]}
          accessibilityLabel="Retour"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[type.headlineLg, { color: colors.primary, fontSize: 22 }]}>Exercices</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setActiveCategory(cat)}
            style={[
              styles.chip,
              activeCategory === cat
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
            ]}
            accessibilityLabel={`Catégorie : ${cat}`}
            accessibilityRole="button"
            accessibilityState={{ selected: activeCategory === cat }}
          >
            <Text
              style={[
                type.labelSm,
                { color: activeCategory === cat ? colors.onPrimary : colors.onSurfaceVariant },
              ]}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Exercise grid */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={{ padding: spacing.containerMobile, gap: 12, paddingBottom: history.length > 0 ? 8 : 24 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={36} color={colors.outlineVariant} />
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
              Aucun exercice dans cette catégorie
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handlePress(item)}
            style={({ pressed }) => [
              styles.exerciseCard,
              softGlow,
              { transform: [{ scale: pressed ? 0.97 : 1 }], backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant },
            ]}
            accessibilityLabel={`${item.name}, ${item.duration}, ${item.difficulty}`}
            accessibilityRole="button"
          >
            <View style={[styles.cardIcon, { backgroundColor: colors.primaryFixed }]}>
              <Ionicons name={item.icon as any} size={24} color={colors.primary} />
              {item.premium && (
                <View style={[styles.premiumBadge, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="star" size={10} color={colors.onPrimary} />
                </View>
              )}
            </View>
            <Text style={[type.titleMd, { color: colors.onSurface, fontSize: 15 }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, fontSize: 13 }]}>
              {item.duration} · {item.difficulty}
            </Text>
            <Text style={[type.bodyMd, { color: colors.outline, fontSize: 12 }]} numberOfLines={2}>
              {item.description}
            </Text>
          </Pressable>
        )}
      />

      {/* Exercise history */}
      {history.length > 0 && (
        <View style={styles.historySection}>
          <Text style={[type.titleMd, { color: colors.primary, marginBottom: 8 }]}>Dernières séances</Text>
          {history.slice(0, 5).map((h) => (
            <View key={h.id} style={[styles.historyRow, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>
                {h.name}
              </Text>
              <Text style={[type.labelSm, { color: colors.outline }]}>
                {new Date(h.completedAt).toLocaleDateString('fr-FR')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.containerMobile,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipScroll: {
    paddingHorizontal: spacing.containerMobile,
    paddingBottom: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  gridRow: {
    gap: 12,
    marginBottom: 12,
  },
  exerciseCard: {
    flex: 1,
    borderRadius: radius.base,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  premiumBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  historySection: {
    paddingHorizontal: spacing.containerMobile,
    paddingBottom: 24,
    gap: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    padding: 12,
    borderWidth: 1,
  },
});
