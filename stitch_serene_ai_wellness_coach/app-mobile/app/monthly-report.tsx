import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Card } from '../components/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { useColors, useType } from '../lib/theme-provider';
import { radius, softGlow, spacing } from '../theme/serene';

type MonthlyReport = {
  avg_mood: number;
  total_sessions: number;
  total_journal_entries: number;
  mood_distribution: Record<string, number>;
  sessions_per_week: number[];
  top_techniques: { name: string; count: number }[];
  streak_record: number;
  improvements: { mood_change_pct: number; sessions_change_pct: number };
  ai_summary: string;
};

const TECHNIQUE_LABELS: Record<string, string> = {
  box_breathing: 'Respiration carrée',
  grounding_54321: 'Ancrage 5-4-3-2-1',
  pmr: 'Relaxation musculaire',
  reframing: 'Reformulation cognitive',
  meditation: 'Méditation',
  journaling: 'Journaling',
};

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function MoodBar({ value, maxValue, label }: { value: number; maxValue: number; label: string }) {
  const colors = useColors();
  const type = useType();
  const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <View style={styles.moodBarCol}>
      <View style={[styles.moodBarTrack, { backgroundColor: colors.surfaceContainer }]}>
        <View style={[styles.moodBarFill, { height: `${Math.max(height, 2)}%`, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[type.labelSm, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }]}>
        {label}
      </Text>
      <Text style={[type.labelSm, { color: colors.primary, textAlign: 'center' }]}>{value}</Text>
    </View>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  const colors = useColors();
  const type = useType();
  return (
    <Card style={styles.statCard}>
      <View style={[styles.iconBubble, { backgroundColor: colors.primaryFixed }]}>
        <Ionicons name={icon as any} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{label}</Text>
        <Text style={[type.titleMd, { color: colors.primary }]}>{value}</Text>
      </View>
    </Card>
  );
}

function ChangeIndicator({ value, label }: { value: number; label: string }) {
  const colors = useColors();
  const type = useType();
  const isPositive = value > 0;
  const color = isPositive ? colors.primaryContainer : value < 0 ? colors.error : colors.outline;
  const icon = isPositive ? 'trending-up' : value < 0 ? 'trending-down' : 'remove';
  return (
    <View style={styles.changeRow}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[type.bodyMd, { color }]}>
        {isPositive ? '+' : ''}{value}%
      </Text>
      <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

export default function MonthlyReportScreen() {
  const colors = useColors();
  const type = useType();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const isPremium = user?.is_premium ?? false;

  const now = new Date();
  const monthName = MONTH_NAMES[now.getMonth()];

  useFocusEffect(
    useCallback(() => {
      if (isPremium) {
        api.monthlyReport().then(setReport).catch(() => {});
      }
    }, [isPremium]),
  );

  if (!isPremium) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: spacing.containerMobile }}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.primary} />
        <Text style={[type.headlineLg, { color: colors.primary, marginTop: 16, textAlign: 'center' }]}>
          Rapport mensuel
        </Text>
        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }]}>
          Ce rapport est réservé aux membres Serene Pro.
        </Text>
        <Pressable
          style={({ pressed }) => [{ backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 32, paddingVertical: 16, marginTop: 20 }, softGlow, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          onPress={() => {/* navigate to paywall */}}
        >
          <Text style={[type.titleMd, { color: colors.onPrimary }]}>Découvrir Pro</Text>
        </Pressable>
      </View>
    );
  }

  const maxMoodCount = report
    ? Math.max(1, ...Object.values(report.mood_distribution))
    : 1;
  const maxWeeklySessions = report
    ? Math.max(1, ...report.sessions_per_week)
    : 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing.containerMobile,
          paddingTop: insets.top + 16,
          gap: spacing.section,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <ScreenHeader title="Rapport mensuel" />

        <View style={styles.header}>
          <Text style={[type.headlineLg, { color: colors.primary }]}>{monthName}</Text>
          <Text style={[type.titleMd, { color: colors.secondary }]}>Rapport Mensuel</Text>
        </View>

        {report ? (
          <>
            {/* Summary stats */}
            <View style={{ gap: 12 }}>
              <StatCard label="Humeur moyenne" value={`${report.avg_mood}/10`} icon="happy-outline" />
              <StatCard label="Sessions totales" value={String(report.total_sessions)} icon="chatbubbles-outline" />
              <StatCard label="Entrées de journal" value={String(report.total_journal_entries)} icon="book-outline" />
            </View>

            {/* Mood distribution */}
            <View style={{ gap: spacing.gutter }}>
              <Text style={[type.titleMd, { color: colors.primary }]}>Distribution de l'humeur</Text>
              <Card style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20 }}>
                <MoodBar value={report.mood_distribution.calme ?? 0} maxValue={maxMoodCount} label="Calme" />
                <MoodBar value={report.mood_distribution.joyeux ?? 0} maxValue={maxMoodCount} label="Joyeux" />
                <MoodBar value={report.mood_distribution.neutre ?? 0} maxValue={maxMoodCount} label="Neutre" />
                <MoodBar value={report.mood_distribution.anxieux ?? 0} maxValue={maxMoodCount} label="Anxieux" />
                <MoodBar value={report.mood_distribution.fatigué ?? 0} maxValue={maxMoodCount} label="Fatigué" />
              </Card>
            </View>

            {/* Weekly breakdown */}
            <View style={{ gap: spacing.gutter }}>
              <Text style={[type.titleMd, { color: colors.primary }]}>Sessions par semaine</Text>
              <Card style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20 }}>
                {report.sessions_per_week.map((count, i) => (
                  <View key={i} style={styles.weekCol}>
                    <View style={[styles.weekTrack, { backgroundColor: colors.surfaceContainer }]}>
                      <View
                        style={[
                          styles.weekFill,
                          { height: `${Math.max((count / maxWeeklySessions) * 100, 4)}%`, backgroundColor: colors.primary },
                        ]}
                      />
                    </View>
                    <Text style={[type.labelSm, { color: colors.onSurfaceVariant, marginTop: 6 }]}>
                      S{i + 1}
                    </Text>
                    <Text style={[type.labelSm, { color: colors.primary }]}>{count}</Text>
                  </View>
                ))}
              </Card>
            </View>

            {/* Top techniques */}
            <View style={{ gap: spacing.gutter }}>
              <Text style={[type.titleMd, { color: colors.primary }]}>Techniques les plus utilisées</Text>
              {report.top_techniques.length > 0 ? (
                report.top_techniques.map((tech, i) => (
                  <Card key={tech.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={[styles.rankBubble, { backgroundColor: i === 0 ? colors.primary : colors.surfaceContainerHighest }]}>
                      <Text style={[type.titleMd, { color: i === 0 ? colors.onPrimary : colors.primary }]}>
                        {i + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyMd, { color: colors.onSurface }]}>
                        {TECHNIQUE_LABELS[tech.name] ?? tech.name}
                      </Text>
                      <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>
                        {tech.count} utilisation{tech.count > 1 ? 's' : ''}
                      </Text>
                    </View>
                  </Card>
                ))
              ) : (
                <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
                  Aucune technique utilisée ce mois-ci.
                </Text>
              )}
            </View>

            {/* Streak record */}
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={[styles.iconBubble, { backgroundColor: colors.secondaryContainer }]}>
                <Ionicons name="flame" size={24} color={colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>MEILLEURE SÉRIE</Text>
                <Text style={[type.titleMd, { color: colors.primary }]}>
                  {report.streak_record} jour{report.streak_record !== 1 ? 's' : ''}
                </Text>
              </View>
            </Card>

            {/* Improvements */}
            <View style={{ gap: spacing.gutter }}>
              <Text style={[type.titleMd, { color: colors.primary }]}>Évolutions</Text>
              <Card style={{ gap: 10 }}>
                <ChangeIndicator value={report.improvements.mood_change_pct} label="d'humeur vs mois précédent" />
                <ChangeIndicator value={report.improvements.sessions_change_pct} label="de sessions vs mois précédent" />
              </Card>
            </View>

            {/* AI Summary */}
            <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderStyle: 'dashed', backgroundColor: colors.surfaceContainerLow }}>
              <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
              <Text style={[type.bodyLg, { color: colors.onSurface, flex: 1 }]}>
                {report.ai_summary}
              </Text>
            </Card>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={colors.outlineVariant} />
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
              Chargement du rapport...
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 4 },
  statCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodBarCol: { alignItems: 'center', flex: 1 },
  moodBarTrack: {
    width: 28,
    height: 120,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  moodBarFill: { borderRadius: radius.sm, width: '100%' },
  weekCol: { alignItems: 'center', flex: 1 },
  weekTrack: {
    width: 24,
    height: 100,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  weekFill: { borderRadius: radius.sm, width: '100%' },
  rankBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.section,
  },
});
