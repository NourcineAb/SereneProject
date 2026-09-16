"""Offline demo coach used when no real LLM key is configured or OpenRouter is
unavailable / quota exhausted.

The demo is intentionally small and dependency-free, but it must never answer
with a single generic "Je t'écoute, m'en dis plus" line. Every matched intent
yields a concrete, actionable reply in the user's language, and the fallback
rotates between several action-oriented replies instead of repeating one.
"""

from __future__ import annotations

import re

_ARP = "\u0600-\u06FF"

_ENG_HINTS = (
    "i", "i'm", "i am", "the", "feeling", "can't", "dont", "sleep",
    "help", "me", "you", "and", "please",
)

_FR_HINTS = (
    "je", "je suis", "j'ai", "ne", "pas", "dans", "avec",
    "dormir", "s'il", "aidez",
)

# Strip accents/diacritics so "l'aise", "gêné", "énervé" match whatever the
# user types. Arabic script is untouched — it has no diacritic folding.
_ACCENT_MAP = {
    "é": "e", "è": "e", "ê": "e", "ë": "e",
    "à": "a", "â": "a", "ä": "a",
    "ô": "o", "ö": "o",
    "î": "i", "ï": "i",
    "ù": "u", "û": "u", "ü": "u",
    "ç": "c", "œ": "oe", "æ": "ae",
}

_ACCENT_RE = re.compile("[" + "".join(_ACCENT_MAP) + "]")


def _fold(text: str) -> str:
    return _ACCENT_RE.sub(lambda m: _ACCENT_MAP[m.group()], text.lower())


def _detect_language(text: str) -> str:
    """Return 'fr', 'en' or 'ar' for the user's message (fr = default)."""
    if re.search(f"[{_ARP}]", text):
        return "ar"
    low = text.lower()
    fr = sum(1 for h in _FR_HINTS if re.search(rf"\b{re.escape(h)}\b", low))
    en = sum(1 for h in _ENG_HINTS if re.search(rf"\b{re.escape(h)}\b", low))
    if en > fr:
        return "en"
    return "fr"


# ── Intent matching ──────────────────────────────────────────────────────────
# Each intent: (reply_key, technique, keywords). Keywords are matched against
# the accent-folded lowercase user text, so French/English/Arabic forms are
# grouped together. Reuses the exact technique tags known to coach.py.
_INTENTS: tuple[tuple[str, str | None, tuple[str, ...]], ...] = (
    ("anxiety", "box_breathing", (
        "anxieux", "anxieuse", "anxiet", "anxiety", "anxious", "stress",
        "stresse", "stressed", "panique", "panic", "angoisse", "nerveux",
        "nerveuse", "nervous", "tension", "dormir", "sleep", "insomnia",
        "insomnie", "sommeil", "va pas", "vais pas", "pas top", "ça va mal",
        "قلق", "القلق", "توتر", "أرق",
    )),
    ("discomfort", "grounding_54321", (
        "l'aise", "aise", "inconfort", "uncomfortable", "malaise", "awkward",
        "gene", "genee", "etrange", "bizarre", "weird", "ضيق", "محرج", "غريب",
    )),
    ("focus", "box_breathing", (
        "concentrer", "concentration", "concentre", "concentrate",
        "concentrating", "focus", "distrait", "distracted", "attention",
        "تركيز", "تشتت",
    )),
    ("fatigue", "box_breathing", (
        "fatigu", "tired", "epuis", "exhaust", "drained", "somnolent",
        "fatigue", "epuise", "نعسان", "متعب", "تعبان", "إرهاق", "مرهق",
    )),
    ("sadness", "journaling", (
        "triste", "sad", "deprim", "depres", "lonely", "seul", "seule",
        "solitude", "vide", "empty", "cafard", "maltraité", "مكتئب", "حزين",
        "وحيد", "وحيدة", "حزن", "اكتئاب", "وحدة",
    )),
    ("anger", "pmr", (
        "colere", "anger", "enerv", "frust", "agace", "irrit", "rage",
        "غاضب", "غضب", "إحباط", "منزعج", "مستاء",
    )),
    ("thoughts", "cognitive_reframing", (
        "pensee", "pensees", "thoughts", "overthink", "negatif", "negative",
        "culpabilite", "guilt", "doute", "doubt", "inquiet", "worried",
        "worry", "أفكار", "ذنب", "شك",
    )),
    ("motivation", "cognitive_reframing", (
        "motiv", "demotiv", "procrast", "flemme", "envie de rien", "lazy",
        "حافز", "دافع", "حماس",
    )),
    ("fun", None, (
        "amuser", "amus", "m'amuse", "t'amuse", "s'amuse", "jouer", "jouons",
        "jeux", "fun", "play", "distraire", "divertir", "rigoler",
        "rire", "laugh", "joie", "joy", "joyeux", "joyeuse", "heureux",
        "heureuse", "happy", "sourire", "smile", "مرح", "المرح", "لعب", "فرح",
        "سعادة",
    )),
    ("thanks", None, (
        "merci", "thanks", "thank you", "شكرا", "شكراً",
    )),
)

