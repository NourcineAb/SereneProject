import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { Card, PillButton, Tag } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { useColors, useType } from '../lib/theme-provider';
import { MOODS, radius, softGlow, spacing } from '../theme/serene';

type JournalEntry = {
  id: number;
  mood_score: number;
  content: string;
  technique: string | null;
  created_at: string;
};

const TECHNIQUES = ['respiration', 'ancrage', 'reframing', 'PMR', 'journaling'] as const;

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function moodEmoji(score: number) {
  const m = MOODS.find((m) => m.score === score);
  return m?.icon ?? 'happy-outline';
}

function dayLabel(d: Date) {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export default function Journal() {
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newMood, setNewMood] = useState<number>(MOODS[0].score);
  const [newContent, setNewContent] = useState('');
  const [newTechnique, setNewTechnique] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    try {
      const data = await api.journalList(formatDate(selectedDate));
      setEntries(data);
    } catch {
      /* offline-tolerant */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadEntries();
    }, [loadEntries]),
  );

  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadEntries();
  };

  const saveEntry = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      await api.journalCreate(newMood, newContent.trim(), newTechnique ?? undefined);
      setSheetOpen(false);
      setNewContent('');
      setNewMood(MOODS[0].score);
      setNewTechnique(null);
      loadEntries();
    } catch {
      /* offline-tolerant */
    } finally {
      setSaving(false);
    }
  };

  const isToday = formatDate(selectedDate) === formatDate(new Date());

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
        <Text style={[type.headlineLg, { color: colors.primary, fontSize: 22 }]}>Mon Journal</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Date picker */}
      <View style={styles.dateRow}>
        <Pressable
          onPress={() => shiftDay(-1)}
          style={[styles.dateArrow, { backgroundColor: colors.surfaceContainerHigh }]}
          accessibilityLabel="Jour précédent"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>
            {isToday ? "Aujourd'hui" : dayLabel(selectedDate)}
          </Text>
          <Text style={[type.labelSm, { color: colors.outline }]}>
            {formatDate(selectedDate)}
          </Text>
        </View>
        <Pressable
          onPress={() => shiftDay(1)}
          style={[styles.dateArrow, { backgroundColor: colors.surfaceContainerHigh }]}
          accessibilityLabel="Jour suivant"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Entries list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{
            padding: spacing.containerMobile,
            gap: 12,
            flexGrow: 1,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={48} color={colors.outlineVariant} />
              <Text style={[type.titleMd, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
                Aucune entrée ce jour
              </Text>
              <Text style={[type.bodyMd, { color: colors.outline, textAlign: 'center' }]}>
                Prenez un moment pour écrire comment vous vous sentez. C'est un pas vers le bien-être.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <View style={styles.entryTime}>
                  <Ionicons name={moodEmoji(item.mood_score) as any} size={20} color={colors.primary} />
                  <Text style={[type.labelSm, { color: colors.outline }]}>{formatTime(item.created_at)}</Text>
                </View>
                {item.technique && <Tag>{item.technique}</Tag>}
              </View>
              <Text style={[type.bodyMd, { color: colors.onSurface }]} numberOfLines={3}>
                {item.content}
              </Text>
            </Card>
          )}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={() => setSheetOpen(true)}
        style={[styles.fab, softGlow, { bottom: insets.bottom + 16, backgroundColor: colors.primary }]}
        accessibilityLabel="Nouvelle entrée"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </Pressable>

      {/* New entry sheet */}
      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetOverlay}
        >
          <Pressable style={styles.sheetDismiss} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, backgroundColor: colors.surfaceContainerLowest }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.outlineVariant }]} />
            <Text style={[type.headlineLg, { color: colors.primary, marginBottom: 16 }]}>Nouvelle entrée</Text>

            {/* Mood selector */}
            <Text style={[type.labelSm, { color: colors.outline, marginBottom: 8 }]}>VOUS ÊTES</Text>
            <View style={styles.moodRow}>
              {MOODS.map((m) => (
                <Pressable
                  key={m.label}
                  onPress={() => setNewMood(m.score)}
                  style={[
                    styles.moodChip,
                    newMood === m.score
                      ? { backgroundColor: colors.primaryFixed, borderColor: colors.primary }
                      : { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
                  ]}
                  accessibilityLabel={`Humeur : ${m.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: newMood === m.score }}
                >
                  <Ionicons name={m.icon as any} size={18} color={newMood === m.score ? colors.primary : colors.secondary} />
                  <Text style={[type.labelSm, { color: newMood === m.score ? colors.primary : colors.onSurfaceVariant }]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Text area */}
            <TextInput
              style={[styles.textArea, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }]}
              multiline
              placeholder="Qu'avez-vous sur le cœur ?"
              placeholderTextColor={colors.outlineVariant}
              value={newContent}
              onChangeText={setNewContent}
              textAlignVertical="top"
            />

            {/* Technique chips */}
            <Text style={[type.labelSm, { color: colors.outline, marginBottom: 8 }]}>TECHNIQUE UTILISÉE (OPTIONNEL)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={styles.techRow}>
                {TECHNIQUES.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setNewTechnique(newTechnique === t ? null : t)}
                    style={[
                      styles.techChip,
                      newTechnique === t
                        ? { backgroundColor: colors.primaryFixed, borderColor: colors.primary }
                        : { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
                    ]}
                    accessibilityLabel={`Technique : ${t}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: newTechnique === t }}
                  >
                    <Text style={[type.labelSm, { color: newTechnique === t ? colors.primary : colors.onSurfaceVariant }]}>
                      {t}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <PillButton
              label={saving ? t('exercise.saving') : t('journal.save')}
              onPress={saveEntry}
              disabled={!newContent.trim() || saving}
              loading={saving}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.containerMobile,
    paddingVertical: 12,
  },
  dateArrow: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 60,
  },
  entryCard: { gap: 10 },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryTime: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.containerMobile,
    gap: 4,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: 16,
  },
  moodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  textArea: {
    height: 160,
    borderWidth: 1,
    borderRadius: radius.base,
    padding: 14,
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_400Regular',
    marginBottom: 16,
  },
  techRow: { flexDirection: 'row', gap: 8 },
  techChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
