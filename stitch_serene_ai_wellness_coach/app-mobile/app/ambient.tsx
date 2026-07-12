import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAuth } from '../lib/auth';
import { Card } from '../components/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { useColors, useType } from '../lib/theme-provider';
import { radius, softGlow, spacing } from '../theme/serene';

type SoundId = 'rain' | 'ocean' | 'forest' | 'wind' | 'fire' | 'stream';

const SOUNDS: { id: SoundId; name: string; icon: string; duration: string; uri: string }[] = [
  { id: 'rain', name: 'Pluie', icon: 'rainy-outline', duration: '∞', uri: 'https://cdn.pixabay.com/audio/2022/10/14/audio_33f66fb5e0.mp3' },
  { id: 'ocean', name: 'Océan', icon: 'water-outline', duration: '∞', uri: 'https://cdn.pixabay.com/audio/2022/08/02/audio_878a4e0588.mp3' },
  { id: 'forest', name: 'Forêt', icon: 'leaf-outline', duration: '∞', uri: 'https://cdn.pixabay.com/audio/2024/11/04/audio_6114388368.mp3' },
  { id: 'wind', name: 'Vent', icon: 'airplane-outline', duration: '∞', uri: 'https://cdn.pixabay.com/audio/2022/10/30/audio_4a27e99874.mp3' },
  { id: 'fire', name: 'Feu de cheminée', icon: 'flame-outline', duration: '∞', uri: 'https://cdn.pixabay.com/audio/2022/11/22/audio_b1ec0a390c.mp3' },
  { id: 'stream', name: 'Ruisseau', icon: 'water', duration: '∞', uri: 'https://cdn.pixabay.com/audio/2022/08/02/audio_2da579e594.mp3' },
];

const SLEEP_STORIES = [
  { id: 's1', name: 'Le lac paisible', duration: '15 min', icon: 'moon-outline', uri: '' },
  { id: 's2', name: 'La forêt enchantée', duration: '20 min', icon: 'star-outline', uri: '' },
  { id: 's3', name: 'Les étoiles filantes', duration: '12 min', icon: 'sparkles-outline', uri: '' },
];

const TIMER_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 h', minutes: 60 },
  { label: "Jusqu'à l'aube", minutes: 480 },
];

function PulsingIcon({ icon, color, size }: { icon: string; color: string; size: number }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Ionicons name={icon as any} size={size} color={color} />
    </Animated.View>
  );
}

