<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# I need you to dig deep into reddit and other platforms to find the perfect way to write prompts for different local AI image and video models. i added images of the ones i need for, so just find all you can and make a complete recipe for me. Im building a UI, and i use ollama as helper for enhancing my small short prompts that only describes the task in minor details. so ollama is supposed to make a full prompt for me.. I added images of the first models i need.

Absolutely — based on the model set you showed, the best approach is to build **one prompt enhancer per model family**, not one universal enhancer. The prompting rules differ a lot between WAN, LTX, Qwen, Chroma, Z-Image, and the edit/referential workflows, so your Ollama helper should rewrite the same short user intent into different structured prompt styles depending on the target model.[^1_1][^1_2][^1_3][^1_4][^1_5][^1_6]

## What the models want

For **WAN 2.2 Img2Vid / Vid2Vid / Story**, the strongest pattern is to describe **motion, camera behavior, and what should stay static**, because the source image already provides subject, scene, and style. Reddit and guide material consistently point toward “motion description + camera movement,” with explicit “static shot” wording when you want low drift.[^1_7][^1_3][^1_5][^1_1]

For **LTX Img2Vid** and similar motion models, the safest recipe is similar: keep the prompt compact, movement-focused, and grounded in visible elements, with only the necessary environment motion. A practical default is to define the subject, the exact movement, and any camera motion in a short sequence, rather than painting a whole new scene.[^1_5]

For **Chroma** and **Z-Image**, the winning style is much more **natural language**, often longer, more descriptive, and less tag-heavy. Chroma seems to respond well to repetition, conversational phrasing, and concrete lighting/background detail; Z-Image prompting trends toward rich, objective scene description and explicit handling of text if present.[^1_2][^1_8][^1_9][^1_10][^1_11]

For **Qwen Reference / Rapid Edit / Multi Angle**, the prompt should be an **edit instruction**, not a scene prompt: tell it what to preserve, what to replace, and what must remain unchanged. The most useful pattern is identity preservation plus targeted change, with short, direct instructions like “keep face, lighting, and pose” or “replace object X with Y while preserving shadows and composition.”[^1_12][^1_4][^1_13][^1_6]

For **FLUX2-Klein** and **Steady Dancer-style** generation, you can usually get better results by using a structured cinematic prompt with composition, lighting, material, atmosphere, and action, then letting the model expand aesthetically from that. These models tend to benefit from more complete scene framing than WAN-style motion prompts.[^1_9][^1_10]

## Prompt recipes

Here is the practical prompt recipe I’d use in your UI.


| Model family | Best prompt shape | What to emphasize | What to avoid |
| :-- | :-- | :-- | :-- |
| WAN 2.2 Img2Vid / Vid2Vid / Story | Motion + camera + stability | Specific physical movement, camera direction, static elements | New scene invention, overdescribing style already in image [^1_1][^1_7][^1_3][^1_5] |
| LTX Img2Vid / First-Last | Motion anchored to frames | Transition behavior between frames, subtle changes, continuity | Excessive scene description or conflicting actions [^1_5] |
| Chroma Simple / HD | Natural language paragraph | Subject, lighting, atmosphere, texture, repetition, realism cues | Tag soup, terse fragments, overly rigid syntax [^1_2][^1_8][^1_14] |
| Z-Image Txt2Img / Dual LoRA | Rich scene description | Composition, environment, subject placement, typography/text if needed | Meta-tags and vague “pretty” language [^1_10][^1_11] |
| Qwen Reference / Rapid Edit / Multi Angle | Edit instruction | Preserve identity/composition, specify exact change, constraints | Rewriting the whole image from scratch [^1_12][^1_13][^1_6] |
| FLUX2-Klein / cinematic gen | Structured creative brief | Setting, lighting, materials, atmosphere, action | Empty prompts, generic style words only [^1_9][^1_10] |

## Your Ollama enhancer

The cleanest architecture is:

1. User enters a short intent.
2. Your UI detects the target model family.
3. Ollama rewrites the intent using the model-specific template.
4. Optionally, a second pass adds negatives or constraints.

A good internal prompt for the enhancer is: **“Expand the user’s short idea into a model-specific generation prompt using only the rules for that target model. Preserve intent. Do not add contradictions. Prefer concrete details over hype.”** For edit models, make it output preserve/change constraints; for video models, make it output motion/camera constraints; for Chroma/Z-Image, make it output descriptive natural language.[^1_3][^1_10][^1_6][^1_1][^1_2][^1_12][^1_5]

