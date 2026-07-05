import random
from typing import Dict, Tuple

SUBJECTS = [
    "a young woman in her early twenties with long honey-blonde waves",
    "a woman in her mid-twenties with a dark sleek bob and sharp cheekbones",
    "a young woman in her twenties with auburn curls and light freckles",
    "a woman in her late twenties with jet-black hair in a loose bun",
    "a young woman in her twenties with platinum hair and grown-out roots",
    "a woman in her early thirties with shoulder-length brunette hair",
    "a young woman in her twenties with a curly afro and gold hoops",
    "a woman in her mid-twenties with a high copper ponytail",
    "a young woman in her twenties with braided dark hair",
    "a Scandinavian woman in her twenties with ash-blonde hair and blue-grey eyes",
    "a Mediterranean woman in her late twenties with dark wavy hair",
    "a young East Asian woman in her twenties with long straight black hair",
    "a Latina woman in her mid-twenties with caramel balayage waves",
]

SCENES = [
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

ACTIONS = [
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
    "wide accidental snapshot with lots of negative space",
    "mid-distance candid shot, imperfect crop, natural perspective",
]

MOODS = [
    "relaxed and unbothered",
    "playful and teasing",
    "confident and put-together",
    "sleepy and cozy",
    "sun-drunk and happy",
    "focused and casual",
    "flirty with a knowing look",
    "reserved and thoughtful",
    "bright and slightly chaotic",
]

COLOR_PALETTES = [
    "warm beige, cream, and soft brown tones",
    "cool grey, black, and muted blue tones",
    "soft pastel pinks and pale neutrals",
    "deep navy, olive, and warm skin tones",
    "high-contrast black and white with one accent color",
    "sun-faded gold, sand, and dusty orange",
    "clean white, silver, and cool daylight tones",
]

COMPOSITIONS = [
    "tight portrait crop with shallow depth of field",
    "off-center framing with empty space on one side",
    "slightly elevated angle, casual and unposed",
    "low angle that makes the scene feel candid and real",
    "waist-up framing with a messy background",
    "full-body framing with natural posture and context visible",
    "three-quarter framing with strong foreground blur",
    "mirror composition with imperfect reflections and edges",
]

LENS = [
    "24mm wide-angle look",
    "28mm casual phone-like perspective",
    "35mm documentary-style framing",
    "50mm natural portrait perspective",
    "85mm compressed portrait look",
]

REALISM = [
    "real skin texture with visible pores",
    "natural imperfections, slight under-eye shadows, no airbrushing",
    "believable everyday lighting, not studio-perfect",
    "minor motion blur and slightly uneven framing",
    "authentic phone-camera sharpness with soft edges",
    "unretouched, spontaneous, lived-in photo feel",
]

NEGATIVES = [
    "no plastic skin",
    "no over-smoothed face",
    "no glam magazine lighting",
    "no cinematic fantasy look",
    "no symmetrical studio pose",
    "no heavy makeup emphasis",
    "no fashion-ad editorial polish",
]

def roll_brief(rng: random.Random | None = None) -> Dict[str, str]:
    r = rng or random.Random()
    return {
        "subject": r.choice(SUBJECTS),
        "scene": r.choice(SCENES),
        "outfit": r.choice(OUTFITS),
        "action": r.choice(ACTIONS),
        "lighting": r.choice(LIGHTING),
        "camera": r.choice(CAMERA),
        "mood": r.choice(MOODS),
        "palette": r.choice(COLOR_PALETTES),
        "composition": r.choice(COMPOSITIONS),
        "lens": r.choice(LENS),
        "realism": r.choice(REALISM),
        "negative": r.choice(NEGATIVES),
    }

def build_messages(brief: Dict[str, str], context: str = "zimage") -> Tuple[str, str]:
    is_video = any(k in (context or "").lower() for k in ("wan", "ltx", "vid", "hunyuan"))

    system = (
        "You are a prompt writer for photorealistic AI image generation. "
        "Write prompts for believable adult social-media influencer photos, always an adult woman. "
        "Turn the brief into one fluent prompt that feels specific, varied, and visually grounded. "
        "Prioritize composition, camera behavior, lighting, and scene detail over generic beauty language. "
        "Avoid repetitive phrasing and avoid falling back to the same pose or selfie structure. "
        "Do not mention camera brands, hashtags, watermark text, or prompt-analysis language. "
        "Output only the final prompt text, 90-150 words, nothing else."
    )

    motion = (
        " End with one short sentence describing subtle natural motion, like hair shifting, a small breath, "
        "a tiny hand movement, or gentle camera drift."
        if is_video else ""
    )

    user = (
        f"Create one photorealistic prompt from these elements:\n"
        f"- Subject: {brief['subject']}\n"
        f"- Scene: {brief['scene']}\n"
        f"- Outfit: {brief['outfit']}\n"
        f"- Action: {brief['action']}\n"
        f"- Lighting: {brief['lighting']}\n"
        f"- Camera: {brief['camera']}\n"
        f"- Lens: {brief['lens']}\n"
        f"- Composition: {brief['composition']}\n"
        f"- Mood: {brief['mood']}\n"
        f"- Color palette: {brief['palette']}\n"
        f"- Realism notes: {brief['realism']}\n"
        f"- Negative constraint: {brief['negative']}\n"
        f"Vary the sentence structure and avoid reusing stock influencer phrasing.{motion}"
    )

    return system, user