export default function AmbientScreen() {
  const colors = useColors();
  const type = useType();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isPremium = user?.is_premium ?? false;

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    setIsLoaded(false);
  }, []);

  const playSound = useCallback(async (id: string) => {
    await stopSound();

    const soundDef = SOUNDS.find((s) => s.id === id);
    const storyDef = SLEEP_STORIES.find((s) => s.id === id);
    const uri = soundDef?.uri || storyDef?.uri;
    if (!uri) return;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { isLooping: true, volume, shouldPlay: true },
      );
      soundRef.current = sound;
      setIsLoaded(true);

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish && !status.isLooping) {
          setPlayingId(null);
          setIsLoaded(false);
        }
      });
    } catch {
      setPlayingId(null);
    }
  }, [volume, stopSound]);

  const togglePlay = useCallback(async (id: string) => {
    if (playingId === id) {
      await stopSound();
      setPlayingId(null);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    } else {
      setPlayingId(id);
      await playSound(id);
    }
  }, [playingId, stopSound, playSound]);

  useEffect(() => {
    if (soundRef.current && isLoaded) {
      soundRef.current.setVolumeAsync(volume).catch(() => {});
    }
  }, [volume, isLoaded]);

  const selectTimer = (minutes: number) => {
    setTimerMinutes(minutes);
    setShowTimerPicker(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (playingId) {
      timerRef.current = setTimeout(async () => {
        await stopSound();
        setPlayingId(null);
        setTimerMinutes(null);
      }, minutes * 60 * 1000);
    }
  };

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
        <ScreenHeader title="Ambiance" />

        <View style={styles.header}>
          <Text style={[type.headlineLg, { color: colors.primary }]}>Sons Apaisants</Text>
        </View>

        {/* Volume control */}
        {playingId && (
          <Card style={{ gap: 12 }}>
            <View style={styles.row}>
              <Ionicons name="volume-low-outline" size={20} color={colors.onSurfaceVariant} />
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>VOLUME</Text>
            </View>
            <View style={styles.volumeRow}>
              <Ionicons name="volume-mute-outline" size={16} color={colors.outline} />
              <View style={[styles.sliderTrack, { backgroundColor: colors.surfaceContainer }]}>
                <View style={[styles.sliderFill, { width: `${volume * 100}%`, backgroundColor: colors.primary }]} />
                <View style={[styles.sliderThumb, { left: `${volume * 100 - 2}%`, backgroundColor: colors.primary }]} />
              </View>
              <Ionicons name="volume-high-outline" size={16} color={colors.outline} />
            </View>
            <View style={styles.row}>
              <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>MINUTEUR</Text>
              <Pressable onPress={() => setShowTimerPicker(!showTimerPicker)}>
                <Text style={[type.labelSm, { color: colors.primary }]}>
                  {timerMinutes ? TIMER_OPTIONS.find((t) => t.minutes === timerMinutes)?.label ?? 'Personnalisé' : 'Aucun'}
                </Text>
              </Pressable>
            </View>
            {showTimerPicker && (
              <View style={styles.timerRow}>
                {TIMER_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.minutes}
                    style={[
                      styles.timerOption,
                      timerMinutes === opt.minutes && { backgroundColor: colors.primaryFixed },
                    ]}
                    onPress={() => selectTimer(opt.minutes)}
                  >
                    <Text
                      style={[
                        type.labelSm,
                        { color: timerMinutes === opt.minutes ? colors.primary : colors.onSurfaceVariant },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Sounds section */}
        <View style={{ gap: spacing.gutter }}>
          <Text style={[type.titleMd, { color: colors.primary }]}>Sons</Text>
          <View style={styles.grid}>
            {SOUNDS.map((sound) => {
              const isPlaying = playingId === sound.id;
              return (
                <Pressable
                  key={sound.id}
                  style={({ pressed }) => [
                    styles.soundCard,
                    isPlaying && { backgroundColor: colors.primaryFixed },
                    { transform: [{ scale: pressed ? 0.97 : 1 }] },
                  ]}
                  onPress={() => togglePlay(sound.id)}
                  accessibilityLabel={`${isPlaying ? 'Pause' : 'Écouter'} ${sound.name}`}
                  accessibilityRole="button"
                >
                  <View style={[styles.soundIcon, { backgroundColor: isPlaying ? colors.primaryContainer : colors.surfaceContainerHighest }]}>
                    {isPlaying ? (
                      <PulsingIcon icon={sound.icon} color={colors.primary} size={28} />
                    ) : (
                      <Ionicons name={sound.icon as any} size={28} color={colors.secondary} />
                    )}
                  </View>
                  <Text style={[type.bodyMd, { color: colors.onSurface, textAlign: 'center' }]}>
                    {sound.name}
                  </Text>
                  <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{sound.duration}</Text>
                  <View style={[styles.playBtn, { backgroundColor: colors.surfaceContainerHighest }]}>
                    <Ionicons
                      name={isPlaying ? 'pause' : 'play'}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Sleep stories section */}
        <View style={{ gap: spacing.gutter }}>
          <View style={styles.row}>
            <Text style={[type.titleMd, { color: colors.primary }]}>Histoires</Text>
            {!isPremium && (
              <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="lock-closed" size={14} color={colors.onPrimary} />
                <Text style={[type.labelSm, { color: colors.onPrimary }]}>Pro</Text>
              </View>
            )}
          </View>
          {isPremium ? (
            <View style={{ gap: 12 }}>
              {SLEEP_STORIES.map((story) => {
                const isPlaying = playingId === story.id;
                return (
                  <Pressable
                    key={story.id}
                    onPress={() => story.uri && togglePlay(story.uri)}
                    accessibilityLabel={`Écouter ${story.name}`}
                    accessibilityRole="button"
                  >
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <View style={[styles.storyIcon, { backgroundColor: isPlaying ? colors.primaryContainer : colors.surfaceContainerHighest }]}>
                        {isPlaying ? (
                          <PulsingIcon icon={story.icon} color={colors.primary} size={22} />
                        ) : (
                          <Ionicons name={story.icon as any} size={22} color={colors.secondary} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyMd, { color: colors.onSurface }]}>{story.name}</Text>
                        <Text style={[type.labelSm, { color: colors.onSurfaceVariant }]}>{story.duration}</Text>
                      </View>
                      <Ionicons
                        name={isPlaying ? 'pause-circle' : 'play-circle'}
                        size={32}
                        color={colors.primary}
                      />
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Pressable
              onPress={() => {/* navigate to paywall */}}
              style={[styles.premiumGate, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant }]}
              accessibilityRole="button"
              accessibilityLabel="Débloquer les histoires avec Serene Pro"
            >
              <Ionicons name="lock-closed-outline" size={32} color={colors.primary} />
              <Text style={[type.bodyMd, { color: colors.primary, textAlign: 'center', flex: 1 }]}>
                Débloquez les histoires du soir avec Serene Pro
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.outline} />
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  soundCard: {
    width: '48%',
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  soundIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderTrack: { flex: 1, height: 6, borderRadius: radius.full, position: 'relative' },
  sliderFill: { height: 6, borderRadius: radius.full },
  sliderThumb: { position: 'absolute', top: -5, width: 16, height: 16, borderRadius: radius.full },
  timerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timerOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  premiumGate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
  },
});