## Model-specific templates

### WAN 2.2 template

Use this order:

- Subject and current state.
- Exact motion.
- Camera movement or “static shot.”
- Secondary motion in the scene.
- Constraints like “keep face, outfit, lighting, and background consistent.”

Example:
“A female elf in a moonlit forest. She slowly turns her head toward the camera, her hair and cloak moving gently in the wind. Static camera, subtle breathing motion, soft drifting particles, keep composition and character identity stable.”[^1_1][^1_7][^1_3][^1_5]

### LTX template

Use this order:

- Frame anchor or subject continuity.
- Primary motion.
- Secondary motion.
- Camera stability or limited movement.
- Keep visual identity stable.

Example:
“Portrait of an elf woman holding a glowing card. She tilts the card slightly and shifts her gaze while the ambient light flickers softly around her. Fixed camera, smooth subtle motion, preserve facial features, outfit, and scene continuity.”[^1_5]

### Chroma template

Use one or two natural paragraphs:

- Start with what the image is.
- Describe the subject, pose, environment, and lighting.
- Repeat the core concept lightly at the end if useful.

Example:
“This is a cinematic portrait of a young elf woman standing in a misty forest at night. She has glowing teal hair, soft expressive eyes, and delicate features, with moonlight and rim light shaping the scene. The atmosphere is magical and photorealistic, with detailed fabric, gentle particles, and soft ambient depth.”[^1_8][^1_14][^1_2][^1_9]

### Z-Image template

Use:

- Scene first.
- Subject second.
- Action third.
- Lighting and composition.
- Text instructions if the image contains text.

Example:
“A futuristic portrait of a young elf woman in a dark teal-lit environment, centered in frame, looking toward the viewer. The image should feel sharp, polished, and cinematic, with soft rim light, glowing energy accents, and a detailed background. If text appears, render it exactly and clearly.”[^1_10][^1_11]

### Qwen edit template

Use this structure:

- Keep X.
- Change Y.
- Preserve Z.
- Do not change A, B, C.

Example:
“Keep the subject’s face, pose, lighting, and background consistent. Replace the glowing crystal in her hand with a small holographic photo card. Preserve shadows, reflections, and the original composition.”[^1_4][^1_13][^1_6][^1_12]

## Negative prompt strategy

For video and edit models, keep negatives short and targeted. The most common useful exclusions are distortion, duplicate limbs, bad hands, warped face, flicker, jitter, text artifacts, and compositional drift. For Chroma and Z-Image, negatives can be simpler and less tag-heavy; avoid overloading the model with huge negative lists unless you’ve verified that helps your specific pipeline.[^1_2][^1_8][^1_12][^1_3][^1_4]

A good default negative set for your UI could be:

- low quality.
- blurry.
- warped face.
- extra fingers.
- duplicate limbs.
- flicker.
- jitter.
- inconsistent lighting.
- bad text.
- compositional drift.[^1_12][^1_3][^1_4]


## Recommended UI logic

I’d implement four prompt modes in the frontend:

- **Generate**: full scene creation.
- **Animate**: motion-only expansion for WAN/LTX.
- **Edit**: preserve-and-change instructions for Qwen.
- **Describe**: rich natural-language expansion for Chroma/Z-Image.

Then add a few sliders or switches:

- Motion strength.
- Camera motion.
- Identity preservation.
- Style richness.
- Text fidelity.
- Negative strictness.

That will let Ollama generate much better prompts than a one-size-fits-all enhancer, and it matches how people are actually getting the best results in community workflows.[^1_9][^1_1][^1_2][^1_12][^1_5]

## Best default prompt policy

If you want one universal rule for the enhancer, use this:

- For **video models**, rewrite into **motion-first** prompts.
- For **edit models**, rewrite into **constraint-first** prompts.
- For **text-to-image models**, rewrite into **scene-first** prompts.
- For **Chroma**, keep it natural and descriptive.
- For **WAN**, keep it conservative and physically grounded.
- For **Qwen edit**, never over-generate new scene elements unless asked.[^1_6][^1_3][^1_10][^1_1][^1_2][^1_12][^1_5]

I can turn this into a production-ready **prompt router schema** for your UI next, including JSON templates for each model and an Ollama system prompt.
<span style="display:none">[^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21]</span>

<div align="center">⁂</div>

