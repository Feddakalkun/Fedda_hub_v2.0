import { useEffect, useRef, useState } from 'react';
import {
  CircleDot,
  Download,
  Image as ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Unlock,
  Wand2,
} from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { WorkflowShell } from '../../components/layout/WorkflowShell';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { comfyService } from '../../services/comfyService';
import { useToast } from '../../components/ui/Toast';
import { usePersistentState } from '../../hooks/usePersistentState';
import { inputBase } from '../../lib/styles';

type StageStatus = {
  success: boolean;
  status?: 'pending' | 'running' | 'completed' | 'not_found';
  error?: string;
  images?: Array<{ filename: string; subfolder: string; type: string }>;
  detected_boxes?: number[][];
  raw_outputs?: Record<string, unknown>;
};

const GENDERS = ['woman', 'man'];
const SCENES = [
  'neutral studio background',
  'soft window light interior',
  'cozy cafe with warm bokeh background',
  'city street at golden hour, blurred traffic',
  'rooftop bar at night, neon city lights behind',
  'sandy beach at sunset, ocean waves',
  'green park with soft dappled sunlight',
  'modern apartment with big windows',
  'nightclub with colorful moving lights',
  'autumn forest path, warm fallen leaves',
  'snowy street with soft winter light',
  'luxury hotel lobby, marble and gold',
  'backstage of a concert, moody lighting',
  'poolside on a bright summer day',
  'graffiti alley, urban streetwear vibe',
];
const STYLES = [
  'photorealistic, natural skin, coherent faces',
  'editorial photography, clean lighting, sharp focus',
  'cinematic realism, balanced contrast, detailed texture',
  'high-end fashion photo, realistic anatomy, soft shadows',
  'candid iPhone photo, natural flash, slightly grainy',
  'film photography look, 35mm, warm color grade',
  'moody low-key lighting, dramatic shadows',
  'bright airy daylight, soft pastel tones',
];

const randomSeed = () => Math.floor(Math.random() * 9_000_000_000_000) + 1;
const randomFrom = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

const shortLoraLabel = (name: string) => (name.replace(/\\/g, '/').split('/').pop() || name).replace(/\.safetensors$/i, '');

const buttonBase = 'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45';
const panelBase = 'rounded-lg border border-white/10 bg-[#0d0e12]';

const DEFAULT_NEGATIVE = 'blurry, low quality, bad anatomy, deformed, extra limbs, distorted face, plastic skin, split image, split screen, collage, diptych, two separate photos, different backgrounds, panel border, seam down the middle';

// Known-good tuning, verified by the settings sweep (matches the workflow's baked-in
// values, which produced the coherent faces). The "Reset to best settings" button
// writes every one of these back — overwriting anything saved in localStorage — so a
// bad manual tweak is always one click away from recovery. LoRA choices, character
// descriptions, scene/style and seed are intentionally NOT reset (they're your content).
const QUALITY_DEFAULTS = {
  loraMainStrength: 1.0,
  loraDetailStrength: 1.0,
  changeStrength: 0.55,
  refineMode: 'faces' as const,
  swapSides: false,
  sceneCfg: 1.1,
  swapCfg: 1.0,
  dualSteps: 9,
  maskFeather: 20,
  edgeFeather: 5,
  detailSize: 512,
  negativePrompt: DEFAULT_NEGATIVE,
};