_INTENT_MATCH_CACHE: dict[str, tuple[str, str | None] | None] = {}


def _match_intent(text: str) -> tuple[str, str | None] | None:
    """Return (reply_key, technique) for the first matching intent."""
    folded = _fold(text)
    hit = _INTENT_MATCH_CACHE.get(folded)
    if hit is not None or folded in _INTENT_MATCH_CACHE:
        return hit
    for reply_key, technique, keywords in _INTENTS:
        if any(kw in folded for kw in keywords):
            result = (reply_key, technique)
            _INTENT_MATCH_CACHE[folded] = result
            return result
    _INTENT_MATCH_CACHE[folded] = None
    return None


# ── Replies ──────────────────────────────────────────────────────────────────
_LANG_REPLIES: dict[str, dict[str, str]] = {
    "fr": {
        "anxiety": (
            "Je suis là avec toi. On va ralentir ensemble : inspire doucement par le nez "
            "pendant 4 secondes, retiens 4, puis expire par la bouche pendant 6. "
            "Répète trois fois. Comment te sens-tu maintenant ?"
        ),
        "discomfort": (
            "Ce malaise est désagréable, et ça se comprend. Remets-toi dans ton corps "
            "avec l'ancrage 5-4-3-2-1 : 5 choses que tu vois, 4 que tu touches, 3 que tu "
            "entends, 2 que tu sens, 1 que tu peux goûter. On y va ensemble ?"
        ),
        "focus": (
            "Quand la concentration devient difficile, un petit reset aide. Fais une pause "
            "de 2 minutes : pose ton téléphone, respire lentement, puis choisis une seule "
            "petite tâche à finir. On respire ensemble pour commencer ?"
        ),
        "fatigue": (
            "La fatigue se lit dans ton message. Offre-toi une micro-pause : respirer lentement "
            "pendant 1 minute suffit parfois à se recharger. Bois un verre d'eau aussi. "
            "Inspire 4, expire 6, trois fois avec moi ?"
        ),
        "sadness": (
            "Merci de partager ça. Quand c'est lourd, mettre des mots dehors allège un peu. "
            "Si tu veux, écris trois courtes phrases sur ce que tu ressens, sans filtre. "
            "Je reste là, à ton écoute."
        ),
        "anger": (
            "La colère met tout le corps sous tension. Essayons un relâchement rapide : "
            "serre les épaules fort pendant 5 secondes, puis lâche tout d'un coup. "
            "Répète deux fois et dis-moi ce que ça change."
        ),
        "thoughts": (
            "Ces pensées insistent, c'est épuisant. Pose-toi une question simple : y a-t-il "
            "une preuve réelle qu'elles sont vraies ? Si un ami pensait la même chose, "
            "que lui dirais-tu ?"
        ),
        "motivation": (
            "Le manque de motivation, on le relance en petit. Choisis une action minuscule "
            "qui te prendra moins de 5 minutes — s'habiller, ranger un tiroir — et commence "
            "seulement celle-là. Quelle micro-étape choisirais-tu ?"
        ),
        "fun": (
            "Excellente idée de te changer les idées ! Mets une chanson qui te fait sourire "
            "et danse pendant 3 minutes, sans jugement, ou appelle quelqu'un qui te fait rire. "
            "Qu'est-ce qui te ferait le plus plaisir là, tout de suite ?"
        ),
        "thanks": (
            "Avec plaisir ! Je suis là quand tu en as besoin. Prends soin de toi."
        ),
        "greeting": (
            "Bonjour, je suis Serene. Je suis ravie d'être là avec toi. Comment tu te sens "
            "en ce moment, et qu'est-ce qui occupe ton esprit aujourd'hui ?"
        ),
        "fallback_0": (
            "Je vois que ça ne va pas trop fort en ce moment. On peut commencer par une "
            "petite respiration douce, juste trois cycles. Qu'est-ce qui te pèse le plus "
            "en ce moment ?"
        ),
        "fallback_1": (
            "D'accord. Si on faisait une mini-pause de 2 minutes, sans téléphone, juste "
            "pour souffler ? Tu peux écouter les sons autour de toi pendant que tu respires. "
            "Qu'est-ce qui occupe ton esprit ?"
        ),
        "fallback_2": (
            "Je t'entends. Une chose à la fois : bois un verre d'eau, étire-toi quelques "
            "secondes, puis raconte-moi ce qui a été le plus dur aujourd'hui."
        ),
    },
    "en": {
        "anxiety": (
            "I'm here with you. Let's slow down together: breathe in gently through your "
            "nose for 4 seconds, hold for 4, then exhale through your mouth for 6. "
            "Repeat three times. How do you feel now?"
        ),
        "discomfort": (
            "That uneasy feeling is uncomfortable, and that's understandable. Let's "
            "ground you back in your body with 5-4-3-2-1: 5 things you see, 4 you touch, "
            "3 you hear, 2 you smell, 1 you can taste. Shall we do it together?"
        ),
        "focus": (
            "When focusing gets hard, a quick reset helps. Take a 2-minute break: put your "
            "phone down, breathe slowly, then pick one small task to finish. Shall we "
            "start with a short breathing exercise?"
        ),
        "fatigue": (
            "Your tiredness comes through in your message. Give yourself a micro-break: "
            "breathing slowly for one minute can be enough to recharge. Sip some water too. "
            "Inhale for 4, exhale for 6, three times with me?"
        ),
        "sadness": (
            "Thank you for sharing that. When it feels heavy, putting words outside helps "
            "a little. If you'd like, write three short sentences about what you feel, "
            "with no filter. I'm still here, listening."
        ),
        "anger": (
            "Anger puts your whole body under tension. Let's try a quick release: squeeze "
            "your shoulders hard for 5 seconds, then drop everything at once. Repeat twice "
            "and tell me what changes."
        ),
        "thoughts": (
            "Those thoughts keep insisting — exhausting. Ask yourself one simple question: "
            "is there real evidence they're true? If a friend thought the same, what would "
            "you tell them?"
        ),
        "motivation": (
            "A lack of motivation gets going again in small steps. Pick one tiny action "
            "that takes under 5 minutes — getting dressed, clearing a drawer — and start "
            "with that one only. Which micro-step would you choose?"
        ),
        "fun": (
            "Excellent idea to switch things up! Play a song that makes you smile and "
            "dance for 3 minutes, no judgment, or call someone who makes you laugh. "
            "What would bring you the most joy right now?"
        ),
        "thanks": (
            "Anytime! I'm here whenever you need. Take care of yourself."
        ),
        "greeting": (
            "Hi, I'm Serene. I'm glad to be here with you. How are you feeling right now, "
            "and what's on your mind today?"
        ),
        "fallback_0": (
            "I can tell things aren't going great right now. Let's start with a soft "
            "breathing exercise, just three rounds. What's weighing on you most right now?"
        ),
        "fallback_1": (
            "Okay. What about a 2-minute break, no phone, just to breathe? Listen to the "
            "sounds around you while you inhale and exhale. What's on your mind?"
        ),
        "fallback_2": (
            "I hear you. One thing at a time: drink a glass of water, stretch for a few "
            "seconds, then tell me what was hardest today."
        ),
    },
    "ar": {
        "anxiety": (
            "أنا معك. لنبطئ معًا: استنشق ببطء من أنفك لمدة 4 ثوانٍ، احبس النفس 4 ثوانٍ، "
            "ثم أخرج الهواء من فمك لمدة 6 ثوانٍ. كرر ثلاث مرات. كيف تشعر الآن؟"
        ),
        "discomfort": (
            "هذا الشعور بعدم الراحة مزعج، وهذا مفهوم. لنعد إلى جسمك مع تمرين الإرساء 5-4-3-2-1: "
            "5 أشياء تراها، 4 تلمسها، 3 تسمعها، 2 تشتمّها، 1 يمكنك تذوقها. نبدأ معًا؟"
        ),
        "focus": (
            "عندما يصعب التركيز، تساعد إعادة الضبط السريعة. خذ استراحة دقيقتين: ضع هاتفك جانبًا، "
            "تنفس ببطء، ثم اختر مهمة صغيرة واحدة لإنهائها. نبدأ بتمرين تنفس قصير؟"
        ),
        "fatigue": (
            "التعب واضح من رسالتك. امنح نفسك استراحة صغيرة: التنفس البطيء لمدة دقيقة يكفي أحيانًا "
            "لإعادة الشحن. واشرب كوبًا من الماء أيضًا. استنشق لـ4 ثوانٍ وأخرج لـ6، ثلاث مرات معي؟"
        ),
        "sadness": (
            "شكرًا لمشاركتك ذلك. عندما يكون الأمر ثقيلًا، وضع الكلمات في الخارج يخفف قليلًا. "
            "إذا أردت، اكتب ثلاث جمل قصيرة عما تشعر به، دون أي تصفية. أنا ما زلت هنا أستمع."
        ),
        "anger": (
            "الغضب يضع جسمك كله في توتر. لنجرب تحريرًا سريعًا: شدّ كتفيك بقوة لمدة 5 ثوانٍ، "
            "ثم أرخِ كل شيء دفعة واحدة. كرر مرتين وأخبرني ما الذي تغيّر."
        ),
        "thoughts": (
            "تلك الأفكار مستمرة ومرهقة. اسأل نفسك سؤالًا واحدًا بسيطًا: هل هناك دليل حقيقي على "
            "صحتها؟ لو فكّر صديق بالشيء نفسه، ماذا كنت ستقول له؟"
        ),
        "motivation": (
            "نقص الحافز يُستعاد بخطوات صغيرة. اختر فعلًا واحدًا صغيرًا لا يتجاوز 5 دقائق — "
            "الاستعداد، ترتيب درج — وابدأ به فقط. ما هي الخطوة الصغيرة التي تختارها؟"
        ),
        "fun": (
            "فكرة رائعة لتغيير الأجواء! ضع أغنية تجعلك تبتسم وارقص لمدة 3 دقائق دون حرج، "
            "أو اتصل بشخص يجعلك تضحك. ما الذي سيسعدك الآن؟"
        ),
        "thanks": (
            "بكل سرور! أنا هنا متى احتجت. اعتني بنفسك."
        ),
        "greeting": (
            "مرحبًا، أنا سيرين. سعيدة بأن أكون معك. كيف تشعر الآن، وما الذي يشغل بالك اليوم؟"
        ),
        "fallback_0": (
            "أشعر أن الأمور ليست جيدة الآن. لنبدأ بتمرين تنفس هادئ، ثلاث جولات فقط. "
            "ما الذي يثقل عليك أكثر في هذه اللحظة؟"
        ),
        "fallback_1": (
            "حسنًا. ماذا عن استراحة دقيقتين، دون هاتف، فقط للتنفس؟ استمع إلى الأصوات من حولك "
            "أثناء الشهيق والزفير. ما الذي يشغل بالك؟"
        ),
        "fallback_2": (
            "أنا أستمع إليك. شيء واحد في كل مرة: اشرب كوبًا من الماء، تمدد لبضع ثوانٍ، "
            "ثم أخبرني بما كان الأصعب اليوم."
        ),
    },
}

