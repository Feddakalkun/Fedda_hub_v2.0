import { useEffect, useState } from 'react';
import { Loader2, Play, Wand2 } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { comfyService } from '../../services/comfyService';
import { Field, NeutralButton } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn, inputBase } from '../../lib/styles';

type HyRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

const HY_RATIOS: HyRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4'];

const HY_DIMS: Record<HyRatio, [number, number]> = {
  '16:9': [848, 480],
  '9:16': [480, 848],
  '1:1':  [624, 624],
  '4:3':  [832, 624],
  '3:4':  [624, 832],
};

const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, watermark, distorted';

function hyDirection(ratio: HyRatio): string {
  return ratio === '9:16' || ratio === '3:4' ? 'Vertical' : 'Horizontal';
}

function hyAspect(ratio: HyRatio): string {
  const map: Record<HyRatio, string> = {
    '16:9': '16:9', '9:16': '16:9', '1:1': '1:1', '4:3': '4:3', '3:4': '4:3',
  };
  return map[ratio];
}

export const HunyuanImg2VidPage = () => {
  const [prompt, setPrompt] = usePersistentState('hy_i2v_prompt', '');
  const [negative, setNegative] = usePersistentState('hy_i2v_negative', DEFAULT_NEGATIVE);
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

  return (
    <WorkflowShell
      title="HunyuanVideo I2V"
      eyebrow="HunyuanVideo fp8"
      description="Animate a reference image into video using HunyuanVideo I2V 720p fp8."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="hunyuan-i2v"
      output={(
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
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
          <WorkflowSection title="Reference Image">
            <UploadSlot
              preview={imagePreview}
              uploading={imageUploading}
              onFile={uploadImage}
              onUrl={uploadImageFromUrl}
              label="Reference Image"
              hint="Click or drop jpg/png"
            />
            {imageFilename && (
              <p className="mt-2 truncate font-mono text-[9px] text-zinc-600">{imageFilename}</p>
            )}
          </WorkflowSection>

          <WorkflowSection
            title="Motion Prompt"
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
              context="hunyuan-i2v"
              value={prompt}
              onChange={setPrompt}
              placeholder="Describe the motion, camera movement, and action you want in the video..."
              minRows={4}
              accent="violet"
              label="Prompt"
              enableCaption
            />
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
                  className={cn(inputBase, 'min-h-[88px] resize-y')}
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
                <SliderField
                  label="LoRA Strength"
                  value={loraStrength}
                  onChange={setLoraStrength}
                  min={0}
                  max={1.5}
                />
              )}

              <Field label={`Aspect Ratio — ${w}×${h}`}>
                <ChipGroup options={HY_RATIOS} value={aspectRatio} onChange={setAspectRatio} />
              </Field>
              <SliderField
                label="Length"
                value={length}
                onChange={setLength}
                min={17}
                max={129}
                step={4}
                format={(v) => `${v} frames · ${(v / 24).toFixed(1)}s`}
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
              requirementHint="Upload a reference image and enter a motion prompt"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
