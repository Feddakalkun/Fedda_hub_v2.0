import { useEffect, useState } from 'react';
import { Loader2, Play, Wand2 } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { comfyService } from '../../services/comfyService';
import { Field } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';
import { BatchQueuePanel, ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, getSafeLtxAspect, type LtxRatio, type LtxResolution } from '../../config/ltx';

const DIRECTIONS = ['Horizontal', 'Vertical'] as const;

export const LtxFlfPage = () => {
  const [prompt, setPrompt] = usePersistentState('ltx_flf_prompt', '');
  const [batchRaw, setBatchRaw] = usePersistentState('ltx_flf_batch_raw', '');
  const [aspectRatio, setAspectRatio] = usePersistentState('ltx_flf_ar', '16:9');
  const [resolution, setResolution] = usePersistentState<LtxResolution>('ltx_flf_res', 'M');
  const [direction, setDirection] = usePersistentState('ltx_flf_dir', 'Horizontal');
  const [lengthSec, setLengthSec] = usePersistentState('ltx_flf_len', 5);
  const [seed, setSeed] = usePersistentState('ltx_flf_seed', -1);
  const [guideFirst, setGuideFirst] = usePersistentState('ltx_flf_gf', 0.7);
  const [guideLast, setGuideLast] = usePersistentState('ltx_flf_gl', 0.7);
  const [loraName, setLoraName] = usePersistentState('ltx_flf_lora_name', '');
  const [loraStrength, setLoraStrength] = usePersistentState('ltx_flf_lora_strength', 1.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [firstFilename, setFirstFilename] = usePersistentState<string | null>('ltx_flf_first_file', null);
  const [lastFilename, setLastFilename] = usePersistentState<string | null>('ltx_flf_last_file', null);
  const [firstUploading, setFirstUploading] = useState(false);
  const [lastUploading, setLastUploading] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();
  const run = useWorkflowRun({
    workflowId: 'ltx-flf',
    currentKey: 'ltx_flf_current_video',
    historyKey: 'ltx_flf_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const firstPreview = firstFilename ? `/comfy/view?filename=${encodeURIComponent(firstFilename)}&type=input` : null;
  const lastPreview = lastFilename ? `/comfy/view?filename=${encodeURIComponent(lastFilename)}&type=input` : null;

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((lora) => {
        const normalized = lora.replace(/\\/g, '/').toLowerCase();
        return normalized.startsWith('ltx/') || normalized.includes('ltx');
      });
      setAvailableLoras(filtered);
    }).catch(() => {});
  }, []);

  const uploadFrame = async (
    file: File,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
  ) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setFile(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const uploadFrameFromUrl = async (
    url: string,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
  ) => {
    setUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await uploadFrame(new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' }), setFile, setUploading);
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
      setUploading(false);
    }
  };

  const buildParams = (promptText: string) => {
    const dimsNow = getLtxDimensions(aspectRatio, resolution);
    const safeAspect = getSafeLtxAspect(aspectRatio);
    return {
      image_first: firstFilename,
      image_last: lastFilename,
      prompt: promptText.trim(),
      aspect_ratio: safeAspect,
      direction,
      width: dimsNow.width,
      height: dimsNow.height,
      length_seconds: lengthSec,
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
      guide_strength_first: guideFirst,
      guide_strength_last: guideLast,
      ...(loraName ? { lora_slot2: { on: true, lora: loraName, strength: loraStrength } } : {}),
    };
  };

  const handleGenerate = () => {
    if (!firstFilename || !lastFilename || !prompt.trim() || run.isGenerating) return;
    run.start(buildParams(prompt));
  };

  const handleBatchRun = (prompts: string[]) => {
    if (run.isGenerating) return;
    if (!firstFilename || !lastFilename) {
      toast('Upload both keyframes first', 'error');
      return;
    }
    void run.startBatch(prompts.map(buildParams));
  };

  const [writingPrompt, setWritingPrompt] = useState(false);
  const writePromptFromFrames = async () => {
    if (!firstFilename || !lastFilename || writingPrompt) return;
    setWritingPrompt(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/flf-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_first: firstFilename, image_last: lastFilename }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not read the frames');
      if (data.prompt) setPrompt(data.prompt);
      toast(data.model ? `Prompt written with ${data.model}` : 'Prompt written from the two frames', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not write a prompt from the frames', 'error');
    } finally {
      setWritingPrompt(false);
    }
  };

  const canGenerate = !!firstFilename && !!lastFilename && !!prompt.trim() && !run.isGenerating;
  const dims = getLtxDimensions(aspectRatio, resolution);

  return (
    <WorkflowShell
      title="First / Last Frame"
      eyebrow="LTX 2.3"
      description="Generate motion between two keyframes with controlled duration and direction."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="ltx-flf"
      output={(
        <LiveSamplingPreview
          previewUrl={previewUrl}
          isRunning={run.isGenerating}
          hasOutput={!!run.currentMedia || run.history.length > 0}
          emptyState={
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
              <div className="text-center text-zinc-500">
                {run.isGenerating ? (
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" />
                ) : (
                  <Play className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {run.isGenerating ? 'Waiting for motion output' : 'No motion output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {run.isGenerating ? 'Motion frames will appear here while sampling progresses.' : 'Upload both frames and generate to see motion here.'}
                </div>
              </div>
            </div>
          }
        >
          <WorkflowVideoPreviewStrip
            title="LTX First / Last Output"
            currentVideo={run.currentMedia}
            history={run.history}
            isGenerating={run.isGenerating}
            onSelectVideo={run.setCurrentMedia}
            onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
            emptyHint="Upload both frames and generate to see motion here."
          />
        </LiveSamplingPreview>
      )}
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <WorkflowSection title="Keyframes">
            <div className="flex gap-2">
              <div className="flex-1">
                <UploadSlot
                  preview={firstPreview}
                  uploading={firstUploading}
                  onFile={(file) => uploadFrame(file, setFirstFilename, setFirstUploading)}
                  onUrl={(url) => uploadFrameFromUrl(url, setFirstFilename, setFirstUploading)}
                  label="First"
                  hint="Click or drop"
                  height={124}
                />
              </div>
              <div className="flex-1">
                <UploadSlot
                  preview={lastPreview}
                  uploading={lastUploading}
                  onFile={(file) => uploadFrame(file, setLastFilename, setLastUploading)}
                  onUrl={(url) => uploadFrameFromUrl(url, setLastFilename, setLastUploading)}
                  label="Last"
                  hint="Click or drop"
                  height={124}
                />
              </div>
            </div>
            {firstFilename && lastFilename && <p className="mt-2 font-mono text-[9px] text-zinc-600">Both frames ready</p>}
          </WorkflowSection>

          <WorkflowSection title="Motion Prompt">
            <button
              type="button"
              onClick={writePromptFromFrames}
              disabled={!firstFilename || !lastFilename || writingPrompt}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              title="Caption both frames and write the motion/transformation prompt between them"
            >
              {writingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {writingPrompt ? 'Reading both frames…' : 'Write prompt from frames'}
            </button>
            <PromptAssistant
              context="ltx-flf"
              value={prompt}
              onChange={setPrompt}
              placeholder="Describe the motion between the two frames..."
              minRows={4}
              accent="violet"
              label="Motion Prompt"
              enableCaption={false}
            />
            <div className="mt-3">
              <BatchQueuePanel
                value={batchRaw}
                onChange={setBatchRaw}
                onRun={handleBatchRun}
                isGenerating={run.isGenerating}
                progress={run.batchProgress}
                autoFillContext="ltx-flf"
              />
            </div>
          </WorkflowSection>
        </div>

        <WorkflowSection
          title="Run Settings"
          actions={(
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
            >
              {showAdvanced ? '− Guide strengths' : '+ Guide strengths'}
            </button>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Aspect Ratio">
                <ChipGroup options={LTX_RATIOS} value={aspectRatio as LtxRatio} onChange={setAspectRatio} />
              </Field>
              <Field label={`Resolution — ${dims.width}×${dims.height}`}>
                <ChipGroup options={LTX_RESOLUTIONS} value={resolution} onChange={setResolution} />
              </Field>
              <Field label="Direction">
                <ChipGroup options={DIRECTIONS} value={direction as typeof DIRECTIONS[number]} onChange={setDirection} />
              </Field>
              <SliderField
                label="Length"
                value={lengthSec}
                onChange={setLengthSec}
                min={2}
                max={15}
                step={1}
                format={(v) => `${v}s`}
              />
            </div>

            <div className="space-y-3">
              <LoraSelector
                label="LTX LoRA"
                value={loraName}
                onChange={setLoraName}
                strength={loraStrength}
                onStrengthChange={setLoraStrength}
                options={availableLoras}
                accent="violet"
              />
              <Field label="Seed (-1 = random)">
                <SeedField value={seed} onChange={setSeed} />
              </Field>
            </div>
          </div>

          {showAdvanced && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <SliderField label="First Frame Guide" value={guideFirst} onChange={setGuideFirst} min={0} max={1} step={0.05} />
              <SliderField label="Last Frame Guide" value={guideLast} onChange={setGuideLast} min={0} max={1} step={0.05} />
            </div>
          )}

          <div className="mt-4">
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate}
              isGenerating={run.isGenerating}
              label="Generate Video"
              requirementHint="Upload both frames and enter a motion prompt"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
