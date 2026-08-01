import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Language } from './i18n';

type CalmTechnique = {
  id: string;
  titleKey: string;
  instructionKey: string;
  durationKey: string;
};

const CALM_TECHNIQUES: CalmTechnique[] = [
  {
    id: 'breath_4',
    titleKey: 'sos.breath4Title',
    instructionKey: 'sos.breath4Instruction',
    durationKey: 'sos.breath4Duration',
  },
  {
    id: 'senses_54321',
    titleKey: 'sos.senses54321Title',
    instructionKey: 'sos.senses54321Instruction',
    durationKey: 'sos.senses54321Duration',
  },
  {
    id: 'shoulder_tense',
    titleKey: 'sos.shoulderTitle',
    instructionKey: 'sos.shoulderInstruction',
    durationKey: 'sos.shoulderDuration',
  },
  {
    id: 'calm_sound',
    titleKey: 'sos.soundTitle',
    instructionKey: 'sos.soundInstruction',
    durationKey: 'sos.soundDuration',
  },
  {
    id: 'grounding',
    titleKey: 'sos.groundingTitle',
    instructionKey: 'sos.groundingInstruction',
    durationKey: 'sos.groundingDuration',
  },
];

type EmergencyNumber = {
  country: string;
  number: string;
  labelKey: string;
};

const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { country: 'France', number: '3114', labelKey: 'sos.france3114' },
  { country: 'France', number: '15', labelKey: 'sos.france15' },
  { country: 'France', number: '112', labelKey: 'sos.france112' },
  { country: 'US', number: '988', labelKey: 'sos.us988' },
  { country: 'International', number: '112', labelKey: 'sos.intl112' },
];

async function getLanguage(): Promise<Language> {
  try {
    const stored = await AsyncStorage.getItem('serene.setting.language');
    if (stored === 'en' || stored === 'ar') return stored;
  } catch { /* ignore */ }
  return 'fr';
}