[^1_1]: https://www.reddit.com/r/StableDiffusion/comments/1nicw7f/turning_simple_prompts_into_noice_scenes_with/%3Ftl=ru

[^1_2]: https://www.reddit.com/r/StableDiffusion/comments/1myew8m/chroma_prompting/

[^1_3]: https://www.veed.io/learn/wan-2-2-prompting-guide

[^1_4]: https://www.reddit.com/r/comfyui/comments/1n1n8j7/qwenimageedit_prompt_guide_the_complete_playbook/

[^1_5]: https://www.reddit.com/r/StableDiffusion/comments/1r9i0cz/wan_22_i2v_svi_prompt_adherence/

[^1_6]: https://www.reddit.com/r/StableDiffusion/comments/1miaxcj/qwen_image_editing/

[^1_7]: https://www.reddit.com/r/StableDiffusion/comments/1jvrsca/help_me_promptiong_wan_img2vid_has_mostly_bad/

[^1_8]: https://www.reddit.com/r/StableDiffusion/comments/1kdgm5g/chroma_is_next_level_something/

[^1_9]: https://www.reddit.com/r/StableDiffusion/comments/1t5aw29/system_prompt_chroma/

[^1_10]: https://www.reddit.com/r/StableDiffusion/comments/1p8mken/heres_the_official_system_prompt_used_to_rewrite/

[^1_11]: https://www.reddit.com/r/StableDiffusion/comments/1qm3ko3/how_to_prompt_zimage_turbo_looking_for_advice/

[^1_12]: https://www.reddit.com/r/StableDiffusion/comments/1qv336q/qwenimageeditrapidaio_how_to_avoid_plastic_skin/

[^1_13]: https://huggingface.co/Phr00t/Qwen-Image-Edit-Rapid-AIO/discussions/236

[^1_14]: https://www.reddit.com/r/StableDiffusion/comments/1lfb35f/spend_all_day_testing_chromait_just_too_good/

[^1_15]: image.jpg

[^1_16]: image-2.jpg

[^1_17]: https://www.reddit.com/r/StableDiffusion/comments/1me8zdg/prompt_strength_for_chroma_small_simple_example/

[^1_18]: https://www.youtube.com/watch?v=YZTvL8C_xz4

[^1_19]: https://www.reddit.com/r/civitai/comments/1qaxzzg/z_image_chatgpt_based_prompt/

[^1_20]: https://huggingface.co/Phr00t/Qwen-Image-Edit-Rapid-AIO/discussions/210

[^1_21]: https://www.reddit.com/r/StableDiffusion/comments/1paglpd/zimageturbo_prompt_trick/


---

# Yes, provide the JSON templates and Ollama system prompt now

Below is a ready-to-drop-in setup for your UI: a **single Ollama system prompt** plus **JSON templates** for each model family in your screenshot. Ollama’s structured output mode is the right fit here because it can be constrained with a JSON schema and works best when you also restate the schema in the prompt with temperature set low for deterministic output.[^2_1][^2_2]

## Ollama system prompt

Use this as the system message for the prompt enhancer:

```text
You are a prompt rewriting engine for local AI image and video models.

Your job is to expand a short user request into a model-specific generation prompt.
Follow the target model rules exactly.
Do not change the user's intent.
Do not add new subjects, actions, or style contradictions.
Prefer concrete, visible details over vague adjectives.
Return valid JSON only.

Core rules by model family:
- WAN 2.2 Img2Vid / Vid2Vid / Story: motion-first, camera-first, stability-aware. Describe only movement that can happen in the source image. Include camera behavior and specify what must remain stable.
- LTX Img2Vid / First-Last: continuity-first. Describe transition behavior between frames, motion progression, and identity stability.
- Chroma: natural language, descriptive, cinematic, slightly verbose. Repetition of the core concept is allowed if it improves adherence.
- Z-Image Txt2Img / Dual LoRA: scene-first, polished descriptive language, strong composition and lighting detail.
- Qwen Reference / Rapid Edit / Multi Angle: edit-first. Explicitly say what to keep, what to change, and what must remain unchanged.
- FLUX2-Klein: cinematic generation brief. Describe subject, environment, lighting, materials, and atmosphere clearly.
- FireRed Edit: edit-first and constraint-heavy. Preserve identity, composition, and photorealism unless the user asks otherwise.
- Steady Dancer: motion-focused but restrained. Keep dance motion smooth and stable, with gentle camera movement only.

Output requirements:
- Return strict JSON matching the requested schema.
- If a field is not needed, use an empty string or empty array.
- Never output markdown, code fences, or commentary.
- Keep prompts concise but complete.
```


