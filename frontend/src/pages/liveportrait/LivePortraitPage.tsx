import { useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { uploadToComfy } from '../../utils/comfyUpload';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';
import { GenerateButton, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';

export const LivePortraitPage = () => {
  const { toast } = useToast();
  const { previewUrl } = useComfyExecution();

  const [portrait, setPortrait] = usePersistentState<string | null>('lp_portrait', null);
  const [driver, setDriver] = usePersistentState<string | null>('lp_driver', null);
  const [portraitUploading, setPortraitUploading] = useState(false);
  const [driverUploading, setDriverUploading] = useState(false);

  const [cropFactor, setCropFactor] = usePersistentState('lp_crop', 1.5);
  const [retargetEyes, setRetargetEyes] = usePersistentState('lp_eyes', 0);
  const [retargetMouth, setRetargetMouth] = usePersistentState('lp_mouth', 0);
  const [fps, setFps] = usePersistentState('lp_fps', 25);

  const run = useWorkflowRun({
    workflowId: 'liveportrait',
    currentKey: 'lp_current_video',
    historyKey: 'lp_history',
    outputKind: 'video',
    readyMessage: 'Live portrait ready',
  });

  const portraitPreview = portrait ? `/comfy/view?filename=${encodeURIComponent(portrait)}&type=input` : null;
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
      set(await uploadToComfy(new File([blob], 'lp-input', { type: blob.type })));
    } catch (err: any) {
      toast(err.message || 'Could not load from URL', 'error');
      setBusy(false);
    }
  };

  // Driving video can arrive via "Send to workflow"; a still image -> the portrait.
  useState(() => {
    const v = consumeHandoff('video');
    if (v) void uploadFromUrl(v, setDriver, setDriverUploading);
    else {
      const i = consumeHandoff('image');
      if (i) void uploadFromUrl(i, setPortrait, setPortraitUploading);
    }
    return undefined;
  });

  const buildParams = () => ({
    image: portrait,
    video: driver,
    crop_factor: cropFactor,
    retarget_eyes: retargetEyes,
    retarget_mouth: retargetMouth,
    frame_rate: fps,
    client_id: undefined,
  });

  const canGenerate = !!portrait && !!driver && !run.isGenerating;
  const handleGenerate = () => {
    if (!canGenerate) return;
    run.start(buildParams());
  };

  return (
    <WorkflowShell
      title="Live Portrait"
      eyebrow="AdvancedLivePortrait"
      description="Animate a still portrait with the motion + expressions of a driving video."
      icon={Video}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="liveportrait"
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
                  {run.isGenerating ? 'Animating portrait…' : 'No output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  Add a portrait and a driving video, then generate.
                </div>
              </div>
            </div>
          }
        >
          <WorkflowVideoPreviewStrip
            title="Live Portrait Output"
            currentVideo={run.currentMedia}
            history={run.history}
            isGenerating={run.isGenerating}
            onSelectVideo={run.setCurrentMedia}
            onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
            emptyHint="Add a portrait and a driving video to see motion here."
          />
        </LiveSamplingPreview>
      )}
    >
      <div className="w-full space-y-4 px-6 pb-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <WorkflowSection title="Portrait">
            <UploadSlot
              preview={portraitPreview}
              uploading={portraitUploading}
              onFile={(f) => upload(f, setPortrait, setPortraitUploading)}
              onUrl={(u) => uploadFromUrl(u, setPortrait, setPortraitUploading)}
              accept="image/*"
              label="Portrait image"
              hint="The face to animate — click or drop"
              height={220}
              filename={portrait ?? undefined}
              onClear={() => setPortrait(null)}
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
              hint="Motion + expressions source — click, drop, or paste a URL"
              height={220}
              filename={driver ?? undefined}
              onClear={() => setDriver(null)}
            />
          </WorkflowSection>
        </div>

        <WorkflowSection title="Controls">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SliderField label="Crop Factor" value={cropFactor} onChange={setCropFactor} min={1.0} max={3.0} step={0.1} />
            <SliderField label="Eye Retargeting" value={retargetEyes} onChange={setRetargetEyes} min={0} max={1} step={0.05} />
            <SliderField label="Mouth Retargeting" value={retargetMouth} onChange={setRetargetMouth} min={0} max={1} step={0.05} />
            <SliderField label="FPS" value={fps} onChange={setFps} min={8} max={60} step={1} />
          </div>
        </WorkflowSection>

        <GenerateButton
          onClick={handleGenerate}
          disabled={!canGenerate}
          isGenerating={run.isGenerating}
          label="Animate portrait"
          generatingLabel="Animating…"
          requirementHint={!portrait ? 'Add a portrait image' : !driver ? 'Add a driving video' : undefined}
        />
      </div>
    </WorkflowShell>
  );
};
