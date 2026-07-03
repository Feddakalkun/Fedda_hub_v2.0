import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Image as ImageIcon, Loader2, Play, Plus, Trash2, Wand2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { WorkflowShell } from '../../components/layout/WorkflowShell';
import { triggerMediaDownload } from '../../utils/mediaStore';
import { inputBase, panel, cn } from '../../lib/styles';
import { Field, NeutralButton } from '../../components/ui/FeddaPrimitives';

const QUALITY_PRESETS = {
  Turbo: { steps: 12, mu: 0.5, std: 1.75 },
  Default: { steps: 20, mu: 0.0, std: 1.75 },
  Quality: { steps: 48, mu: 0.0, std: 1.5 },
} as const;
type QualityKey = keyof typeof QUALITY_PRESETS;

const SIZE_PRESETS = [
  { label: 'Square', w: 1024, h: 1024 },
  { label: 'Portrait', w: 880, h: 1456 },
  { label: 'Wide', w: 1456, h: 880 },
  { label: 'Tall', w: 784, h: 1456 },
];

const STYLE_OPTIONS = ['none', 'auto', 'realistic', 'design', 'illustration', 'render_3d', 'anime'];
const BG_PRESETS = ['white bg', 'black bg', 'transparent', 'gradient', 'studio'];

interface IdeogramElement {
  id: string;
  type: 'text' | 'obj';
  text: string;
  desc: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function newElement(type: 'text' | 'obj'): IdeogramElement {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    text: '',
    desc: '',
    x: 0.1,
    y: 0.1,
    w: 0.4,
    h: 0.2,
  };
}

function serializeElements(elements: IdeogramElement[]): string {
  return JSON.stringify(
    elements.map((el) => ({
      type: el.type,
      text: el.type === 'obj' ? '' : el.text,
      desc: el.desc,
      palette: [] as string[],
      x: el.x,
      y: el.y,
      w: el.w,
      h: el.h,
    })),
  );
}

