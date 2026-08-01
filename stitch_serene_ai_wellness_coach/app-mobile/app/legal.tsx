import { useState } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme-provider';
import { useI18n } from '../lib/i18n';

type Tab = 'privacy' | 'terms';

export default function Legal() {
  const { theme: t } = useTheme();
  const { t: tl } = useI18n();
  const [tab, setTab] = useState<Tab>('privacy');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={tl('misc.back')}>
          <Ionicons name="chevron-back" size={28} color={t.colors.primary} />
        </Pressable>
        <Text style={[t.type.headlineLg, { color: t.colors.primary }]}>{tl('legal.title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setTab('privacy')}
          style={[styles.tab, tab === 'privacy' && { borderBottomColor: t.colors.primary }]}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'privacy' }}
        >
          <Text
            style={[
              t.type.titleMd,
              { color: tab === 'privacy' ? t.colors.primary : t.colors.outline },
            ]}
          >
            {tl('legal.privacy')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('terms')}
          style={[styles.tab, tab === 'terms' && { borderBottomColor: t.colors.primary }]}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'terms' }}
        >
          <Text
            style={[
              t.type.titleMd,
              { color: tab === 'terms' ? t.colors.primary : t.colors.outline },
            ]}
          >
            {tl('legal.terms')}
          </Text>
        </Pressable>
      </View>

      {tab === 'privacy' ? (
        <View style={styles.content}>
          <Section title={tl('legal.privacy.dataTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.privacy.dataDesc')}
            </Text>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.dataEmail')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.dataMood')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.dataName')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.dataUsage')}
            </Bullet>
          </Section>

          <Section title={tl('legal.privacy.usageTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.privacy.usageDesc')}
            </Text>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.usagePersonalize')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.usageTrack')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.usageImprove')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.usageContact')}
            </Bullet>
          </Section>

          <Section title={tl('legal.privacy.securityTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.privacy.securityDesc')}
            </Text>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.securityFernet')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.securityJwt')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.securityTls')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.securityAccess')}
            </Bullet>
          </Section>

          <Section title={tl('legal.privacy.gdprTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.privacy.gdprDesc')}
            </Text>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.gdprAccess')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.gdprErase')}
            </Bullet>
            <Bullet color={t.colors.onSurfaceVariant} type={t.type}>
              {tl('legal.privacy.gdprPortable')}
            </Bullet>
          </Section>

          <Section title={tl('legal.privacy.dpoTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.privacy.dpoDesc')}
            </Text>
            <Text style={[t.type.bodyMd, { color: t.colors.primary, marginTop: 8 }]}>
              serenecoach@outlook.com
            </Text>
          </Section>
        </View>
      ) : (
        <View style={styles.content}>
          <Section title={tl('legal.terms.serviceTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.terms.serviceDesc')}
            </Text>
          </Section>

          <Section title={tl('legal.terms.liabilityTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.terms.liabilityDesc')}
            </Text>
          </Section>

          <Section title={tl('legal.terms.subscriptionTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.terms.subscriptionDesc')}
            </Text>
          </Section>

          <Section title={tl('legal.terms.cancellationTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.terms.cancellationDesc')}
            </Text>
          </Section>

          <Section title={tl('legal.terms.accountTitle')} color={t.colors.onSurface} variant={t.type}>
            <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
              {tl('legal.terms.accountDesc')}
            </Text>
          </Section>
        </View>
      )}

      <Text style={[t.type.labelSm, { color: t.colors.outline, textAlign: 'center', marginTop: 32 }]}>
        {tl('legal.lastUpdate')}
      </Text>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  color,
  variant,
}: {
  title: string;
  children: React.ReactNode;
  color: string;
  variant: any;
}) {
  return (
    <View style={sectionStyles.section}>
      <Text style={[variant.titleMd, { color }]}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children, color, type }: { children: React.ReactNode; color: string; type: any }) {
  return (
    <View style={sectionStyles.bullet}>
      <Text style={[type.bodyMd, { color, marginLeft: 8, flex: 1 }]}>
        {'  \u2022  '}{children}
      </Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  section: {
    marginBottom: 28,
  },
  bullet: {
    flexDirection: 'row',
    marginTop: 6,
  },
});

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 56,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  content: {},
});
