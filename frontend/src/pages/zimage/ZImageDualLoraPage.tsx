import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  CircleDot,
  Download,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Unlock,
  Wand2,
} from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { TopPreviewStrip } from '../../components/layout/TopPreviewStrip';
import { WorkflowShell } from '../../components/layout/WorkflowShell';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { comfyService } from '../../services/comfyService';
import { useToast } from '../../components/ui/Toast';
import { usePersistentState } from '../../hooks/usePersistentState';
import { inputBase } from '../../lib/styles';

type BoxSource = 'none' | 'detected' | 'fallback' | 'manual';

type DualBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DragPoint = { x: number; y: number };

type StageStatus = {
  success: boolean;
  status?: 'pending' | 'running' | 'completed' | 'not_found';
  error?: string;
  images?: Array<{ filename: string; subfolder: string; type: string }>;
  detected_boxes?: number[][];
  raw_outputs?: Record<string, unknown>;
};

const TARGET_CHOICES = [
  { label: 'Person 1', hint: 'left side', side: 'left' },
  { label: 'Person 2', hint: 'right side', side: 'right' },
];

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

function choosePreferredBoxIndex(boxes: DualBox[], phrase: string) {
  if (boxes.length === 0) return -1;
  if (boxes.length === 1) return 0;
  const lower = phrase.toLowerCase();
  const wantsLeft = lower.includes('left');
  const wantsRight = lower.includes('right');
  if (!wantsLeft && !wantsRight) return 0;

  let bestIndex = 0;
  let bestCenter = (boxes[0].x1 + boxes[0].x2) / 2;
  boxes.forEach((box, index) => {
    const center = (box.x1 + box.x2) / 2;
    if ((wantsLeft && center < bestCenter) || (wantsRight && center > bestCenter)) {
      bestIndex = index;
      bestCenter = center;
    }
  });
  return bestIndex;
}