const SOS_STRINGS: Record<Language, Record<string, string>> = {
  fr: {
    'sos.title': 'SOS — Respirez',
    'sos.numbersLabel': 'Numéros d\'urgence',
    'sos.techniqueLabel': 'Technique rapide',
    'sos.call3114': 'Appeler le 3114',
    'sos.calmTechnique': 'Technique de calme',
    'sos.close': 'Fermer',
    'sos.breath4Title': 'Respiration 4 temps',
    'sos.breath4Instruction': 'Inspirez sur 4 temps, retenez 4 temps, expirez sur 4 temps. Répétez 4 fois.',
    'sos.breath4Duration': '2 minutes',
    'sos.senses54321Title': '5-4-3-2-1',
    'sos.senses54321Instruction': 'Nommez 5 choses que vous voyez, 4 que vous touchez, 3 que vous entendez, 2 que vous sentez, 1 que vous goûtez.',
    'sos.senses54321Duration': '3 minutes',
    'sos.shoulderTitle': 'Contractez-relâchez',
    'sos.shoulderInstruction': 'Contractez vos épaules vers vos oreilles, maintenez 5 secondes, puis relâchez. Répétez 3 fois.',
    'sos.shoulderDuration': '2 minutes',
    'sos.soundTitle': 'Écoute apaisante',
    'sos.soundInstruction': 'Fermez les yeux et écoutez un son apaisant pendant 1 minute. Concentrez-vous uniquement sur ce son.',
    'sos.soundDuration': '1 minute',
    'sos.groundingTitle': 'Ancrage corporel',
    'sos.groundingInstruction': 'Plantez vos pieds fermement au sol. Sentez le contact de vos pieds avec le sol. Respirez 3 fois lentement.',
    'sos.groundingDuration': '1 minute',
    'sos.france3114': 'Ligne nationale prévention suicide',
    'sos.france15': 'SAMU',
    'sos.france112': 'Numéro européen',
    'sos.us988': 'Suicide & Crisis Lifeline',
    'sos.intl112': 'Numéro d\'urgence international',
  },
  en: {
    'sos.title': 'SOS — Breathe',
    'sos.numbersLabel': 'Emergency numbers',
    'sos.techniqueLabel': 'Quick technique',
    'sos.call3114': 'Call 3114',
    'sos.calmTechnique': 'Calming technique',
    'sos.close': 'Close',
    'sos.breath4Title': '4-count breathing',
    'sos.breath4Instruction': 'Inhale for 4 counts, hold for 4 counts, exhale for 4 counts. Repeat 4 times.',
    'sos.breath4Duration': '2 minutes',
    'sos.senses54321Title': '5-4-3-2-1',
    'sos.senses54321Instruction': 'Name 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste.',
    'sos.senses54321Duration': '3 minutes',
    'sos.shoulderTitle': 'Tense and release',
    'sos.shoulderInstruction': 'Shrug your shoulders toward your ears, hold for 5 seconds, then release. Repeat 3 times.',
    'sos.shoulderDuration': '2 minutes',
    'sos.soundTitle': 'Soothing listening',
    'sos.soundInstruction': 'Close your eyes and listen to a soothing sound for 1 minute. Focus only on that sound.',
    'sos.soundDuration': '1 minute',
    'sos.groundingTitle': 'Body grounding',
    'sos.groundingInstruction': 'Plant your feet firmly on the ground. Feel the contact of your feet with the floor. Breathe slowly 3 times.',
    'sos.groundingDuration': '1 minute',
    'sos.france3114': 'National suicide prevention hotline',
    'sos.france15': 'SAMU',
    'sos.france112': 'European number',
    'sos.us988': 'Suicide & Crisis Lifeline',
    'sos.intl112': 'International emergency number',
  },
  ar: {
    'sos.title': 'SOS — تنفس',
    'sos.numbersLabel': 'أرقام الطوارئ',
    'sos.techniqueLabel': 'تقنية سريعة',
    'sos.call3114': 'اتصل بـ 3114',
    'sos.calmTechnique': 'تقنية هدوء',
    'sos.close': 'إغلاق',
    'sos.breath4Title': 'تنفس بـ 4 عدات',
    'sos.breath4Instruction': 'استنشق لمدة 4 عدات، احبس لمدة 4 عدات، زفير لمدة 4 عدات. كرر 4 مرات.',
    'sos.breath4Duration': 'دقيقتان',
    'sos.senses54321Title': '5-4-3-2-1',
    'sos.senses54321Instruction': 'اذكر 5 أشياء تراها، 4 تلمسها، 3 تسمعها، 2 تشمها، 1 تتذوقها.',
    'sos.senses54321Duration': '3 دقائق',
    'sos.shoulderTitle': 'شد واسترخِ',
    'sos.shoulderInstruction': 'ارفع كتفيك نحو أذنيك، احبس 5 ثوانٍ، ثم استرخِ. كرر 3 مرات.',
    'sos.shoulderDuration': 'دقيقتان',
    'sos.soundTitle': 'استماع مهدئ',
    'sos.soundInstruction': 'أغلق عينيك واستمع لصوت مهدئ لمدة دقيقة. ركز فقط على ذلك الصوت.',
    'sos.soundDuration': 'دقيقة واحدة',
    'sos.groundingTitle': 'تأسيس جسدي',
    'sos.groundingInstruction': 'اثبت قدميك ب firmness على الأرض. أشعر بتلامس قدميك مع الأرض. تنفس ببطء 3 مرات.',
    'sos.groundingDuration': 'دقيقة واحدة',
    'sos.france3114': 'الخط الوطني لمنع الانتحار',
    'sos.france15': 'SAMU',
    'sos.france112': 'الرقم الأوروبي',
    'sos.us988': 'خط مساعدة الانتحار والأزمات',
    'sos.intl112': 'رقم الطوارئ الدولي',
  },
};

export function getCalmTechnique(): CalmTechnique {
  const idx = Math.floor(Math.random() * CALM_TECHNIQUES.length);
  return CALM_TECHNIQUES[idx];
}

export function getEmergencyNumbers(): EmergencyNumber[] {
  return EMERGENCY_NUMBERS;
}

export async function showSOSAlert(): Promise<void> {
  const lang = await getLanguage();
  const strings = SOS_STRINGS[lang] ?? SOS_STRINGS.fr;

  const numbersText = EMERGENCY_NUMBERS.map((n) => {
    const label = strings[n.labelKey] ?? n.labelKey;
    return `  ${n.country}: ${n.number} (${label})`;
  }).join('\n');

  const technique = getCalmTechnique();
  const techniqueTitle = strings[technique.titleKey] ?? technique.titleKey;
  const techniqueInstruction = strings[technique.instructionKey] ?? technique.instructionKey;

  Alert.alert(
    strings['sos.title'],
    `${strings['sos.numbersLabel']}:\n${numbersText}\n\n${strings['sos.techniqueLabel']}:\n${techniqueTitle}\n${techniqueInstruction}`,
    [
      { text: strings['sos.call3114'], onPress: () => {}, style: 'destructive' },
      { text: strings['sos.calmTechnique'], onPress: () => showSOSAlert() },
      { text: strings['sos.close'], style: 'cancel' },
    ],
  );
}

export const SOS_BUTTON = {
  color: '#D32F2F',
  label: 'SOS',
  icon: 'alert-circle',
};
