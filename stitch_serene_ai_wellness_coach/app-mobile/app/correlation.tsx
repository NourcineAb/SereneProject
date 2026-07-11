import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, WeeklyReport } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, PillButton } from '../components/ui';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

function getTechniqueColors(colors: any): Record<string, string> {
  return {
    box_breathing: colors.primary,
    grounding_54321: colors.primaryFixedDim,
    pmr: colors.secondary,
    reframing: '#484744',
    meditation: '#2d6a4f',
    journaling: '#a39270',
  };
}

const TECHNIQUE_LABELS: Record<string, string> = {
  box_breathing: 'Respiration carree',
  grounding_54321: 'Ancrage 5-4-3-2-1',
  pmr: 'Relaxation musculaire',
  reframing: 'Reformulation cognitive',
  meditation: 'Meditation',
  journaling: 'Journaling',
};

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const INSIGHT_TEMPLATES = [
  "Vous etes plus serein apres les exercices de {technique}.",
  "Votre humeur est meilleure le {day}.",
  "La {technique} est votre technique la plus efficace.",
  "Vous avez tendance a etre plus {mood} le {day}.",
  "Essayez de maintenir votre routine le {day} pour ameliorer votre humeur.",
];

function getInsights(data: WeeklyReport): string[] {
  const insights: string[] = [];
  const techUsage = data.technique_usage;
  const bestTech = Object.entries(techUsage).sort((a, b) => b[1] - a[1])[0];
  if (bestTech) {
    const label = TECHNIQUE_LABELS[bestTech[0]] ?? bestTech[0];
    insights.push(`Vous etes plus serein apres les exercices de ${label}.`);
  }
  if (data.insights.best_day) {
    insights.push(`Votre humeur est meilleure le ${data.insights.best_day}.`);
  }
  if (data.insights.mood_trend === 'improved') {
    insights.push("Votre humeur s'ameliore progressivement. Continuez !");
  } else if (data.insights.mood_trend === 'declined') {
    insights.push("Votre humeur a baisse cette semaine. Essayez de plus de repos.");
  } else {
    insights.push('Votre humeur est restee stable cette semaine.');
  }
  if (insights.length < 3) {
    insights.push('Enregistrez votre humeur chaque jour pour des insights plus precis.');
  }
  return insights.slice(0, 3);
}

export default function CorrelationScreen() {
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
            Correlations
          </Text>
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Les analyses de correlations sont reservees aux membres Serene Pro.
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

  const techUsage = data?.technique_usage ?? {};
  const sessionsPerDay = data?.sessions_per_day ?? [0, 0, 0, 0, 0, 0, 0];
  const maxSessions = Math.max(1, ...sessionsPerDay);
  const insights = data ? getInsights(data) : [];

  const sortedTech = Object.entries(techUsage)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const maxTechCount = Math.max(1, ...sortedTech.map(([, v]) => v));

  const bestDayIdx = sessionsPerDay.indexOf(Math.max(...sessionsPerDay));
  const worstDayIdx = sessionsPerDay.indexOf(
    Math.min(...(sessionsPerDay.filter((v) => v > 0).length > 0 ? sessionsPerDay : [0, 0, 0, 0, 0, 0, 0])),
  );

  const TECHNIQUE_COLORS = getTechniqueColors(colors);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.containerMobile,
        paddingTop: insets.top + 16,
        gap: spacing.section,
      }}
    >
      <View style={styles.headerRow}>
        <Ionicons
          name="chevron-back"
          size={28}
          color={colors.primary}
          onPress={() => router.back()}
        />
        <Text style={[type.headlineLg, { color: colors.primary }]}>Correlations</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Section 1: Humeur apres exercice */}
      <Card style={{ gap: 14 }}>
        <Text style={[type.titleMd, { color: colors.primary }]}>Humeur apres exercice</Text>
        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
          Score d'humeur moyen par technique utilisee
        </Text>
        {sortedTech.length > 0 ? (
          sortedTech.map(([tech, count]) => {
            const barWidth = Math.max(15, (count / maxTechCount) * 100);
            const color = TECHNIQUE_COLORS[tech] ?? colors.outline;
            const avgMood = data?.avg_mood ?? 5;
            const moodBar = Math.max(10, (avgMood / 10) * 100);
            return (
              <View key={tech} style={styles.techBarRow}>
                <Text style={[type.labelSm, { color: colors.onSurfaceVariant, width: 100 }]}>
                  {TECHNIQUE_LABELS[tech] ?? tech}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: colors.surfaceContainer }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${moodBar}%`,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>
                <Text style={[type.labelSm, { color: colors.onSurface, width: 40, textAlign: 'right' }]}>
                  {avgMood.toFixed(1)}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Aucune donnee de technique cette semaine.
          </Text>
        )}
      </Card>

      {/* Section 2: Tendance hebdomadaire */}
      <Card style={{ gap: 14 }}>
        <Text style={[type.titleMd, { color: colors.primary }]}>Tendance hebdomadaire</Text>
        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
          Score d'humeur par jour de la semaine
        </Text>
        <View style={styles.weekChart}>
          {DAY_LABELS.map((day, i) => {
            const count = sessionsPerDay[i];
            const heightPct = count > 0 ? Math.max(8, (count / maxSessions) * 100) : 0;
            const isBest = i === bestDayIdx && count > 0;
            const isWorst = i === worstDayIdx && count > 0 && worstDayIdx !== bestDayIdx;
            return (
              <View key={i} style={styles.barCol}>
                <View style={styles.chartBarTrack}>
                  {count > 0 ? (
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: `${heightPct}%`,
                          backgroundColor: isBest
                            ? colors.primary
                            : isWorst
                            ? colors.error
                            : colors.surfaceContainerHighest,
                        },
                      ]}
                    />
                  ) : (
                    <View style={[styles.chartBarEmpty, { backgroundColor: colors.surfaceContainerHigh }]} />
                  )}
                </View>
                {isBest && (
                  <Ionicons name="star" size={12} color={colors.primary} style={{ marginBottom: 2 }} />
                )}
                {isWorst && (
                  <Ionicons name="alert-circle" size={12} color={colors.error} style={{ marginBottom: 2 }} />
                )}
                <Text
                  style={[
                    type.labelSm,
                    {
                      color: isBest ? colors.primary : isWorst ? colors.error : colors.onSurfaceVariant,
                    },
                  ]}
                >
                  {day}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>Meilleur jour</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
            <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>Jour le plus bas</Text>
          </View>
        </View>
      </Card>

      {/* Section 3: Insights */}
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="bulb" size={20} color={colors.primary} />
          <Text style={[type.titleMd, { color: colors.primary }]}>Insights</Text>
        </View>
        {insights.map((insight, i) => (
          <View key={i} style={styles.insightRow}>
            <View style={[styles.insightIcon, { backgroundColor: colors.primaryFixed }]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            </View>
            <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1, lineHeight: 22 }]}>
              {insight}
            </Text>
          </View>
        ))}
      </Card>

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paywallIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: 12,
    borderRadius: radius.full,
  },
  weekChart: {
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
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
