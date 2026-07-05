import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../lib/auth';
import { api, Progress } from '../../lib/api';
import { Card } from '../../components/ui';
import { AdBanner } from '../../components/AdBanner';
import { colors, FREE_SESSION_LIMIT, MOODS, radius, softGlow, spacing, type } from '../../theme/serene';
import { ONBOARDING_NAME_KEY } from '../onboarding';

export default function Home() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [celebratingStreak, setCelebratingStreak] = useState(false);
  const streakScale = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      api.progress().then(setProgress).catch(() => {});
      AsyncStorage.getItem(ONBOARDING_NAME_KEY)
        .then((v) => setLocalName(v))
        .catch(() => {});
    }, []),
  );

  const displayName = user?.name ?? localName ?? 'vous';

  const celebrateStreak = () => {
    setCelebratingStreak(true);
    Animated.sequence([
      Animated.spring(streakScale, { toValue: 1.35, useNativeDriver: true, friction: 4 }),
      Animated.spring(streakScale, { toValue: 1, useNativeDriver: true, friction: 6 }),
    ]).start(() => setCelebratingStreak(false));
  };

  const pickMood = async (i: number) => {
    setSelected(i);
    const m = MOODS[i];
    try {
      await api.logMood(m.score, m.label);
    } catch {
      /* offline-tolerant */
    }
  };

  const weeklyPct = progress
    ? Math.min(1, progress.sessions_this_week / (progress.sessions_limit || FREE_SESSION_LIMIT))
    : 0;

  const sessionsLeft = progress
    ? Math.max(0, (progress.sessions_limit || FREE_SESSION_LIMIT) - progress.sessions_this_week)
    : null;
  const isPremium = user?.is_premium ?? progress?.is_premium ?? false;
  const showUpgradeNudge = !isPremium && sessionsLeft !== null && sessionsLeft <= 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.containerMobile, paddingTop: insets.top + 16, gap: spacing.section }}
      >
        {/* Header */}
        <View style={styles.row}>
          <View style={[styles.row, { gap: 8 }]}>
            <Ionicons name="leaf" size={28} color={colors.primary} />
            <Text style={[type.displayLg, { color: colors.primary, fontSize: 30 }]}>Serene</Text>
          </View>
        </View>

        {/* Greeting */}
        <View style={{ gap: 4 }}>
          <Text style={[type.titleMd, { color: colors.secondary }]}>
            Bonjour, {displayName}
          </Text>
          <Text style={[type.headlineLg, { color: colors.primary }]}>Comment vous sentez-vous ?</Text>
        </View>

        {/* Mood selector */}
        <View style={styles.moodRow}>
          {MOODS.map((m, i) => (
            <Pressable
              key={m.label}
              style={styles.mood}
              onPress={() => pickMood(i)}
              accessibilityLabel={`Humeur : ${m.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === i }}
            >
              <View style={[styles.moodCircle, softGlow, selected === i && { backgroundColor: colors.primaryFixed }]}>
                <Ionicons
                  name={m.icon as any}
                  size={26}
                  color={selected === i ? colors.primary : colors.secondary}
                />
              </View>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Sessions-left nudge — visible when 1 or 0 sessions remain for free users */}
        {showUpgradeNudge && (
          <Pressable
            onPress={() => router.push('/paywall')}
            style={styles.nudge}
            accessibilityRole="button"
            accessibilityLabel={`Il vous reste ${sessionsLeft} session gratuite. Passer à Pro`}
          >
            <Ionicons name="star-outline" size={18} color={colors.primary} />
            <Text style={[type.bodyMd, { color: colors.primary, flex: 1 }]}>
              {sessionsLeft === 0
                ? 'Votre quota gratuit est atteint. Passez à Pro pour continuer.'
                : 'Il vous reste 1 session gratuite cette semaine. Découvrez Pro →'}
            </Text>
          </Pressable>
        )}

        {/* Big CTA → chat */}
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Pressable
            style={({ pressed }) => [styles.cta, softGlow, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            onPress={() => router.push('/(tabs)/chat')}
            accessibilityLabel="Commencer une session"
            accessibilityRole="button"
          >
            <Ionicons name="play" size={34} color={colors.onPrimary} />
            <Text style={[type.titleMd, { color: colors.onPrimary, textAlign: 'center' }]}>
              Commencer{'\n'}une session
            </Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={{ gap: spacing.gutter }}>
          {/* Streak card with celebration tap */}
          <Pressable onPress={celebrateStreak} accessibilityRole="none">
            <Card style={styles.statCard}>
              <View style={[styles.iconBubble, { backgroundColor: colors.secondaryContainer }]}>
                <Animated.View style={{ transform: [{ scale: streakScale }] }}>
                  <Ionicons name="flame" size={22} color={colors.secondary} />
                </Animated.View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>SÉRIE ACTUELLE</Text>
                <Text style={[type.titleMd, { color: colors.primary }]}>
                  {progress?.streak_days ?? 0} jour{(progress?.streak_days ?? 0) !== 1 ? 's' : ''} consécutif{(progress?.streak_days ?? 0) !== 1 ? 's' : ''}
                </Text>
                {celebratingStreak && (
                  <Text style={[type.labelSm, { color: colors.primary, marginTop: 2 }]}>
                    Continuez comme ça !
                  </Text>
                )}
                {!progress && (
                  <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, fontSize: 13 }]}>
                    Commencez votre première session pour démarrer votre série.
                  </Text>
                )}
              </View>
            </Card>
          </Pressable>

          {/* Weekly goal card */}
          <Card style={styles.statCard}>
            <View style={[styles.iconBubble, { backgroundColor: colors.primaryFixed }]}>
              <Ionicons name="calendar" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>OBJECTIF HEBDO</Text>
              <Text style={[type.titleMd, { color: colors.primary }]}>
                {progress?.sessions_this_week ?? 0}/{progress?.sessions_limit ?? FREE_SESSION_LIMIT} sessions
              </Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${weeklyPct * 100}%` }]} />
              </View>
              {!isPremium && sessionsLeft !== null && sessionsLeft > 1 && (
                <Text style={[type.labelSm, { color: colors.outline, marginTop: 4 }]}>
                  {sessionsLeft} session{sessionsLeft > 1 ? 's' : ''} gratuite{sessionsLeft > 1 ? 's' : ''} restante{sessionsLeft > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </Card>
        </View>

        {/* Quick exercise shortcut */}
        <Pressable
          onPress={() => router.push('/breathing')}
          accessibilityLabel="Exercice de respiration au carré"
          accessibilityRole="button"
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={[styles.iconBubble, { backgroundColor: colors.primaryFixed }]}>
              <Ionicons name="fitness" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.titleMd, { color: colors.onSurface }]}>Respiration au carré</Text>
              <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>2 min · apaise l'anxiété</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.outline} />
          </Card>
        </Pressable>

        {/* Empty-state encouragement when no progress yet */}
        {!progress && (
          <View style={styles.emptyState}>
            <Ionicons name="leaf-outline" size={32} color={colors.outlineVariant} />
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
              Votre parcours commence ici.{'\n'}Commencez une session ou choisissez votre humeur pour suivre vos progrès.
            </Text>
          </View>
        )}

        <View style={{ height: 8 }} />
      </ScrollView>

      <AdBanner isPremium={isPremium} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  mood: { alignItems: 'center', gap: 8, flex: 1 },
  moodCircle: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primaryFixed,
    borderRadius: radius.base,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  cta: {
    width: 190,
    height: 190,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statCard: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  iconBubble: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  bar: {
    height: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.full,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: { height: 6, backgroundColor: colors.primary, borderRadius: radius.full },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.gutter,
    paddingHorizontal: spacing.containerMobile,
  },
});