async function pollPrompt(promptId: string, workflowId: string, timeoutMs = 300000): Promise<StageStatus> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE_STATUS}/${promptId}?workflow_id=${encodeURIComponent(workflowId)}`);
    const data = (await res.json()) as StageStatus;
    if (!data.success) throw new Error(data.error || 'Status request failed');
    if (data.status === 'completed') return data;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error('Timed out while waiting for generation status');
}

const selectBestImage = (images: StageStatus['images'], needle: string) => {
  const list = images || [];
  return list.find((img) => String(img.filename).toLowerCase().includes(needle)) || list[list.length - 1];
};

export const ZImageDualLoraPage = () => {
  const { toast } = useToast();
  const { clearOutputs, registerNodeMap, previewUrl } = useComfyExecution();

  const [loraMainName, setLoraMainName] = usePersistentState('zimage_dual_lora_main_name', '');
  const [loraMainStrength, setLoraMainStrength] = usePersistentState('zimage_dual_lora_main_strength', QUALITY_DEFAULTS.loraMainStrength);
  const [loraDetailName, setLoraDetailName] = usePersistentState('zimage_dual_lora_detail_name', '');
  const [loraDetailStrength, setLoraDetailStrength] = usePersistentState('zimage_dual_lora_detail_strength', QUALITY_DEFAULTS.loraDetailStrength);

  // How strongly the selected person is repainted into Person 2 (DetailerForEach denoise).
  const [changeStrength, setChangeStrength] = usePersistentState('zimage_dual_change_strength', QUALITY_DEFAULTS.changeStrength);

  // Refine faces (identity) or whole bodies (outfit/pose).
  const [refineMode, setRefineMode] = usePersistentState<'faces' | 'bodies'>('zimage_dual_refine_mode', 'faces');

  // Who-gets-who: by default Person 1's LoRA repaints the LEFT face, Person 2's the
  // RIGHT. If the detector flips them, this swaps which LoRA lands on which person.
  const [swapSides, setSwapSides] = usePersistentState('zimage_dual_swap_sides', false);

  // Advanced quality knobs (defaults match the workflow).
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sceneCfg, setSceneCfg] = usePersistentState('zimage_dual_scene_cfg', 1.1);
  const [swapCfg, setSwapCfg] = usePersistentState('zimage_dual_swap_cfg', 1.0);
  const [dualSteps, setDualSteps] = usePersistentState('zimage_dual_steps', 9);
  const [maskFeather, setMaskFeather] = usePersistentState('zimage_dual_mask_feather', 20);
  const [edgeFeather, setEdgeFeather] = usePersistentState('zimage_dual_edge_feather', 5);
  const [detailSize, setDetailSize] = usePersistentState('zimage_dual_detail_size', QUALITY_DEFAULTS.detailSize);

  const [scene, setScene] = usePersistentState('zimage_dual_scene', SCENES[0]);
  const [style, setStyle] = usePersistentState('zimage_dual_style', STYLES[0]);

  // Character descriptions pulled from each LoRA's .md sheet (editable).
  const [genderA, setGenderA] = usePersistentState('zimage_dual_gender_a', 'woman');
  const [genderB, setGenderB] = usePersistentState('zimage_dual_gender_b', 'woman');
  const [triggerA, setTriggerA] = usePersistentState('zimage_dual_trigger_a', '');
  const [triggerB, setTriggerB] = usePersistentState('zimage_dual_trigger_b', '');
  const [appearanceA, setAppearanceA] = usePersistentState('zimage_dual_appearance_a', '');
  const [appearanceB, setAppearanceB] = usePersistentState('zimage_dual_appearance_b', '');
  const [sheetLoading, setSheetLoading] = useState<{ a: boolean; b: boolean }>({ a: false, b: false });

  const [mainPrompt, setMainPrompt] = usePersistentState('zimage_dual_main_prompt', '');
  const [negativePrompt, setNegativePrompt] = usePersistentState('zimage_dual_negative_prompt', DEFAULT_NEGATIVE);

  // Stage 3 — entry mode: generate a base scene from the prompt, or refine an
  // uploaded 2-person photo. uploadFilename is the ComfyUI input name (persisted so a
  // reload can still run); the object-URL preview is ephemeral.
  const [entryMode, setEntryMode] = usePersistentState<'generate' | 'upload'>('zimage_dual_entry_mode', 'generate');
  const [uploadFilename, setUploadFilename] = usePersistentState<string | null>('zimage_dual_upload_filename', null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [lockedSeed, setLockedSeed] = usePersistentState<number>('zimage_dual_locked_seed', randomSeed());
  const [seedLocked, setSeedLocked] = usePersistentState<boolean>('zimage_dual_seed_locked', false);

  const [baseImageUrl, setBaseImageUrl] = usePersistentState<string | null>('zimage_dual_base_image', null);
  const [beforeImageUrl, setBeforeImageUrl] = usePersistentState<string | null>('zimage_dual_before_image', null);
  const [finalImageUrl, setFinalImageUrl] = usePersistentState<string | null>('zimage_dual_final_image', null);

  // Stage 2 mask preview: which face each LoRA actually repainted (seg_preview_p1/p2).
  const [p1PreviewUrl, setP1PreviewUrl] = usePersistentState<string | null>('zimage_dual_p1_preview', null);
  const [p2PreviewUrl, setP2PreviewUrl] = usePersistentState<string | null>('zimage_dual_p2_preview', null);

  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const isRunning = runningWorkflow;
  const canRun = !!loraMainName && !!loraDetailName && loraMainStrength > 0 && loraDetailStrength > 0
    && (entryMode === 'generate' || !!uploadFilename);

  const handleUpload = async (file?: File | null) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'Upload failed');
      setUploadFilename(data.filename);
      setUploadPreview(URL.createObjectURL(file));
      toast('Photo uploaded — ready to refine.', 'success');
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    comfyService.getLoras().then((all) => {
      const filtered = all.filter((name) => {
        const normalized = name.replace(/\\/g, '/').toLowerCase();
        // Match anywhere in the path so subfolder-organized LoRAs (app/Aurora/...-zimage) show up
        return normalized.includes('zimage') || normalized.includes('z-image');
      });
      setAvailableLoras(filtered);
    }).catch(() => setAvailableLoras([]));
  }, []);

  // Pull a LoRA's character sheet (.md sidecar) → trigger + appearance.
  const loadSheet = async (
    loraName: string,
    slot: 'a' | 'b',
    setTrigger: (v: string) => void,
    setAppearance: (v: string) => void,
    { force = false }: { force?: boolean } = {},
  ) => {
    if (!loraName) return;
    setSheetLoading((s) => ({ ...s, [slot]: true }));
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/lora/sheet?file=${encodeURIComponent(loraName)}`);
      const data = await res.json();
      if (data.success && data.exists) {
        if (data.trigger) setTrigger(data.trigger);
        if (data.appearance) setAppearance(data.appearance);
        if (force) toast(`Loaded ${shortLoraLabel(loraName)}'s description`, 'success');
      } else if (force) {
        toast('No character sheet (.md) found next to that LoRA.', 'info');
      }
    } catch {
      if (force) toast('Could not read the character sheet.', 'error');
    } finally {
      setSheetLoading((s) => ({ ...s, [slot]: false }));
    }
  };

  // Auto-load a sheet only when the LoRA actually changes (not on every remount),
  // so persisted manual edits survive a page reload.
  const mainSheetRef = useRef<string | null>(loraMainName || null);
  const detailSheetRef = useRef<string | null>(loraDetailName || null);
  useEffect(() => {
    if (loraMainName && mainSheetRef.current !== loraMainName) {
      mainSheetRef.current = loraMainName;
      void loadSheet(loraMainName, 'a', setTriggerA, setAppearanceA);
    }
  }, [loraMainName]);
  useEffect(() => {
    if (loraDetailName && detailSheetRef.current !== loraDetailName) {
      detailSheetRef.current = loraDetailName;
      void loadSheet(loraDetailName, 'b', setTriggerB, setAppearanceB);
    }
  }, [loraDetailName]);

  // Build the scene + refine prompts straight from the two character sheets.
  const describe = (trigger: string, gender: string, appearance: string) =>
    [trigger.trim(), gender.trim(), appearance.trim()].filter(Boolean).join(', ');

  const composePrompts = () => {
    const left = describe(triggerA, genderA, appearanceA);
    const right = describe(triggerB, genderB, appearanceB);
    const plural = genderA === genderB ? `two ${genderA}s` : 'two people';
    // Lead with ONE shared scene so Z-Image renders a single photo (not a diptych).
    const base = `a single candid photograph of ${plural} standing close together in the same place, ${scene}, one shared continuous background, same lighting and same camera angle, left person: ${left}; right person: ${right}, both fully in frame, natural realistic proportions, ${style}, one seamless image`;
    setMainPrompt(base);
    return { base };
  };

  // Per-person face-refine prompts (left = Person 1 / LoRA A, right = Person 2 / LoRA B).
  const personPrompts = () => ({
    personA: [describe(triggerA, genderA, appearanceA) || (genderA || 'woman'), 'natural detailed face, coherent'].join(', '),
    personB: [describe(triggerB, genderB, appearanceB) || (genderB || 'woman'), 'natural detailed face, coherent'].join(', '),
  });

  const ensurePromptText = () => ({
    base: mainPrompt.trim() || composePrompts().base,
    ...personPrompts(),
  });

  // Restore every tuning knob to the known-good sweep values, overwriting whatever
  // is saved in localStorage. Deliberately leaves LoRA picks, character text,
  // scene/style and seed untouched — only the quality settings snap back.
  const resetSettings = () => {
    setLoraMainStrength(QUALITY_DEFAULTS.loraMainStrength);
    setLoraDetailStrength(QUALITY_DEFAULTS.loraDetailStrength);
    setChangeStrength(QUALITY_DEFAULTS.changeStrength);
    setRefineMode(QUALITY_DEFAULTS.refineMode);
    setSwapSides(QUALITY_DEFAULTS.swapSides);
    setSceneCfg(QUALITY_DEFAULTS.sceneCfg);
    setSwapCfg(QUALITY_DEFAULTS.swapCfg);
    setDualSteps(QUALITY_DEFAULTS.dualSteps);
    setMaskFeather(QUALITY_DEFAULTS.maskFeather);
    setEdgeFeather(QUALITY_DEFAULTS.edgeFeather);
    setDetailSize(QUALITY_DEFAULTS.detailSize);
    setNegativePrompt(QUALITY_DEFAULTS.negativePrompt);
    toast('Settings reset to the best-known values.', 'success');
  };

  const registerWorkflowNodeMap = async (workflowId: string) => {
    try {
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/workflow/node-map/${workflowId}`);
      const data = await response.json();
      if (data.success) registerNodeMap(data.node_map);
    } catch {
      // Metadata is nice to have, generation is still allowed without it.
    }
  };

  const runSingleWorkflow = async () => {
    if (!canRun) {
      toast('Select both LoRAs first.', 'error');
      return;
    }
    const prompts = ensurePromptText();
    const seed = seedLocked ? lockedSeed : randomSeed();
    setLockedSeed(seed);
    setSeedLocked(true);
    clearOutputs();
    setFinalImageUrl(null);
    setP1PreviewUrl(null);
    setP2PreviewUrl(null);
    setRunningWorkflow(true);

    try {
      // v2: left face → LoRA A, right face → LoRA B (deterministic, two separate
      // detailer passes). No detection phrase / side pick needed.
      const antiSplit = 'split image, collage, diptych, two separate photos, different backgrounds';
      const negativeForRun = /split image|collage|diptych/i.test(negativePrompt)
        ? negativePrompt
        : `${negativePrompt}, ${antiSplit}`;
      const isUpload = entryMode === 'upload';
      const workflowId = isUpload ? 'z-image-dual-lora-upload' : 'z-image-dual-lora';
      await registerWorkflowNodeMap(workflowId);
      // Shared refine params for both entry modes.
      const params: Record<string, unknown> = {
        person_a_prompt: prompts.personA,
        person_b_prompt: prompts.personB,
        negative: negativeForRun,
        detect_model: refineMode === 'bodies' ? 'bbox/yolov8m.pt' : 'bbox/face_yolov8m.pt',
        detect_labels: refineMode === 'bodies' ? 'person' : 'all',
        // Who-gets-who: Person 1's LoRA repaints the leftmost face (index 0) by
        // default; swap sends P1→right, P2→left.
        person1_face_index: swapSides ? 1 : 0,
        person2_face_index: swapSides ? 0 : 1,
        seed,
        lora_main_name: loraMainName,
        lora_main_strength: Number(loraMainStrength),
        lora_detail_name: loraDetailName,
        lora_detail_strength: Number(loraDetailStrength),
        detail_denoise: Number(changeStrength),
        swap_cfg: Number(swapCfg),
        dual_steps: Number(dualSteps),
        mask_feather: Number(maskFeather),
        edge_feather: Number(edgeFeather),
        // Full-person crops are tall — at 512 the face inside gets downscaled and
        // softens, so refine at >=768 in that mode (face-only keeps the slider value).
        detail_size: refineMode === 'bodies' ? Math.max(Number(detailSize), 768) : Number(detailSize),
        client_id: comfyService.clientId,
      };
      if (isUpload) {
        // Refine the user's photo — no base generation, so no scene prompt / CFG.
        params.image = uploadFilename;
      } else {
        params.main_prompt = prompts.base;
        params.scene_cfg = Number(sceneCfg);
      }
      const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, params }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Failed to start Dual LoRA workflow');

      const done = await pollPrompt(data.prompt_id, workflowId);
      const beforeImage = selectBestImage(done.images, 'main_before_detail');
      const finalImage = selectBestImage(done.images, 'final_refined');
      if (beforeImage) {
        const imageUrl = comfyService.getImageUrl(beforeImage);
        setBaseImageUrl(imageUrl);
        setBeforeImageUrl(imageUrl);
      }
      // Stage 2: the face each LoRA repainted. Present only if detection found
      // both — a single-face detection leaves one preview empty.
      const p1Preview = (done.images || []).find((img) => String(img.filename).toLowerCase().includes('seg_preview_p1'));
      const p2Preview = (done.images || []).find((img) => String(img.filename).toLowerCase().includes('seg_preview_p2'));
      setP1PreviewUrl(p1Preview ? comfyService.getImageUrl(p1Preview) : null);
      setP2PreviewUrl(p2Preview ? comfyService.getImageUrl(p2Preview) : null);
      if (!finalImage) throw new Error('No refined image returned');
      setFinalImageUrl(comfyService.getImageUrl(finalImage));

      toast('Dual LoRA image finished.', 'success');
    } catch (err: any) {
      toast(err.message || 'Dual LoRA workflow failed', 'error');
    } finally {
      setRunningWorkflow(false);
    }
  };

  const loraOptions = availableLoras.length ? availableLoras : [loraMainName, loraDetailName].filter(Boolean);

  return (
    <WorkflowShell
      title="Dual LoRA"
      eyebrow="Z-Image"
      description="Create a two-person image, choose one person, then refine that person with the second LoRA."
      icon={CircleDot}
      isGenerating={isRunning}
      canGenerate={canRun && !isRunning}
      hideOutputPane
      output={null}
    >
        <section className={`${panelBase} p-3`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Start from</span>
            {([
              { m: 'generate' as const, label: 'Generate base', hint: 'make a new 2-person scene from the prompt' },
              { m: 'upload' as const, label: 'Upload photo', hint: 'refine two people in a photo you already have' },
            ]).map((o) => (
              <button
                key={o.m}
                onClick={() => setEntryMode(o.m)}
                title={o.hint}
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${entryMode === o.m ? 'bg-white text-black' : 'bg-white/[0.04] text-white/55 hover:bg-white/[0.08]'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className={`${panelBase} p-3`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
              <CircleDot className="h-4 w-4 text-white/50" />
              Characters + Seed
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSeedLocked(!seedLocked)}
                className={`${buttonBase} border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-white/75 hover:bg-white/[0.08]`}
              >
                {seedLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                {seedLocked ? `Seed ${lockedSeed}` : 'Random seed'}
              </button>
              <button
                onClick={() => {
                  setLockedSeed(randomSeed());
                  setSeedLocked(true);
                }}
                className={`${buttonBase} border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-white/75 hover:bg-white/[0.08]`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                New Seed
              </button>
              <button
                onClick={resetSettings}
                title="Restore every quality knob (strengths, denoise, CFG, steps, feathers, detail size, negative) to the best-known values. Keeps your LoRAs, descriptions, scene and seed."
                className={`${buttonBase} border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-amber-200/80 hover:bg-amber-400/[0.12]`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to best settings
              </button>
            </div>
          </div>
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_140px]">
            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Person 1 LoRA
              <select value={loraMainName} onChange={(e) => setLoraMainName(e.target.value)} className={inputBase}>
                <option value="">Select Person 1 LoRA</option>
                {loraOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Person 1 {Number(loraMainStrength).toFixed(2)}
              <input type="range" min={0.1} max={1.8} step={0.01} value={loraMainStrength} onChange={(e) => setLoraMainStrength(Number(e.target.value))} className="mt-2 w-full accent-zinc-300" />
            </label>
            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Person 2 LoRA
              <select value={loraDetailName} onChange={(e) => setLoraDetailName(e.target.value)} className={inputBase}>
                <option value="">Select Person 2 LoRA</option>
                {loraOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Person 2 likeness {Number(loraDetailStrength).toFixed(2)}
              <input type="range" min={0.1} max={1.8} step={0.01} value={loraDetailStrength} onChange={(e) => setLoraDetailStrength(Number(e.target.value))} className="mt-2 w-full accent-zinc-300" />
            </label>
          </div>

          <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-emerald-200/70">
              <span>Change Strength (how fully Person 2 replaces the selected person)</span>
              <span className="font-mono text-emerald-300">{Number(changeStrength).toFixed(2)}</span>
            </div>
            <input type="range" min={0.3} max={1} step={0.01} value={changeStrength} onChange={(e) => setChangeStrength(Number(e.target.value))} className="mt-2 w-full accent-emerald-400" />
            <div className="mt-1 flex justify-between text-[9px] font-mono text-white/30">
              <span>0.30 · subtle</span>
              <span className="text-white/20">0.75 · balanced</span>
              <span>1.00 · full swap</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Refine</span>
            {(['faces', 'bodies'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setRefineMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize transition ${refineMode === m ? 'bg-white text-black' : 'bg-white/[0.04] text-white/55 hover:bg-white/[0.08]'}`}
              >
                {m === 'faces' ? 'Face only (identity)' : 'Full person (face + body)'}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-white/70">Who gets who</div>
              <div className="mt-0.5 text-[10px] text-white/35">
                {swapSides
                  ? <><span className="text-sky-300/80">Person 1</span> → right face · <span className="text-emerald-300/80">Person 2</span> → left face</>
                  : <><span className="text-sky-300/80">Person 1</span> → left face · <span className="text-emerald-300/80">Person 2</span> → right face</>}
              </div>
            </div>
            <button
              onClick={() => setSwapSides((v) => !v)}
              title="If each LoRA landed on the wrong person, flip this and re-run."
              className={`${buttonBase} shrink-0 ${swapSides ? 'border-amber-400/30 bg-amber-400/[0.1] text-amber-200/85' : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'}`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {swapSides ? 'Swapped' : 'Swap sides'}
            </button>
          </div>

          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-2 text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white/70"
          >
            {showAdvanced ? '− Advanced quality' : '+ Advanced quality'}
          </button>
          {showAdvanced && (
            <div className="mt-2 grid gap-3 rounded-lg border border-white/10 bg-black/25 p-3 sm:grid-cols-2">
              {([
                { label: 'Scene CFG', v: sceneCfg, set: setSceneCfg, min: 1, max: 6, step: 0.1, hint: 'base image prompt adherence' },
                { label: 'Swap CFG', v: swapCfg, set: setSwapCfg, min: 1, max: 6, step: 0.1, hint: 'repaint prompt adherence' },
                { label: 'Steps', v: dualSteps, set: setDualSteps, min: 4, max: 20, step: 1, hint: 'more = cleaner, slower' },
                { label: 'Mask feather', v: maskFeather, set: setMaskFeather, min: 0, max: 64, step: 1, hint: 'soft blend into the scene' },
                { label: 'Edge feather', v: edgeFeather, set: setEdgeFeather, min: 0, max: 32, step: 1, hint: 'inpaint edge softness' },
                { label: 'Detail size', v: detailSize, set: setDetailSize, min: 512, max: 1024, step: 64, hint: 'face refine resolution' },
              ] as const).map((f) => (
                <label key={f.label} className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  <span className="flex justify-between"><span>{f.label}</span><span className="font-mono text-white/60">{f.v}</span></span>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={f.v} onChange={(e) => f.set(Number(e.target.value))} className="w-full accent-zinc-300" />
                  <span className="block font-normal normal-case tracking-normal text-[9px] text-white/25">{f.hint}</span>
                </label>
              ))}
            </div>
          )}
        </section>

          <main className="space-y-3">
            <section className={`${panelBase} p-3`}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white/85">Characters</div>
                      <p className="mt-1 text-[11px] text-white/35">Pick each person's LoRA (above) + gender. <b className="text-white/55">Build Prompts</b> auto-fills the two prompt boxes → from each LoRA's sheet. Or skip it and write the boxes yourself.</p>
                    </div>
                    <button onClick={composePrompts} className={`${buttonBase} border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]`}>
                      <Wand2 className="h-3.5 w-3.5" />
                      Build Prompts
                    </button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {[
                      { role: 'Person 1 — base scene', slot: 'a' as const, lora: loraMainName, gender: genderA, setGender: setGenderA, trigger: triggerA, appearance: appearanceA, setAppearance: setAppearanceA, setTrigger: setTriggerA, accent: 'sky' },
                      { role: 'Person 2 — the swap-in', slot: 'b' as const, lora: loraDetailName, gender: genderB, setGender: setGenderB, trigger: triggerB, appearance: appearanceB, setAppearance: setAppearanceB, setTrigger: setTriggerB, accent: 'emerald' },
                    ].map((p) => (
                      <div key={p.slot} className={`rounded-lg border p-2.5 ${p.accent === 'sky' ? 'border-sky-400/20 bg-sky-400/[0.03]' : 'border-emerald-400/20 bg-emerald-400/[0.03]'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white/75">{p.role}</div>
                            {p.lora
                              ? <div className="mt-0.5 truncate text-[10px] text-white/40">{shortLoraLabel(p.lora)}{p.trigger ? <> · <span className="font-mono text-white/60">{p.trigger}</span></> : ' · no sheet'}</div>
                              : <div className="mt-0.5 text-[10px] text-white/25">Pick this LoRA above ↑</div>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <select value={p.gender} onChange={(e) => p.setGender(e.target.value)} className={`${inputBase} h-7 w-24 py-0`}>
                              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <button
                              title="Reload this LoRA's description from its sheet"
                              onClick={() => void loadSheet(p.lora, p.slot, p.setTrigger, p.setAppearance, { force: true })}
                              disabled={!p.lora || sheetLoading[p.slot]}
                              className={`${buttonBase} h-7 border-white/10 bg-white/[0.04] px-2 py-0 text-white/60 hover:bg-white/[0.08]`}
                            >
                              {sheetLoading[p.slot] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                      Scene
                      <input list="dual-scenes" value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Pick or type a scene…" className={inputBase} />
                      <datalist id="dual-scenes">{SCENES.map((s) => <option key={s} value={s} />)}</datalist>
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                      Style
                      <input list="dual-styles" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Pick or type a style…" className={inputBase} />
                      <datalist id="dual-styles">{STYLES.map((s) => <option key={s} value={s} />)}</datalist>
                    </label>
                    <div className="flex items-end">
                      <button
                        onClick={() => { setScene(randomFrom(SCENES)); setStyle(randomFrom(STYLES)); }}
                        title="Shuffle scene + style"
                        className={`${buttonBase} h-[38px] border-white/10 bg-white/[0.04] px-3 text-white/70 hover:bg-white/[0.08]`}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Shuffle
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {entryMode === 'generate' ? (
                    <div>
                      <PromptAssistant
                        context="zimage"
                        value={mainPrompt}
                        onChange={setMainPrompt}
                        label="1 · Full Scene Prompt (the main image)"
                        minRows={5}
                        accent="sky"
                        placeholder="The whole image with both people — setting, who's where, what they wear. e.g. 'two people on a crowded bus, a woman on the left in a red coat, a man on the right in a suit...'"
                      />
                      <p className="mt-1 text-[10px] text-white/30">This generates the base image with <span className="text-sky-300/70">Person 1</span>'s LoRA. Describe the full scene here.</p>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">1 · Your 2-person photo</div>
                      <label
                        onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files?.[0]); }}
                        onDragOver={(e) => e.preventDefault()}
                        className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-sky-400/25 bg-sky-400/[0.03] p-3 text-center transition hover:bg-sky-400/[0.06]"
                      >
                        {uploadPreview ? (
                          <img src={uploadPreview} alt="uploaded" className="max-h-[220px] rounded-md border border-white/10 object-contain" />
                        ) : uploadFilename ? (
                          <div className="text-[11px] text-white/60">Photo ready: <span className="font-mono text-white/80">{uploadFilename}</span><div className="mt-1 text-[10px] text-white/30">click to replace</div></div>
                        ) : (
                          <>
                            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white/60" /> : <ImageIcon className="h-6 w-6 text-white/30" />}
                            <div className="text-[11px] font-semibold text-white/60">{uploading ? 'Uploading…' : 'Drop a photo of two people'}</div>
                            <div className="text-[10px] text-white/30">or click to browse — no base is generated, we just refine the two faces</div>
                          </>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
                      </label>
                      <p className="mt-1 text-[10px] text-white/30">Both people get detected + repainted with your two LoRAs. Person 1 = left, Person 2 = right (use <span className="text-amber-200/70">Swap sides</span> if flipped).</p>
                    </div>
                  )}
                  <label className="block space-y-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                    Negative
                    <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={2} className={`${inputBase} resize-none`} />
                  </label>
                </div>
              </div>
            </section>

            <section className={`${panelBase} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white/85">Generate + Refine</div>
                  <p className="mt-1 text-[11px] text-white/35">Choose which side/person gets the second LoRA. FEDDA runs the full mask + refine workflow in one ComfyUI job.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void runSingleWorkflow()}
                    disabled={!canRun || isRunning}
                    className={`${buttonBase} border-white/10 bg-white text-black hover:bg-white/85`}
                  >
                    {runningWorkflow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Create Dual LoRA Image
                  </button>
                </div>
              </div>

              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-h-[420px] bg-[#07080a] p-3">
                  {baseImageUrl ? (
                    <div className="flex h-full items-start justify-center">
                      <div className="relative inline-block max-w-full">
                        <img
                          src={baseImageUrl}
                          alt="Base"
                          className="max-h-[620px] rounded-lg border border-white/10 object-contain"
                        />
                      </div>
                    </div>
                  ) : isRunning && previewUrl ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="relative">
                        <img src={previewUrl} alt="Generating…" className="max-h-[620px] rounded-lg border border-white/10 object-contain" />
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/70">
                          <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />Generating
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20">
                      <div className="text-center text-white/35">
                        {isRunning ? <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" /> : <ImageIcon className="mx-auto mb-3 h-8 w-8 opacity-40" />}
                        <div className="text-sm font-semibold">{isRunning ? 'Generating…' : 'No image yet'}</div>
                        <div className="mt-1 text-xs text-white/25">{isRunning ? 'Rendering the scene, then refining the chosen person.' : 'Choose two LoRAs, choose side/person, then run once.'}</div>
                      </div>
                    </div>
                  )}
                </div>

                <aside className="border-t border-white/10 bg-[#0b0c10] p-3 xl:border-l xl:border-t-0">
                  <div className="space-y-3">
                    {(p1PreviewUrl || p2PreviewUrl) && (
                      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/55">Mask preview — who got repainted</div>
                          <button
                            onClick={() => setSwapSides((v) => !v)}
                            title="Wrong LoRA on the wrong face? Swap and re-run."
                            className={`${buttonBase} h-6 px-2 py-0 text-[10px] ${swapSides ? 'border-amber-400/30 bg-amber-400/[0.1] text-amber-200/85' : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'}`}
                          >
                            <RefreshCw className="h-3 w-3" />
                            {swapSides ? 'Swapped' : 'Swap'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-sky-300/80">
                              <span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> Person 1 {shortLoraLabel(loraMainName) && <span className="truncate text-white/35">· {shortLoraLabel(loraMainName)}</span>}
                            </div>
                            {p1PreviewUrl
                              ? <img src={p1PreviewUrl} alt="Person 1 mask" className="w-full rounded border border-sky-400/30 bg-black object-contain" />
                              : <div className="flex h-24 items-center justify-center rounded border border-dashed border-white/10 text-[9px] text-white/25">no 2nd face found</div>}
                          </div>
                          <div>
                            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-300/80">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Person 2 {shortLoraLabel(loraDetailName) && <span className="truncate text-white/35">· {shortLoraLabel(loraDetailName)}</span>}
                            </div>
                            {p2PreviewUrl
                              ? <img src={p2PreviewUrl} alt="Person 2 mask" className="w-full rounded border border-emerald-400/30 bg-black object-contain" />
                              : <div className="flex h-24 items-center justify-center rounded border border-dashed border-white/10 text-[9px] text-white/25">no 2nd face found</div>}
                          </div>
                        </div>
                        <p className="text-[9px] leading-snug text-white/30">Each panel is the exact region that LoRA repainted ({refineMode === 'bodies' ? 'whole person' : 'face'}). If they're on the wrong people, hit Swap and re-run.</p>
                      </div>
                    )}

                      {finalImageUrl && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-white/45">Finished Image</div>
                        <img src={finalImageUrl} alt="Final refined" className="rounded-lg border border-white/10" />
                        <div className="flex gap-2">
                          <a href={finalImageUrl} target="_blank" rel="noreferrer" className={`${buttonBase} flex-1 border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]`}>Open</a>
                          <a href={finalImageUrl} download className={`${buttonBase} flex-1 border-white/10 bg-white text-black hover:bg-white/85`}>
                            <Download className="h-3.5 w-3.5" />
                            Save
                          </a>
                        </div>
                      </div>
                    )}

                    {beforeImageUrl && finalImageUrl && (
                      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wide text-white/35">Before</div>
                          <img src={beforeImageUrl} alt="Before" className="rounded border border-white/10" />
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wide text-white/35">After</div>
                          <img src={finalImageUrl} alt="After" className="rounded border border-white/10" />
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          </main>
    </WorkflowShell>
  );
};
