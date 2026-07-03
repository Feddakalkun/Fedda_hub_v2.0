import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ListOrdered, Loader2, Sparkles } from 'lucide-react';
import { WorkflowShell } from '../../components/layout/WorkflowShell';
import { WorkflowPreviewBar } from '../../components/layout/WorkflowPreviewBar';
import { SimpleImageCockpit, type SimpleImageLoraEntry, type SimpleImagePromptPreset } from '../../components/workflows/SimpleImageCockpit';
import type { PromptContext } from '../../components/ui/PromptAssistant';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { consumeHandoff } from '../../utils/workflowHandoff';

const PRESETS = [
  { label: '1:1', w: 1024, h: 1024 },
  { label: '2:3', w: 1024, h: 1536 },
  { label: '3:2', w: 1536, h: 1024 },
  { label: '9:16', w: 896, h: 1152 },
];

const DEFAULT_LORA_PREFIXES = ['zimage_turbo/', 'zimage-turbo/'];
const DEFAULT_LORA_PACKS = ['zimage_turbo', 'zimage_nsfw'];

type WorkflowModelStatus = {
  ready: boolean;
  missing_count: number;
  files?: Array<{
    filename?: string;
    exists?: boolean;
    status?: string;
    path?: string;
    error?: string | null;
  }>;
};

type LoraCatalogItem = {
  file: string;
  preview_url?: string;
};

interface Txt2ImgPageConfig {
  storageKey?: string;
  workflowId?: string;
  familyLabel?: string;
  promptContext?: PromptContext;
  accent?: 'emerald' | 'violet';
  loraPrefixes?: string[];
  loraPacks?: string[];
  aspectPresets?: Array<{ label: string; w: number; h: number }>;
  allowedResolutions?: Array<{ w: number; h: number }>;
  requireImageUpload?: boolean;
  imageParamKey?: string;
  imageLabel?: string;
  enableLoras?: boolean;
  defaultSteps?: number;
  defaultCfg?: number;
  defaultNegative?: string;
  maxSteps?: number;
  showCfgControl?: boolean;
  minCfg?: number;
  maxCfg?: number;
  characterPromptLabel?: string;
  characterPromptPlaceholder?: string;
  promptPresets?: SimpleImagePromptPreset[];

  showMaskSettings?: boolean;
  maskFace?: boolean;
  setMaskFace?: (value: boolean) => void;
  maskHair?: boolean;
  setMaskHair?: (value: boolean) => void;
  maskBody?: boolean;
  setMaskBody?: (value: boolean) => void;
  maskClothes?: boolean;
  setMaskClothes?: (value: boolean) => void;
  maskAccessories?: boolean;
  setMaskAccessories?: (value: boolean) => void;
  maskBackground?: boolean;
  setMaskBackground?: (value: boolean) => void;
  maskConfidence?: number;
  setMaskConfidence?: (value: number) => void;
  maskDetailErode?: number;
  setMaskDetailErode?: (value: number) => void;
  maskDetailDilate?: number;
  setMaskDetailDilate?: (value: number) => void;
  maskBlackPoint?: number;
  setMaskBlackPoint?: (value: number) => void;
  maskWhitePoint?: number;
  setMaskWhitePoint?: (value: number) => void;
  maskDilation?: number;
  setMaskDilation?: (value: number) => void;
  maskBlurAmount?: number;
  setMaskBlurAmount?: (value: number) => void;
}

const normLora = (value: string) => value.replace(/\\/g, '/').toLowerCase().trim();
const loraFileName = (path: string) => path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';

const resolveInstalledLoraName = (name: string, available: string[]) => {
  if (!name) return '';
  const direct = available.find((entry) => normLora(entry) === normLora(name));
  if (direct) return direct;

  const candidate = name
    .replace(/zimage_turbo/gi, 'zimage-turbo')
    .replace(/zimage\/turbo/gi, 'zimage-turbo');
  const fixed = available.find((entry) => normLora(entry) === normLora(candidate));
  return fixed ?? name;
};

export const ZImageTxt2Img = () => {
  return (
    <Txt2ImgPage
      storageKey="zimage"
      workflowId="z-image"
      familyLabel="Z-Image"
      promptContext="zimage"
      accent="violet"
      loraPrefixes={DEFAULT_LORA_PREFIXES}
      loraPacks={DEFAULT_LORA_PACKS}
    />
  );
};

