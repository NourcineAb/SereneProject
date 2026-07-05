import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AdBanner } from '../../components/AdBanner';
import { colors, radius, softGlow, spacing, type } from '../../theme/serene';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; technique?: string | null };

const WELCOME: Msg = { id: 'welcome', role: 'assistant', content: "Bonjour ! Qu'est-ce qui vous pèse aujourd'hui ?" };

const SUGGESTIONS = ['Le travail me submerge', "Je n'arrive pas à dormir", 'Je me sens anxieux'];

export default function Chat() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const listRef = useRef<FlatList>(null);

  // Hydrate the most recent session on mount (offline-tolerant)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessions = await api.listSessions();
        if (cancelled || !sessions.length) return;
        const latest = sessions[0];
        const history = await api.sessionMessages(latest.id);
        if (cancelled || !history.length) return;
        const hydrated: Msg[] = history.map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          technique: m.technique,
        }));
        setMessages(hydrated);
        setSessionId(latest.id);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
      } catch {
        // Offline or backend unavailable — keep the welcome message, no crash
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
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
      setSessionId(res.session_id);
      setMessages((m) => [
        ...m,
        { id: `a${Date.now()}`, role: 'assistant', content: res.reply, technique: res.technique },
      ]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { id: `e${Date.now()}`, role: 'assistant', content: `Désolé, une erreur est survenue : ${e.message}` },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  const renderItem = ({ item }: { item: Msg }) => {
    const isUser = item.role === 'user';
    return (
      <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
        <View
          style={[
            styles.bubble,
            softGlow,
            isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          <Text style={[type.bodyMd, { color: isUser ? colors.onPrimary : colors.primary }]}>{item.content}</Text>
        </View>
        {item.technique === 'box_breathing' && (
          <Pressable
            style={styles.techniqueChip}
            onPress={() => router.push('/breathing')}
            accessibilityLabel="Faire l'exercice de respiration guidé"
            accessibilityRole="button"
          >
            <Ionicons name="fitness" size={16} color={colors.primary} />
            <Text style={[type.labelSm, { color: colors.primary }]}>Faire l'exercice guidé</Text>
          </Pressable>
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
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: spacing.containerMobile }}>
        <Text
          style={[type.labelSm, { color: colors.outline, textAlign: 'center' }]}
          accessibilityRole="header"
        >
          AUJOURD'HUI
        </Text>
        <Text style={[type.titleMd, { color: colors.secondary, textAlign: 'center' }]}>
          Votre session de calme avec Serene
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.containerMobile, paddingBottom: 8 }}
        ListFooterComponent={
          sending ? (
            <View style={[styles.bubble, styles.aiBubble, { alignSelf: 'flex-start' }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : messages.length === 1 && messages[0].id === 'welcome' ? (
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
                  <Text style={[type.labelSm, { color: colors.secondary }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />

      {/* AdBanner above the input bar — hidden for premium users */}
      <AdBanner isPremium={!!user?.is_premium} />

      <View style={[styles.inputBar, { marginBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Dites-moi tout..."
          placeholderTextColor={colors.outline}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <Pressable
          style={styles.sendBtn}
          onPress={() => send(input)}
          accessibilityLabel="Envoyer le message"
          accessibilityRole="button"
        >
          <Ionicons name="send" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', padding: 16, borderRadius: 20 },
  aiBubble: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
    borderBottomLeftRadius: 4,
  },
  userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  techniqueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  chip: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.base,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.containerMobile,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
    borderRadius: radius.full,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
    ...softGlow,
  },
  input: { flex: 1, color: colors.onSurface, fontFamily: type.bodyMd.fontFamily, fontSize: 16, paddingVertical: 8 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
