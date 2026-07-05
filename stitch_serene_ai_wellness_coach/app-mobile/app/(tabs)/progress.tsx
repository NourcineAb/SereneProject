import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, Progress as ProgressData } from '../../lib/api';
import { Card } from '../../components/ui';
import { colors, radius, spacing, type } from '../../theme/serene';

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Mood score bands → colour for the chart bars
function moodColor(score: number): string {
  if (score >= 8) return colors.primary;
  if (score >= 6) return colors.primaryFixedDim;
  if (score >= 4) return colors.secondary;
  return colors.outline;
}

export default function Progress() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ProgressData | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.progress().then(setData).catch(() => {});
    }, []),
  );

  const trend = data?.mood_trend ?? Array(7).fill(0);
  const maxTrend = Math.max(10, ...trend);
  const hasData = trend.some((v) => v > 0);

  const anxietyDelta = data?.anxiety_change_pct ?? 0;
  const insightIcon = anxietyDelta < 0 ? 'trending-down' : anxietyDelta > 0 ? 'trending-up' : 'remove';
  const insightColor = anxietyDelta < 0 ? colors.primary : anxietyDelta > 0 ? colors.secondary : colors.outline;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.containerMobile, paddingTop: insets.top + 16, gap: spacing.section }}
    >
      <Text style={[type.headlineLg, { color: colors.primary }]}>Vos progrès</Text>

      {/* Top stats */}
      <View style={styles.statsRow}>
        <StatCard
          value={`${data?.streak_days ?? 0}`}
          label="série"
          icon="flame"
          iconBg={colors.secondaryContainer}
          iconColor={colors.secondary}
        />
        <StatCard
          value={`${data?.sessions_this_week ?? 0}`}
          label="sessions"
          icon="chatbubble-ellipses"
          iconBg={colors.primaryFixed}
          iconColor={colors.primary}
        />
        <StatCard
          value={data ? data.avg_mood.toFixed(1) : '—'}
          label="humeur moy."
          icon="happy-outline"
          iconBg={colors.primaryFixed}
          iconColor={colors.primary}
        />
      </View>

      {/* Mood trend chart */}
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>7 derniers jours</Text>
          <Text style={[type.labelSm, { color: colors.outline }]}>Humeur (0–10)</Text>
        </View>

        {hasData ? (
          <>
            <View style={styles.chart}>
              {trend.map((v, i) => {
                const heightPct = v > 0 ? Math.max(8, (v / maxTrend) * 100) : 0;
                return (
                  <View key={i} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      {v > 0 && (
                        <View
                          style={[
                            styles.bar,
                            {
                              height: `${heightPct}%`,
                              backgroundColor: moodColor(v),
                            },
                          ]}
                        />
                      )}
                      {v === 0 && (
                        <View style={styles.barEmpty} />
                      )}
                    </View>
                    {v > 0 && (
                      <Text style={[type.labelSm, { color: colors.onSurfaceVariant, fontSize: 10, marginBottom: 2 }]}>
                        {v}
                      </Text>
                    )}
                    <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{DAYS[i]}</Text>
                  </View>
                );
              })}
            </View>
            {/* Legend */}
            <View style={styles.legend}>
              {[
                { color: colors.primary, label: 'Serein (8-10)' },
                { color: colors.primaryFixedDim, label: 'Neutre (6-7)' },
                { color: colors.secondary, label: 'Tendu (4-5)' },
              ].map((l) => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                  <Text style={[type.labelSm, { color: colors.onSurfaceVariant, fontSize: 11 }]}>{l.label}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.chartEmpty}>
            <Ionicons name="analytics-outline" size={36} color={colors.outlineVariant} />
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
              Enregistrez votre humeur chaque jour pour voir votre courbe apparaître ici.
            </Text>
          </View>
        )}
      </Card>

      {/* Insight card */}
      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', backgroundColor: colors.surfaceContainerLow }}>
        <View style={[styles.insightIcon, { backgroundColor: colors.primaryFixed }]}>
          <Ionicons name={insightIcon as any} size={20} color={insightColor} />
        </View>
        <Text style={[type.bodyMd, { color: colors.secondary, flex: 1, lineHeight: 22 }]}>
          {data && anxietyDelta < 0
            ? `Votre anxiété a baissé de ${Math.abs(anxietyDelta)} % cette semaine. Continuez — vous progressez vraiment.`
            : data && anxietyDelta > 0
            ? `Semaine plus intense (+${anxietyDelta} %). Une petite session aujourd'hui peut faire la différence.`
            : 'Enregistrez votre humeur chaque jour pour suivre vos tendances et constater vos progrès.'}
        </Text>
      </Card>

      {/* Empty-state encouragement */}
      {!data && (
        <View style={styles.emptyState}>
          <Ionicons name="leaf-outline" size={32} color={colors.outlineVariant} />
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
            Votre tableau de bord apparaîtra ici après votre première session.{'\n'}
            C'est le moment de commencer !
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  value,
  label,
  icon,
  iconBg,
  iconColor,
}: {
  value: string;
  label: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 8 }}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={[type.displayLg, { color: colors.primary, fontSize: 26 }]}>{value}</Text>
      <Text style={[type.labelSm, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: spacing.gutter },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    flex: 1,
    width: '80%',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  bar: {
    width: '100%',
    borderRadius: radius.sm,
    minHeight: 6,
  },
  barEmpty: {
    width: '80%',
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignSelf: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  chartEmpty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.gutter,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.gutter,
  },
});