function extractBoxesFromUnknown(value: unknown): DualBox[] {
  const boxes: DualBox[] = [];
  const seen = new Set<string>();

  const add = (x1: number, y1: number, x2: number, y2: number) => {
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
    if (x2 <= x1 || y2 <= y1) return;
    const key = `${x1.toFixed(1)}:${y1.toFixed(1)}:${x2.toFixed(1)}:${y2.toFixed(1)}`;
    if (seen.has(key)) return;
    seen.add(key);
    boxes.push({ x1, y1, x2, y2 });
  };

  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length >= 4) {
        const [a, b, c, d] = v.map(Number);
        if ([a, b, c, d].every(Number.isFinite)) add(a, b, c, d);
      }
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      if (['x1', 'y1', 'x2', 'y2'].every((k) => typeof obj[k] !== 'undefined')) {
        add(Number(obj.x1), Number(obj.y1), Number(obj.x2), Number(obj.y2));
      }
      if (['left', 'top', 'right', 'bottom'].every((k) => typeof obj[k] !== 'undefined')) {
        add(Number(obj.left), Number(obj.top), Number(obj.right), Number(obj.bottom));
      }
      Object.values(obj).forEach(walk);
    }
  };

  walk(value);
  return boxes;
}

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
  const { clearOutputs, registerNodeMap } = useComfyExecution();

  const [loraMainName, setLoraMainName] = usePersistentState('zimage_dual_lora_main_name', '');
  const [loraMainStrength, setLoraMainStrength] = usePersistentState('zimage_dual_lora_main_strength', 1.2);
  const [loraDetailName, setLoraDetailName] = usePersistentState('zimage_dual_lora_detail_name', '');
  const [loraDetailStrength, setLoraDetailStrength] = usePersistentState('zimage_dual_lora_detail_strength', 1.2);

  // How strongly the selected person is repainted into Person 2 (DetailerForEach denoise).
  const [changeStrength, setChangeStrength] = usePersistentState('zimage_dual_change_strength', 0.75);

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
  const [detailPrompt, setDetailPrompt] = usePersistentState('zimage_dual_detail_prompt', '');
  const [negativePrompt, setNegativePrompt] = usePersistentState('zimage_dual_negative_prompt', 'blurry, low quality, bad anatomy, deformed, extra limbs, distorted face, plastic skin');
  const [detectionPhrase, setDetectionPhrase] = usePersistentState('zimage_dual_detection_phrase', 'person on right');

  const [lockedSeed, setLockedSeed] = usePersistentState<number>('zimage_dual_locked_seed', randomSeed());
  const [seedLocked, setSeedLocked] = usePersistentState<boolean>('zimage_dual_seed_locked', false);

  const [baseImageUrl, setBaseImageUrl] = usePersistentState<string | null>('zimage_dual_base_image', null);
  const [beforeImageUrl, setBeforeImageUrl] = usePersistentState<string | null>('zimage_dual_before_image', null);
  const [finalImageUrl, setFinalImageUrl] = usePersistentState<string | null>('zimage_dual_final_image', null);

  const [detectedBoxes, setDetectedBoxes] = usePersistentState<DualBox[]>('zimage_dual_boxes', []);
  const [selectedBoxIndex, setSelectedBoxIndex] = usePersistentState<number>('zimage_dual_selected_box', -1);
  const [boxSource, setBoxSource] = usePersistentState<BoxSource>('zimage_dual_box_source', 'none');

  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const [manualMarkMode, setManualMarkMode] = useState(false);
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<DragPoint | null>(null);
  const [notice, setNotice] = useState('');

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });

  const selectedBox = selectedBoxIndex >= 0 ? detectedBoxes[selectedBoxIndex] : undefined;
  const isRunning = runningWorkflow;
  const canRun = !!loraMainName && !!loraDetailName && loraMainStrength > 0 && loraDetailStrength > 0;

  const draftBox = useMemo(() => {
    if (!dragStart || !dragCurrent) return null;
    return {
      x1: Math.min(dragStart.x, dragCurrent.x),
      y1: Math.min(dragStart.y, dragCurrent.y),
      x2: Math.max(dragStart.x, dragCurrent.x),
      y2: Math.max(dragStart.y, dragCurrent.y),
    };
  }, [dragCurrent, dragStart]);

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

  const buildFallbackBoxes = (w: number, h: number, phrase: string) => {
    const left: DualBox = { x1: w * 0.06, y1: h * 0.08, x2: w * 0.49, y2: h * 0.96 };
    const right: DualBox = { x1: w * 0.51, y1: h * 0.08, x2: w * 0.94, y2: h * 0.96 };
    const center: DualBox = { x1: w * 0.18, y1: h * 0.08, x2: w * 0.82, y2: h * 0.96 };
    const lower = phrase.toLowerCase();
    if (lower.includes('left')) return [left, right];
    if (lower.includes('right')) return [right, left];
    return [left, right, center];
  };

  const eventToNaturalPoint = (e: ReactMouseEvent): DragPoint | null => {
    const img = imageRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height || naturalSize.w <= 1 || naturalSize.h <= 1) return null;
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    return {
      x: (x / rect.width) * naturalSize.w,
      y: (y / rect.height) * naturalSize.h,
    };
  };

  // Build the scene + refine prompts straight from the two character sheets.
  const describe = (trigger: string, gender: string, appearance: string) =>
    [trigger.trim(), gender.trim(), appearance.trim()].filter(Boolean).join(', ');

  const composePrompts = () => {
    const left = describe(triggerA, genderA, appearanceA);
    const right = describe(triggerB, genderB, appearanceB);
    const base = `two people side by side, left person: ${left}; right person: ${right}, ${scene}, ${style}, realistic proportions, separate identities, clean composition`;
    const onLeft = detectionPhrase.toLowerCase().includes('left');
    const side = onLeft ? 'left' : 'right';
    const target = onLeft ? left : right;
    const detail = `refine only the ${side} person inside the mask, preserve the other person unchanged, preserve pose and composition, ${target}, natural skin texture, coherent face, realistic lighting`;
    setMainPrompt(base);
    setDetailPrompt(detail);
    return { base, detail };
  };

  const setDetectionTarget = (phrase: string) => {
    setDetectionPhrase(phrase);
    if (detectedBoxes.length > 0) {
      setSelectedBoxIndex(choosePreferredBoxIndex(detectedBoxes, phrase));
    }
  };

  const clearSelection = () => {
    setDetectedBoxes([]);
    setSelectedBoxIndex(-1);
    setBoxSource('none');
    setManualMarkMode(false);
    setDragStart(null);
    setDragCurrent(null);
    setNotice('');
  };

  const applyFallbackBoxes = () => {
    if (!baseImageUrl || naturalSize.w <= 1 || naturalSize.h <= 1) {
      toast('Preview must load before auto-mark.', 'info');
      return;
    }
    const boxes = buildFallbackBoxes(naturalSize.w, naturalSize.h, detectionPhrase);
    setDetectedBoxes(boxes);
    setSelectedBoxIndex(choosePreferredBoxIndex(boxes, detectionPhrase));
    setBoxSource('fallback');
    setManualMarkMode(false);
    setNotice('Auto-mark fallback boxes are active.');
  };

  const ensurePromptText = () => {
    if (mainPrompt.trim() && detailPrompt.trim()) {
      return { base: mainPrompt.trim(), detail: detailPrompt.trim() };
    }
    return composePrompts();
  };

  const targetPhraseForSide = (side: string) => {
    const gender = side === 'left' ? genderA : genderB;
    return `${side} ${gender || 'person'}`;
  };

  const selectedTargetSide = detectionPhrase.toLowerCase().includes('left') ? 'left' : 'right';

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
    setRunningWorkflow(true);

    try {
      // Ground BOTH people (Florence returns them left-to-right), then pick the
      // box by the chosen side. The phrase must not contain 'left'/'right' —
      // Florence ignores spatial words, so grounding "woman"/"person" returns
      // every instance and the index below is what actually selects the side.
      const groundingPhrase = genderA === genderB ? genderA : 'person';
      const boxIndexForSide = selectedTargetSide === 'left' ? '0' : '1';
      setDetectionPhrase(targetPhraseForSide(selectedTargetSide));
      await registerWorkflowNodeMap('z-image-dual-lora');
      const payload = {
        workflow_id: 'z-image-dual-lora',
        params: {
          main_prompt: prompts.base,
          detail_prompt: prompts.detail,
          negative: negativePrompt,
          detection_phrase: groundingPhrase,
          selected_box_index: boxIndexForSide,
          seed,
          lora_main_name: loraMainName,
          lora_main_strength: Number(loraMainStrength),
          lora_detail_name: loraDetailName,
          lora_detail_strength: Number(loraDetailStrength),
          detail_denoise: Number(changeStrength),
          client_id: comfyService.clientId,
        },
      };
      const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Failed to start Dual LoRA workflow');

      const done = await pollPrompt(data.prompt_id, 'z-image-dual-lora');
      const beforeImage = selectBestImage(done.images, 'main_before_detail');
      const finalImage = selectBestImage(done.images, 'final_refined');
      if (beforeImage) {
        const imageUrl = comfyService.getImageUrl(beforeImage);
        setBaseImageUrl(imageUrl);
        setBeforeImageUrl(imageUrl);
      }
      if (!finalImage) throw new Error('No refined image returned');
      setFinalImageUrl(comfyService.getImageUrl(finalImage));

      const directBoxes = (done.detected_boxes || []).map((b) => ({ x1: Number(b[0]), y1: Number(b[1]), x2: Number(b[2]), y2: Number(b[3]) }));
      const rawBoxes = extractBoxesFromUnknown(done.raw_outputs || {});
      const seen = new Set<string>();
      const boxes = [...directBoxes, ...rawBoxes]
        .filter((box) => [box.x1, box.y1, box.x2, box.y2].every(Number.isFinite))
        .filter((box) => {
          const key = `${Math.round(box.x1)}:${Math.round(box.y1)}:${Math.round(box.x2)}:${Math.round(box.y2)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      if (boxes.length) {
        setDetectedBoxes(boxes);
        setSelectedBoxIndex(choosePreferredBoxIndex(boxes, detectionPhrase));
        setBoxSource('detected');
        setNotice('');
        toast(`Dual LoRA image finished. Found ${boxes.length} candidate box(es).`, 'success');
      } else {
        setNotice('Dual LoRA image finished. Detection returned no preview boxes.');
        toast('Dual LoRA image finished.', 'success');
      }
    } catch (err: any) {
      toast(err.message || 'Dual LoRA workflow failed', 'error');
    } finally {
      setRunningWorkflow(false);
    }
  };

  const selectedLabel = useMemo(() => {
    if (!selectedBox) return 'No person selected';
    const source = boxSource === 'detected' ? 'Detected' : boxSource === 'manual' ? 'Manual' : 'Auto-marked';
    return `${source} person #${selectedBoxIndex + 1}`;
  }, [boxSource, selectedBox, selectedBoxIndex]);

  const loraOptions = availableLoras.length ? availableLoras : [loraMainName, loraDetailName].filter(Boolean);

  return (
    <WorkflowShell
      title="Dual LoRA"
      eyebrow="Z-Image"
      description="Create a two-person image, choose one person, then refine that person with the second LoRA."
      icon={CircleDot}
      isGenerating={isRunning}
      canGenerate={canRun && !isRunning}
      preview={<TopPreviewStrip storageKey="zimage_dual_lora" maxItems={12} />}
      hideOutputPane
      output={null}
    >
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
        </section>

          <main className="space-y-3">
            <section className={`${panelBase} p-3`}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white/85">Characters + Prompt</div>
                      <p className="mt-1 text-[11px] text-white/35">Descriptions load from each LoRA's character sheet. Edit if you want, then build the prompts.</p>
                    </div>
                    <button onClick={composePrompts} className={`${buttonBase} border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]`}>
                      <Wand2 className="h-3.5 w-3.5" />
                      Build Prompts
                    </button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {[
                      { title: 'Person 1 · full scene', slot: 'a' as const, lora: loraMainName, gender: genderA, setGender: setGenderA, trigger: triggerA, appearance: appearanceA, setAppearance: setAppearanceA, setTrigger: setTriggerA, accent: 'sky' },
                      { title: 'Person 2 · the change', slot: 'b' as const, lora: loraDetailName, gender: genderB, setGender: setGenderB, trigger: triggerB, appearance: appearanceB, setAppearance: setAppearanceB, setTrigger: setTriggerB, accent: 'emerald' },
                    ].map((p) => (
                      <div key={p.slot} className={`rounded-lg border p-2.5 ${p.accent === 'sky' ? 'border-sky-400/20 bg-sky-400/[0.03]' : 'border-emerald-400/20 bg-emerald-400/[0.03]'}`}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/75">{p.title}</div>
                          <div className="flex items-center gap-1.5">
                            <select value={p.gender} onChange={(e) => p.setGender(e.target.value)} className={`${inputBase} h-7 w-24 py-0`}>
                              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <button
                              title="Reload description from the LoRA's sheet"
                              onClick={() => void loadSheet(p.lora, p.slot, p.setTrigger, p.setAppearance, { force: true })}
                              disabled={!p.lora || sheetLoading[p.slot]}
                              className={`${buttonBase} h-7 border-white/10 bg-white/[0.04] px-2 py-0 text-white/60 hover:bg-white/[0.08]`}
                            >
                              {sheetLoading[p.slot] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                        {p.lora
                          ? <div className="mb-1.5 text-[10px] text-white/40">{shortLoraLabel(p.lora)}{p.trigger ? <> · trigger <span className="font-mono text-white/60">{p.trigger}</span></> : ' · no sheet found'}</div>
                          : <div className="mb-1.5 text-[10px] text-white/25">Pick this person's LoRA above ↑</div>}
                        <textarea
                          value={p.appearance}
                          onChange={(e) => p.setAppearance(e.target.value)}
                          rows={5}
                          placeholder="Appearance description (auto-loads from the LoRA sheet)…"
                          className={`${inputBase} resize-none text-[11px] leading-relaxed`}
                        />
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
                  <PromptAssistant
                    context="zimage"
                    value={mainPrompt}
                    onChange={setMainPrompt}
                    label="Full Scene Prompt"
                    minRows={5}
                    accent="sky"
                    placeholder="Prompt for the first image with both people..."
                  />
                  <PromptAssistant
                    context="zimage"
                    value={detailPrompt}
                    onChange={setDetailPrompt}
                    label="Selected Person Prompt"
                    minRows={3}
                    accent="emerald"
                    placeholder="Prompt used when refining the chosen person..."
                    enableCaption={false}
                  />
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
                  <button onClick={clearSelection} className={`${buttonBase} border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]`}>
                    <Eraser className="h-3.5 w-3.5" />
                    Clear Boxes
                  </button>
                </div>
                <div className="text-xs text-white/45">{selectedLabel}</div>
              </div>

              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-h-[420px] bg-[#07080a] p-3">
                  {baseImageUrl ? (
                    <div className="flex h-full items-start justify-center">
                      <div className="relative inline-block max-w-full">
                        <img
                          ref={imageRef}
                          src={baseImageUrl}
                          alt="Base"
                          className="max-h-[620px] rounded-lg border border-white/10 object-contain"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            setNaturalSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
                          }}
                        />
                        {manualMarkMode && (
                          <div
                            className="absolute inset-0 cursor-crosshair"
                            onMouseDown={(e) => {
                              const point = eventToNaturalPoint(e);
                              if (!point) return;
                              setDragStart(point);
                              setDragCurrent(point);
                            }}
                            onMouseMove={(e) => {
                              if (!dragStart) return;
                              const point = eventToNaturalPoint(e);
                              if (point) setDragCurrent(point);
                            }}
                            onMouseUp={(e) => {
                              if (!dragStart) return;
                              const point = eventToNaturalPoint(e);
                              setDragStart(null);
                              setDragCurrent(null);
                              if (!point) return;
                              const box = {
                                x1: Math.min(dragStart.x, point.x),
                                y1: Math.min(dragStart.y, point.y),
                                x2: Math.max(dragStart.x, point.x),
                                y2: Math.max(dragStart.y, point.y),
                              };
                              const minSize = Math.max(naturalSize.w, naturalSize.h) * 0.03;
                              if (box.x2 - box.x1 < minSize || box.y2 - box.y1 < minSize) {
                                toast('Manual box too small.', 'error');
                                return;
                              }
                              setDetectedBoxes([box]);
                              setSelectedBoxIndex(0);
                              setBoxSource('manual');
                              setManualMarkMode(false);
                              setNotice('Manual person box selected.');
                            }}
                          />
                        )}

                        {detectedBoxes.map((box, index) => {
                          const active = index === selectedBoxIndex;
                          return (
                            <button
                              key={`${index}-${Math.round(box.x1)}-${Math.round(box.y1)}`}
                              onClick={() => setSelectedBoxIndex(index)}
                              className={`absolute rounded-sm border-2 transition ${active ? 'border-white bg-white/15 shadow-[0_0_0_1px_rgba(0,0,0,0.8)]' : 'border-white/45 bg-white/5 hover:bg-white/10'}`}
                              style={{
                                left: `${(box.x1 / naturalSize.w) * 100}%`,
                                top: `${(box.y1 / naturalSize.h) * 100}%`,
                                width: `${((box.x2 - box.x1) / naturalSize.w) * 100}%`,
                                height: `${((box.y2 - box.y1) / naturalSize.h) * 100}%`,
                              }}
                              title={`Person box ${index + 1}`}
                            />
                          );
                        })}

                        {draftBox && (
                          <div
                            className="pointer-events-none absolute rounded-sm border-2 border-white bg-white/10"
                            style={{
                              left: `${(draftBox.x1 / naturalSize.w) * 100}%`,
                              top: `${(draftBox.y1 / naturalSize.h) * 100}%`,
                              width: `${((draftBox.x2 - draftBox.x1) / naturalSize.w) * 100}%`,
                              height: `${((draftBox.y2 - draftBox.y1) / naturalSize.h) * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20">
                      <div className="text-center text-white/35">
                        <ImageIcon className="mx-auto mb-3 h-8 w-8 opacity-40" />
                        <div className="text-sm font-semibold">No image yet</div>
                        <div className="mt-1 text-xs text-white/25">Choose two LoRAs, choose side/person, then run once.</div>
                      </div>
                    </div>
                  )}
                </div>

                <aside className="border-t border-white/10 bg-[#0b0c10] p-3 xl:border-l xl:border-t-0">
                  <div className="space-y-3">
                    <div>
                      <div className="mb-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-white/45">Person To Refine</div>
                        <p className="mt-1 text-[11px] text-white/30">Pick which side should receive Person 2's LoRA during the built-in mask/refine step.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {TARGET_CHOICES.map((choice) => (
                          <button
                            key={choice.side}
                            onClick={() => setDetectionTarget(targetPhraseForSide(choice.side))}
                            className={`${buttonBase} flex-col gap-0.5 py-2.5 ${selectedTargetSide === choice.side ? 'border-white/25 bg-white/12 text-white' : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]'}`}
                          >
                            <span>{choice.label}</span>
                            <span className="text-[9px] font-normal uppercase tracking-wide text-white/35">{choice.hint} / {choice.side === 'left' ? genderA || 'person' : genderB || 'person'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={applyFallbackBoxes} disabled={!baseImageUrl} className={`${buttonBase} border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]`}>
                        Auto-Mark Person
                      </button>
                      <button
                        onClick={() => {
                          if (!baseImageUrl) return;
                          setManualMarkMode((value) => !value);
                          setDragStart(null);
                          setDragCurrent(null);
                          setNotice(manualMarkMode ? '' : 'Manual mark mode active.');
                        }}
                        disabled={!baseImageUrl}
                        className={`${buttonBase} ${manualMarkMode ? 'border-white/25 bg-white/12 text-white' : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'}`}
                      >
                        Manual Box
                      </button>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-black/25 p-2.5 text-xs text-white/55">
                      <div className="flex justify-between">
                        <span>Person boxes</span>
                        <span>{detectedBoxes.length}</span>
                      </div>
                      <div className="mt-1 flex justify-between">
                        <span>Selection</span>
                        <span>{boxSource}</span>
                      </div>
                      <div className="mt-1 flex justify-between">
                        <span>Chosen</span>
                        <span>{selectedBoxIndex >= 0 ? `#${selectedBoxIndex + 1}` : '-'}</span>
                      </div>
                    </div>

                    {notice && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs text-white/55">{notice}</div>}

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
