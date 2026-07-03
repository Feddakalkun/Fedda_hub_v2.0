import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2, Play, RefreshCw, Upload, Wand2 } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { comfyService } from '../../services/comfyService';
import { FeddaButton, FeddaSectionTitle } from '../../components/ui/FeddaPrimitives';
import { WorkflowWorkbench } from '../../components/layout/WorkflowWorkbench';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';

type HyRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

const HY_RATIOS: HyRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4'];

const HY_DIMS: Record<HyRatio, [number, number]> = {
  '16:9': [848, 480],
  '9:16': [480, 848],
  '1:1':  [624, 624],
  '4:3':  [832, 624],
  '3:4':  [624, 832],
};

function hyDirection(ratio: HyRatio): string {
  return ratio === '9:16' || ratio === '3:4' ? 'Vertical' : 'Horizontal';
}

function hyAspect(ratio: HyRatio): string {
  const map: Record<HyRatio, string> = {
    '16:9': '16:9', '9:16': '16:9', '1:1': '1:1', '4:3': '4:3', '3:4': '4:3',
  };
  return map[ratio];
}

function RefImageSlot({ preview, uploading, onFile, onUrl }: {
  preview: string | null;
  uploading: boolean;
  onFile: (file: File) => void;
  onUrl?: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file?.type.startsWith('image/')) { onFile(file); return; }
        const url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
        if (url && onUrl) onUrl(url.trim());
      }}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      className={`relative cursor-pointer overflow-hidden rounded-xl border border-dashed transition-all group ${
        dragOver ? 'border-violet-400/60 bg-violet-500/10' :
        preview ? 'border-zinc-500/40 bg-black/40' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/25'
      }`}
      style={{ height: 150 }}
    >
      {preview ? (
        <>
          <img src={preview} alt="Reference" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-all group-hover:opacity-100">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/70">Replace reference</span>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-white/45" /> : <Upload className="h-6 w-6 text-white/15" />}
          <span className="text-[10px] font-black uppercase tracking-widest text-white/25">
            {uploading ? 'Uploading...' : 'Reference Image'}
          </span>
          <span className="text-[9px] text-white/[0.12]">Click or drop jpg/png</span>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
      />
    </div>
  );
}

