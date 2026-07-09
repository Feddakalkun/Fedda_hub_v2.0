/**
 * TransformReelPage — the viral "beat-drop transformation" reel:
 * photo → character version of the same frame (Qwen Rapid Edit, pose/face kept)
 * → LTX First/Last Frame morphs between the two → vertical reel clip.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Music, Sparkles, Wand2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { useToast } from '../../components/ui/Toast';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { Field } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { ChipGroup, GenerateButton, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { Lightbox } from '../../components/ui/Lightbox';
import { cn, inputBase } from '../../lib/styles';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, getSafeLtxAspect, type LtxRatio, type LtxResolution } from '../../config/ltx';

// Written photographically — real fabrics, real fit, same light as the source photo —
// so the edit reads as a real photo, not a costume-shop render.
const CHARACTER_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: 'Red Latex', prompt: 'a skin-tight glossy red latex mini dress that hugs every curve, deep neckline, the latex catching real specular highlights from the scene lighting, black stiletto heels, smoky evening makeup, hair styled loose' },
  { label: 'Lingerie', prompt: 'a black lace lingerie set - underwired balconette bra, matching high-cut briefs, a garter belt with sheer thigh-high stockings - real delicate lace texture against her skin, a thin gold body chain, bedroom-glam makeup' },
  { label: 'Club Dress', prompt: 'a backless skin-tight black satin mini dress with a cowl neck, the satin draping and creasing naturally, strappy heels, a small clutch, glowing evening makeup with glossy lips, styled waves' },
  { label: 'Bikini', prompt: 'a tiny bronze string bikini with thin ties at the hips, real sunlit skin with a natural sheen, wet-look hair pushed back, barefoot, delicate anklet and layered necklaces' },
  { label: 'Biker', prompt: 'tight black leather pants and a cropped leather biker jacket worn open over a black lace bralette, the leather creased and worn like real hide, chunky boots, silver rings, tousled hair, bold eyeliner' },
  { label: 'Bunny', prompt: 'a classic black satin bunny corset outfit with a white collar and cuffs, sheer black tights, tall black ears, the satin reflecting the room light realistically, red lipstick and winged liner' },
  { label: 'Devil', prompt: 'a sexy devil look shot like a real photoshoot - a tight red vinyl corset dress with a sweetheart neckline, small red horns in her hair, long red gloves, sheer black stockings, dramatic red-and-black makeup' },
  { label: 'Angel', prompt: 'a white silk slip mini dress with delicate lace trim, thin straps slipping off one shoulder, soft feathered wings behind her, dewy glowing skin, pearl jewelry, soft romantic makeup' },
  { label: 'Fishnet Goth', prompt: 'a black mesh long-sleeve top over a black bra, a leather mini skirt with a studded belt, ripped fishnet tights, platform boots, layered chokers, dark lipstick and smudged black eyeliner' },
  { label: 'Cosplay Armor', prompt: 'a form-fitting fantasy armor set that looks practically built - a molded chest piece over a black bodysuit, layered thigh plates, worn metal with real scratches and reflections, a long braid, subtle scar makeup' },
  { label: 'Sporty', prompt: 'a matching seamless sports bra and high-waisted gym leggings hugging her curves, a light sweat sheen on toned skin, athletic and real, gym-lit' },
  { label: 'Evening Gown', prompt: 'a floor-length silk evening gown with a thigh-high slit and a plunging back, the fabric draping and catching light realistically, statement earrings, red-carpet glam makeup' },
  { label: 'Schoolgirl', prompt: 'a plaid pleated mini skirt with a fitted white blouse tied at the waist, knee-high socks and mary-jane heels, playful, real cotton and pleats' },
  { label: 'Maid', prompt: 'a classic black-and-white maid dress with a lace apron, ruffled trim and a choker, real satin sheen and lace texture, styled hair' },
  { label: 'Wet Look', prompt: 'a soaked sheer white tank top clinging to her skin over a bikini top and tiny denim shorts, water droplets on her body, bright sunlit realism' },
  { label: 'Winter Glam', prompt: 'an open cream fur coat over a matching knit bralette and mini skirt, thigh-high boots, cold rosy skin, breath-in-the-air realism' },
];

// Hair presets — used when the Inpaint "Hair" toggle is on (real, describable styles).
const HAIR_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: 'Platinum Waves', prompt: 'long platinum blonde soft waves with natural shine' },
  { label: 'Jet Black', prompt: 'sleek jet-black long straight hair with a middle part' },
  { label: 'Red Curls', prompt: 'fiery red bouncy shoulder-length curls' },
  { label: 'Beach Brown', prompt: 'honey-brown tousled beach waves' },
  { label: 'Silver', prompt: 'long silver-white straight hair, glossy' },
  { label: 'Pink Pastel', prompt: 'soft pastel-pink wavy hair' },
  { label: 'Pixie', prompt: 'a short dark textured pixie cut' },
  { label: 'Braided', prompt: 'long dark hair in a sleek braid with soft baby hairs' },
];

// Accessory presets — used when the Inpaint "Accessories" toggle is on.
const ACCESSORY_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: 'Gold Hoops', prompt: 'gold hoop earrings and thin layered gold necklaces' },
  { label: 'Diamond Choker', prompt: 'a sparkling diamond choker and matching drop earrings' },
  { label: 'Sunglasses', prompt: 'oversized designer sunglasses pushed into her hair' },
  { label: 'Body Chain', prompt: 'a delicate silver body chain and anklet' },
  { label: 'Rings', prompt: 'chunky silver rings and stacked bracelets' },
  { label: 'Pearls', prompt: 'pearl stud earrings and a delicate pearl pendant' },
];

// Scene / setting presets — photographic, so the new background reads as a real place.
const SCENE_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: 'Nightclub', prompt: 'a dark nightclub with colored laser lights, haze in the air, a crowd blurred behind her, neon signs glowing, real club atmosphere' },
  { label: 'Beach Sunset', prompt: 'a tropical beach at golden-hour sunset, wet sand and gentle waves behind her, warm rim light, palm silhouettes, real seaside haze' },
  { label: 'Penthouse', prompt: 'a luxury penthouse at night with floor-to-ceiling windows overlooking a glittering city skyline, warm interior lamps, marble and glass' },
  { label: 'Neon Street', prompt: 'a rainy neon city street at night, wet reflective asphalt, glowing shop signs in Japanese and English, bokeh headlights, cinematic cyberpunk mood' },
  { label: 'Red Carpet', prompt: 'a red carpet event with camera flashes going off, a step-and-repeat backdrop, velvet ropes, glamorous paparazzi lighting' },
  { label: 'Throne Room', prompt: 'a grand fantasy throne room with towering stone pillars, torch fire, banners and a golden throne, dramatic volumetric light' },
  { label: 'Rooftop Pool', prompt: 'a luxury rooftop infinity pool at dusk, city skyline behind, string lights, turquoise water reflections, warm summer air' },
  { label: 'Snow Forest', prompt: 'a quiet snow-covered pine forest at blue hour, soft falling snow, cold blue light with a warm rim, breath visible in the air' },
  { label: 'Desert Dunes', prompt: 'golden desert sand dunes under a low warm sun, wind lifting fine sand, long shadows, epic cinematic scale' },
  { label: 'Cathedral', prompt: 'a vast gothic cathedral interior with stained-glass light beams, stone arches, dust in the air, moody dramatic lighting' },
];

// Transition styles — music-video moves, not a soft glow morph.
const TRANSITION_STYLES: Array<{ label: string; prompt: string }> = [
  {
    label: 'Whip Spin',
    prompt:
      'She spins fast on her heel, hair whipping across the frame. At the peak of the spin a single hard white '
      + 'flash fills the frame for a split second, and as she completes the turn she is wearing the new outfit. '
      + 'She lands the pose sharply and holds it, chin up, confident smirk. Fast snappy motion, music-video pacing, '
      + 'crisp focus, energetic, no slow motion.',
  },
  {
    label: 'Hard Flash',
    prompt:
      'She looks straight into the camera and snaps her fingers. The frame whites out in a hard camera flash for '
      + 'two frames, and when it clears she is in the new outfit in the exact same stance, one eyebrow raised. '
      + 'The camera does a quick subtle push-in as she rolls her shoulders back. Punchy, clean, editorial pacing.',
  },
  {
    label: 'Hair Flip',
    prompt:
      'She throws her head down and whips her hair back up in one fluid motion. Behind the curtain of moving hair '
      + 'her outfit changes, revealed as the hair settles. She runs a hand through it and locks eyes with the '
      + 'camera. Smooth but fast, glossy music-video energy, sharp focus on her face.',
  },
  {
    label: 'Shockwave',
    prompt:
      'She stomps one heel and a fast shockwave ripples up her body from the floor, converting her outfit to the '
      + 'new look as it passes, dust and small debris kicking up around her feet. She squares her shoulders and '
      + 'stares down the camera. Powerful, cinematic, quick.',
  },
  {
    label: 'Walk Toward',
    prompt:
      'She struts confidently toward the camera, hips swaying, in the new outfit from the first step. A quick low-angle '
      + 'shot as she approaches, hair bouncing, holding eye contact with a slow smirk. Glossy fashion-film look, '
      + 'shallow depth of field, smooth steady motion, high detail on fabric and skin.',
  },
  {
    label: 'Slow Reveal',
    prompt:
      'The camera slowly tilts up her body from her heels to her face, revealing the new outfit piece by piece, ending '
      + 'on her confident gaze into the lens. Cinematic, sensual, unhurried, warm key light, crisp focus, film grain.',
  },
  {
    label: 'Energy Sweep',
    prompt:
      'A burst of glowing energy sweeps across her body and her outfit seamlessly transforms into the new look. '
      + 'She holds the same pose with a confident expression, camera static, cinematic lighting, sparkling '
      + 'particles and light streaks during the transformation.',
  },
];

const DEFAULT_MORPH_PROMPT = TRANSITION_STYLES[0].prompt;

export const TransformReelPage = () => {
  const [sourceFilename, setSourceFilename] = usePersistentState<string | null>('treel_source_file', null);
  const [sourceUploading, setSourceUploading] = useState(false);
  const [characterPrompt, setCharacterPrompt] = usePersistentState('treel_character_prompt', CHARACTER_PRESETS[0].prompt);
  const [changeScene, setChangeScene] = usePersistentState('treel_change_scene', false);
  const [scenePrompt, setScenePrompt] = usePersistentState('treel_scene_prompt', SCENE_PRESETS[0].prompt);
  const [morphPrompt, setMorphPrompt] = usePersistentState('treel_morph_prompt', DEFAULT_MORPH_PROMPT);
  const [transformedUrl, setTransformedUrl] = usePersistentState<string | null>('treel_transformed_url', null);
  const [transformedInput, setTransformedInput] = usePersistentState<string | null>('treel_transformed_input', null);
  const [transforming, setTransforming] = useState(false);
  const [aspectRatio, setAspectRatio] = usePersistentState('treel_ar', '9:16');
  const [resolution, setResolution] = usePersistentState<LtxResolution>('treel_res', 'M');
  const [lengthSec, setLengthSec] = usePersistentState('treel_len', 3);
  const [beatFilename, setBeatFilename] = usePersistentState<string | null>('treel_beat_file', null);
  const [beatUploading, setBeatUploading] = useState(false);
  const [beatDropSec, setBeatDropSec] = usePersistentState('treel_beat_drop', 0);
  const [beatUrl, setBeatUrl] = useState('');
  const [beatUrlLoading, setBeatUrlLoading] = useState(false);
  const [muxing, setMuxing] = useState(false);
  // Which model makes the character frame
  const [editModel, setEditModel] = usePersistentState<'fast' | 'quality' | 'inpaint'>('treel_edit_model', 'fast');
  // Inpaint mode: which regions to also repaint (clothing is always on)
  const [inpaintBody, setInpaintBody] = usePersistentState('treel_inpaint_body', true);
  const [inpaintHair, setInpaintHair] = usePersistentState('treel_inpaint_hair', false);
  const [inpaintBackground, setInpaintBackground] = usePersistentState('treel_inpaint_bg', false);
  const [inpaintAccessories, setInpaintAccessories] = usePersistentState('treel_inpaint_acc', false);
  const [hairPrompt, setHairPrompt] = usePersistentState('treel_hair_prompt', HAIR_PRESETS[0].prompt);
  const [accessoryPrompt, setAccessoryPrompt] = usePersistentState('treel_accessory_prompt', ACCESSORY_PRESETS[0].prompt);
  // Character-frame (Qwen img2img) controls
  const [editStrength, setEditStrength] = usePersistentState('treel_edit_strength', 0.85);
  const [editCfg, setEditCfg] = usePersistentState('treel_edit_cfg', 1.0);
  const [editSteps, setEditSteps] = usePersistentState('treel_edit_steps', 8);
  // Morph (LTX FLF) control
  const [morphGuide, setMorphGuide] = usePersistentState('treel_morph_guide', 0.85);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'ltx-flf',
    currentKey: 'treel_current_video',
    historyKey: 'treel_history',
    outputKind: 'video',
    readyMessage: 'Transformation reel ready',
  });

  const sourcePreview = sourceFilename ? `/comfy/view?filename=${encodeURIComponent(sourceFilename)}&type=input` : null;

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  // One-time migration: users who stored the old soft "energy sweep" default get the punchier Whip Spin
  useEffect(() => {
    if (morphPrompt.startsWith('A burst of glowing energy sweeps across her body')) {
      setMorphPrompt(DEFAULT_MORPH_PROMPT);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadSource = async (file: File) => {
    setSourceUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setSourceFilename(data.filename);
      setTransformedUrl(null);
      setTransformedInput(null);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setSourceUploading(false);
    }
  };

  const uploadSourceFromUrl = async (url: string) => {
    setSourceUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await uploadSource(new File([blob], 'transform-source.png', { type: blob.type || 'image/png' }));
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
      setSourceUploading(false);
    }
  };

  // Upload your own "after" / last frame directly (skip generation)
  const uploadAfterFrame = async (file: File) => {
    setTransforming(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setTransformedInput(data.filename);
      setTransformedUrl(`/comfy/view?filename=${encodeURIComponent(data.filename)}&type=input`);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setTransforming(false);
    }
  };

  const uploadAfterFromUrl = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await uploadAfterFrame(new File([blob], 'transform-after.png', { type: blob.type || 'image/png' }));
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
    }
  };

  // Consume a "Send to Workflow" handoff image on first mount
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) uploadSourceFromUrl(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Source photo's dimensions scaled to ~1024 on the long side, snapped to /8 — keeps the edit in the same aspect ratio. */
  const getSourceDims = (): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      if (!sourcePreview) { resolve({ w: 768, h: 768 }); return; }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
        resolve({
          w: Math.max(64, Math.round((img.naturalWidth * scale) / 8) * 8),
          h: Math.max(64, Math.round((img.naturalHeight * scale) / 8) * 8),
        });
      };
      img.onerror = () => resolve({ w: 768, h: 768 });
      img.src = sourcePreview;
    });

  /** Runs the Qwen edit and stages the result as a ComfyUI input; returns the staged filename. */
  const createCharacterFrame = async (): Promise<string | null> => {
    if (!sourceFilename || !characterPrompt.trim() || transforming) return null;
    let stagedName: string | null = null;
    setTransforming(true);
    setTransformedUrl(null);
    setTransformedInput(null);
    try {
      const dims = await getSourceDims();
      const negative = 'blurry, low quality, deformed, different pose, different person, same clothes, unchanged outfit, '
        + 'costume party look, cosplay prop, plastic, CGI, 3d render, doll, airbrushed, cartoon, illustration, studio backdrop';
      const seed = Math.floor(Math.random() * 10_000_000_000);

      let reqBody: { workflow_id: string; params: Record<string, unknown> };
      if (editModel === 'inpaint') {
        // Inpaint keeps face + hair + background pixel-locked; only clothing/body is repainted.
        reqBody = {
          workflow_id: 'sdxl-inpaint-automask',
          params: {
            image: sourceFilename,
            width: dims.w,
            height: dims.h,
            preresize_min_width: dims.w,
            preresize_min_height: dims.h,
            denoise: editStrength,
            cfg: editCfg,
            steps: Math.max(editSteps, 20),
            seed,
            prompt: `a woman wearing ${characterPrompt.trim()}`
              + (inpaintHair && hairPrompt.trim() ? `, ${hairPrompt.trim()}` : '')
              + (inpaintAccessories && accessoryPrompt.trim() ? `, wearing ${accessoryPrompt.trim()}` : '')
              + (inpaintBackground && scenePrompt.trim() ? `, background is ${scenePrompt.trim()}` : '')
              + ', real fabric with natural folds and sheen, natural skin texture, photorealistic, sharp focus, same body and pose',
            negative,
            mask_clothes: true,
            mask_body: inpaintBody,
            mask_face: false,
            mask_hair: inpaintHair,
            mask_accessories: inpaintAccessories,
            mask_background: inpaintBackground,
          },
        };
      } else {
        // Fast (rapid, img2img) or Quality (2509, reference-conditioned from empty latent)
        reqBody = {
          workflow_id: editModel === 'quality' ? 'qwen-edit-2509-image-reference' : 'qwen-rapid-edit-v23',
          params: {
            image: sourceFilename,
            width: dims.w,
            height: dims.h,
            denoise: editModel === 'quality' ? 1.0 : editStrength,
            cfg: editCfg,
            steps: editSteps,
            prompt: (changeScene && scenePrompt.trim())
              ? (
                `Change her outfit and her surroundings: she is now wearing ${characterPrompt.trim()}, `
                + `and the background is now ${scenePrompt.trim()}. `
                + 'Completely replace both her clothing and the background. The result must look like a REAL PHOTOGRAPH '
                + 'of her - real fabric with natural folds, weight and sheen, natural skin texture, the outfit fitting '
                + 'her body believably, and lighting on her that matches the new environment. '
                + 'Keep the exact same pose, same face, same body position and same camera framing and distance.'
              )
              : (
                `Change her outfit: she is now wearing ${characterPrompt.trim()}. `
                + 'Completely replace her clothing. The result must look like a REAL PHOTOGRAPH of her - real fabric '
                + 'with natural folds, weight and sheen, natural skin texture, the outfit fitting her body believably, '
                + 'and the same lighting, color grade and grain as the original photo. '
                + 'Keep the exact same pose, same face, same body position, same camera framing and same background.'
              ),
            negative,
            seed,
          },
        };
      }

      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Transform failed to start');

      const promptId: string = data.prompt_id;
      await new Promise<void>((resolve, reject) => {
        let ticks = 0;
        pollRef.current = window.setInterval(async () => {
          ticks += 1;
          if (ticks > 120) { // 10 minutes
            if (pollRef.current) window.clearInterval(pollRef.current);
            reject(new Error('Transform timed out'));
            return;
          }
          try {
            const statusRes = await fetch(
              `${BACKEND_API.BASE_URL}/api/generate/status/${promptId}?workflow_id=${encodeURIComponent(reqBody.workflow_id)}`,
            );
            const status = await statusRes.json();
            if (status.status !== 'completed') return;
            if (pollRef.current) window.clearInterval(pollRef.current);
            const images: Array<{ filename: string; subfolder: string; type: string }> = status.images ?? [];
            if (!images.length) { reject(new Error('Transform finished but returned no image')); return; }
            const img = images[images.length - 1];
            const outUrl = `/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
            setTransformedUrl(outUrl);

            // Re-upload the output as a ComfyUI input so LTX FLF can use it as the last frame
            const blob = await (await fetch(outUrl)).blob();
            const form = new FormData();
            form.append('file', new File([blob], 'transform-character.png', { type: blob.type || 'image/png' }));
            const upRes = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
            const upData = await upRes.json();
            if (!upData.success) { reject(new Error(upData.detail || 'Could not stage character frame')); return; }
            setTransformedInput(upData.filename);
            stagedName = upData.filename;
            resolve();
          } catch {
            /* transient poll errors are fine */
          }
        }, 5000);
      });
      toast('Character frame ready', 'success');
    } catch (err: any) {
      toast(err.message || 'Transform failed', 'error');
    } finally {
      setTransforming(false);
    }
    return stagedName;
  };

  const generateMorph = (lastFrameOverride?: string) => {
    const lastFrame = lastFrameOverride ?? transformedInput;
    if (!sourceFilename || !lastFrame || run.isGenerating) return;
    const dims = getLtxDimensions(aspectRatio, resolution);
    run.start({
      image_first: sourceFilename,
      image_last: lastFrame,
      prompt: morphPrompt.trim() || DEFAULT_MORPH_PROMPT,
      aspect_ratio: getSafeLtxAspect(aspectRatio),
      direction: aspectRatio === '9:16' || aspectRatio === '3:4' ? 'Vertical' : 'Horizontal',
      width: dims.width,
      height: dims.height,
      length_seconds: lengthSec,
      seed: Math.floor(Math.random() * 10_000_000_000),
      guide_strength_first: morphGuide,
      guide_strength_last: morphGuide,
    });
  };

  /** Full pipeline in one click: character frame → auto-start the morph video. */
  const autoGenerate = async () => {
    const staged = await createCharacterFrame();
    if (staged) generateMorph(staged);
  };

  const uploadBeat = async (file: File) => {
    setBeatUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setBeatFilename(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setBeatUploading(false);
    }
  };

  /** Pull audio from a TikTok / Instagram / YouTube (or any yt-dlp) link and use it as the beat. */
  const loadBeatFromUrl = async () => {
    const u = beatUrl.trim();
    if (!u || beatUrlLoading) return;
    setBeatUrlLoading(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/download-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not fetch audio from link');
      setBeatFilename(data.filename); // the mux step extracts the audio track from it
      toast('Audio loaded from link', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not fetch audio from link', 'error');
    } finally {
      setBeatUrlLoading(false);
    }
  };

  /** Mux the beat track onto the current reel — the drop lands on the morph midpoint. */
  const addBeatToReel = async () => {
    if (!run.currentMedia || !beatFilename || muxing) return;
    setMuxing(true);
    try {
      const params = new URLSearchParams(run.currentMedia.split('?')[1] ?? '');
      const videoFilename = params.get('filename') ?? '';
      if (!videoFilename) throw new Error('No reel selected');
      // Morph peaks around the middle of the clip; start the audio so the drop lands there
      const offset = Math.max(0, beatDropSec - lengthSec / 2);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/mux-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_filename: videoFilename,
          video_subfolder: params.get('subfolder') ?? '',
          audio_filename: beatFilename,
          audio_offset_sec: offset,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'Mux failed');
      const url = `/comfy/view?filename=${encodeURIComponent(data.filename)}&subfolder=&type=output`;
      run.setCurrentMedia(url);
      run.setHistory((prev) => [url, ...prev.filter((u) => u !== url)]);
      toast('Beat added — reel has audio now', 'success');
    } catch (err: any) {
      toast(err.message || 'Adding audio failed', 'error');
    } finally {
      setMuxing(false);
    }
  };

  const dims = getLtxDimensions(aspectRatio, resolution);
  const canTransform = !!sourceFilename && !!characterPrompt.trim() && !transforming;
  const canMorph = !!sourceFilename && !!transformedInput && !run.isGenerating && !transforming;
  const canAuto = !!sourceFilename && !!characterPrompt.trim() && !transforming && !run.isGenerating;

  return (
    <WorkflowShell
      title="Transform Reel"
      eyebrow="Qwen + LTX 2.3"
      description="The viral beat-drop transformation: photo → character version of the same frame → seamless morph video."
      icon={Wand2}
      isGenerating={run.isGenerating || transforming}
      canGenerate={canMorph}
      workflowId="ltx-flf"
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="Transformation Reels"
          emptyHint="Create a character frame, then morph — the reel lands here."
        />
      )}
    >
      <div className="space-y-4">
        {/* Step 1 — source + character */}
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
          <WorkflowSection title="1 · Source Photo">
            <UploadSlot
              preview={sourcePreview}
              uploading={sourceUploading}
              onFile={uploadSource}
              onUrl={uploadSourceFromUrl}
              label="Source Photo"
              hint="The 'before' — her normal look"
              onClear={() => { setSourceFilename(null); setTransformedUrl(null); setTransformedInput(null); }}
            />
          </WorkflowSection>

          <WorkflowSection title="2 · Character">
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {CHARACTER_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCharacterPrompt(p.prompt)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                      characterPrompt === p.prompt
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                        : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea
                value={characterPrompt}
                onChange={(e) => setCharacterPrompt(e.target.value)}
                placeholder="Describe who she becomes..."
                className={cn(inputBase, 'min-h-[72px] resize-y')}
              />

              {/* Scene / setting — optional background change */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Change scene too</span>
                  <input
                    type="checkbox"
                    checked={changeScene}
                    onChange={(e) => setChangeScene(e.target.checked)}
                  />
                </label>
                {changeScene && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {SCENE_PRESETS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => setScenePrompt(s.prompt)}
                          className={cn(
                            'rounded-lg border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all',
                            scenePrompt === s.prompt
                              ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                              : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10',
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={scenePrompt}
                      onChange={(e) => setScenePrompt(e.target.value)}
                      placeholder="Describe the new setting / background..."
                      className={cn(inputBase, 'min-h-[56px] resize-y text-[12px]')}
                    />
                    <p className="text-[9px] text-white/25">
                      Changing the scene is a bigger edit — bump Edit Strength up (0.9+) if the background doesn't change enough.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/25">Edit model</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditModel('fast')}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest transition-all',
                      editModel === 'fast' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10',
                    )}
                  >
                    Fast
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModel('quality')}
                    title="Qwen Image Edit 2509 — flexible, can change scene, but regenerates the whole frame (face/hair may drift)"
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest transition-all',
                      editModel === 'quality' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10',
                    )}
                  >
                    Quality
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModel('inpaint')}
                    title="SDXL automask inpaint — repaints ONLY the clothing; face, hair and background stay pixel-identical. Best for keeping her exactly."
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest transition-all',
                      editModel === 'inpaint' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10',
                    )}
                  >
                    Inpaint
                  </button>
                </div>
              </div>
              {editModel === 'inpaint' && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-2">
                  <p className="text-[9px] text-white/30">
                    Locks her face and pose. Outfit always changes — optionally also repaint:
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/50">
                      <input type="checkbox" checked={inpaintBody} onChange={(e) => setInpaintBody(e.target.checked)} />
                      Body
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/50">
                      <input type="checkbox" checked={inpaintHair} onChange={(e) => setInpaintHair(e.target.checked)} />
                      Hair
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/50">
                      <input type="checkbox" checked={inpaintAccessories} onChange={(e) => setInpaintAccessories(e.target.checked)} />
                      Accessories
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/50">
                      <input type="checkbox" checked={inpaintBackground} onChange={(e) => setInpaintBackground(e.target.checked)} />
                      Background
                    </label>
                  </div>
                  {inpaintHair && (
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-1">
                        {HAIR_PRESETS.map((h) => (
                          <button key={h.label} type="button" onClick={() => setHairPrompt(h.prompt)}
                            className={cn('rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-all',
                              hairPrompt === h.prompt ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10')}>
                            {h.label}
                          </button>
                        ))}
                      </div>
                      <input type="text" value={hairPrompt} onChange={(e) => setHairPrompt(e.target.value)}
                        placeholder="Describe the hair..." className={cn(inputBase, 'text-[11px]')} />
                    </div>
                  )}
                  {inpaintAccessories && (
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-1">
                        {ACCESSORY_PRESETS.map((a) => (
                          <button key={a.label} type="button" onClick={() => setAccessoryPrompt(a.prompt)}
                            className={cn('rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-all',
                              accessoryPrompt === a.prompt ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10')}>
                            {a.label}
                          </button>
                        ))}
                      </div>
                      <input type="text" value={accessoryPrompt} onChange={(e) => setAccessoryPrompt(e.target.value)}
                        placeholder="Describe accessories..." className={cn(inputBase, 'text-[11px]')} />
                    </div>
                  )}
                  {inpaintBackground && (
                    <p className="text-[9px] text-white/25">
                      Background uses the Scene picked below — turn on "Change scene too" to choose one.
                    </p>
                  )}
                  <p className="text-[9px] text-white/25">
                    Makeup-only and pose change aren't possible in inpaint (they'd repaint the face / need a full regenerate) — use Quality for those.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={autoGenerate}
                  disabled={!canAuto}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {(transforming || run.isGenerating) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {transforming ? 'Step 1/2 — character frame…' : run.isGenerating ? 'Step 2/2 — morph video…' : 'Auto — Photo to Reel'}
                </button>
                <button
                  type="button"
                  onClick={() => { void createCharacterFrame(); }}
                  disabled={!canTransform}
                  title="Only create the character frame (re-roll until you like it, then morph manually below)"
                  className="flex items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Frame Only
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[9px] font-black uppercase tracking-widest text-white/25 transition-colors hover:text-white/50"
              >
                {showAdvanced ? '− Advanced controls' : '+ Advanced controls'}
              </button>
              {showAdvanced && (
                <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-2.5">
                  <SliderField
                    label="Edit Strength (Fast model only)"
                    value={editStrength}
                    onChange={setEditStrength}
                    min={0.4}
                    max={1}
                    step={0.05}
                    format={(v) => editModel === 'quality' ? 'ignored — Quality uses full denoise' : `${v.toFixed(2)} — low keeps her, high changes more`}
                  />
                  <SliderField
                    label="Edit CFG"
                    value={editCfg}
                    onChange={setEditCfg}
                    min={1}
                    max={7}
                    step={0.5}
                    format={(v) => `${v.toFixed(1)} — how hard it follows the costume prompt`}
                  />
                  <SliderField
                    label="Edit Steps"
                    value={editSteps}
                    onChange={setEditSteps}
                    min={4}
                    max={20}
                    step={1}
                    format={(v) => `${v} (rapid AIO — 8 is plenty)`}
                  />
                  <SliderField
                    label="Morph Keyframe Lock"
                    value={morphGuide}
                    onChange={setMorphGuide}
                    min={0.5}
                    max={1}
                    step={0.05}
                    format={(v) => `${v.toFixed(2)} — how tightly the video hits both frames`}
                  />
                </div>
              )}
            </div>
          </WorkflowSection>
        </div>

        {/* Before → After keyframes (drop your own, or let the character step fill the after) */}
        <WorkflowSection title="Before → After">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-white/25">Before · first frame</p>
              <UploadSlot
                preview={sourcePreview}
                uploading={sourceUploading}
                onFile={uploadSource}
                onUrl={uploadSourceFromUrl}
                label="Before"
                hint="Click or drop"
                height={200}
                onClear={() => { setSourceFilename(null); setTransformedUrl(null); setTransformedInput(null); }}
              />
            </div>
            <ArrowRight className="mt-14 h-5 w-5 shrink-0 text-violet-400/60" />
            <div className="flex-1">
              <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-white/25">After · last frame</p>
              <UploadSlot
                preview={transformedUrl}
                uploading={transforming}
                onFile={uploadAfterFrame}
                onUrl={uploadAfterFromUrl}
                label="After"
                hint="Drop your own, or generate above"
                height={200}
                onClear={() => { setTransformedUrl(null); setTransformedInput(null); }}
              />
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-white/25">
            Drop both frames to morph your own before → after, or upload a Source and generate the character above.
          </p>
        </WorkflowSection>

        {/* Step 3 — morph */}
        <WorkflowSection title="3 · Morph Video">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Transformation Style">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TRANSITION_STYLES.map((style) => (
                  <button
                    key={style.label}
                    type="button"
                    onClick={() => setMorphPrompt(style.prompt)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                      morphPrompt === style.prompt
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                        : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10',
                    )}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
              <textarea
                value={morphPrompt}
                onChange={(e) => setMorphPrompt(e.target.value)}
                className={cn(inputBase, 'min-h-[88px] resize-y')}
              />
            </Field>
            <div className="space-y-3">
              <Field label="Aspect Ratio — reels are 9:16">
                <ChipGroup options={LTX_RATIOS} value={aspectRatio as LtxRatio} onChange={setAspectRatio} />
              </Field>
              <Field label={`Resolution — ${dims.width}×${dims.height}`}>
                <ChipGroup options={LTX_RESOLUTIONS} value={resolution} onChange={setResolution} />
              </Field>
              <SliderField
                label="Length"
                value={lengthSec}
                onChange={setLengthSec}
                min={2}
                max={20}
                step={1}
                format={(v) => `${v}s${v > 10 ? ' · heavy on VRAM' : ''}`}
              />
            </div>
          </div>
          <div className="mt-4">
            <GenerateButton
              onClick={() => generateMorph()}
              disabled={!canMorph}
              isGenerating={run.isGenerating}
              label="Generate Transformation Reel"
              requirementHint="Upload a photo and create the character frame first"
            />
          </div>
        </WorkflowSection>

        {/* Step 4 — beat audio */}
        <WorkflowSection title="4 · Beat Audio (optional)">
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
            <UploadSlot
              preview={beatFilename ? `/comfy/view?filename=${encodeURIComponent(beatFilename)}&type=input` : null}
              uploading={beatUploading}
              onFile={uploadBeat}
              accept="audio/*,video/*"
              label="Beat Track"
              hint="mp3/wav — the song with the drop"
              previewKind="audio"
              filename={beatFilename ?? undefined}
              onClear={() => setBeatFilename(null)}
            />
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-white/25">Or paste a TikTok / Reels / YouTube link</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={beatUrl}
                    onChange={(e) => setBeatUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !beatUrlLoading && loadBeatFromUrl()}
                    placeholder="https://www.tiktok.com/..."
                    className={cn(inputBase, 'flex-1 text-[12px]')}
                  />
                  <button
                    type="button"
                    onClick={loadBeatFromUrl}
                    disabled={!beatUrl.trim() || beatUrlLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 text-[10px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {beatUrlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load'}
                  </button>
                </div>
              </div>
              <SliderField
                label="Drop is at (second in the song)"
                value={beatDropSec}
                onChange={setBeatDropSec}
                min={0}
                max={120}
                step={1}
                format={(v) => `${v}s → morph lands on the drop`}
              />
              <button
                type="button"
                onClick={addBeatToReel}
                disabled={!run.currentMedia || !beatFilename || muxing || run.isGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 py-2.5 text-[11px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {muxing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music className="h-3.5 w-3.5" />}
                {muxing ? 'Adding beat…' : 'Add Beat to Current Reel'}
              </button>
              <p className="text-[10px] text-white/25">
                The song starts so its drop hits the middle of the clip — where the transformation peaks.
                The result appears as a new reel in the output strip, audio included.
              </p>
            </div>
          </div>
        </WorkflowSection>
      </div>
      {lightbox && <Lightbox imageUrl={lightbox} onClose={() => setLightbox(null)} />}
    </WorkflowShell>
  );
};
