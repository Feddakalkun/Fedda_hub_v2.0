import { useState } from 'react';
import { Loader2, PersonStanding, Video } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { uploadToComfy } from '../../utils/comfyUpload';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';
import { GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn } from '../../lib/styles';

const CONTROL_MODES = [
  { label: 'Pose (DWPose)', value: 0 },
  { label: 'Depth', value: 1 },
  { label: 'Lotus Depth', value: 2 },
];

export const Wan22VacePage = () => {
  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();

  const [reference, setReference] = usePersistentState<string | null>('vace_ref', null);
  const [driver, setDriver] = usePersistentState<string | null>('vace_driver', null);
  const [refUploading, setRefUploading] = useState(false);
  const [driverUploading, setDriverUploading] = useState(false);

  const [prompt, setPrompt] = usePersistentState('vace_prompt', 'a woman dancing, natural fluid motion, cinematic lighting');
  const [negative, setNegative] = usePersistentState('vace_negative', '');
  const [lengthSec, setLengthSec] = usePersistentState('vace_len', 5);
  const [skipSec, setSkipSec] = usePersistentState('vace_skip', 0);
  const [fps, setFps] = usePersistentState('vace_fps', 15);
  const [controlMode, setControlMode] = usePersistentState('vace_control', 2);
  const [seed, setSeed] = usePersistentState('vace_seed', -1);

  const run = useWorkflowRun({
    workflowId: 'wan22-vace',
    currentKey: 'vace_current_video',
    historyKey: 'vace_history',
    outputKind: 'video',
    readyMessage: 'VACE video ready',
  });

  const refPreview = reference ? `/comfy/view?filename=${encodeURIComponent(reference)}&type=input` : null;
  const driverPreview = driver ? `/comfy/view?filename=${encodeURIComponent(driver)}&type=input` : null;

  const upload = async (file: File, set: (v: string) => void, setBusy: (b: boolean) => void) => {
    setBusy(true);
    try {
      set(await uploadToComfy(file));
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadFromUrl = async (url: string, set: (v: string) => void, setBusy: (b: boolean) => void) => {
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const blob = await res.blob();
      set(await uploadToComfy(new File([blob], 'vace-input', { type: blob.type })));
    } catch (err: any) {
      toast(err.message || 'Could not load from URL', 'error');
      setBusy(false);
    }
  };

  useState(() => {
    const v = consumeHandoff('video');
    if (v) void uploadFromUrl(v, setDriver, setDriverUploading);
    else {
      const i = consumeHandoff('image');
      if (i) void uploadFromUrl(i, setReference, setRefUploading);
    }
    return undefined;
  });

  const canGenerate = !!reference && !!driver && !!prompt.trim() && !run.isGenerating;
  const handleGenerate = () => {
    if (!canGenerate) return;
    run.start({
      image: reference,
      video: driver,
      prompt: prompt.trim(),
      negative: negative.trim(),
      length_seconds: String(lengthSec),
      skip_seconds: String(skipSec),
      frame_rate: String(fps),
      control_mode: controlMode,
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
    });
  };

  return (
    <WorkflowShell
      title="WAN 2.2 VACE"
      eyebrow="Motion Transfer"
      description="Full-body motion transfer — animate a reference person with a driving video."
      icon={PersonStanding}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="wan22-vace"
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
                  <Video className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {run.isGenerating ? 'Transferring motion…' : 'No output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  Add a reference person and a driving video, then generate.
                </div>
              </div>
            </div>
          }
        >
          <WorkflowVideoPreviewStrip
            title="VACE Output"
            currentVideo={run.currentMedia}
            history={run.history}
            isGenerating={run.isGenerating}
            onSelectVideo={run.setCurrentMedia}
            onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
            emptyHint="Add a reference person and driving video to see motion here."
          />
        </LiveSamplingPreview>
      )}
    >
      <div className="w-full space-y-4 px-6 pb-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <WorkflowSection title="Reference Person">
            <UploadSlot
              preview={refPreview}
              uploading={refUploading}
              onFile={(f) => upload(f, setReference, setRefUploading)}
              onUrl={(u) => uploadFromUrl(u, setReference, setRefUploading)}
              accept="image/*"
              label="Reference image"
              hint="The person to animate — click or drop"
              height={220}
              filename={reference ?? undefined}
              onClear={() => setReference(null)}
            />
          </WorkflowSection>

          <WorkflowSection title="Driving Video">
            <UploadSlot
              preview={driverPreview}
              uploading={driverUploading}
              onFile={(f) => upload(f, setDriver, setDriverUploading)}
              onUrl={(u) => uploadFromUrl(u, setDriver, setDriverUploading)}
              accept="video/*"
              previewKind="video"
              label="Driving video"
              hint="Full-body motion source — click, drop, or paste URL"
              height={220}
              filename={driver ?? undefined}
              onClear={() => setDriver(null)}
            />
          </WorkflowSection>
        </div>

        <WorkflowSection title="Prompt">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/25"
            placeholder="Describe the subject and motion…"
          />
          <input
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-zinc-300 outline-none transition focus:border-white/25"
            placeholder="Negative (optional)"
          />
        </WorkflowSection>

        <WorkflowSection title="Controls">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CONTROL_MODES.map((c) => (
              <button
                key={c.value}
                onClick={() => setControlMode(c.value)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-[11px] font-semibold transition',
                  controlMode === c.value
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 text-white/45 hover:text-white/80',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SliderField label="Length (s)" value={lengthSec} onChange={setLengthSec} min={1} max={15} step={1} />
            <SliderField label="Skip intro (s)" value={skipSec} onChange={setSkipSec} min={0} max={30} step={1} />
            <SliderField label="Frame rate" value={fps} onChange={setFps} min={8} max={30} step={1} />
            <SeedField value={seed} onChange={setSeed} />
          </div>
        </WorkflowSection>

        <GenerateButton
          onClick={handleGenerate}
          disabled={!canGenerate}
          isGenerating={run.isGenerating}
          label="Transfer motion"
          generatingLabel="Transferring…"
          requirementHint={!reference ? 'Add a reference image' : !driver ? 'Add a driving video' : !prompt.trim() ? 'Write a prompt' : undefined}
        />
      </div>
    </WorkflowShell>
  );
};
