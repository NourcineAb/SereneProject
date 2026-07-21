import { useState } from 'react';
import { router } from 'expo-router';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme-provider';

export default function Help() {
  const { theme: t } = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<number | null>(null);

  const faq = [
    {
      q: 'Comment fonctionne Serene ?',
      a: "Serene est votre coach bien-être personnel propulsé par l'intelligence artificielle. L'assistant vous écoute, vous propose des exercices adaptés (respiration, méditation, restructuration cognitive) et suit votre progression au fil du temps pour personnaliser ses conseils.",
    },
    {
      q: 'Les données sont-elles sécurisées ?',
      a: "Absolument. Toutes vos données sont chiffrées avec l'algorithme Fernet (AES-128-CBC). Les sessions sont protégées par JWT. Vos messages et données de santé ne sont jamais vendus à des tiers. Nous sommes conformes au RGPD.",
    },
    {
      q: "Comment fonctionne l'abonnement ?",
      a: "Serene propose un plan gratuit limité à 3 sessions de coaching. L'abonnement Premium débloque des sessions illimitées, des exercices exclusifs et des fonctionnalités avancées de suivi. Vous pouvez annuler à tout moment.",
    },
    {
      q: 'Puis-je utiliser Serene en cas de crise ?',
      a: "Serene n'est pas un dispositif médical et ne remplace pas une aide professionnelle. En cas de crise ou d'urgence, contactez immédiatement les numéros d'urgence (3114 en France, 988 aux États-Unis) ou rendez aux urgences.",
    },
    {
      q: 'Comment supprimer mon compte ?',
      a: "Conformément au RGPD (article 17), vous pouvez demander la suppression complète de votre compte et de vos données. Envoyez un email à l'adresse de contact ci-dessous avec votre demande. La suppression sera effectuée sous 30 jours.",
    },
    {
      q: 'Les exercices sont-ils validés médicalement ?',
      a: "Les exercices proposés sont inspirés de techniques validées scientifiquement (TCC, pleine conscience, cohérence cardiaque). Cependant, Serene n'est pas un dispositif médical et ne se substitue pas à un avis médical professionnel.",
    },
    {
      q: 'Comment contacter le support ?',
      a: 'Vous pouvez nous écrire à l\'adresse serenecoach@outlook.com. Notre équipe vous répondra dans les 48 heures ouvrées.',
    },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.background }} contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={28} color={t.colors.primary} />
        </Pressable>
        <Text style={[t.type.headlineLg, { color: t.colors.primary }]}>Aide</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.faq}>
        {faq.map((item, i) => (
          <Pressable
            key={i}
            onPress={() => setExpanded(expanded === i ? null : i)}
            style={[styles.faqItem, { borderColor: t.colors.outlineVariant }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: expanded === i }}
          >
            <View style={styles.faqRow}>
              <Text style={[t.type.titleMd, { color: t.colors.onSurface, flex: 1 }]}>
                {item.q}
              </Text>
              <Ionicons
                name={expanded === i ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={t.colors.outline}
              />
            </View>
            {expanded === i && (
              <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant, marginTop: 10 }]}>
                {item.a}
              </Text>
            )}
          </Pressable>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: t.colors.surfaceContainer }]}>
        <Ionicons name="mail-outline" size={24} color={t.colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[t.type.titleMd, { color: t.colors.onSurface }]}>Contacter le support</Text>
          <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
            serenecoach@outlook.com
          </Text>
        </View>
        <Pressable
          onPress={() => Linking.openURL('mailto:serenecoach@outlook.com')}
          hitSlop={12}
          accessibilityLabel="Envoyer un email"
        >
          <Ionicons name="open-outline" size={20} color={t.colors.primary} />
        </Pressable>
      </View>

      <View style={[styles.section, { backgroundColor: t.colors.errorContainer }]}>
        <Ionicons name="alert-circle-outline" size={24} color={t.colors.error} />
        <View style={{ flex: 1 }}>
          <Text style={[t.type.titleMd, { color: t.colors.onSurface }]}>Ressources de crise</Text>
          <Text style={[t.type.bodyMd, { color: t.colors.onSurfaceVariant }]}>
            Si vous êtes en situation de détresse, contactez immédiatement :
          </Text>
          <Text style={[t.type.bodyMd, { color: t.colors.onSurface, marginTop: 8 }]}>
            France : 3114 (24h/24)
          </Text>
          <Text style={[t.type.bodyMd, { color: t.colors.onSurface }]}>
            États-Unis : 988
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  faq: {
    gap: 12,
  },
  faqItem: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
  },
});