## JSON schema

Use one schema for all models, then fill fields depending on the target.

```json
{
  "model_family": "string",
  "mode": "generate | animate | edit | describe",
  "positive_prompt": "string",
  "negative_prompt": "string",
  "style_notes": ["string"],
  "motion_notes": ["string"],
  "camera_notes": ["string"],
  "preserve_notes": ["string"],
  "edit_instructions": ["string"],
  "output_prompt": "string"
}
```


## Router template

This is the JSON object your UI can build before sending the request to Ollama:

```json
{
  "target_model": "wan_2_2_img2vid",
  "user_intent": "string",
  "reference_caption": "string",
  "reference_image_mode": true,
  "user_constraints": {
    "style": "string",
    "camera": "string",
    "motion": "string",
    "edit": "string",
    "quality": "string"
  }
}
```


## Model templates

### WAN 2.2 Img2Vid

Use this when the model is animating a single image.

```json
{
  "model_family": "wan",
  "mode": "animate",
  "positive_prompt": "Subject + exact motion + camera behavior + stability constraints.",
  "negative_prompt": "flicker, jitter, warped face, extra limbs, compositional drift, sudden scene change, text artifacts",
  "style_notes": ["Keep visual style aligned with the reference image."],
  "motion_notes": ["Describe only physically plausible movement visible in the reference."],
  "camera_notes": ["Use explicit camera verbs only if needed, otherwise static shot."],
  "preserve_notes": ["Preserve identity, outfit, lighting, background, and framing unless changed intentionally."],
  "edit_instructions": [],
  "output_prompt": "A cinematic portrait of an elf woman in a misty forest. She slowly turns her head toward the camera, hair moving gently in the wind. Static camera, subtle breathing motion, drifting particles, preserve face, outfit, lighting, and composition."
}
```


### WAN 2.2 Vid2Vid

Use this when you already have motion continuity.

```json
{
  "model_family": "wan",
  "mode": "animate",
  "positive_prompt": "Continuity-based motion across the clip with clear subject progression and smooth camera behavior.",
  "negative_prompt": "scene cut, flicker, jitter, morphing, identity drift, inconsistent motion, warped hands, unstable background",
  "style_notes": ["Maintain cinematic continuity."],
  "motion_notes": ["Describe progression from start state to end state."],
  "camera_notes": ["Specify camera movement only if it should clearly change."],
  "preserve_notes": ["Keep subject identity, scene layout, and style stable."],
  "edit_instructions": [],
  "output_prompt": "The character walks forward with steady pacing while the camera slowly pulls back to maintain framing. Keep the environment stable, motion smooth, and facial identity consistent throughout."
}
```


### WAN Story

Use this for story-like multi-beat motion.

```json
{
  "model_family": "wan",
  "mode": "animate",
  "positive_prompt": "Story beat sequence with clear motion progression, cinematic pacing, and stable identity.",
  "negative_prompt": "random action, flicker, abrupt cuts, identity drift, unstable framing, motion blur overload",
  "style_notes": ["Use cinematic language and clear scene beats."],
  "motion_notes": ["Write motion as 2 to 4 beats in order."],
  "camera_notes": ["Use simple camera movement aligned with story beats."],
  "preserve_notes": ["Keep the main character, setting, and mood consistent."],
  "edit_instructions": [],
  "output_prompt": "Beat 1: she stands still in the glowing forest. Beat 2: she raises her hand and the light intensifies. Beat 3: the camera slowly pushes in as particles swirl around her. Beat 4: she turns toward the viewer, keeping her identity and outfit stable."
}
```


### LTX Img2Vid

```json
{
  "model_family": "ltx",
  "mode": "animate",
  "positive_prompt": "Smooth subject motion, minimal drift, continuity-first framing, subtle camera movement.",
  "negative_prompt": "flicker, jitter, frame warping, morphing, identity drift, scene jump",
  "style_notes": ["Keep the motion elegant and controlled."],
  "motion_notes": ["Specify one main action and one secondary effect."],
  "camera_notes": ["Use locked-off camera or very gentle movement."],
  "preserve_notes": ["Preserve subject identity, lighting, and object placement."],
  "edit_instructions": [],
  "output_prompt": "A woman holds a glowing card and slowly turns it toward the light. Her hair moves softly, ambient particles drift in the background, and the camera remains mostly static with only a slight push-in."
}
```