const ImagePreviewStrip = ({
  currentImage,
  history,
  isGenerating,
  previewUrl,
  onSelectImage,
  downloadName,
}: {
  currentImage: string | null;
  history: string[];
  isGenerating: boolean;
  previewUrl: string | null;
  onSelectImage: (url: string) => void;
  downloadName: string;
}) => {
  const display = currentImage || (isGenerating ? previewUrl : null);
  return (
    <section className="rounded-xl border border-white/10 bg-[#09090b] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <ImageIcon className="h-3.5 w-3.5" />
          Output
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-zinc-600">
            {isGenerating ? 'Generating' : 'Recent'} · {history.length}
          </span>
          {currentImage && (
            <>
              <button
                type="button"
                onClick={() => window.open(currentImage, '_blank', 'noopener,noreferrer')}
                className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 transition hover:text-zinc-100"
                title="Open full size"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => triggerMediaDownload(currentImage, downloadName)}
                className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 transition hover:text-zinc-100"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-2 flex min-h-[180px] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/30">
        {isGenerating && !display ? (
          <span className="flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </span>
        ) : display ? (
          <img
            src={display}
            alt="Ideogram output"
            className="max-h-[480px] w-auto max-w-full object-contain"
          />
        ) : (
          <span className="text-sm text-zinc-700">No output yet</span>
        )}
      </div>

      {history.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {history.slice(0, 14).map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => onSelectImage(url)}
              className={cn(
                'h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition',
                url === currentImage
                  ? 'border-violet-500/50'
                  : 'border-white/10 hover:border-white/30',
              )}
            >
              <img src={url} alt={`Output ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export function IdeogramTxt2ImgPage() {
  const { toast } = useToast();
  const {
    state: execState,
    error: execError,
    lastOutputImages,
    outputReadyCount,
    previewUrl,
    registerNodeMap,
    startExecution,
  } = useComfyExecution();

  const prevImgCountRef = useRef(0);

  const [description, setDescription] = usePersistentState('ideogram_description', '');
  const [background, setBackground] = usePersistentState('ideogram_background', 'white bg');
  const [style, setStyle] = usePersistentState('ideogram_style', 'none');
  const [aesthetics, setAesthetics] = usePersistentState('ideogram_aesthetics', '');
  const [lighting, setLighting] = usePersistentState('ideogram_lighting', '');
  const [medium, setMedium] = usePersistentState('ideogram_medium', '');
  const [bgBrightness, setBgBrightness] = usePersistentState('ideogram_bg_brightness', 13);
  const [elements, setElements] = usePersistentState<IdeogramElement[]>('ideogram_elements', []);
  const [width, setWidth] = usePersistentState('ideogram_width', 1024);
  const [height, setHeight] = usePersistentState('ideogram_height', 1024);
  const [quality, setQuality] = usePersistentState<QualityKey>('ideogram_quality', 'Default');
  const [seed, setSeed] = usePersistentState('ideogram_seed', -1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);

  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [history, setHistory] = usePersistentState<string[]>('ideogram_history', []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);

  const canRun = !!description.trim() && !isGenerating;

  useEffect(() => {
    if (!isGenerating && !pendingPromptId) return;
    if (!lastOutputImages?.length) return;
    const newImgs = lastOutputImages.slice(prevImgCountRef.current);
    if (newImgs.length === 0) return;
    prevImgCountRef.current = lastOutputImages.length;
    const urls = newImgs.map((img) => comfyService.getImageUrl(img));
    const ideogramUrls = urls.filter((url) => /ideogram/i.test(url));
    const picked = ideogramUrls.length > 0 ? ideogramUrls : urls;
    if (picked.length === 0) return;
    setCurrentImage(picked[picked.length - 1]);
    setHistory((prev) => [...picked, ...prev].slice(0, 30));
  }, [outputReadyCount, lastOutputImages, isGenerating, pendingPromptId, setHistory]);

  useEffect(() => {
    if (!pendingPromptId) return;
    if (execState === 'done') {
      setIsGenerating(false);
      setPendingPromptId(null);
      toast('Ideogram generation complete', 'success');
    }
    if (execState === 'error') {
      setIsGenerating(false);
      setPendingPromptId(null);
      const message = typeof execError === 'string' ? execError : execError?.message ?? 'Ideogram failed';
      toast(message, 'error');
    }
  }, [execError, execState, pendingPromptId, toast]);

  useEffect(() => {
    if (!pendingPromptId || !isGenerating) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 360;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(
          `${BACKEND_API.BASE_URL}/api/generate/status/${encodeURIComponent(pendingPromptId)}`,
        );
        const data = await res.json();
        if (!res.ok || !data.success) return;
        if (data.status === 'completed') {
          const images = Array.isArray(data.images) ? data.images : [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const urls = images.map((img: any) => comfyService.getImageUrl(img));
          const ideogramUrls = urls.filter((url: string) => /ideogram/i.test(url));
          const picked = ideogramUrls.length > 0 ? ideogramUrls : urls;
          if (picked.length > 0) {
            setCurrentImage(picked[picked.length - 1]);
            setHistory((prev) => [...picked, ...prev].slice(0, 30));
          }
          setIsGenerating(false);
          setPendingPromptId(null);
          toast('Ideogram generation complete', 'success');
          return;
        }
      } catch {
        // keep polling on transient errors
      }
      if (!cancelled && attempts >= maxAttempts) {
        setIsGenerating(false);
        setPendingPromptId(null);
        toast('Timed out waiting for Ideogram output.', 'error');
      }
    };

    const timer = window.setInterval(poll, 5000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isGenerating, pendingPromptId, setHistory, toast]);

  const runIdeogram = async () => {
    if (!canRun) return;
    prevImgCountRef.current = lastOutputImages?.length ?? 0;
    setIsGenerating(true);

    fetch(`${BACKEND_API.BASE_URL}/api/workflow/node-map/ideogram-txt2img`)
      .then((r) => r.json())
      .then((data) => { if (data.success) registerNodeMap(data.node_map); })
      .catch(() => {});

    const preset = QUALITY_PRESETS[quality];
    const effectiveSeed = seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed;

    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'ideogram-txt2img',
          params: {
            description: description.trim(),
            background: background.trim(),
            style,
            aesthetics: aesthetics.trim(),
            lighting: lighting.trim(),
            medium: medium.trim(),
            bg_brightness: bgBrightness,
            elements_data: serializeElements(elements),
            width,
            height,
            steps: preset.steps,
            mu: preset.mu,
            std: preset.std,
            seed: effectiveSeed,
            client_id: comfyService.clientId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Ideogram generation failed');
      setPendingPromptId(String(data.prompt_id));
      startExecution();
    } catch (err: unknown) {
      setIsGenerating(false);
      const message = err instanceof Error ? err.message : 'Ideogram generation failed';
      toast(message, 'error');
    }
  };

  const updateElement = (id: string, patch: Partial<IdeogramElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  };

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
  };

  const generateLayout = async () => {
    const desc = description.trim();
    if (!desc) { toast('Enter a description first', 'error'); return; }
    setIsGeneratingLayout(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/ideogram/generate-layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: desc }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Layout generation failed');
      if (data.description) setDescription(data.description);
      if (data.background) setBackground(data.background);
      if (Array.isArray(data.elements)) {
        setElements(
          data.elements.map((el: { type: string; text: string; desc: string; x: number; y: number; w: number; h: number }) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: (el.type === 'text' ? 'text' : 'obj') as 'text' | 'obj',
            text: el.text ?? '',
            desc: el.desc ?? '',
            x: el.x ?? 0.1,
            y: el.y ?? 0.1,
            w: el.w ?? 0.4,
            h: el.h ?? 0.2,
          })),
        );
      }
      toast(`Layout generated — ${data.elements?.length ?? 0} elements`, 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Layout generation failed', 'error');
    } finally {
      setIsGeneratingLayout(false);
    }
  };

  return (
    <WorkflowShell
      title="Ideogram 4"
      eyebrow="Txt2Img · Local"
      description="Generate images with structured text and object placement using a local Ideogram 4 model."
      icon={ImageIcon}
      isGenerating={isGenerating}
      canGenerate={canRun}
      leftClassName="bg-[#050505]"
      hideOutputPane
      workflowId="ideogram-txt2img"
      output={null}
    >
      <div className="mx-auto max-w-5xl space-y-4 px-4 pb-8">
        <ImagePreviewStrip
          currentImage={currentImage}
          history={history}
          isGenerating={isGenerating}
          previewUrl={previewUrl}
          onSelectImage={setCurrentImage}
          downloadName="fedda-ideogram.png"
        />

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* Left: content */}
          <div className="space-y-4">
            <section className={panel}>
              <div className="space-y-4">
                <Field label="Description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className={cn(inputBase, 'resize-y leading-relaxed')}
                    placeholder="Describe the overall image: scene, mood, content, style..."
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Background">
                    <div className="space-y-1.5">
                      <input
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                        className={inputBase}
                        placeholder="e.g. white bg, black bg, gradient..."
                      />
                      <div className="flex flex-wrap gap-1">
                        {BG_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setBackground(p)}
                            className={cn(
                              'rounded border px-2 py-0.5 text-[10px] transition',
                              background === p
                                ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                                : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300',
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Field>

                  <Field label="Style">
                    <select
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                      className={cn(inputBase, 'cursor-pointer')}
                    >
                      {STYLE_OPTIONS.map((s) => (
                        <option key={s} value={s} className="bg-zinc-900">
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
                  >
                    {showAdvanced ? '− Advanced prompt fields' : '+ Advanced prompt fields (aesthetics, lighting, medium)'}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Field label="Aesthetics">
                        <input
                          value={aesthetics}
                          onChange={(e) => setAesthetics(e.target.value)}
                          className={inputBase}
                          placeholder="cinematic, moody..."
                        />
                      </Field>
                      <Field label="Lighting">
                        <input
                          value={lighting}
                          onChange={(e) => setLighting(e.target.value)}
                          className={inputBase}
                          placeholder="golden hour, studio..."
                        />
                      </Field>
                      <Field label="Medium">
                        <input
                          value={medium}
                          onChange={(e) => setMedium(e.target.value)}
                          className={inputBase}
                          placeholder="oil painting, photo..."
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Elements builder */}
            <section className={panel}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                  Placed Elements{elements.length > 0 ? ` (${elements.length})` : ''}
                </p>
                <div className="flex gap-2">
                  <NeutralButton
                    onClick={generateLayout}
                    disabled={isGeneratingLayout || !description.trim()}
                    className="border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                  >
                    {isGeneratingLayout ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    {isGeneratingLayout ? 'Thinking...' : 'AI Layout'}
                  </NeutralButton>
                  <NeutralButton
                    onClick={() => setElements((prev) => [...prev, newElement('text')])}
                  >
                    <Plus className="h-3 w-3" />
                    Text
                  </NeutralButton>
                  <NeutralButton
                    onClick={() => setElements((prev) => [...prev, newElement('obj')])}
                  >
                    <Plus className="h-3 w-3" />
                    Object
                  </NeutralButton>
                </div>
              </div>

              {elements.length === 0 ? (
                <p className="py-3 text-center text-[12px] text-zinc-600">
                  Optional: add text or object elements to precisely control their placement in the image.
                  Position values are 0.0–1.0 (fraction of image size).
                </p>
              ) : (
                <div className="space-y-3">
                  {elements.map((el) => (
                    <div key={el.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                            el.type === 'text'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-emerald-500/20 text-emerald-300',
                          )}
                        >
                          {el.type}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeElement(el.id)}
                          className="text-zinc-600 transition hover:text-zinc-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {el.type === 'text' && (
                          <textarea
                            value={el.text}
                            onChange={(e) => updateElement(el.id, { text: e.target.value })}
                            rows={2}
                            className={cn(inputBase, 'resize-y text-xs')}
                            placeholder="Text content (use \n for line breaks)"
                          />
                        )}
                        <textarea
                          value={el.desc}
                          onChange={(e) => updateElement(el.id, { desc: e.target.value })}
                          rows={2}
                          className={cn(inputBase, 'resize-y text-xs')}
                          placeholder={
                            el.type === 'text'
                              ? 'Visual description of text style (bold sans-serif, white, metallic...)'
                              : 'Describe the object (photorealistic person, car, tree...)'
                          }
                        />

                        <div className="grid grid-cols-4 gap-1.5">
                          {(['x', 'y', 'w', 'h'] as const).map((key) => (
                            <div key={key}>
                              <p className="mb-0.5 text-[9px] uppercase tracking-wider text-zinc-600">
                                {key === 'x' ? 'Left' : key === 'y' ? 'Top' : key === 'w' ? 'Width' : 'Height'}
                              </p>
                              <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.01}
                                value={el[key]}
                                onChange={(e) =>
                                  updateElement(el.id, {
                                    [key]: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                                  })
                                }
                                className={cn(inputBase, 'px-2 py-1 text-xs font-mono')}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right: settings + generate */}
          <div className="space-y-4">
            <section className={panel}>
              <div className="space-y-4">
                <Field label="Quality Preset">
                  <div className="flex gap-1">
                    {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setQuality(key)}
                        className={cn(
                          'flex-1 rounded-lg border py-2 text-xs font-semibold transition',
                          quality === key
                            ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                            : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]',
                        )}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {QUALITY_PRESETS[quality].steps} steps
                  </p>
                </Field>

                <Field label="Size">
                  <div className="grid grid-cols-2 gap-1 mb-2">
                    {SIZE_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => { setWidth(p.w); setHeight(p.h); }}
                        className={cn(
                          'rounded-lg border py-2 text-xs font-semibold transition',
                          width === p.w && height === p.h
                            ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                            : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]',
                        )}
                      >
                        {p.label}
                        <span className="block text-[9px] font-normal opacity-60">
                          {p.w}×{p.h}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-[10px] text-zinc-600">W</p>
                      <input
                        type="number"
                        min={256}
                        max={2048}
                        step={16}
                        value={width}
                        onChange={(e) =>
                          setWidth(Math.max(256, Math.round(Number(e.target.value) / 16) * 16))
                        }
                        className={cn(inputBase, 'text-xs')}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] text-zinc-600">H</p>
                      <input
                        type="number"
                        min={256}
                        max={2048}
                        step={16}
                        value={height}
                        onChange={(e) =>
                          setHeight(Math.max(256, Math.round(Number(e.target.value) / 16) * 16))
                        }
                        className={cn(inputBase, 'text-xs')}
                      />
                    </div>
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="BG Brightness">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={bgBrightness}
                      onChange={(e) => setBgBrightness(Number(e.target.value))}
                      className={cn(inputBase, 'text-xs')}
                    />
                  </Field>
                  <Field label="Seed (−1 = random)">
                    <input
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(Number(e.target.value))}
                      className={cn(inputBase, 'text-xs')}
                    />
                  </Field>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-500">
                  <span className="font-semibold text-zinc-400">Model:</span> ideogram4_fp8_scaled
                  &nbsp;·&nbsp;
                  <span className="font-semibold text-zinc-400">Size:</span> {width}×{height}
                  &nbsp;·&nbsp;
                  <span className="font-semibold text-zinc-400">Steps:</span>{' '}
                  {QUALITY_PRESETS[quality].steps}
                </div>

                <NeutralButton
                  onClick={runIdeogram}
                  disabled={!canRun}
                  className="w-full py-3 text-sm"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isGenerating ? 'Generating...' : 'Generate'}
                </NeutralButton>

                {!description.trim() && (
                  <p className="text-center text-[11px] text-zinc-600">
                    Enter a description to enable generation
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </WorkflowShell>
  );
}

export default IdeogramTxt2ImgPage;
