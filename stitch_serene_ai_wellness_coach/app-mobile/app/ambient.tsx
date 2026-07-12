import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { Card } from '../components/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { useColors, useType } from '../lib/theme-provider';
import { radius, softGlow, spacing } from '../theme/serene';

type SoundId = 'rain' | 'ocean' | 'forest' | 'wind' | 'fire' | 'stream' | 's1' | 's2' | 's3';

const SOUNDS: { id: SoundId; name: string; icon: string }[] = [
  { id: 'rain', name: 'Pluie', icon: 'rainy-outline' },
  { id: 'ocean', name: 'Océan', icon: 'water-outline' },
  { id: 'forest', name: 'Forêt', icon: 'leaf-outline' },
  { id: 'wind', name: 'Vent', icon: 'airplane-outline' },
  { id: 'fire', name: 'Feu de cheminée', icon: 'flame-outline' },
  { id: 'stream', name: 'Ruisseau', icon: 'water' },
];

const SLEEP_STORIES = [
  { id: 's1', name: 'Le lac paisible', duration: '15 min', icon: 'moon-outline' },
  { id: 's2', name: 'La forêt enchantée', duration: '20 min', icon: 'star-outline' },
  { id: 's3', name: 'Les étoiles filantes', duration: '12 min', icon: 'sparkles-outline' },
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

// ── Web Audio ambient sound generators ──────────────────────────────────────

type AmbientNodes = { master: GainNode; stop: () => void };

function createRain(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 2 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 8000;

  src.connect(hp).connect(lp).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); } };
}

function createOcean(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 4 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const t = i / ctx.sampleRate;
    const wave = Math.sin(t * 0.15 * Math.PI * 2) * 0.5 + 0.5;
    data[i] = (Math.random() * 2 - 1) * wave;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;

  src.connect(lp).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); } };
}

function createForest(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 3 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const t = i / ctx.sampleRate;
    const chirp = Math.sin(t * 2200 * Math.PI * 2) * Math.exp(-((t % 0.8) * 5));
    const rustle = (Math.random() * 2 - 1) * 0.02;
    data[i] = chirp * 0.08 + rustle;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000;
  bp.Q.value = 2;

  src.connect(bp).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); } };
}

function createWind(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 4 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const t = i / ctx.sampleRate;
    const sweep = Math.sin(t * 0.08 * Math.PI * 2) * 0.5 + 0.5;
    data[i] = (Math.random() * 2 - 1) * sweep;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  lp.Q.value = 1;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.1;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 200;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();

  src.connect(lp).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); lfo.stop(); } };
}

function createFire(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 3 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const t = i / ctx.sampleRate;
    const crackle = Math.random() > 0.997 ? (Math.random() - 0.5) * 0.6 : 0;
    const hum = Math.sin(t * 80 * Math.PI * 2) * 0.015;
    const noise = (Math.random() * 2 - 1) * 0.03;
    data[i] = crackle + hum + noise;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;

  src.connect(lp).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); } };
}

function createStream(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 3 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const t = i / ctx.sampleRate;
    const bubble = Math.sin(t * 1800 * Math.PI * 2 + Math.sin(t * 3) * 4) * 0.03;
    const flow = (Math.random() * 2 - 1) * 0.06;
    data[i] = bubble + flow;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 0.5;

  src.connect(bp).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); } };
}

// ── Sleep story soundscapes ─────────────────────────────────────────────────

function createStoryLake(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 6 * ctx.sampleRate;
  const buf = ctx.createBuffer(2, bufSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      const lapping = Math.sin(t * 0.2 * Math.PI * 2 + ch * 1.2) * 0.5 + 0.5;
      const water = (Math.random() * 2 - 1) * lapping * 0.15;
      const pad = Math.sin(t * 110 * Math.PI * 2) * 0.02
        + Math.sin(t * 165 * Math.PI * 2) * 0.015
        + Math.sin(t * 220 * Math.PI * 2 + Math.sin(t * 0.05) * 2) * 0.01;
      data[i] = water + pad;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;

  const reverb = ctx.createConvolver();
  const reverbLen = 2 * ctx.sampleRate;
  const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = reverbBuf.getChannelData(ch);
    for (let i = 0; i < reverbLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.6));
  }
  reverb.buffer = reverbBuf;

  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  const dry = ctx.createGain();
  dry.gain.value = 0.7;

  src.connect(lp);
  lp.connect(dry).connect(master);
  lp.connect(reverb).connect(wet).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); reverb.disconnect(); } };
}