### LTX First / Last

```json
{
  "model_family": "ltx",
  "mode": "animate",
  "positive_prompt": "Transition from first frame to last frame with smooth continuity and stable identity.",
  "negative_prompt": "frame tearing, warping, flicker, sudden pose changes, compositional drift",
  "style_notes": ["Keep the transition natural and coherent."],
  "motion_notes": ["Describe the path from start pose to end pose."],
  "camera_notes": ["Keep camera stable unless the shot depends on movement."],
  "preserve_notes": ["Preserve identity and lighting across both endpoints."],
  "edit_instructions": [],
  "output_prompt": "The subject begins facing left and gradually turns toward the viewer while maintaining the same lighting, outfit, and framing. The transition should be smooth and visually stable."
}
```


### Chroma Simple

```json
{
  "model_family": "chroma",
  "mode": "describe",
  "positive_prompt": "Natural language, cinematic, detailed, atmospheric, photorealistic or stylized as requested.",
  "negative_prompt": "bad anatomy, low detail, blurry, text artifacts, overexposed, flat lighting",
  "style_notes": ["Use descriptive prose rather than tags."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": [],
  "edit_instructions": [],
  "output_prompt": "A cinematic portrait of a young elf woman standing in a misty forest at night. She has glowing teal hair, soft expressive eyes, and delicate features, with moonlight shaping her face and the background fading into soft depth. The atmosphere is magical, detailed, and visually rich."
}
```


### Chroma HD

```json
{
  "model_family": "chroma",
  "mode": "describe",
  "positive_prompt": "High-detail natural language with strong atmosphere, light, texture, and composition.",
  "negative_prompt": "blurry, low detail, ugly face, broken anatomy, harsh noise, bad text",
  "style_notes": ["Repeat the core concept lightly if needed for adherence."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": [],
  "edit_instructions": [],
  "output_prompt": "A high-detail cinematic portrait of an elf woman in a dark teal-lit forest, centered in frame, with glowing particles in the air and soft rim light defining her face. The image feels polished, atmospheric, and richly textured."
}
```


### Z-Image Txt2Img

```json
{
  "model_family": "z_image",
  "mode": "generate",
  "positive_prompt": "Scene-first description with composition, lighting, subject, and atmosphere.",
  "negative_prompt": "cartoonish, low detail, blurry, warped face, text errors, cluttered background",
  "style_notes": ["Use a polished, direct, image-focused tone."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": [],
  "edit_instructions": [],
  "output_prompt": "A centered fantasy portrait of a young elf woman in a dark teal forest, with soft glowing energy around her, luminous hair, and cinematic rim lighting. The composition is clean and balanced, with crisp detail and a polished visual finish."
}
```


### Z-Image Dual LoRA

```json
{
  "model_family": "z_image",
  "mode": "generate",
  "positive_prompt": "Blend both LoRA concepts naturally while keeping the composition readable and clean.",
  "negative_prompt": "muddy fusion, conflicting styles, low detail, distorted face, bad hands",
  "style_notes": ["Balance both style concepts without forcing them."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": [],
  "edit_instructions": [],
  "output_prompt": "A fantasy portrait combining both character styles naturally, with consistent facial structure, harmonious color grading, and a clean cinematic composition. The lighting is soft and controlled, with detailed textures and strong subject clarity."
}
```


### FLUX2-Klein

```json
{
  "model_family": "flux2_klein",
  "mode": "generate",
  "positive_prompt": "Cinematic scene brief with subject, environment, materials, lighting, and atmosphere.",
  "negative_prompt": "generic, flat, low detail, blurry, low contrast, bad anatomy",
  "style_notes": ["Think like a film brief."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": [],
  "edit_instructions": [],
  "output_prompt": "A luminous elf woman stands in a futuristic ritual chamber surrounded by glowing blue sigils, wet reflective stone, and drifting particles. The scene is cinematic, highly detailed, and lit with soft teal rim light and subtle volumetric haze."
}
```


### FireRed Edit

