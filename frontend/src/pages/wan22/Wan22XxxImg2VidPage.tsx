import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2, Play, RefreshCw, Upload } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { comfyService } from '../../services/comfyService';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { FeddaButton, FeddaSectionTitle } from '../../components/ui/FeddaPrimitives';
import { WorkflowWorkbench } from '../../components/layout/WorkflowWorkbench';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';

type WanRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

const WAN_RATIOS: WanRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4'];

// width controls resolution; AspectRatioResizeImage auto-computes height when height=0
const RATIO_WIDTH: Record<WanRatio, number> = {
  '16:9': 832,
  '9:16': 480,
  '1:1':  672,
  '4:3':  768,
  '3:4':  576,
};

// AspectRatioResizeImage: portrait ratios use the same base aspect string with Vertical direction
const RATIO_ASPECT: Record<WanRatio, string> = {
  '16:9': '16:9', '9:16': '16:9', '1:1': '1:1', '4:3': '4:3', '3:4': '4:3',
};

const RATIO_DIRECTION: Record<WanRatio, string> = {
  '16:9': 'Horizontal', '9:16': 'Vertical', '1:1': 'Horizontal', '4:3': 'Horizontal', '3:4': 'Vertical',
};

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
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith('image/')) { onFile(file); return; }
        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (url && onUrl) onUrl(url.trim());
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}

export const Wan22XxxImg2VidPage = () => {
  const [prompt, setPrompt]       = usePersistentState('wan22xxx_prompt', '');
  const [negative, setNegative]   = usePersistentState('wan22xxx_negative', '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量');
  const [seed, setSeed]           = usePersistentState('wan22xxx_seed', -1);
  const [loraHigh, setLoraHigh]   = usePersistentState('wan22xxx_lora_high', '');
  const [loraLow, setLoraLow]     = usePersistentState('wan22xxx_lora_low', '');
  const [loraHighStr, setLoraHighStr] = usePersistentState('wan22xxx_lora_high_str', 1.0);
  const [loraLowStr, setLoraLowStr]   = usePersistentState('wan22xxx_lora_low_str', 1.0);
  const [aspectRatio, setAspectRatio] = usePersistentState<WanRatio>('wan22xxx_ar', '16:9');
  const [length, setLength]       = usePersistentState('wan22xxx_length', 10);
  const [showSeed, setShowSeed]   = useState(false);
  const [imageFilename, setImageFilename] = usePersistentState<string | null>('wan22xxx_image', null);
  const [imageUploading, setImageUploading] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'wan22xxx-img2vid',
    currentKey: 'wan22xxx_current_video',
    historyKey: 'wan22xxx_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const imagePreview = imageFilename
    ? `/comfy/view?filename=${encodeURIComponent(imageFilename)}&type=input`
    : null;

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((l) => {
        const n = l.replace(/\\/g, '/').toLowerCase();
        return n.startsWith('wan') || n.includes('wan2') || n.includes('fusion') || n.includes('sauce') || n.includes('seko');
      });
      setAvailableLoras(filtered.length ? filtered : loras);
    }).catch(() => {});
  }, []);

  const uploadImage = async (file: File) => {
    setImageUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setImageFilename(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setImageUploading(false);
    }
  };

  const uploadFromUrl = async (url: string) => {
    setImageUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
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
    if (url) uploadFromUrl(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = () => {
    if (!imageFilename || !prompt.trim() || run.isGenerating) return;
    const resolvedSeed = seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed;
    run.start({
      image: imageFilename,
      prompt: prompt.trim(),
      negative: negative.trim(),
      seed: resolvedSeed,
      aspect_ratio: RATIO_ASPECT[aspectRatio],
      direction: RATIO_DIRECTION[aspectRatio],
      width: RATIO_WIDTH[aspectRatio],
      length,
      ...(loraHigh ? { lora_high: { on: true, lora: loraHigh, strength: loraHighStr } } : {}),
      ...(loraLow  ? { lora_low:  { on: true, lora: loraLow,  strength: loraLowStr  } } : {}),
    });
  };

  const canGenerate = !!imageFilename && !!prompt.trim() && !run.isGenerating;
  // duration: value * 15 frames ÷ 30fps = value / 2 seconds
  const durationSec = (length / 2).toFixed(1);

  return (
    <WorkflowWorkbench
      title="WAN 2.2 XXX Img2Vid"
      eyebrow="WAN 2.2 14B fp8"
      description="Dual high/low noise pass with NSFW UMT5 encoder and Power LoRA slots."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      preview={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="WAN XXX Output"
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
            onUrl={uploadFromUrl}
          />
          {imageFilename && (
            <p className="mt-2 truncate font-mono text-[8px] text-white/35">{imageFilename}</p>
          )}
        </section>

        <section className="workflow-section">
          <FeddaSectionTitle className="mb-2 text-white/30">Prompt</FeddaSectionTitle>
          <PromptAssistant
            context="wan-i2v"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the motion and action..."
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
            onClick={() => setShowSeed(!showSeed)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/35 hover:text-white/70"
          >
            {showSeed ? 'Hide' : 'Show'} Seed
            <RefreshCw className={`h-3 w-3 transition ${showSeed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Negative Prompt</p>
              <button
                onClick={() => setNegative('色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量')}
                className="text-[8px] text-white/35 hover:text-white/70"
              >
                Reset
              </button>
            </div>
            <textarea
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              className="min-h-[72px] w-full resize-y rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white/80 focus:border-white/25 focus:outline-none"
              placeholder="Artifacts to avoid..."
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Output Format</p>
            <div className="flex flex-wrap gap-1">
              {WAN_RATIOS.map((r) => (
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
            <p className="font-mono text-[9px] text-white/35">{RATIO_WIDTH[aspectRatio]}px wide</p>

            <div className="pt-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Length</p>
                <span className="font-mono text-[9px] text-white/45">{length} → ~{durationSec}s @ 30fps</span>
              </div>
              <input
                type="range"
                min={5}
                max={20}
                step={1}
                value={length}
                onChange={(e) => setLength(parseInt(e.target.value))}
                className="w-full accent-zinc-400"
              />
              <div className="flex justify-between text-[8px] text-white/25">
                <span>2.5s</span>
                <span>10s</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <LoraSelector
            label="High Noise LoRA"
            value={loraHigh}
            onChange={setLoraHigh}
            strength={loraHighStr}
            onStrengthChange={setLoraHighStr}
            options={availableLoras}
            accent="violet"
          />
          <LoraSelector
            label="Low Noise LoRA"
            value={loraLow}
            onChange={setLoraLow}
            strength={loraLowStr}
            onStrengthChange={setLoraLowStr}
            options={availableLoras}
            accent="violet"
          />
        </div>

        {showSeed && (
          <div className="mt-3">
            <p className="mb-1 text-[8px] font-black uppercase tracking-widest text-white/25">Seed (-1 = random)</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
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
              Upload a reference image and enter a prompt
            </p>
          )}
        </div>
      </section>
    </WorkflowWorkbench>
  );
};