function createStoryForestEnchanted(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 6 * ctx.sampleRate;
  const buf = ctx.createBuffer(2, bufSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      const drone = Math.sin(t * 82.4 * Math.PI * 2) * 0.04
        + Math.sin(t * 123 * Math.PI * 2 + Math.sin(t * 0.15) * 3) * 0.03;
      const bird = Math.sin(t * (2000 + Math.sin(t * 4) * 600) * Math.PI * 2)
        * Math.exp(-((t % 2.5) * 2.5)) * 0.04;
      const leaves = (Math.random() * 2 - 1) * 0.015 * (Math.sin(t * 0.3) * 0.5 + 0.5);
      const twinkle = Math.sin(t * 3100 * Math.PI * 2) * Math.exp(-((t % 1.7) * 3)) * 0.02;
      data[i] = drone + bird + leaves + twinkle;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1000;
  bp.Q.value = 0.3;

  const reverb = ctx.createConvolver();
  const reverbLen = 3 * ctx.sampleRate;
  const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = reverbBuf.getChannelData(ch);
    for (let i = 0; i < reverbLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 1.0));
  }
  reverb.buffer = reverbBuf;

  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const dry = ctx.createGain();
  dry.gain.value = 0.6;

  src.connect(bp);
  bp.connect(dry).connect(master);
  bp.connect(reverb).connect(wet).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); reverb.disconnect(); } };
}

function createStoryStars(ctx: AudioContext, vol: number): AmbientNodes {
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  const bufSize = 8 * ctx.sampleRate;
  const buf = ctx.createBuffer(2, bufSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      const space = Math.sin(t * 55 * Math.PI * 2) * 0.03
        + Math.sin(t * 82.5 * Math.PI * 2 + Math.sin(t * 0.07) * 5) * 0.02
        + Math.sin(t * 110 * Math.PI * 2) * 0.02;
      const shimmer = Math.sin(t * 4400 * Math.PI * 2 + ch * 3) * Math.exp(-((t % 3.0) * 1.8)) * 0.018;
      const cosmic = (Math.random() * 2 - 1) * 0.008 * (Math.sin(t * 0.1) * 0.5 + 0.5);
      data[i] = space + shimmer + cosmic;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500;

  const reverb = ctx.createConvolver();
  const reverbLen = 4 * ctx.sampleRate;
  const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = reverbBuf.getChannelData(ch);
    for (let i = 0; i < reverbLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 1.5));
  }
  reverb.buffer = reverbBuf;

  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  const dry = ctx.createGain();
  dry.gain.value = 0.65;

  src.connect(lp);
  lp.connect(dry).connect(master);
  lp.connect(reverb).connect(wet).connect(master);
  src.start();

  return { master, stop: () => { src.stop(); reverb.disconnect(); } };
}

const GENERATORS: Record<SoundId, (ctx: AudioContext, vol: number) => AmbientNodes> = {
  rain: createRain,
  ocean: createOcean,
  forest: createForest,
  wind: createWind,
  fire: createFire,
  stream: createStream,
  s1: createStoryLake,
  s2: createStoryForestEnchanted,
  s3: createStoryStars,
};

// ── Component ───────────────────────────────────────────────────────────────

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
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AmbientNodes | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      nodesRef.current?.stop();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const stopSound = useCallback(() => {
    nodesRef.current?.stop();
    nodesRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const playSound = useCallback((id: SoundId) => {
    stopSound();
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx() as AudioContext;
    const nodes = GENERATORS[id](ctx, volume);
    ctxRef.current = ctx;
    nodesRef.current = nodes;
  }, [volume, stopSound]);

  const togglePlay = useCallback((id: string) => {
    if (playingId === id) {
      stopSound();
      setPlayingId(null);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    } else {
      stopSound();
      setPlayingId(id);
      playSound(id as SoundId);
    }
  }, [playingId, stopSound, playSound]);

  useEffect(() => {
    if (nodesRef.current && ctxRef.current) {
      nodesRef.current.master.gain.value = volume;
    }
  }, [volume]);

  const selectTimer = (minutes: number) => {
    setTimerMinutes(minutes);
    setShowTimerPicker(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (playingId) {
      timerRef.current = setTimeout(() => {
        stopSound();
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
              <Pressable onPress={() => setVolume(Math.max(0, volume - 0.1))}>
                <Ionicons name="volume-mute-outline" size={16} color={colors.outline} />
              </Pressable>
              <View style={[styles.sliderTrack, { backgroundColor: colors.surfaceContainer }]}>
                <View style={[styles.sliderFill, { width: `${volume * 100}%`, backgroundColor: colors.primary }]} />
                <View style={[styles.sliderThumb, { left: `${volume * 100 - 2}%`, backgroundColor: colors.primary }]} />
              </View>
              <Pressable onPress={() => setVolume(Math.min(1, volume + 0.1))}>
                <Ionicons name="volume-high-outline" size={16} color={colors.outline} />
              </Pressable>
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
                      onPress={() => togglePlay(story.id)}
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
                      <Ionicons name="play-circle" size={32} color={colors.primary} />
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Pressable
              onPress={() => {}}
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
