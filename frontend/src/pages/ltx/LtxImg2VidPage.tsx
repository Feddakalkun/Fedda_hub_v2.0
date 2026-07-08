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
import { BatchQueuePanel, ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn, inputBase } from '../../lib/styles';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, type LtxRatio, type LtxResolution } from '../../config/ltx';

const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, jitter, artifacts';

export const LtxImg2VidPage = () => {
  const [prompt, setPrompt] = usePersistentState('ltx_img2vid_prompt', '');
  const [negative, setNegative] = usePersistentState('ltx_img2vid_negative', DEFAULT_NEGATIVE);
  const [seed, setSeed] = usePersistentState('ltx_img2vid_seed', -1);
  const [loraName, setLoraName] = usePersistentState('ltx_img2vid_lora_name', '');
  const [loraStrength, setLoraStrength] = usePersistentState('ltx_img2vid_lora_strength', 0.65);
  const [batchRaw, setBatchRaw] = usePersistentState('ltx_img2vid_batch_raw', '');
  const [aspectRatio, setAspectRatio] = usePersistentState('ltx_img2vid_ar', '16:9');
  const [resolution, setResolution] = usePersistentState<LtxResolution>('ltx_img2vid_res', 'M');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imageFilename, setImageFilename] = usePersistentState<string | null>('ltx_img2vid_image_file', null);
  const [imageUploading, setImageUploading] = useState(false);
  const [referenceCaptioning, setReferenceCaptioning] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'ltx-img2vid',
    currentKey: 'ltx_img2vid_current_video',
    historyKey: 'ltx_img2vid_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const imagePreview = imageFilename ? `/comfy/view?filename=${encodeURIComponent(imageFilename)}&type=input` : null;

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((lora) => {
        const normalized = lora.replace(/\\/g, '/').toLowerCase();
        return normalized.startsWith('ltx/') || normalized.includes('ltx');
      });
      setAvailableLoras(filtered);
    }).catch(() => {});
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
      const file = new File(
        [blob],
        imageFilename || 'ltx-reference.png',
        { type: blob.type || 'image/png' },
      );

      const form = new FormData();
      form.append('file', file);
      form.append('context', 'ltx-img2vid');

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

  const buildParams = (promptText: string) => {
    const dims = getLtxDimensions(aspectRatio, resolution);
    return {
      image: imageFilename,
      prompt: promptText.trim(),
      negative: negative.trim(),
      width: dims.width,
      height: dims.height,
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
      ...(loraName ? { lora_name: loraName, lora_strength: loraStrength } : {}),
    };
  };

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
  const dims = getLtxDimensions(aspectRatio, resolution);

  return (
    <WorkflowShell
      title="Image to Video"
      eyebrow="LTX 2.3"
      description="Animate one reference image into a cinematic motion clip."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="ltx-img2vid"
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="LTX Img2Vid Output"
          emptyHint="Upload an image and generate to see motion results here."
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
            {imageFilename && <p className="mt-2 truncate font-mono text-[9px] text-zinc-600">{imageFilename}</p>}
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
              context="ltx-img2vid"
              value={prompt}
              onChange={setPrompt}
              placeholder="Describe the motion, camera movement, and life you want in the video..."
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
                label="LTX LoRA"
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

              <Field label="Aspect Ratio">
                <ChipGroup options={LTX_RATIOS} value={aspectRatio as LtxRatio} onChange={setAspectRatio} />
              </Field>
              <Field label={`Resolution — ${dims.width}×${dims.height}`}>
                <ChipGroup options={LTX_RESOLUTIONS} value={resolution} onChange={setResolution} />
              </Field>
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