export const HunyuanImg2VidPage = () => {
  const [prompt, setPrompt] = usePersistentState('hy_i2v_prompt', '');
  const [negative, setNegative] = usePersistentState('hy_i2v_negative', 'blurry, low quality, deformed, watermark, distorted');
  const [seed, setSeed] = usePersistentState('hy_i2v_seed', -1);
  const [loraName, setLoraName] = usePersistentState('hy_i2v_lora_name', '');
  const [loraStrength, setLoraStrength] = usePersistentState('hy_i2v_lora_strength', 0.8);
  const [aspectRatio, setAspectRatio] = usePersistentState<HyRatio>('hy_i2v_ar', '16:9');
  const [length, setLength] = usePersistentState('hy_i2v_length', 77);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imageFilename, setImageFilename] = usePersistentState<string | null>('hy_i2v_image_file', null);
  const [imageUploading, setImageUploading] = useState(false);
  const [referenceCaptioning, setReferenceCaptioning] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'hunyuan-i2v',
    currentKey: 'hy_i2v_current_video',
    historyKey: 'hy_i2v_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const imagePreview = imageFilename
    ? `/comfy/view?filename=${encodeURIComponent(imageFilename)}&type=input`
    : null;

  useEffect(() => {
    comfyService.getLoras().catch(() => {});
    // Show all loras — HunyuanVideo I2V is compatible with most motion loras
    comfyService.getLoras().then(setAvailableLoras).catch(() => {});
  }, []);

  const uploadImage = async (file: File) => {
    setImageUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setImageFilename(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setImageUploading(false);
    }
  };

  const uploadImageFromUrl = async (url: string) => {
    setImageUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await uploadImage(new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' }));
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
      setImageUploading(false);
    }
  };

  // Consume a "Send to Workflow" handoff image on first mount
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) uploadImageFromUrl(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPromptFromReference = async () => {
    if (!imageFilename || !imagePreview || referenceCaptioning) return;
    setReferenceCaptioning(true);
    try {
      const imageResponse = await fetch(imagePreview);
      if (!imageResponse.ok) throw new Error('Could not read reference image');
      const blob = await imageResponse.blob();
      const file = new File([blob], imageFilename, { type: blob.type || 'image/png' });
      const form = new FormData();
      form.append('file', file);
      form.append('context', 'hunyuan-i2v');
      const response = await fetch(
        `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`,
        { method: 'POST', body: form },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || 'Prompt caption failed');
      setPrompt(data.caption ?? '');
      toast(data.model ? `Prompt built with ${data.model}` : 'Prompt built from reference image', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not build prompt from reference image', 'error');
    } finally {
      setReferenceCaptioning(false);
    }
  };

  const handleGenerate = () => {
    if (!imageFilename || !prompt.trim() || run.isGenerating) return;
    const [width, height] = HY_DIMS[aspectRatio];
    const resolvedSeed = seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed;
    run.start({
      image: imageFilename,
      prompt: prompt.trim(),
      negative: negative.trim(),
      seed: resolvedSeed,
      width,
      height,
      aspect_ratio: hyAspect(aspectRatio),
      direction: hyDirection(aspectRatio),
      length,
      ...(loraName ? { lora_slot1: { on: true, lora: loraName, strength: loraStrength } } : {}),
    });
  };

  const canGenerate = !!imageFilename && !!prompt.trim() && !run.isGenerating;
  const [w, h] = HY_DIMS[aspectRatio];
  const durationSec = (length / 24).toFixed(1);

  return (
    <WorkflowWorkbench
      title="HunyuanVideo I2V"
      eyebrow="HunyuanVideo fp8"
      description="Animate a reference image into video using HunyuanVideo I2V 720p fp8."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      preview={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="HunyuanVideo I2V Output"
          emptyHint="Upload an image and generate to see results here."
        />
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
        <section className="workflow-section">
          <div className="workflow-section-header">
            <FeddaSectionTitle className="text-white/30">Reference Image</FeddaSectionTitle>
            <ImageIcon className="h-3.5 w-3.5 text-white/25" />
          </div>
          <RefImageSlot
            preview={imagePreview}
            uploading={imageUploading}
            onFile={uploadImage}
            onUrl={uploadImageFromUrl}
          />
          {imageFilename && (
            <p className="mt-2 truncate font-mono text-[8px] text-white/35">{imageFilename}</p>
          )}
        </section>

        <section className="workflow-section">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <FeddaSectionTitle className="text-white/30">Motion Prompt</FeddaSectionTitle>
              <p className="mt-1 text-[10px] text-white/35">Describe the motion and action for the generated video.</p>
            </div>
            <button
              onClick={buildPromptFromReference}
              disabled={!imageFilename || referenceCaptioning}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/55 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              {referenceCaptioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Build From Reference
            </button>
          </div>
          <PromptAssistant
            context="hunyuan-i2v"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the motion, camera movement, and action you want in the video..."
            minRows={4}
            accent="violet"
            label="Prompt"
            enableCaption
          />
        </section>
      </div>

      <section className="workflow-section">
        <div className="mb-3 flex items-center justify-between gap-3">
          <FeddaSectionTitle className="text-white/30">Run Settings</FeddaSectionTitle>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/35 hover:text-white/70"
          >
            {showAdvanced ? 'Hide' : 'Show'} Seed
            <RefreshCw className={`h-3 w-3 transition ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Negative Prompt</p>
              <button
                onClick={() => setNegative('blurry, low quality, deformed, watermark, distorted')}
                className="text-[8px] text-white/35 hover:text-white/70"
              >
                Reset
              </button>
            </div>
            <textarea
              value={negative}
              onChange={(event) => setNegative(event.target.value)}
              className="min-h-[88px] w-full resize-y rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white/80 focus:border-white/25 focus:outline-none"
              placeholder="Artifacts to avoid..."
            />
          </div>

          <div className="space-y-2">
            <LoraSelector
              options={availableLoras}
              value={loraName}
              onChange={setLoraName}
              strength={loraStrength}
              onStrengthChange={setLoraStrength}
              accent="violet"
              label="LoRA"
            />
            {loraName && (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-white/35">Strength</span>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.01}
                  value={loraStrength}
                  onChange={(event) => setLoraStrength(parseFloat(event.target.value))}
                  className="flex-1 accent-zinc-400"
                />
                <span className="w-10 text-right font-mono text-white/65">{loraStrength.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5 pt-1">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Output Format</p>
            <div className="flex flex-wrap gap-1">
              {HY_RATIOS.map((r) => (
                <button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  className={`rounded-md border px-2 py-0.5 text-[9px] font-black tracking-widest transition-all ${
                    aspectRatio === r
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/10 bg-white/[0.02] text-white/40 hover:text-white/70'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="font-mono text-[9px] text-white/35">{w}×{h}</p>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Length</p>
              <span className="font-mono text-[9px] text-white/45">{length} frames · {durationSec}s @ 24fps</span>
            </div>
            <input
              type="range"
              min={17}
              max={129}
              step={4}
              value={length}
              onChange={(event) => setLength(parseInt(event.target.value))}
              className="w-full accent-zinc-400"
            />
            <div className="flex justify-between text-[8px] text-white/25">
              <span>0.7s</span>
              <span>5.4s</span>
            </div>
          </div>
        </div>

        {showAdvanced && (
          <div className="mt-3">
            <p className="mb-1 text-[8px] font-black uppercase tracking-widest text-white/25">Seed (-1 = random)</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={seed}
                onChange={(event) => setSeed(parseInt(event.target.value) || -1)}
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white/80 focus:border-white/25 focus:outline-none"
              />
              <button
                onClick={() => setSeed(-1)}
                className="rounded-lg bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
              >
                Random
              </button>
            </div>
          </div>
        )}

        <div className="mt-3">
          <FeddaButton
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="h-11 w-full bg-zinc-200 text-base text-black hover:bg-white disabled:bg-white/10 disabled:text-white/30"
          >
            {run.isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play className="h-4 w-4" /> Generate Video
              </span>
            )}
          </FeddaButton>
          {!canGenerate && (
            <p className="mt-2 text-center text-[10px] text-white/25">
              Upload a reference image and enter a motion prompt
            </p>
          )}
        </div>
      </section>
    </WorkflowWorkbench>
  );
};