export const Txt2ImgPage = ({
  storageKey = 'zimage',
  workflowId = 'z-image',
  familyLabel = 'Z-Image',
  promptLabel = 'Prompt',
  promptContext = 'zimage',
  accent = 'violet',
  loraPrefixes = DEFAULT_LORA_PREFIXES,
  loraPacks = DEFAULT_LORA_PACKS,
  aspectPresets = PRESETS,
  allowedResolutions = [],
  requireImageUpload = false,
  imageParamKey = 'image',
  imageLabel = 'Reference Image',
  enableLoras = true,
  defaultSteps = 11,
  defaultCfg = 1.0,
  defaultNegative = 'blurry, ugly, bad proportions, low quality, artifacts',
  maxSteps = 25,
  showCfgControl = false,
  minCfg = 0.5,
  maxCfg = 5,
  characterPromptLabel,
  characterPromptPlaceholder,
  promptPresets = [],

  showMaskSettings = false,
  maskFace: propMaskFace,
  setMaskFace: propSetMaskFace,
  maskHair: propMaskHair,
  setMaskHair: propSetMaskHair,
  maskBody: propMaskBody,
  setMaskBody: propSetMaskBody,
  maskClothes: propMaskClothes,
  setMaskClothes: propSetMaskClothes,
  maskAccessories: propMaskAccessories,
  setMaskAccessories: propSetMaskAccessories,
  maskBackground: propMaskBackground,
  setMaskBackground: propSetMaskBackground,
  maskConfidence: propMaskConfidence,
  setMaskConfidence: propSetMaskConfidence,
  maskDetailErode: propMaskDetailErode,
  setMaskDetailErode: propSetMaskDetailErode,
  maskDetailDilate: propMaskDetailDilate,
  setMaskDetailDilate: propSetMaskDetailDilate,
  maskBlackPoint: propMaskBlackPoint,
  setMaskBlackPoint: propSetMaskBlackPoint,
  maskWhitePoint: propMaskWhitePoint,
  setMaskWhitePoint: propSetMaskWhitePoint,
  maskDilation: propMaskDilation,
  setMaskDilation: propSetMaskDilation,
  maskBlurAmount: propMaskBlurAmount,
  setMaskBlurAmount: propSetMaskBlurAmount,
}: Txt2ImgPageConfig) => {
  const key = (name: string) => `${storageKey}_${name}`;
  const [prompt, setPrompt] = usePersistentState(key('prompt'), '');
  const [negativePrompt, setNegativePrompt] = usePersistentState(key('negative'), defaultNegative);
  const [characterPrompt, setCharacterPrompt] = usePersistentState(key('character_prompt'), '');
  const [width, setWidth] = usePersistentState(key('width'), 1024);
  const [height, setHeight] = usePersistentState(key('height'), 1024);
  const [steps, setSteps] = usePersistentState(key('steps'), defaultSteps);
  const [cfg, setCfg] = usePersistentState(key('cfg'), defaultCfg);
  const [seed, setSeed] = usePersistentState(key('seed'), -1);
  const [loraEntries, setLoraEntries] = usePersistentState<SimpleImageLoraEntry[]>(key('loras'), []);
  const [loraPreviewMap, setLoraPreviewMap] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = usePersistentState<string | null>(key('current_image'), null);
  const [history, setHistory] = usePersistentState<string[]>(key('history'), []);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const [negExpanded, setNegExpanded] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageName, setUploadedImageName] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [modelStatus, setModelStatus] = useState<WorkflowModelStatus | null>(null);
  const [modelStatusError, setModelStatusError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Batch queue state
  const [batchRaw, setBatchRaw] = usePersistentState(key('batch_raw'), '');
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const batchQueueRef = useRef<string[]>([]);
  const completionHandledRef = useRef(false);
  const submitRef = useRef<(promptText: string) => Promise<void>>();
  const onCompleteRef = useRef<(promptId: string, images?: Array<{ filename: string; subfolder: string; type: string }>) => void>();
  const pendingPromptIdRef = useRef<string | null>(null);

  const parsedBatchPrompts = useMemo(
    () => batchRaw.split('\n').map((l) => l.trim()).filter(Boolean),
    [batchRaw]
  );

  // Keep ref in sync so effects that depend only on execState can read the latest promptId
  pendingPromptIdRef.current = pendingPromptId;

  // Auto-set size to original image dimensions for SDXL Inpaint Automask
  useEffect(() => {
    if (requireImageUpload && uploadedImage && workflowId === 'sdxl-inpaint-automask') {
      const img = new Image();
      img.onload = () => {
        const w = Math.round(img.naturalWidth / 8) * 8;
        const h = Math.round(img.naturalHeight / 8) * 8;
        setWidth(w);
        setHeight(h);
      };
      img.src = uploadedImage;
    }
  }, [uploadedImage, requireImageUpload, workflowId, setWidth, setHeight]);

  // Mask settings for SDXL Inpaint Automask / PersonMaskUltra V2
  const [maskFace, setMaskFace] = usePersistentState(key('mask_face'), false);
  const [maskHair, setMaskHair] = usePersistentState(key('mask_hair'), false);
  const [maskBody, setMaskBody] = usePersistentState(key('mask_body'), false);
  const [maskClothes, setMaskClothes] = usePersistentState(key('mask_clothes'), false);
  const [maskAccessories, setMaskAccessories] = usePersistentState(key('mask_accessories'), false);
  const [maskBackground, setMaskBackground] = usePersistentState(key('mask_background'), false);
  const [maskConfidence, setMaskConfidence] = usePersistentState(key('mask_confidence'), 0.2);
  const [maskDetailErode, setMaskDetailErode] = usePersistentState(key('mask_detail_erode'), 6);
  const [maskDetailDilate, setMaskDetailDilate] = usePersistentState(key('mask_detail_dilate'), 6);
  const [maskBlackPoint, setMaskBlackPoint] = usePersistentState(key('mask_black_point'), 0.01);
  const [maskWhitePoint, setMaskWhitePoint] = usePersistentState(key('mask_white_point'), 0.99);
  const [maskDilation, setMaskDilation] = usePersistentState(key('mask_dilation'), 50);
  const [maskBlurAmount, setMaskBlurAmount] = usePersistentState(key('mask_blur_amount'), 50);

  const { toast } = useToast();
  const {
    state: execState,
    clearOutputs,
    previewUrl,
    outputReadyCount,
    lastOutputImages,
    registerNodeMap,
  } = useComfyExecution();

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((lora) => {
        const normalized = normLora(lora);
        return loraPrefixes.some((prefix) => normalized.startsWith(normLora(prefix)));
      });
      setAvailableLoras(filtered);
    }).catch(() => {});
  }, [loraPrefixes]);

  useEffect(() => {
    let cancelled = false;

    const fetchModelStatus = async () => {
      try {
        const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.WORKFLOW_MODEL_STATUS}/${workflowId}`);
        const data = await response.json();
        if (cancelled) return;
        if (!data?.success) throw new Error(data?.detail || 'Model status unavailable');
        setModelStatus(data);
        setModelStatusError(null);
      } catch (error: any) {
        if (!cancelled) setModelStatusError(error.message || 'Model status unavailable');
      }
    };

    fetchModelStatus();
    const interval = window.setInterval(fetchModelStatus, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [workflowId]);

  useEffect(() => {
    const fetchCatalog = async (packKey: string) => {
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/lora/pack/${packKey}/catalog?limit=3000`);
      const data = await response.json();
      if (!data?.success || !Array.isArray(data?.items)) return [] as LoraCatalogItem[];
      return data.items as LoraCatalogItem[];
    };

    Promise.all(loraPacks.map((pack) => fetchCatalog(pack)))
      .then((packSets) => {
        const map: Record<string, string> = {};
        packSets.flat().forEach((item) => {
          if (!item?.file || !item?.preview_url) return;
          map[normLora(item.file)] = item.preview_url;
          map[loraFileName(item.file)] = item.preview_url;
        });
        setLoraPreviewMap(map);
      })
      .catch(() => {});
  }, [loraPacks]);

  useEffect(() => {
    if (availableLoras.length === 0 || loraEntries.length === 0) return;
    const normalized = loraEntries.map((entry) => ({
      ...entry,
      name: resolveInstalledLoraName(entry.name, availableLoras),
    }));
    const changed = normalized.some((entry, index) => entry.name !== loraEntries[index]?.name);
    if (changed) setLoraEntries(normalized);
  }, [availableLoras, loraEntries, setLoraEntries]);

  useEffect(() => {
    if (storageKey !== 'zimage') return;
    try {
      const marker = `${storageKey}_defaults_migrated_v2`;
      if (window.localStorage.getItem(marker)) return;
      setSteps(11);
      window.localStorage.setItem(`${storageKey}_cfg`, JSON.stringify(1.0));
      window.localStorage.setItem(marker, '1');
    } catch {
      // Ignore storage access errors.
    }
  }, [setSteps, storageKey]);

  useEffect(() => {
    if (storageKey !== 'chroma_txt2img') return;
    try {
      const marker = `${storageKey}_quality_defaults_v3`;
      if (window.localStorage.getItem(marker)) return;
      setSteps(defaultSteps);
      setNegativePrompt(defaultNegative);
      setCfg(defaultCfg);
      window.localStorage.setItem(marker, '1');
    } catch {
      // Ignore storage access errors.
    }
  }, [defaultCfg, defaultNegative, defaultSteps, setCfg, setNegativePrompt, setSteps, storageKey]);

  useEffect(() => {
    if (storageKey !== 'qwen_txt2img') return;
    try {
      const marker = `${storageKey}_lightning_defaults_v1`;
      if (window.localStorage.getItem(marker)) return;
      setSteps(defaultSteps);
      setCfg(defaultCfg);
      setNegativePrompt(defaultNegative);
      window.localStorage.setItem(marker, '1');
    } catch {
      // Ignore storage access errors.
    }
  }, [defaultCfg, defaultNegative, defaultSteps, setCfg, setNegativePrompt, setSteps, storageKey]);

  useEffect(() => {
    if (allowedResolutions.length === 0) return;
    if (workflowId === 'sdxl-inpaint-automask') return; // let image size or manual control it
    const isAllowed = allowedResolutions.some((resolution) => resolution.w === width && resolution.h === height);
    if (isAllowed) return;
    const fallback = aspectPresets[0] ?? allowedResolutions[0];
    if (!fallback) return;
    setWidth(fallback.w);
    setHeight(fallback.h);
  }, [allowedResolutions, aspectPresets, width, height, setWidth, setHeight, workflowId]);

  useEffect(() => {
    if (loraEntries.length > 0) return;
    try {
      const legacyNameRaw = window.localStorage.getItem(`${storageKey}_lora_name`);
      const legacyStrengthRaw = window.localStorage.getItem(`${storageKey}_lora_strength`);
      if (!legacyNameRaw) return;
      const legacyName = JSON.parse(legacyNameRaw) as string;
      const legacyStrength = legacyStrengthRaw ? Number(JSON.parse(legacyStrengthRaw)) : 1.0;
      if (legacyName && legacyName.trim()) {
        setLoraEntries([{ name: legacyName, strength: Number.isFinite(legacyStrength) ? legacyStrength : 1.0 }]);
      }
    } catch {
      // Ignore legacy parsing errors.
    }
  }, [loraEntries.length, setLoraEntries, storageKey]);

  useEffect(() => {
    if (execState !== 'done') return;
    const promptId = pendingPromptIdRef.current;
    if (!promptId) return;
    onCompleteRef.current?.(promptId);
  }, [execState]); // Only fires when execState transitions to 'done' — reading promptId via ref avoids spurious fires when a new promptId is set while execState is still 'done'

  // HTTP polling fallback — handles completion when WebSocket is unavailable
  useEffect(() => {
    if (!pendingPromptId) return;
    const capturedId = pendingPromptId;
    const intervalId = setInterval(async () => {
      if (completionHandledRef.current) { clearInterval(intervalId); return; }
      try {
        const resp = await fetch(`${BACKEND_API.BASE_URL}/api/generate/status/${capturedId}?workflow_id=${encodeURIComponent(workflowId)}`);
        const data = await resp.json();
        if (data.status !== 'completed') return;
        clearInterval(intervalId);
        onCompleteRef.current?.(capturedId, data.images);
      } catch {}
    }, 5000);
    return () => clearInterval(intervalId);
  }, [pendingPromptId, workflowId]);

  useEffect(() => {
    if (execState === 'error') {
      setIsGenerating(false);
      setPendingPromptId(null);
    }
  }, [execState]);

  useEffect(() => {
    if (!isGenerating || outputReadyCount <= 0 || lastOutputImages.length === 0) return;
    const urls = lastOutputImages.map((image) => comfyService.getImageUrl(image));
    setHistory((prev) => {
      const merged = [...urls, ...prev.filter((url) => !urls.includes(url))];
      return merged.slice(0, 40);
    });
    if (urls[0]) setCurrentImage(urls[0]);
  }, [isGenerating, outputReadyCount, lastOutputImages, setHistory, setCurrentImage]);

  const handleUploadImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setUploadedImageName(data.filename);
      if (uploadedImage?.startsWith('blob:')) URL.revokeObjectURL(uploadedImage);
      setUploadedImage(URL.createObjectURL(file));
    } catch (error: any) {
      toast(error.message || 'Upload failed', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  // Consume a "Send to Workflow" handoff image on first mount
  useEffect(() => {
    if (!requireImageUpload) return;
    const url = consumeHandoff('image');
    if (!url) return;
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const file = new File([blob], 'handoff-image.png', { type: blob.type || 'image/png' });
        return handleUploadImage(file);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Core API submission — called by both single generate and batch runner
  const _submitGeneration = async (promptText: string) => {
    completionHandledRef.current = false;
    clearOutputs();

    try {
      try {
        const nodeMapResponse = await fetch(`${BACKEND_API.BASE_URL}/api/workflow/node-map/${workflowId}`);
        const nodeMapData = await nodeMapResponse.json();
        if (nodeMapData.success) registerNodeMap(nodeMapData.node_map);
      } catch {
        // Execution can continue; the top strip falls back to raw node IDs.
      }

      const effectivePrompt = [promptText.trim(), characterPrompt.trim()].filter(Boolean).join(', ');

      const params: Record<string, unknown> = {
        prompt: effectivePrompt,
        negative: negativePrompt,
        width,
        height,
        preresize_min_width: width,
        preresize_min_height: height,
        seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
        steps,
        cfg,
        client_id: comfyService.clientId,
      };

      if (requireImageUpload && uploadedImageName) {
        params[imageParamKey] = uploadedImageName;
      }

      const activeLoras = enableLoras
        ? loraEntries
            .filter((lora) => lora.name && lora.name.trim())
            .map((lora) => ({
              name: resolveInstalledLoraName(lora.name, availableLoras),
              strength: lora.strength,
            }))
            .filter((lora) => {
              const normalized = normLora(lora.name);
              const hasValidPrefix = loraPrefixes.some((prefix) => normalized.startsWith(normLora(prefix)));
              const isInAvailable = availableLoras.some((entry) => normLora(entry) === normalized);
              return hasValidPrefix || isInAvailable;
            })
        : [];

      if (enableLoras && activeLoras.length > 0) params.loras = activeLoras;

      if (showMaskSettings) {
        params.mask_face = maskFace;
        params.mask_hair = maskHair;
        params.mask_body = maskBody;
        params.mask_clothes = maskClothes;
        params.mask_accessories = maskAccessories;
        params.mask_background = maskBackground;
        params.mask_confidence = maskConfidence;
        params.mask_detail_erode = maskDetailErode;
        params.mask_detail_dilate = maskDetailDilate;
        params.mask_black_point = maskBlackPoint;
        params.mask_white_point = maskWhitePoint;
        params.mask_dilation = maskDilation;
        params.mask_blur_amount = maskBlurAmount;
      }

      const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, params }),
      });
      const data = await response.json();
      if (data.success) setPendingPromptId(data.prompt_id);
      else throw new Error(data.detail || 'Failed');
    } catch (error: any) {
      toast(error.message || `${familyLabel} generate failed`, 'error');
      batchQueueRef.current = [];
      setBatchProgress(null);
      setIsGenerating(false);
    }
  };

  // Keep submitRef current so batch chain always uses latest params
  submitRef.current = _submitGeneration;

  // Completion handler: shows the image, then either starts the next batch item or ends
  onCompleteRef.current = (promptId, prefetchedImages) => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;

    const finish = async () => {
      try {
        let images: Array<{ filename: string; subfolder: string; type: string }> = prefetchedImages ?? [];
        if (images.length === 0) {
          const resp = await fetch(`${BACKEND_API.BASE_URL}/api/generate/status/${promptId}?workflow_id=${encodeURIComponent(workflowId)}`);
          const respData = await resp.json();
          images = respData.images ?? [];
        }
        if (images.length > 0) {
          const image = images[images.length - 1];
          const url = `/comfy/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=${image.type}`;
          setCurrentImage(url);
          setHistory((prev) => (prev.includes(url) ? prev : [url, ...prev.slice(0, 29)]));
          toast('Complete', 'success');
        }
      } catch {}

      const nextPrompt = batchQueueRef.current.shift();
      if (nextPrompt !== undefined) {
        setBatchProgress((prev) => (prev ? { ...prev, current: prev.current + 1 } : null));
        setPendingPromptId(null);
        setPrompt(nextPrompt);
        setTimeout(() => submitRef.current?.(nextPrompt), 300);
      } else {
        setBatchProgress(null);
        setIsGenerating(false);
        setPendingPromptId(null);
        clearOutputs();
      }
    };

    finish();
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    if (requireImageUpload && !uploadedImageName) {
      toast(`${familyLabel}: upload a reference image first`, 'error');
      return;
    }
    if (
      allowedResolutions.length > 0 &&
      !allowedResolutions.some((resolution) => resolution.w === width && resolution.h === height)
    ) {
      toast(`${familyLabel}: unsupported resolution ${width}x${height}`, 'error');
      return;
    }
    batchQueueRef.current = [];
    setBatchProgress(null);
    setIsGenerating(true);
    await _submitGeneration(prompt);
  };

  const handleBatchStart = async () => {
    if (parsedBatchPrompts.length === 0 || isGenerating) return;
    if (requireImageUpload && !uploadedImageName) {
      toast(`${familyLabel}: upload a reference image first`, 'error');
      return;
    }
    const [first, ...rest] = parsedBatchPrompts;
    batchQueueRef.current = rest;
    setBatchProgress({ current: 1, total: parsedBatchPrompts.length });
    setIsGenerating(true);
    setPrompt(first);
    await _submitGeneration(first);
  };

  const getLoraPreview = (loraPath: string) => {
    if (!loraPath) return null;
    const byPath = loraPreviewMap[normLora(loraPath)];
    if (byPath) return byPath;
    const byFile = loraPreviewMap[loraFileName(loraPath)];
    return byFile ?? null;
  };

  const stripImages = [
    ...(previewUrl ? [previewUrl] : []),
    ...history.filter((url) => url !== previewUrl),
  ];

  const missingModels = modelStatus?.files?.filter((file) => !file.exists) ?? [];
  const missingModelNames = missingModels.map((file) => file.filename || file.path || 'unknown model');
  const uploadReady = !requireImageUpload || !!uploadedImageName;
  const canGenerate = !!prompt.trim() && uploadReady && !isGenerating;

  const modelStatusBadge = modelStatusError ? (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
      <AlertCircle className="h-3 w-3" /> Status unknown
    </span>
  ) : modelStatus?.ready ? (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
      <CheckCircle2 className="h-3 w-3" /> Models ready
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-200">
      <Loader2 className="h-3 w-3 animate-spin" /> Checking models
    </span>
  );

  return (
    <WorkflowShell
      title={familyLabel}
      eyebrow="Image workflow"
      description={(
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {requireImageUpload
              ? 'Reference-guided generation with compact controls.'
              : 'Prompt, LoRA, preview and generation in one compact cockpit.'}
          </span>
          {modelStatusBadge}
        </div>
      )}
      icon={Sparkles}
      isGenerating={isGenerating}
      canGenerate={canGenerate}
      hideOutputPane
      preview={(
        <WorkflowPreviewBar
          title={`${familyLabel} previews`}
          images={stripImages}
          currentImage={currentImage}
          liveImage={previewUrl}
          historyCount={history.length}
          storageKey={`${storageKey}_top_preview`}
          emptyHint="Generate an image to fill this preview bar."
          onSelectImage={setCurrentImage}
        />
      )}
      output={null}
    >
      {/* Batch Queue */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setBatchExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/25 transition-colors hover:text-white/50"
          >
            <ListOrdered className="h-3 w-3" />
            Batch Queue
            {parsedBatchPrompts.length > 0 && (
              <span className="ml-1 rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[8px] text-violet-400">
                {parsedBatchPrompts.length}
              </span>
            )}
          </button>
          {batchProgress && (
            <span className="animate-pulse font-mono text-[9px] text-violet-400">
              {batchProgress.current} / {batchProgress.total}
            </span>
          )}
        </div>
        {batchExpanded && (
          <div className="mt-2 space-y-2">
            <textarea
              value={batchRaw}
              onChange={(e) => setBatchRaw(e.target.value)}
              placeholder={"Paste prompts — one per line:\n\na portrait of a woman in red...\na sunset over mountains...\na cyberpunk cityscape..."}
              disabled={!!batchProgress}
              rows={6}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/30 p-2.5 font-mono text-[11px] text-white/70 placeholder:text-white/15 focus:border-violet-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            />
            {parsedBatchPrompts.length > 0 && (
              <button
                type="button"
                onClick={handleBatchStart}
                disabled={isGenerating}
                className="w-full rounded-lg border border-violet-500/30 bg-violet-500/10 py-2 text-[10px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGenerating && batchProgress
                  ? `Generating ${batchProgress.current} / ${batchProgress.total}…`
                  : `Run Batch — ${parsedBatchPrompts.length} prompt${parsedBatchPrompts.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        )}
      </div>

      <SimpleImageCockpit
        promptLabel={promptLabel}
        promptContext={promptContext}
        workflowId={workflowId}
        prompt={prompt}
        setPrompt={setPrompt}
        promptPresets={promptPresets}
        characterPrompt={characterPrompt}
        setCharacterPrompt={setCharacterPrompt}
        characterPromptLabel={characterPromptLabel}
        characterPromptPlaceholder={characterPromptPlaceholder}
        familyLabel={familyLabel}
        accent={accent}
        requireImageUpload={requireImageUpload}
        imageLabel={imageLabel}
        uploadedImage={uploadedImage}
        uploadedImageName={uploadedImageName}
        uploadingImage={uploadingImage}
        fileInputRef={fileInputRef}
        onUploadImage={handleUploadImage}
        enableLoras={enableLoras}
        availableLoras={availableLoras}
        loraEntries={loraEntries}
        setLoraEntries={setLoraEntries}
        getLoraPreview={getLoraPreview}
        aspectPresets={aspectPresets}
        width={width}
        height={height}
        setWidth={setWidth}
        setHeight={setHeight}
        steps={steps}
        setSteps={setSteps}
        maxSteps={maxSteps}
        showCfgControl={showCfgControl}
        cfg={cfg}
        setCfg={setCfg}
        minCfg={minCfg}
        maxCfg={maxCfg}
        seed={seed}
        setSeed={setSeed}
        negativePrompt={negativePrompt}
        setNegativePrompt={setNegativePrompt}
        negExpanded={negExpanded}
        setNegExpanded={setNegExpanded}
        missingModels={missingModelNames}
        canGenerate={canGenerate}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}

        showMaskSettings={showMaskSettings}
        maskFace={maskFace}
        setMaskFace={setMaskFace}
        maskHair={maskHair}
        setMaskHair={setMaskHair}
        maskBody={maskBody}
        setMaskBody={setMaskBody}
        maskClothes={maskClothes}
        setMaskClothes={setMaskClothes}
        maskAccessories={maskAccessories}
        setMaskAccessories={setMaskAccessories}
        maskBackground={maskBackground}
        setMaskBackground={setMaskBackground}
        maskConfidence={maskConfidence}
        setMaskConfidence={setMaskConfidence}
        maskDetailErode={maskDetailErode}
        setMaskDetailErode={setMaskDetailErode}
        maskDetailDilate={maskDetailDilate}
        setMaskDetailDilate={setMaskDetailDilate}
        maskBlackPoint={maskBlackPoint}
        setMaskBlackPoint={setMaskBlackPoint}
        maskWhitePoint={maskWhitePoint}
        setMaskWhitePoint={setMaskWhitePoint}
        maskDilation={maskDilation}
        setMaskDilation={setMaskDilation}
        maskBlurAmount={maskBlurAmount}
        setMaskBlurAmount={setMaskBlurAmount}
      />
    </WorkflowShell>
  );
};
