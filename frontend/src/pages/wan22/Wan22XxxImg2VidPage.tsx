import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { comfyService } from '../../services/comfyService';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { Field } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { BatchQueuePanel, ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn, inputBase } from '../../lib/styles';

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

const DEFAULT_NEGATIVE = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量';

export const Wan22XxxImg2VidPage = () => {
  const [prompt, setPrompt]       = usePersistentState('wan22xxx_prompt', '');
  const [batchRaw, setBatchRaw]   = usePersistentState('wan22xxx_batch_raw', '');
  const [negative, setNegative]   = usePersistentState('wan22xxx_negative', DEFAULT_NEGATIVE);
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

  const buildParams = (promptText: string) => ({
    image: imageFilename,
    prompt: promptText.trim(),
    negative: negative.trim(),
    seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
    aspect_ratio: RATIO_ASPECT[aspectRatio],
    direction: RATIO_DIRECTION[aspectRatio],
    width: RATIO_WIDTH[aspectRatio],
    length,
    ...(loraHigh ? { lora_high: { on: true, lora: loraHigh, strength: loraHighStr } } : {}),
    ...(loraLow  ? { lora_low:  { on: true, lora: loraLow,  strength: loraLowStr  } } : {}),
  });

  const handleGenerate = () => {
    if (!imageFilename || !prompt.trim() || run.isGenerating) return;
    run.start(buildParams(prompt));
  };

  const handleBatchRun = (prompts: string[]) => {
    if (run.isGenerating) return;
    if (!imageFilename) {
      toast('Upload a reference image first', 'error');
      return;
    }
    void run.startBatch(prompts.map(buildParams));
  };

  const canGenerate = !!imageFilename && !!prompt.trim() && !run.isGenerating;

  return (
    <WorkflowShell
      title="Image to Video"
      eyebrow="WAN 2.2"
      description="Single-shot image-to-video with dual high/low noise pass and Power LoRA slots."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="wan22xxx-img2vid"
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
          isGenerating={run.isGenerating}
          title="WAN Img2Vid Output"
          emptyHint="Upload an image and generate to see results here."
        />
      )}
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
          <WorkflowSection title="Reference Image">
            <UploadSlot
              preview={imagePreview}
              uploading={imageUploading}
              onFile={uploadImage}
              onUrl={uploadFromUrl}
              label="Reference Image"
              hint="Click or drop jpg/png"
            />
            {imageFilename && (
              <p className="mt-2 truncate font-mono text-[9px] text-zinc-600">{imageFilename}</p>
            )}
          </WorkflowSection>

          <WorkflowSection title="Prompt">
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
            <div className="mt-3">
              <BatchQueuePanel
                value={batchRaw}
                onChange={setBatchRaw}
                onRun={handleBatchRun}
                isGenerating={run.isGenerating}
                progress={run.batchProgress}
                autoFillContext="wan-i2v"
              />
            </div>
          </WorkflowSection>
        </div>

        <WorkflowSection
          title="Run Settings"
          actions={(
            <button
              type="button"
              onClick={() => setShowSeed((v) => !v)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
            >
              {showSeed ? '− Seed' : '+ Seed'}
            </button>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Negative Prompt">
              <div className="space-y-1.5">
                <textarea
                  value={negative}
                  onChange={(e) => setNegative(e.target.value)}
                  className={cn(inputBase, 'min-h-[72px] resize-y')}
                  placeholder="Artifacts to avoid..."
                />
                <button
                  type="button"
                  onClick={() => setNegative(DEFAULT_NEGATIVE)}
                  className="text-[10px] text-zinc-600 transition hover:text-zinc-400"
                >
                  Reset to default
                </button>
              </div>
            </Field>

            <div className="space-y-3">
              <Field label={`Aspect Ratio — ${RATIO_WIDTH[aspectRatio]}px wide`}>
                <ChipGroup options={WAN_RATIOS} value={aspectRatio} onChange={setAspectRatio} />
              </Field>
              <SliderField
                label="Length"
                value={length}
                onChange={setLength}
                min={5}
                max={20}
                step={1}
                format={(v) => `${v} · ~${(v / 2).toFixed(1)}s @ 30fps`}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
            <div className="mt-4">
              <Field label="Seed (-1 = random)">
                <SeedField value={seed} onChange={setSeed} />
              </Field>
            </div>
          )}

          <div className="mt-4">
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate}
              isGenerating={run.isGenerating}
              label="Generate Video"
              requirementHint="Upload a reference image and enter a prompt"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
