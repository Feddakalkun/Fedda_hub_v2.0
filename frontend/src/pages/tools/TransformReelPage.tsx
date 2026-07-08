/**
 * TransformReelPage — the viral "beat-drop transformation" reel:
 * photo → character version of the same frame (Qwen Rapid Edit, pose/face kept)
 * → LTX First/Last Frame morphs between the two → vertical reel clip.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { useToast } from '../../components/ui/Toast';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { Field } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { ChipGroup, GenerateButton, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn, inputBase } from '../../lib/styles';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, getSafeLtxAspect, type LtxRatio, type LtxResolution } from '../../config/ltx';

const CHARACTER_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: 'Superhero', prompt: 'a superhero in a sleek armored suit with glowing energy accents and a flowing cape' },
  { label: 'Anime', prompt: 'an anime warrior heroine with an elaborate detailed costume, cel-shaded anime art style' },
  { label: 'Cyberpunk', prompt: 'a cyberpunk mercenary with a neon-lit jacket, cybernetic arm details and holographic visor' },
  { label: 'Elf Queen', prompt: 'a fantasy elf queen in an ornate silver gown with a jeweled crown and pointed ears' },
  { label: 'Comic', prompt: 'a bold comic-book heroine with a dramatic costume, inked comic art style with halftone shading' },
  { label: 'Vampire', prompt: 'a gothic vampire countess in an elegant black lace dress with dramatic dark makeup' },
];

const DEFAULT_MORPH_PROMPT =
  'A burst of glowing energy sweeps across her body and her outfit seamlessly transforms into the new look. '
  + 'She holds the same pose with a confident expression, camera static, cinematic lighting, '
  + 'sparkling particles and light streaks during the transformation.';

export const TransformReelPage = () => {
  const [sourceFilename, setSourceFilename] = usePersistentState<string | null>('treel_source_file', null);
  const [sourceUploading, setSourceUploading] = useState(false);
  const [characterPrompt, setCharacterPrompt] = usePersistentState('treel_character_prompt', CHARACTER_PRESETS[0].prompt);
  const [morphPrompt, setMorphPrompt] = usePersistentState('treel_morph_prompt', DEFAULT_MORPH_PROMPT);
  const [transformedUrl, setTransformedUrl] = usePersistentState<string | null>('treel_transformed_url', null);
  const [transformedInput, setTransformedInput] = usePersistentState<string | null>('treel_transformed_input', null);
  const [transforming, setTransforming] = useState(false);
  const [aspectRatio, setAspectRatio] = usePersistentState('treel_ar', '9:16');
  const [resolution, setResolution] = usePersistentState<LtxResolution>('treel_res', 'M');
  const [lengthSec, setLengthSec] = usePersistentState('treel_len', 3);
  const pollRef = useRef<number | null>(null);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'ltx-flf',
    currentKey: 'treel_current_video',
    historyKey: 'treel_history',
    outputKind: 'video',
    readyMessage: 'Transformation reel ready',
  });

  const sourcePreview = sourceFilename ? `/comfy/view?filename=${encodeURIComponent(sourceFilename)}&type=input` : null;

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const uploadSource = async (file: File) => {
    setSourceUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setSourceFilename(data.filename);
      setTransformedUrl(null);
      setTransformedInput(null);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setSourceUploading(false);
    }
  };

  const uploadSourceFromUrl = async (url: string) => {
    setSourceUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await uploadSource(new File([blob], 'transform-source.png', { type: blob.type || 'image/png' }));
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
      setSourceUploading(false);
    }
  };

  // Consume a "Send to Workflow" handoff image on first mount
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) uploadSourceFromUrl(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Runs the Qwen edit and stages the result as a ComfyUI input; returns the staged filename. */
  const createCharacterFrame = async (): Promise<string | null> => {
    if (!sourceFilename || !characterPrompt.trim() || transforming) return null;
    let stagedName: string | null = null;
    setTransforming(true);
    setTransformedUrl(null);
    setTransformedInput(null);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'qwen-rapid-edit-v23',
          params: {
            image: sourceFilename,
            prompt:
              `Transform her into ${characterPrompt.trim()}. `
              + 'Keep the exact same pose, same face, same body position, same camera framing and same background.',
            negative: 'blurry, low quality, deformed, different pose, different person',
            seed: Math.floor(Math.random() * 10_000_000_000),
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Transform failed to start');

      const promptId: string = data.prompt_id;
      await new Promise<void>((resolve, reject) => {
        let ticks = 0;
        pollRef.current = window.setInterval(async () => {
          ticks += 1;
          if (ticks > 120) { // 10 minutes
            if (pollRef.current) window.clearInterval(pollRef.current);
            reject(new Error('Transform timed out'));
            return;
          }
          try {
            const statusRes = await fetch(
              `${BACKEND_API.BASE_URL}/api/generate/status/${promptId}?workflow_id=qwen-rapid-edit-v23`,
            );
            const status = await statusRes.json();
            if (status.status !== 'completed') return;
            if (pollRef.current) window.clearInterval(pollRef.current);
            const images: Array<{ filename: string; subfolder: string; type: string }> = status.images ?? [];
            if (!images.length) { reject(new Error('Transform finished but returned no image')); return; }
            const img = images[images.length - 1];
            const outUrl = `/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
            setTransformedUrl(outUrl);

            // Re-upload the output as a ComfyUI input so LTX FLF can use it as the last frame
            const blob = await (await fetch(outUrl)).blob();
            const form = new FormData();
            form.append('file', new File([blob], 'transform-character.png', { type: blob.type || 'image/png' }));
            const upRes = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
            const upData = await upRes.json();
            if (!upData.success) { reject(new Error(upData.detail || 'Could not stage character frame')); return; }
            setTransformedInput(upData.filename);
            stagedName = upData.filename;
            resolve();
          } catch {
            /* transient poll errors are fine */
          }
        }, 5000);
      });
      toast('Character frame ready', 'success');
    } catch (err: any) {
      toast(err.message || 'Transform failed', 'error');
    } finally {
      setTransforming(false);
    }
    return stagedName;
  };

  const generateMorph = (lastFrameOverride?: string) => {
    const lastFrame = lastFrameOverride ?? transformedInput;
    if (!sourceFilename || !lastFrame || run.isGenerating) return;
    const dims = getLtxDimensions(aspectRatio, resolution);
    run.start({
      image_first: sourceFilename,
      image_last: lastFrame,
      prompt: morphPrompt.trim() || DEFAULT_MORPH_PROMPT,
      aspect_ratio: getSafeLtxAspect(aspectRatio),
      direction: aspectRatio === '9:16' || aspectRatio === '3:4' ? 'Vertical' : 'Horizontal',
      width: dims.width,
      height: dims.height,
      length_seconds: lengthSec,
      seed: Math.floor(Math.random() * 10_000_000_000),
      guide_strength_first: 0.85,
      guide_strength_last: 0.85,
    });
  };

  /** Full pipeline in one click: character frame → auto-start the morph video. */
  const autoGenerate = async () => {
    const staged = await createCharacterFrame();
    if (staged) generateMorph(staged);
  };

  const dims = getLtxDimensions(aspectRatio, resolution);
  const canTransform = !!sourceFilename && !!characterPrompt.trim() && !transforming;
  const canMorph = !!sourceFilename && !!transformedInput && !run.isGenerating && !transforming;
  const canAuto = !!sourceFilename && !!characterPrompt.trim() && !transforming && !run.isGenerating;

  return (
    <WorkflowShell
      title="Transform Reel"
      eyebrow="Qwen + LTX 2.3"
      description="The viral beat-drop transformation: photo → character version of the same frame → seamless morph video."
      icon={Wand2}
      isGenerating={run.isGenerating || transforming}
      canGenerate={canMorph}
      workflowId="ltx-flf"
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="Transformation Reels"
          emptyHint="Create a character frame, then morph — the reel lands here."
        />
      )}
    >
      <div className="space-y-4">
        {/* Step 1 — source + character */}
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
          <WorkflowSection title="1 · Source Photo">
            <UploadSlot
              preview={sourcePreview}
              uploading={sourceUploading}
              onFile={uploadSource}
              onUrl={uploadSourceFromUrl}
              label="Source Photo"
              hint="The 'before' — her normal look"
            />
          </WorkflowSection>

          <WorkflowSection title="2 · Character">
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {CHARACTER_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCharacterPrompt(p.prompt)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                      characterPrompt === p.prompt
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                        : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea
                value={characterPrompt}
                onChange={(e) => setCharacterPrompt(e.target.value)}
                placeholder="Describe who she becomes..."
                className={cn(inputBase, 'min-h-[72px] resize-y')}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={autoGenerate}
                  disabled={!canAuto}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {(transforming || run.isGenerating) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {transforming ? 'Step 1/2 — character frame…' : run.isGenerating ? 'Step 2/2 — morph video…' : 'Auto — Photo to Reel'}
                </button>
                <button
                  type="button"
                  onClick={() => { void createCharacterFrame(); }}
                  disabled={!canTransform}
                  title="Only create the character frame (re-roll until you like it, then morph manually below)"
                  className="flex items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Frame Only
                </button>
              </div>
            </div>
          </WorkflowSection>
        </div>

        {/* Before / after */}
        {(sourcePreview || transformedUrl) && (
          <WorkflowSection title="Before → After">
            <div className="flex items-center gap-3">
              <div className="flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {sourcePreview
                  ? <img src={sourcePreview} alt="before" className="max-h-64 w-full object-contain" />
                  : <div className="flex h-32 items-center justify-center text-[10px] text-white/20">source</div>}
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-violet-400/60" />
              <div className="flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {transformedUrl
                  ? <img src={transformedUrl} alt="after" className="max-h-64 w-full object-contain" />
                  : (
                    <div className="flex h-32 items-center justify-center text-[10px] text-white/20">
                      {transforming ? 'generating…' : 'character frame appears here'}
                    </div>
                  )}
              </div>
            </div>
          </WorkflowSection>
        )}

        {/* Step 3 — morph */}
        <WorkflowSection title="3 · Morph Video">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Transformation Prompt">
              <textarea
                value={morphPrompt}
                onChange={(e) => setMorphPrompt(e.target.value)}
                className={cn(inputBase, 'min-h-[88px] resize-y')}
              />
            </Field>
            <div className="space-y-3">
              <Field label="Aspect Ratio — reels are 9:16">
                <ChipGroup options={LTX_RATIOS} value={aspectRatio as LtxRatio} onChange={setAspectRatio} />
              </Field>
              <Field label={`Resolution — ${dims.width}×${dims.height}`}>
                <ChipGroup options={LTX_RESOLUTIONS} value={resolution} onChange={setResolution} />
              </Field>
              <SliderField
                label="Length"
                value={lengthSec}
                onChange={setLengthSec}
                min={2}
                max={8}
                step={1}
                format={(v) => `${v}s`}
              />
            </div>
          </div>
          <div className="mt-4">
            <GenerateButton
              onClick={() => generateMorph()}
              disabled={!canMorph}
              isGenerating={run.isGenerating}
              label="Generate Transformation Reel"
              requirementHint="Upload a photo and create the character frame first"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
