"""Random influencer prompt generator.

Rolls a random photo brief from curated attribute tables, then hands it to
Ollama to weave into one coherent photorealistic prompt. Server-side
randomization is what keeps output varied — LLMs sampled repeatedly at the
same temperature converge on the same few scenes.

The realism recipe (amateur phone photo, real skin texture, imperfect
framing) comes from the proven consistent-influencer pipeline.
"""
import random

SUBJECTS = [
    "a young woman in her early twenties with long honey-blonde waves",
    "a woman in her mid twenties with a dark sleek bob and sharp cheekbones",
    "a young woman in her twenties with auburn curls and light freckles",
    "a woman in her late twenties with jet-black hair in a loose bun",
    "a young woman in her twenties with platinum hair and grown-out roots",
    "a woman in her early thirties with shoulder-length brunette hair",
    "a young woman in her twenties with a curly afro and gold hoops",
    "a woman in her mid twenties with a high copper ponytail",
    "a young woman in her twenties with braided dark hair",
    "a Scandinavian woman in her twenties with ash-blonde hair and blue-grey eyes",
    "a Mediterranean woman in her late twenties with dark wavy hair",
    "a young East Asian woman in her twenties with long straight black hair",
    "a Latina woman in her mid twenties with caramel balayage waves",
]

SETTINGS = [
    "her bedroom with an unmade bed and fairy lights",
    "a bright modern kitchen mid-morning",
    "a cozy cafe window table with a latte",
    "a gym with mirrors and rubber floors",
    "an overcast city street with wet asphalt",
    "a golden-hour balcony over city rooftops",
    "a dim restaurant booth at night",
    "a grocery store aisle under fluorescent light",
    "a fitting room with harsh overhead lighting",
    "a car driver's seat with window light",
    "a hiking trail with mountains behind her",
    "a hotel bathroom with marble counters",
    "a sunny park lawn on a blanket",
    "a beach boardwalk near sunset",
    "an airport gate with a suitcase",
    "a rooftop pool edge in summer light",
    "a farmers market stall with flowers",
    "a library corner with warm lamps",
    "a music festival crowd at dusk",
    "a ski lodge window with snow outside",
    "a night street lit by neon signs",
    "her sofa under a chunky knit blanket",
]

OUTFITS = [
    "an oversized cream knit sweater",
    "a matching grey ribbed loungewear set",
    "a black satin top with a thin gold necklace",
    "a plain white tee and blue jeans",
    "a fitted ribbed midi dress",
    "gym leggings and a plain sports bra",
    "an oversized beige wool coat over a white top",
    "a black puffer jacket and sneakers",
    "a silk slip dress with small earrings",
    "a denim jacket over a striped top",
    "a plain hoodie and bike shorts",
    "a linen shirt half tucked into trousers",
    "a summer sundress with thin straps",
    "a blazer over a plain camisole",
    "a bikini top and denim shorts",
    "a turtleneck and gold hoops",
]

ACTIVITIES = [
    "taking a casual mirror selfie with her phone",
    "caught mid-laugh looking away from the camera",
    "sipping a drink and glancing at the lens",
    "fixing her hair with a small smile",
    "walking toward the camera mid-step",
    "leaning on a railing looking back over her shoulder",
    "holding a shopping bag and smirking",
    "stretching after a workout",
    "reading with her legs curled up",
    "taking a close selfie from slightly above",
    "adjusting her sunglasses",
    "holding her coffee with both hands",
    "mid-conversation with someone off camera",
    "posing half-turned with a relaxed smile",
]

LIGHTING = [
    "soft overcast daylight",
    "warm golden-hour sun with lens flare",
    "harsh direct phone flash with slight overexposure",
    "mixed warm lamp light and cool daylight",
    "flat fluorescent indoor light",
    "dim moody evening light",
    "bright midday sun with hard shadows",
    "neon-tinted night light",
    "window side-light on one side of her face",
]

CAMERA = [
    "amateur iPhone photo, slightly tilted framing, no filter",
    "candid phone snapshot with imperfect composition",
    "front-camera selfie angle, arm slightly visible",
    "photo taken by a friend, casual framing, mild motion blur",
    "mirror selfie with the phone visible",
    "close-up phone portrait with natural depth of field",
]

MOODS = [
    "relaxed and unbothered",
    "playful and teasing",
    "confident and put-together",
    "sleepy and cozy",
    "sun-drunk and happy",
    "focused and casual",
    "flirty with a knowing look",
]

REALISM = (
    "real skin texture with visible pores, natural imperfect skin, "
    "no airbrush, no glamour retouching, believable everyday photo"
)


def roll_brief(rng: random.Random | None = None) -> dict:
    r = rng or random.Random()
    return {
        "subject": r.choice(SUBJECTS),
        "setting": r.choice(SETTINGS),
        "outfit": r.choice(OUTFITS),
        "activity": r.choice(ACTIVITIES),
        "lighting": r.choice(LIGHTING),
        "camera": r.choice(CAMERA),
        "mood": r.choice(MOODS),
    }


def build_messages(brief: dict, context: str = "zimage") -> tuple[str, str]:
    """Return (system, user) messages for Ollama."""
    is_video = any(k in (context or "").lower() for k in ("wan", "ltx", "vid", "hunyuan"))

    system = (
        "You are a prompt writer for photorealistic AI image generation. "
        "You write prompts for believable adult social-media influencer photos - "
        "the subject is always an adult woman in her twenties or thirties. "
        "Combine ALL the given elements into ONE flowing, natural-language prompt. "
        "Keep the amateur-photo realism language intact - that is what makes results believable. "
        "Do not add camera brand names, watermark text, or hashtags. "
        "Output ONLY the final prompt text, 60-110 words, nothing else."
    )

    motion = (
        " End with one short sentence describing subtle natural motion "
        "(hair moving, breathing, small gestures, gentle camera drift)."
        if is_video else ""
    )

    user = (
        f"Elements for this photo:\n"
        f"- Subject: {brief['subject']}\n"
        f"- Setting: {brief['setting']}\n"
        f"- Outfit: {brief['outfit']}\n"
        f"- Doing: {brief['activity']}\n"
        f"- Lighting: {brief['lighting']}\n"
        f"- Camera style: {brief['camera']}\n"
        f"- Mood: {brief['mood']}\n"
        f"- Realism requirements: {REALISM}\n"
        f"Write the single final prompt now.{motion}"
    )
    return system, user
