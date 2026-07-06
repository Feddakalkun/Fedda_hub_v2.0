import { useEffect, useState } from 'react';
import { Loader2, Music, Wand2 } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { Field, NeutralButton } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn, inputBase } from '../../lib/styles';

const WIDTH_PRESETS = ['512', '640', '768', '1024', '1280'] as const;
const DEFAULT_NEGATIVE = 'blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles';

export const LtxAi2vPage = () => {
  const [prompt, setPrompt] = usePersistentState('ltx_ai2v_prompt', '');
  const [negative, setNegative] = usePersistentState('ltx_ai2v_negative', DEFAULT_NEGATIVE);
  const [seed, setSeed] = usePersistentState('ltx_ai2v_seed', -1);
  const [steps, setSteps] = usePersistentState('ltx_ai2v_steps', 4);
  const [duration, setDuration] = usePersistentState('ltx_ai2v_duration', 5);
  const [width, setWidth] = usePersistentState('ltx_ai2v_width', '1024');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [imageFilename, setImageFilename] = usePersistentState<string | null>('ltx_ai2v_image_file', null);
  const [imageUploading, setImageUploading] = useState(false);
  const [audioFilename, setAudioFilename] = usePersistentState<string | null>('ltx_ai2v_audio_file', null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [referenceCaptioning, setReferenceCaptioning] = useState(false);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'ltx-ai2v',
    currentKey: 'ltx_ai2v_current_video',
    historyKey: 'ltx_ai2v_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const imagePreview = imageFilename ? `/comfy/view?filename=${encodeURIComponent(imageFilename)}&type=input` : null;
  const audioPreview = audioFilename ? `/comfy/view?filename=${encodeURIComponent(audioFilename)}&type=input` : null;

  const uploadTo = async (
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

  const uploadFromUrl = async (
    url: string,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
    fallbackName: string,
  ) => {
    setUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const blob = await res.blob();
      await uploadTo(new File([blob], fallbackName, { type: blob.type || 'application/octet-stream' }), setFile, setUploading);
    } catch (err: any) {
      toast(err.message || 'Could not load file from URL', 'error');
      setUploading(false);
    }
  };

  // Consume a "Send to Workflow" handoff image on first mount
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) uploadFromUrl(url, setImageFilename, setImageUploading, 'handoff-image.png');
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
      form.append('context', 'ltx-lipsync');
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
    if (!imageFilename || !audioFilename || !prompt.trim() || run.isGenerating) return;
    run.start({
      image: imageFilename,
      audio: audioFilename,
      prompt: prompt.trim(),
      negative: negative.trim(),
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
      steps,
      width: parseInt(width, 10),
      duration,
    });
  };

  const canGenerate = !!imageFilename && !!audioFilename && !!prompt.trim() && !run.isGenerating;

  return (
    <WorkflowShell
      title="LTX 2.3 Audio + Image2Video"
      eyebrow="LTX Video 2.3 · Audio-conditioned"
      description="Animate a reference image driven by an audio clip — motion and expression follow the audio track."
      icon={Music}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="ltx-ai2v"
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="LTX AI2V Output"
          emptyHint="Upload an image and an audio clip, then generate to see results here."
        />
      )}
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkflowSection title="Reference Image">
            <UploadSlot
              preview={imagePreview}
              uploading={imageUploading}
              onFile={(file) => uploadTo(file, setImageFilename, setImageUploading)}
              onUrl={(url) => uploadFromUrl(url, setImageFilename, setImageUploading, 'gallery-image.png')}
              label="Reference Image"
              hint="Click or drop jpg/png"
            />
            {imageFilename && <p className="mt-2 truncate font-mono text-[9px] text-zinc-600">{imageFilename}</p>}
          </WorkflowSection>

          <WorkflowSection title="Audio Clip">
            <UploadSlot
              preview={audioPreview}
              uploading={audioUploading}
              onFile={(file) => uploadTo(file, setAudioFilename, setAudioUploading)}
              onUrl={(url) => uploadFromUrl(url, setAudioFilename, setAudioUploading, 'gallery-audio.mp3')}
              accept="audio/*,video/*"
              label="Audio Clip"
              hint="Click or drop mp3/wav/mp4 — full clip is used"
              previewKind="audio"
              filename={audioFilename ?? undefined}
            />
          </WorkflowSection>
        </div>

        <WorkflowSection
          title="Prompt"
          actions={(
            <NeutralButton
              onClick={buildPromptFromReference}
              disabled={!imageFilename || referenceCaptioning}
            >
              {referenceCaptioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Build From Reference
            </NeutralButton>
          )}
        >
          <PromptAssistant
            context="ltx-lipsync"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the expression, energy, and presence you want synced to the audio..."
            minRows={4}
            accent="violet"
            label="Prompt"
            enableCaption
          />
        </WorkflowSection>

        <WorkflowSection
          title="Run Settings"
          actions={(
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
            >
              {showAdvanced ? '− Seed' : '+ Seed'}
            </button>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Negative Prompt">
              <div className="space-y-1.5">
                <textarea
                  value={negative}
                  onChange={(event) => setNegative(event.target.value)}
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
              <Field label="Target Width — height follows the image's aspect ratio">
                <ChipGroup options={WIDTH_PRESETS} value={width} onChange={setWidth} />
              </Field>
              <SliderField
                label="Video Length"
                value={duration}
                onChange={setDuration}
                min={0}
                max={30}
                step={1}
                format={(v) => (v === 0 ? 'full audio clip' : `first ${v}s of audio`)}
              />
              <SliderField
                label="Steps"
                value={steps}
                onChange={setSteps}
                min={4}
                max={12}
                step={1}
                format={(v) => `${v} (distilled turbo — 4 is fastest)`}
              />
            </div>
          </div>

          {showAdvanced && (
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
              requirementHint="Upload a reference image, an audio clip, and enter a prompt"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
