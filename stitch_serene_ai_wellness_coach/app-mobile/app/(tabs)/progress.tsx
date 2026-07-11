import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, Progress as ProgressData } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Card } from '../../components/ui';
import { useColors, useType } from '../../lib/theme-provider';
import { radius, spacing } from '../../theme/serene';

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function moodColor(score: number, colors: ReturnType<typeof import('../../lib/theme-provider').useColors>) {
  if (score >= 8) return colors.primary;
  if (score >= 6) return colors.primaryFixedDim;
  if (score >= 4) return colors.secondary;
  return colors.outline;
}

export default function Progress() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
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
      <Text style={[type.headlineLg, { color: colors.primary }]}>{t('progress.title')}</Text>

      {/* Top stats */}
      <View style={styles.statsRow}>
        <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 8 }}>
          <View style={[styles.statIcon, { backgroundColor: colors.secondaryContainer }]}>
            <Ionicons name="flame" size={20} color={colors.secondary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, fontSize: 26 }]}>{data?.streak_days ?? 0}</Text>
          <Text style={[type.labelSm, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>{t('progress.streak')}</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 8 }}>
          <View style={[styles.statIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, fontSize: 26 }]}>{data?.sessions_this_week ?? 0}</Text>
          <Text style={[type.labelSm, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>{t('progress.sessions')}</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 8 }}>
          <View style={[styles.statIcon, { backgroundColor: colors.primaryFixed }]}>
            <Ionicons name="happy-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[type.displayLg, { color: colors.primary, fontSize: 26 }]}>{data ? data.avg_mood.toFixed(1) : '—'}</Text>
          <Text style={[type.labelSm, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>{t('progress.avgMood')}</Text>
        </Card>
      </View>

      {/* Mood trend chart */}
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>{t('progress.chartTitle')}</Text>
          <Text style={[type.labelSm, { color: colors.outline }]}>{t('progress.chartLabel')}</Text>
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
                              backgroundColor: moodColor(v, colors),
                            },
                          ]}
                        />
                      )}
                      {v === 0 && (
                        <View style={[styles.barEmpty, { backgroundColor: colors.surfaceContainerHigh }]} />
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
            <View style={styles.legend}>
              {[
                { color: colors.primary, label: t('progress.calm') },
                { color: colors.primaryFixedDim, label: t('progress.neutral') },
                { color: colors.secondary, label: t('progress.tense') },
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
              {t('progress.noData')}
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
            ? t('progress.anxietyDown', { pct: String(Math.abs(anxietyDelta)) })
            : data && anxietyDelta > 0
            ? t('progress.anxietyUp', { pct: String(anxietyDelta) })
            : t('progress.noData')}
        </Text>
      </Card>

      {/* Weekly report link */}
      {data && (
        <Pressable onPress={() => router.push('/weekly-report')} accessibilityRole="button" accessibilityLabel="Voir le rapport hebdomadaire">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[styles.insightIcon, { backgroundColor: colors.primaryFixed }]}>
              <Ionicons name="bar-chart" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.titleMd, { color: colors.primary }]}>{t('progress.reportLink')}</Text>
              <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>{t('progress.reportSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.outline} />
          </Card>
        </Pressable>
      )}

      {/* More insights */}
      <View style={{ gap: 10 }}>
        <Text style={[type.labelSm, { color: colors.outline }]}>{t('progress.explore')}</Text>
        {[
          { label: t('progress.correlation'), icon: 'git-branch-outline', href: '/correlation' },
          { label: t('progress.monthlyReport'), icon: 'calendar-outline', href: '/monthly-report' },
          { label: t('progress.badges'), icon: 'medal-outline', href: '/badges' },
          { label: t('progress.challenges'), icon: 'trophy-outline', href: '/challenges' },
        ].map((item) => (
          <Pressable
            key={item.href}
            onPress={() => router.push(item.href as any)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[styles.insightIcon, { backgroundColor: colors.primaryFixed }]}>
                <Ionicons name={item.icon as any} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.titleMd, { color: colors.primary }]}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.outline} />
            </Card>
          </Pressable>
        ))}
      </View>

      {/* Empty-state */}
      {!data && (
        <View style={styles.emptyState}>
          <Ionicons name="leaf-outline" size={32} color={colors.outlineVariant} />
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
              {t('progress.empty')}
            </Text>
        </View>
      )}
    </ScrollView>
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
