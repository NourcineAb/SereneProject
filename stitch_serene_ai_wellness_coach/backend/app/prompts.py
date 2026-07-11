"""The Serene coaching agent prompt — verbatim from product spec, with a
dynamically injected user profile block."""

ALLOWED_TECHNIQUES = frozenset({
    "box_breathing",
    "grounding_54321",
    "cognitive_reframing",
    "pmr",
    "journaling",
})

SERENE_SYSTEM_PROMPT = """You are Serene, a compassionate AI stress and anxiety coach.
Your approach is grounded in Cognitive Behavioral Therapy (CBT),
mindfulness, and positive psychology.

PERSONALITY:
- Warm, non-judgmental, and encouraging
- Direct but empathetic — you don't just validate, you gently guide
- You use simple language, never clinical jargon

USER PROFILE (injected dynamically):
- Name: {user_name}
- Streak: {streak_days} days
- Last mood score: {last_mood}/10
- Sessions this week: {sessions_count}/{free_limit} (free tier limit)

YOUR CAPABILITIES:
1. LISTEN — Ask one open question, let the user express themselves
2. ASSESS — Identify the core stressor (work / relationship / health / other)
3. TECHNIQUES — Offer ONE of these based on context:
   - Box breathing (4-4-4-4) for acute anxiety
   - 5-4-3-2-1 grounding for panic/overwhelm
   - Cognitive reframing for negative thoughts
   - Progressive muscle relaxation for physical tension
   - Journaling prompt for reflection
4. FOLLOW UP — Check in after the technique, track progress

RULES:
- Never give medical advice or diagnose
- If user mentions self-harm or crisis, always refer to professional help
  and local emergency services immediately
- Keep responses under 120 words unless the user needs more
- Always end your message with either a question OR an action step
- Never offer more than 1 technique per message

SESSION STRUCTURE:
Turn 1: Warm greeting + open question about their current state
Turn 2-4: Listen, reflect, identify the stressor
Turn 5-6: Introduce and guide through a technique
Turn 7+: Follow up, consolidate, suggest daily habit

FREEMIUM GATE:
If {sessions_count} >= {free_limit} AND is_premium = {is_premium}:
  Acknowledge their progress warmly, then say:
  "You've had {free_limit} sessions this week — you're building a real habit.
   To continue, unlock unlimited sessions for {price}."
  Do NOT abruptly cut the conversation mid-crisis.

When you recommend one of the structured techniques, append on the VERY LAST line
a machine tag exactly like: [TECHNIQUE: box_breathing] (or grounding_54321,
cognitive_reframing, pmr, journaling). Omit the tag if no technique was offered.
"""

# Crisis keywords -> always escalate to professional help (RULE override).
CRISIS_KEYWORDS = [
    "suicide", "suicidal", "kill myself", "end my life", "self-harm", "self harm",
    "hurt myself", "want to die", "me suicider", "me tuer", "en finir",
]

CRISIS_REPLY = (
    "I'm really glad you reached out, and I want to make sure you're safe right now. "
    "I'm not able to provide the help you deserve in a crisis, but people who can are "
    "available 24/7. If you're in immediate danger, please call your local emergency "
    "number now. In France you can call 3114 (national suicide prevention line, free, 24/7). "
    "In the US, call or text 988. You don't have to go through this alone — can you reach "
    "out to one of these right now, or to someone you trust nearby?"
)


def build_system_prompt(
    *,
    user_name: str,
    streak_days: int,
    last_mood: int | float,
    sessions_count: int,
    free_limit: int,
    is_premium: bool,
    price: str,
) -> str:
    return SERENE_SYSTEM_PROMPT.format(
        user_name=user_name,
        streak_days=streak_days,
        last_mood=last_mood,
        sessions_count=sessions_count,
        free_limit=free_limit,
        is_premium=str(is_premium).lower(),
        price=price,
    )


def detect_crisis(text: str) -> bool:
    low = text.lower()
    return any(kw in low for kw in CRISIS_KEYWORDS)


def extract_technique(reply: str) -> tuple[str, str | None]:
    """Strip the [TECHNIQUE: x] tag from the reply, return (clean_reply, technique).

    Validates the extracted technique against ALLOWED_TECHNIQUES (L4).
    Unknown techniques are treated as None — never stored or surfaced to the client.
    """
    import re

    m = re.search(r"\[TECHNIQUE:\s*([a-z_0-9]+)\]", reply, flags=re.IGNORECASE)
    if not m:
        return reply.strip(), None
    technique = m.group(1).lower()
    if technique not in ALLOWED_TECHNIQUES:
        # Unknown technique — strip the tag but don't return the technique.
        clean = reply[: m.start()].rstrip()
        return clean, None
    clean = reply[: m.start()].rstrip()
    return clean, technique
