import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, WeeklyReport } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, PillButton } from '../components/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function getMoodColors(colors: any): Record<string, string> {
  return {
    calme: colors.primary,
    joyeux: colors.primaryFixedDim,
    neutre: colors.secondary,
    anxieux: colors.outline,
    'fatigué': colors.secondary,
  };
}

const MOOD_LABELS: Record<string, string> = {
  calme: 'Calme',
  joyeux: 'Joyeux',
  neutre: 'Neutre',
  anxieux: 'Anxieux',
  'fatigué': 'Fatigu\u00e9',
};

function getWeekRange(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getDate()} ${d.toLocaleString('fr-FR', { month: 'short' })}`;
  return `${fmt(monday)} \u2014 ${fmt(sunday)}`;
}

function moodEmoji(avg: number): string {
  if (avg >= 8) return '\ud83d\ude0a';
  if (avg >= 6) return '\ud83d\ude10';
  if (avg >= 4) return '\ud83d\ude15';
  return '\ud83d\ude1e';
}

function getTrendInfo(trend: string, colors: any): { name: string; color: string } {
  if (trend === 'improved') return { name: 'trending-up', color: colors.primary };
  if (trend === 'declined') return { name: 'trending-down', color: colors.error };
  return { name: 'remove', color: colors.outline };
}

function trendText(trend: string): string {
  if (trend === 'improved') return "Votre humeur s'ameliore cette semaine !";
  if (trend === 'declined') return 'Votre humeur a baisse cette semaine.';
  return 'Votre humeur est restee stable cette semaine.';
}

export default function WeeklyReportScreen() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      api
        .weeklyReport()
        .then((r) => {
          if (active) setData(r);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const isPremium = user?.is_premium ?? false;

  if (!isPremium && !loading) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: spacing.containerMobile,
          paddingTop: insets.top + 16,
          gap: spacing.section,
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
        }}
      >
        <View style={{ alignItems: 'center', gap: 16 }}>
          <View style={[styles.paywallIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="lock-closed" size={32} color={colors.primary} />
          </View>
          <Text style={[type.headlineLg, { color: colors.primary, textAlign: 'center' }]}>
            Rapport Hebdomadaire
          </Text>
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Le rapport IA hebdomadaire est disponible pour les membres Serene Pro.
          </Text>
          <PillButton label="Decouvrir Serene Pro" onPress={() => router.push('/paywall')} />
          <Text
            onPress={() => router.back()}
            style={[type.bodyMd, { color: colors.outline, textAlign: 'center' }]}
          >
            Retour
          </Text>
        </View>
      </ScrollView>
    );
  }

  const moodDist = data?.mood_distribution ?? { calme: 0, joyeux: 0, neutre: 0, anxieux: 0, 'fatigué': 0 };
  const totalMood = Object.values(moodDist).reduce((a, b) => a + b, 0);
  const sessionsPerDay = data?.sessions_per_day ?? [0, 0, 0, 0, 0, 0, 0];
  const maxSessions = Math.max(1, ...sessionsPerDay);
  const techUsage = data?.technique_usage ?? {};

  const techLabels: Record<string, string> = {
    box_breathing: 'Respiration carr\u00e9e',
    grounding_54321: 'Ancrage 5-4-3-2-1',
    pmr: 'Relaxation musculaire',
    reframing: 'Reformulation cognitive',
    meditation: 'M\u00e9ditation',
    journaling: 'Journaling',
  };
  const sortedTech = Object.entries(techUsage)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const trend = data?.insights.mood_trend ?? 'stable';
  const trendInfo = getTrendInfo(trend, colors);
  const MOOD_COLORS = getMoodColors(colors);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.containerMobile,
        paddingTop: insets.top + 16,
        gap: spacing.section,
      }}
    >
      {/* Header */}
      <ScreenHeader title="Rapport hebdomadaire" />

      <View style={styles.header}>
        <Text style={[type.headlineLg, { color: colors.primary }]}>Rapport Hebdomadaire</Text>
        <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{getWeekRange()}</Text>
      </View>

      {/* Summary cards */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statEmoji}>{moodEmoji(data?.avg_mood ?? 0)}</Text>
          <Text style={[type.displayLg, { color: colors.primary, fontSize: 26 }]}>
            {data?.avg_mood?.toFixed(1) ?? '\u2014'}
          </Text>
          <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>Humeur moy.</Text>
        </Card>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, fontSize: 26 }]}>
            {data?.total_sessions ?? 0}
          </Text>
          <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>Sessions</Text>
        </Card>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: colors.secondaryContainer }]}>
            <Ionicons name="flame" size={20} color={colors.secondary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, fontSize: 26 }]}>
            {data?.streak_days ?? 0}
          </Text>
          <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>S\u00e9rie</Text>
        </Card>
      </View>

      {/* Most used technique */}
      {data?.most_used_technique && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={[styles.statIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="fitness" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.labelSm, { color: colors.outline }]}>TECHNIQUE LA PLUS UTILIS\u00c9E</Text>
            <Text style={[type.titleMd, { color: colors.primary }]}>{data.most_used_technique}</Text>
          </View>
        </Card>
      )}

      {/* Insights IA */}
      <Card style={{ gap: 14 }}>
        <Text style={[type.titleMd, { color: colors.primary }]}>Insights IA</Text>

        <View style={styles.insightRow}>
          <View style={[styles.insightIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name={trendInfo.name as any} size={18} color={trendInfo.color} />
          </View>
          <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1, lineHeight: 22 }]}>
            {trendText(trend)}
          </Text>
        </View>

        <View style={styles.insightRow}>
          <View style={[styles.insightIcon, { backgroundColor: colors.secondaryContainer }]}>
            <Ionicons name="calendar" size={18} color={colors.secondary} />
          </View>
          <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1, lineHeight: 22 }]}>
            Votre jour le plus productif :{' '}
            <Text style={{ fontFamily: type.titleMd.fontFamily }}>{data?.insights.best_day ?? '\u2014'}</Text>
          </Text>
        </View>

        <View style={styles.insightRow}>
          <View style={[styles.insightIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="bulb" size={18} color={colors.primary} />
          </View>
          <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1, lineHeight: 22 }]}>
            {data?.insights.recommendation ?? 'Enregistrez votre humeur chaque jour pour recevoir des conseils personnalises.'}
          </Text>
        </View>
      </Card>

      {/* Mood distribution */}
      <Card style={{ gap: 14 }}>
        <Text style={[type.titleMd, { color: colors.primary }]}>Distribution d'humeur</Text>
        {Object.entries(moodDist).map(([key, count]) => {
          const pct = totalMood > 0 ? (count / totalMood) * 100 : 0;
          return (
            <View key={key} style={styles.barRow}>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant, width: 80 }]}>
                {MOOD_LABELS[key] ?? key}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: colors.surfaceContainer }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: MOOD_COLORS[key] ?? colors.outline,
                    },
                  ]}
                />
              </View>
              <Text style={[type.labelSm, { color: colors.outline, width: 30, textAlign: 'right' }]}>{count}</Text>
            </View>
          );
        })}
        {totalMood === 0 && (
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Aucune donnee d'humeur cette semaine.
          </Text>
        )}
      </Card>

      {/* Sessions per day */}
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>Sessions par jour</Text>
          <Text style={[type.labelSm, { color: colors.outline }]}>Cette semaine</Text>
        </View>
        <View style={styles.chart}>
          {sessionsPerDay.map((count, i) => {
            const heightPct = count > 0 ? Math.max(8, (count / maxSessions) * 100) : 0;
            return (
              <View key={i} style={styles.barCol}>
                <View style={styles.chartBarTrack}>
                  {count > 0 ? (
                    <View
                      style={[
                        styles.chartBar,
                        { height: `${heightPct}%`, backgroundColor: colors.primary },
                      ]}
                    />
                  ) : (
                    <View style={[styles.chartBarEmpty, { backgroundColor: colors.surfaceContainerHigh }]} />
                  )}
                </View>
                {count > 0 && (
                  <Text style={[type.labelSm, { color: colors.onSurfaceVariant, fontSize: 10, marginBottom: 2 }]}>
                    {count}
                  </Text>
                )}
                <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{DAYS[i]}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Technique usage */}
      {sortedTech.length > 0 && (
        <Card style={{ gap: 14 }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>Utilisation des techniques</Text>
          {sortedTech.map(([key, count]) => (
            <View key={key} style={styles.barRow}>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant, flex: 1 }]}>
                {techLabels[key] ?? key}
              </Text>
              <View style={[styles.techBadge, { backgroundColor: colors.primaryFixed }]}>
                <Text style={[type.labelSm, { color: colors.primary }]}>{count}x</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Encouragement */}
      <Card style={{ backgroundColor: colors.surfaceContainerLow, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="heart" size={22} color={colors.primary} />
          <Text style={[type.titleMd, { color: colors.primary }]}>Continuez comme \u00e7a !</Text>
        </View>
        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, lineHeight: 22 }]}>
          {data && data.avg_mood >= 7
            ? "Excellent travail ! Votre regularite fait la difference. Chaque session vous rapproche de votre meilleure version."
            : data && data.total_sessions > 0
            ? "Chaque pas compte. Vous etes en train de construire une habitude bien\u00eatre solide. On est fier de vous."
            : 'Commencez une session aujourd\'hui pour demarrer votre parcours vers plus de serenite.'}
        </Text>
      </Card>

      {/* Share button */}
      <PillButton
        label="Partager mon rapport"
        variant="tonal"
        onPress={() => Alert.alert('Partage', 'Partage bientot disponible.')}
      />

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.gutter },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 6 },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statEmoji: { fontSize: 28 },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  insightIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: radius.full },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBarTrack: {
    flex: 1,
    width: '80%',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  chartBar: {
    width: '100%',
    borderRadius: radius.sm,
    minHeight: 6,
  },
  chartBarEmpty: {
    width: '80%',
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
  },
  techBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  paywallIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