_FALLBACK_KEYS = ("fallback_0", "fallback_1", "fallback_2")

_GREETINGS = (
    "bonjour", "salut", "bonsoir", "coucou", "hello", "hi", "hey", "yo",
    "مرحبا", "السلام عليكم", "اهلا",
)


def _pick_fallback(lang: str, text: str) -> str:
    """Rotate between the action-oriented fallback replies."""
    folded = _fold(text)
    index = sum(ord(c) for c in folded) % len(_FALLBACK_KEYS)
    key = _FALLBACK_KEYS[index]
    return _LANG_REPLIES[lang][key]


async def _demo_generate(system: str, history: list[dict]) -> str:
    """Offline coaching reply. Understands the last message (and falls back to
    the conversation context for very short messages), gives a concrete action,
    and replies in the user's language."""
    user_msgs = [m["content"] for m in history if m["role"] == "user"]
    last_user = user_msgs[-1] if user_msgs else ""
    lang = _detect_language(last_user)

    intent = _match_intent(last_user)
    user_turns = len(user_msgs)

    if intent is None and user_turns >= 2:
        # Very short / fuzzy message ("avance", "ça va pas"): reuse the topic
        # of the most recent matched message so the reply is contextual.
        for earlier in reversed(user_msgs[:-1]):
            prior_intent = _match_intent(earlier)
            if prior_intent:
                intent = prior_intent
                break

    if intent is None:
        folded = _fold(last_user).strip(" .,!?")
        if folded in _GREETINGS:
            reply = _LANG_REPLIES[lang]["greeting"]
        else:
            reply = _pick_fallback(lang, last_user)
        return reply

    reply_key, technique = intent
    reply = _LANG_REPLIES[lang][reply_key]
    if technique:
        reply += f"\n[TECHNIQUE: {technique}]"
    return reply