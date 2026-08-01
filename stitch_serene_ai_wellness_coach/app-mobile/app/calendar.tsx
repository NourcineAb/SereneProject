import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../components/ui';
import { useColors, useType } from '../lib/theme-provider';
import { radius, spacing } from '../theme/serene';

const ACTIVITY_KEY = 'serene.activity.';
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function firstDayOfWeek(y: number, m: number): number {
  const day = new Date(y, m - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function cellColor(activityCount: number, colors: any): string {
  if (activityCount === 0) return colors.surfaceContainerHigh;
  if (activityCount === 1) return colors.primaryFixedDim;
  if (activityCount === 2) return colors.primaryFixed;
  return colors.primaryContainer;
}

function cellTextColor(activityCount: number, colors: any): string {
  if (activityCount === 0) return colors.outline;
  return colors.onPrimaryContainer;
}

export default function CalendarScreen() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activities, setActivities] = useState<Record<string, string[]>>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const loadMonth = async () => {
    const prefix = ACTIVITY_KEY;
    const allKeys = await AsyncStorage.getAllKeys();
    const matched = allKeys.filter((k) => k.startsWith(prefix));
    if (matched.length === 0) {
      setActivities({});
      return;
    }
    const pairs = await AsyncStorage.multiGet(matched);
    const map: Record<string, string[]> = {};
    for (const [key, value] of pairs) {
      const dayKey = key.replace(prefix, '');
      try {
        map[dayKey] = JSON.parse(value ?? '[]');
      } catch {
        map[dayKey] = ['activity'];
      }
    }
    setActivities(map);
  };

  useFocusEffect(
    useCallback(() => {
      loadMonth();
    }, [year, month]),
  );

  const totalDays = daysInMonth(year, month);
  const startOffset = firstDayOfWeek(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  let activeDays = 0;
  for (let d = 1; d <= totalDays; d++) {
    const key = dateKey(year, month, d);
    if ((activities[key]?.length ?? 0) > 0) activeDays++;
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const monthLabel = new Date(year, month - 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  const selectedDate = selectedDay ? dateKey(year, month, selectedDay) : null;
  const selectedActivities = selectedDate ? activities[selectedDate] ?? [] : [];

  const selectedDayLabel = selectedDay
    ? new Date(year, month - 1, selectedDay).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.containerMobile, paddingTop: insets.top + 16, gap: spacing.section }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Retour" accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </Pressable>
        <Text style={[type.headlineLg, { color: colors.primary }]}>Calendrier</Text>
        <View style={{ width: 28 }} />
      </View>

      <Card style={{ gap: 16 }}>
        <View style={styles.monthRow}>
          <Pressable onPress={prevMonth} accessibilityLabel="Mois précédent" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
          <Text style={[type.titleMd, { color: colors.primary, textTransform: 'capitalize' }]}>{monthLabel}</Text>
          <Pressable onPress={nextMonth} accessibilityLabel="Mois suivant" accessibilityRole="button">
            <Ionicons name="chevron-forward" size={24} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.dayHeaderRow}>
          {DAYS_FR.map((d) => (
            <Text key={d} style={[type.labelSm, { color: colors.outline, flex: 1, textAlign: 'center' }]}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (day === null) return <View key={`empty-${idx}`} style={styles.cell} />;
            const key = dateKey(year, month, day);
            const count = activities[key]?.length ?? 0;
            const isToday = isCurrentMonth && day === today.getDate();
            const isSelected = selectedDay === day;
            return (
              <Pressable
                key={key}
                style={[
                  styles.cell,
                  { backgroundColor: cellColor(count, colors) },
                  isSelected && { borderWidth: 2, borderColor: colors.primary },
                  isToday && !isSelected && { borderWidth: 2, borderColor: colors.secondary },
                ]}
                onPress={() => setSelectedDay(isSelected ? null : day)}
                accessibilityLabel={`${day}, ${count > 0 ? count + ' activité(s)' : 'aucune activité'}`}
                accessibilityRole="button"
              >
                <Text style={[type.labelSm, { color: cellTextColor(count, colors) }]}>{day}</Text>
                {count > 0 && (
                  <View style={[styles.dot, { backgroundColor: colors.primary }]}>
                    <Text style={[type.labelSm, { color: colors.onPrimary, fontSize: 8 }]}>{count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={styles.legendRow}>
        {[
          { color: colors.surfaceContainerHigh, label: 'Aucune activité' },
          { color: colors.primaryFixedDim, label: 'Humeur enregistrée' },
          { color: colors.primaryFixed, label: 'Session complétée' },
          { color: colors.primaryContainer, label: 'Activités multiples' },
        ].map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={[type.labelSm, { color: colors.onSurfaceVariant, fontSize: 11 }]}>{l.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.statsRow}>
        <Card style={{ ...styles.statsCard, flex: 1 }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>{activeDays}</Text>
          <Text style={[type.labelSm, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>jours actifs ce mois</Text>
        </Card>
      </View>

      {selectedDay && (
        <Card style={{ gap: 12 }}>
          <Text style={[type.titleMd, { color: colors.primary, textTransform: 'capitalize' }]}>{selectedDayLabel}</Text>
          {selectedActivities.length > 0 ? (
            selectedActivities.map((act, i) => (
              <View key={i} style={styles.activityRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={[type.bodyMd, { color: colors.onSurface, flex: 1 }]}>{act}</Text>
              </View>
            ))
          ) : (
            <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>Aucune activité enregistrée ce jour.</Text>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayHeaderRow: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.gutter,
  },
  statsCard: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