```json
{
  "model_family": "firered_edit",
  "mode": "edit",
  "positive_prompt": "Preserve identity and composition while applying the requested edit cleanly and realistically.",
  "negative_prompt": "identity drift, warped face, changed background, extra limbs, bad blending, overprocessed skin",
  "style_notes": ["Keep the edit natural and photorealistic unless otherwise requested."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": ["Keep face, pose, lighting, and background consistent."],
  "edit_instructions": ["Apply only the requested change."],
  "output_prompt": "Keep the subject’s face, pose, and lighting unchanged. Replace the glowing object in her hand with a small holographic photo card, matching reflections, shadows, and perspective."
}
```


### Qwen Reference

```json
{
  "model_family": "qwen_reference",
  "mode": "edit",
  "positive_prompt": "Reference-driven edit with strict identity preservation and target changes only.",
  "negative_prompt": "drift, distortion, scene rewrite, mismatched lighting, face swap artifacts",
  "style_notes": ["Be explicit and constraint-heavy."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": ["Preserve identity, pose, composition, and overall scene structure."],
  "edit_instructions": ["Specify the exact reference elements to use."],
  "output_prompt": "Use the subject from image one. Keep the face, hair, and pose consistent. Transfer the outfit style from image two while preserving lighting, framing, and background."
}
```


### Qwen Rapid Edit

```json
{
  "model_family": "qwen_edit_rapid",
  "mode": "edit",
  "positive_prompt": "Fast, direct, constraint-driven edit instruction.",
  "negative_prompt": "plastic skin, warping, identity drift, background corruption, artifacts",
  "style_notes": ["Keep instructions short and unambiguous."],
  "motion_notes": [],
  "camera_notes": [],
  "preserve_notes": ["Keep everything else unchanged."],
  "edit_instructions": ["State one main edit only when possible."],
  "output_prompt": "Change the sign text to GRAND OPENING. Keep the font style, color, size, perspective, lighting, and background unchanged."
}
```


### Qwen Multi Angle

```json
{
  "model_family": "qwen_multi_angle",
  "mode": "describe",
  "positive_prompt": "Multiple angle consistency with one character identity preserved across views.",
  "negative_prompt": "identity drift, inconsistent face, angle mismatch, duplicate artifacts",
  "style_notes": ["Describe the same subject from several viewpoints."],
  "motion_notes": [],
  "camera_notes": ["Specify front, left, right, and three-quarter views if needed."],
  "preserve_notes": ["Keep facial identity and outfit consistent across all angles."],
  "edit_instructions": [],
  "output_prompt": "The same elf woman shown from multiple angles, with consistent facial identity, hairstyle, outfit, and lighting. Front view in the center, with smaller supporting views from left and right."
}
```


## Suggested API shape

Here is a compact request payload for your UI:

```json
{
  "model": "wan_2_2_img2vid",
  "user_prompt": "make her turn and smile in the wind",
  "mode": "animate",
  "style": "cinematic",
  "strength": "medium",
  "preserve_identity": true
}
```


## Best implementation rule

For your enhancer, keep the rewrite step simple:

- one short user prompt in.
- one structured JSON object out.
- one final flattened prompt field for the generator.

That gives you validation, easier debugging, and model-specific prompt quality without making the UI brittle.[^2_2][^2_1]

Would you like the next step as a **TypeScript schema + Ollama request code** for your UI?
<span style="display:none">[^2_10][^2_11][^2_12][^2_3][^2_4][^2_5][^2_6][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://docs.ollama.com/capabilities/structured-outputs

[^2_2]: https://ollama.com/blog/structured-outputs

[^2_3]: image.jpg

[^2_4]: image-2.jpg

[^2_5]: https://aikolhub.com/mastering-camera-control-in-wan-2-2-workflow-how-to-guide/

[^2_6]: https://www.reddit.com/r/Qwen_AI/comments/1n1vyug/qwenimageedit_prompt_guide_the_complete_playbook/

[^2_7]: https://gemma4-ai.com/blog/gemma4-json-output

[^2_8]: https://shshell.com/blog/ollama-module-9-lesson-4

[^2_9]: https://www.reddit.com/r/StableDiffusion/comments/1p54o54/wan_22_faster_motion_with_prompting_part_1/

[^2_10]: https://wan-animate.com/posts/how-to-use-i2v-prompting-wan-2-2-animate-guide

[^2_11]: https://www.reddit.com/r/StableDiffusion/comments/1p91c96/wan_22_does_including_setting_camera_scene_etc_in/

[^2_12]: https://www.veed.io/learn/wan-2-2-prompting-guide

