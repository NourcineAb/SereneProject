import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ExerciseSuggestion, Session } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { useColors, useType } from '../../lib/theme-provider';
import { getMyChallenges, updateChallengeProgress } from '../../lib/community';
import { AdBanner } from '../../components/AdBanner';
import { radius, softGlow, spacing } from '../../theme/serene';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  technique?: string | null;
  exercises?: ExerciseSuggestion[];
  exerciseStats?: Record<string, number>;
};

const TECHNIQUE_ROUTES: Record<string, string> = {
  box_breathing: '/breathing',
  grounding_54321: '/grounding',
  pmr: '/pmr',
  cognitive_reframing: '/reframing',
  journaling: '/journal',
};

const TECHNIQUE_LABELS: Record<string, string> = {
  box_breathing: 'Respiration guidée',
  grounding_54321: 'Ancrage 5-4-3-2-1',
  pmr: 'Relaxation musculaire',
  cognitive_reframing: 'Restructuration cognitive',
  journaling: 'Journal réflexif',
};

const WELCOME_MSG: Msg = { id: 'welcome', role: 'assistant', content: '' };

export default function Chat() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const colors = useColors();
  const type = useType();
  const WELCOME: Msg = { ...WELCOME_MSG, content: t('chat.welcome') };
  const SUGGESTIONS = [t('chat.workStress'), t('chat.sleep'), t('chat.anxious')];
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const listRef = useRef<FlatList>(null);

  // Session history
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await api.listSessions();
      setSessions(list);
    } catch (e: any) {
      console.warn('Failed to load sessions:', e?.message);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setInitialLoading(true);
      try {
        const sessionsList = await api.listSessions();
        if (cancelled) return;
        setSessions(sessionsList);
        if (!sessionsList.length) {
          setInitialLoading(false);
          return;
        }
        const latest = sessionsList[0];
        const history = await api.sessionMessages(latest.id);
        if (cancelled) return;
        if (history.length) {
          const hydrated: Msg[] = history.map((m) => ({
            id: String(m.id),
            role: m.role,
            content: m.content,
            technique: m.technique,
          }));
          setMessages(hydrated);
          setSessionId(latest.id);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
        }
      } catch (e: any) {
        console.warn('Failed to load chat history:', e?.message);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Refresh session list when the tab comes into focus (e.g. after re-login)
  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const switchSession = useCallback(async (session: Session) => {
    setShowHistory(false);
    try {
      const history = await api.sessionMessages(session.id);
      const hydrated: Msg[] = history.map((m) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        technique: m.technique,
      }));
      setMessages(hydrated.length ? hydrated : [WELCOME]);
      setSessionId(session.id);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    } catch (e: any) {
      console.warn('Failed to load session messages:', e?.message);
      setChatError('Impossible de charger les messages. Vérifiez votre connexion.');
      setTimeout(() => setChatError(null), 4000);
    }
  }, [WELCOME]);

  const startNewSession = useCallback(() => {
    setShowHistory(false);
    setSessionId(undefined);
    setMessages([WELCOME]);
    setInput('');
  }, [WELCOME]);

  const deleteSession = useCallback(async (session: Session) => {
    if (deletingId === session.id) {
      setDeletingId(null);
      setDeleteError(null);
      try {
        await api.sessionDelete(session.id);
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
        if (sessionId === session.id) {
          setSessionId(undefined);
          setMessages([WELCOME]);
        }
      } catch (e: any) {
        console.warn('Session delete failed:', e);
        setDeleteError(e.message ?? 'Erreur de suppression');
        setTimeout(() => setDeleteError(null), 3000);
      }
    } else {
      setDeletingId(session.id);
      setDeleteError(null);
      const id = session.id;
      setTimeout(() => {
        setDeletingId((current) => (current === id ? null : current));
      }, 3000);
    }
  }, [sessionId, deletingId, WELCOME]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    setChatError(null);
    const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', content: trimmed };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const res = await api.chat(trimmed, sessionId);
      if (res.paywall) {
        setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', content: res.reply }]);
        router.push('/paywall');
        return;
      }
      if (res.session_id && res.session_id !== 0) {
        setSessionId(res.session_id);
      }
      setMessages((m) => [
        ...m,
        { id: `a${Date.now()}`, role: 'assistant', content: res.reply, technique: res.technique },
      ]);
      try {
        const myChallenges = await getMyChallenges();
        await Promise.all(
          myChallenges
            .filter((uc) => !uc.completed)
            .map((uc) => updateChallengeProgress(uc.challenge_id)),
        );
      } catch {}
    } catch (e: any) {
      console.warn('Chat send failed:', e);
      const errorMsg = e?.message?.includes('timeout') || e?.message?.includes('Network')
        ? 'Problème de connexion. Vérifiez votre réseau et réessayez.'
        : `Désolé, une erreur est survenue. Réessayez dans un instant.`;
      setMessages((m) => [
        ...m,
        { id: `e${Date.now()}`, role: 'assistant', content: errorMsg },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  const renderItem = ({ item }: { item: Msg }) => {
    const isUser = item.role === 'user';
    const techniqueRoute = item.technique ? TECHNIQUE_ROUTES[item.technique] : null;
    const techniqueLabel = item.technique ? TECHNIQUE_LABELS[item.technique] ?? item.technique : null;
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="leaf" size={16} color={colors.primary} />
          </View>
        )}
        <View style={{ maxWidth: '78%' }}>
          <View
            style={[
              styles.bubble,
              isUser
                ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
                : { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.surfaceVariant, borderBottomLeftRadius: 4 },
            ]}
          >
            <Text style={[type.bodyMd, { color: isUser ? colors.onPrimary : colors.primary }]}>{item.content}</Text>
          </View>
          {techniqueRoute && techniqueLabel && (
            <Pressable
              style={[styles.techniqueChip, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}
              onPress={() => router.push(techniqueRoute as any)}
              accessibilityLabel={`Faire l'exercice : ${techniqueLabel}`}
              accessibilityRole="button"
            >
              <Ionicons name="fitness" size={16} color={colors.primary} />
              <Text style={[type.labelSm, { color: colors.primary }]}>{techniqueLabel}</Text>
            </Pressable>
          )}
        </View>
        {isUser && (
          <View style={[styles.avatar, { backgroundColor: colors.secondaryContainer }]}>
            <Ionicons name="person" size={16} color={colors.secondary} />
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingHorizontal: spacing.containerMobile }]}>
        <Pressable
          onPress={() => { loadSessions(); setShowHistory(true); }}
          hitSlop={12}
          accessibilityLabel="Historique des sessions"
          accessibilityRole="button"
        >
          <Ionicons name="list-outline" size={26} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[type.labelSm, { color: colors.outline, textAlign: 'center' }]} accessibilityRole="header">
            {t('chat.today')}
          </Text>
          <Text style={[type.titleMd, { color: colors.secondary, textAlign: 'center' }]}>
            {t('chat.sessionTitle')}
          </Text>
        </View>
        <Pressable
          onPress={startNewSession}
          hitSlop={12}
          accessibilityLabel="Nouvelle session"
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
        </Pressable>
      </View>

      {chatError && (
        <View style={{ backgroundColor: colors.errorContainer, marginHorizontal: spacing.containerMobile, borderRadius: radius.md, padding: 10, marginBottom: 8 }}>
          <Text style={[type.labelSm, { color: colors.error }]}>{chatError}</Text>
        </View>
      )}

      {initialLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[type.bodyMd, { color: colors.outline, marginTop: 12 }]}>Chargement des conversations...</Text>
        </View>
      ) : (
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.containerMobile, paddingBottom: 8 }}
        ListFooterComponent={
          sending ? (
            <View style={[styles.bubble, { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.surfaceVariant, borderBottomLeftRadius: 4, alignSelf: 'flex-start' }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : messages.length === 1 && messages[0].id === 'welcome' ? (
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}
                  onPress={() => send(s)}
                >
                  <Text style={[type.labelSm, { color: colors.secondary }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />
      )}

      <AdBanner isPremium={!!user?.is_premium} />

      <View style={[styles.inputBar, { marginBottom: insets.bottom + 8, backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant }]}>
        <TextInput
          style={[styles.input, { color: colors.onSurface, fontFamily: type.bodyMd.fontFamily }]}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.outline}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          onPress={() => send(input)}
          accessibilityLabel="Envoyer le message"
          accessibilityRole="button"
        >
          <Ionicons name="send" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>

      {/* ── Session History Modal ─────────────────────────────── */}
      <Modal visible={showHistory} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[type.headlineLg, { color: colors.primary }]}>Sessions</Text>
              <Pressable onPress={() => setShowHistory(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.outline} />
              </Pressable>
            </View>

            <Pressable
              style={[styles.newSessionBtn, { backgroundColor: colors.primary }]}
              onPress={startNewSession}
            >
              <Ionicons name="add" size={20} color={colors.onPrimary} />
              <Text style={[type.bodyMd, { color: colors.onPrimary }]}>Nouvelle session</Text>
            </Pressable>

            {deleteError && (
              <View style={{ backgroundColor: colors.errorContainer, borderRadius: radius.md, padding: 10, marginBottom: 8 }}>
                <Text style={[type.labelSm, { color: colors.error }]}>{deleteError}</Text>
              </View>
            )}

            {loadingSessions ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            ) : sessions.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 48, gap: 8 }}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.outline} />
                <Text style={[type.bodyMd, { color: colors.outline }]}>Aucune session</Text>
              </View>
            ) : (
              <FlatList
                data={sessions}
                keyExtractor={(s) => String(s.id)}
                contentContainerStyle={{ paddingVertical: 12, gap: 8 }}
                renderItem={({ item: session }) => {
                  const isActive = sessionId === session.id;
                  const date = new Date(session.created_at);
                  const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                  return (
                    <View style={styles.sessionRow}>
                      <Pressable
                        onPress={() => switchSession(session)}
                        style={[
                          styles.sessionItem,
                          {
                            flex: 1,
                            backgroundColor: isActive ? colors.primaryFixed : colors.surfaceContainerLowest,
                            borderColor: isActive ? colors.primary : colors.surfaceVariant,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[type.bodyMd, { color: isActive ? colors.primary : colors.onSurface }]}
                            numberOfLines={1}
                          >
                            {session.title}
                          </Text>
                          <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{dateStr}</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => deleteSession(session)}
                        style={[
                          styles.deleteBtn,
                          deletingId === session.id
                            ? { backgroundColor: colors.error }
                            : { backgroundColor: colors.errorContainer },
                        ]}
                        accessibilityLabel={deletingId === session.id ? `Confirmer suppression de ${session.title}` : `Supprimer ${session.title}`}
                        accessibilityRole="button"
                      >
                        <Ionicons
                          name={deletingId === session.id ? 'checkmark' : 'trash-outline'}
                          size={18}
                          color={deletingId === session.id ? colors.onErrorContainer : colors.error}
                        />
                      </Pressable>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 16 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { maxWidth: '100%', padding: 14, borderRadius: 18 },
  techniqueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  chip: {
    borderRadius: radius.base,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.containerMobile,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
    ...softGlow,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 8 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.containerMobile,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  newSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.full,
    paddingVertical: 14,
    marginBottom: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sessionItem: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
