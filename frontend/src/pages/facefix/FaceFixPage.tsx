import { useEffect, useState } from 'react';
import { Loader2, ScanFace } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { uploadToComfy } from '../../utils/comfyUpload';
import { comfyService } from '../../services/comfyService';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';
import { GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn, inputBase, smallLabel } from '../../lib/styles';

type ComfyImage = { filename: string; subfolder?: string; type?: string };
const viewUrl = (im: ComfyImage) =>
  `/comfy/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder ?? '')}&type=${im.type ?? 'output'}`;

// Lightning checkpoints are distilled for few-step sampling; regular SDXL needs
// the normal profile. Toggling sets the three linked widgets so the user never
// has to know the numbers.
const PROFILES = {
  lightning: { steps: 6, cfg: 2, sampler_name: 'dpmpp_sde', scheduler: 'karras' },
  quality: { steps: 20, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras' },
};

export const FaceFixPage = () => {
  const { toast } = useToast();
  const { previewUrl, startExecution } = useComfyExecution();

  const [image, setImage] = usePersistentState<string | null>('facefix_image', null);
  const [uploading, setUploading] = useState(false);
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [checkpoint, setCheckpoint] = usePersistentState('facefix_ckpt', 'realvisxlV40_v40LightningBakedvae.safetensors');
  const [profile, setProfile] = usePersistentState<'lightning' | 'quality'>('facefix_profile', 'lightning');
  const [denoise, setDenoise] = usePersistentState('facefix_denoise', 0.5);
  const [seed, setSeed] = usePersistentState('facefix_seed', -1);
  const [bboxThreshold, setBboxThreshold] = usePersistentState('facefix_bbox', 0.5);
  const [cropFactor, setCropFactor] = usePersistentState('facefix_crop', 3.0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = usePersistentState<string[]>('facefix_results', []);

  useEffect(() => {
    fetch('/comfy/object_info/CheckpointLoaderSimple')
      .then((r) => r.json())
      .then((d) => {
        const opts = d?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
        if (Array.isArray(opts) && opts.length) {
          const sdxl = opts.filter((o: string) => /xl|realvis|realism|sdxl/i.test(o));
          setCheckpoints(sdxl.length ? sdxl : opts);
        }
      })
      .catch(() => {});
  }, []);

  const imagePreview = image ? `/comfy/view?filename=${encodeURIComponent(image)}&type=input` : null;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      setImage(await uploadToComfy(file));
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const uploadFromUrl = async (url: string) => {
    setUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const blob = await res.blob();
      setImage(await uploadToComfy(new File([blob], 'facefix-input.png', { type: blob.type || 'image/png' })));
    } catch (err: any) {
      toast(err.message || 'Could not load from URL', 'error');
      setUploading(false);
    }
  };

  useState(() => {
    const i = consumeHandoff('image');
    if (i) void uploadFromUrl(i);
    return undefined;
  });

  const pollImages = async (promptId: string): Promise<ComfyImage[]> => {
    for (let i = 0; i < 240; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/generate/status/${encodeURIComponent(promptId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Status failed');
      if (data.status === 'completed') {
        const images = Array.isArray(data.images) ? (data.images as ComfyImage[]) : [];
        const outputs = images.filter((im) => im.type === 'output');
        return outputs.length ? outputs : images;
      }
      if (data.status === 'not_found' && i > 8) throw new Error('Prompt disappeared from Comfy history');
    }
    throw new Error('Timed out waiting for output');
  };

  const canGenerate = !!image && !isGenerating;
  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    // Tell the execution context a run started so its websocket resets cancelledRef
    // and feeds live preview frames to previewUrl (the LiveSamplingPreview).
    startExecution();
    try {
      const p = PROFILES[profile];
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'facefix',
          params: {
            image,
            checkpoint,
            denoise,
            steps: p.steps,
            cfg: p.cfg,
            sampler_name: p.sampler_name,
            scheduler: p.scheduler,
            bbox_threshold: bboxThreshold,
            bbox_crop_factor: cropFactor,
            seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
            client_id: comfyService.clientId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Face fix failed');
      const images = await pollImages(String(data.prompt_id));
      const urls = images.map(viewUrl);
      setResults((prev) => [...urls, ...prev].slice(0, 20));
      toast('Faces fixed', 'success');
    } catch (err: any) {
      toast(err.message || 'Face fix failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <WorkflowShell
      title="Face Fixer"
      eyebrow="Impact FaceDetailer"
      description="Detect and re-detail every face in a photo — great for group shots and full-body renders."
      icon={ScanFace}
      isGenerating={isGenerating}
      canGenerate={canGenerate}
      workflowId="facefix"
      output={(
        <LiveSamplingPreview
          previewUrl={previewUrl}
          isRunning={isGenerating}
          hasOutput={results.length > 0}
          emptyState={
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
              <div className="text-center text-zinc-500">
                {isGenerating ? (
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" />
                ) : (
                  <ScanFace className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {isGenerating ? 'Fixing faces…' : 'No output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">Upload a photo and fix the faces.</div>
              </div>
            </div>
          }
        >
          <div className="space-y-2">
            {/* Latest result — whole image, scaled to fit (never cropped). */}
            <div className="flex items-center justify-center rounded-lg border border-white/10 bg-black/30 p-2">
              <img
                src={results[0]}
                alt="fixed"
                className="max-h-[62vh] w-auto max-w-full rounded object-contain"
              />
            </div>
            {results.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {results.slice(1, 10).map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="h-16 w-16 shrink-0 cursor-pointer rounded border border-white/10 object-cover transition hover:border-white/40"
                    onClick={() => setResults((prev) => [url, ...prev.filter((u) => u !== url)])}
                  />
                ))}
              </div>
            )}
          </div>
        </LiveSamplingPreview>
      )}
    >
      <div className="w-full space-y-4 px-6 pb-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <WorkflowSection title="Photo">
            <UploadSlot
              preview={imagePreview}
              uploading={uploading}
              onFile={upload}
              onUrl={uploadFromUrl}
              accept="image/*"
              label="Photo with faces"
              hint="Group shots and full-body renders work great — click or drop"
              height={240}
              filename={image ?? undefined}
              onClear={() => setImage(null)}
            />
          </WorkflowSection>

          <WorkflowSection title="Settings">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className={smallLabel}>Checkpoint (re-draws the faces)</label>
                <select className={cn(inputBase, 'text-xs')} value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
                  {checkpoints.length === 0 && <option value={checkpoint}>{checkpoint}</option>}
                  {checkpoints.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className={smallLabel}>Speed / quality</label>
                <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
                  {(['lightning', 'quality'] as const).map((pr) => (
                    <button
                      key={pr}
                      onClick={() => setProfile(pr)}
                      className={cn(
                        'flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition',
                        profile === pr ? 'bg-white text-black' : 'text-white/50 hover:text-white',
                      )}
                    >
                      {pr === 'lightning' ? 'Lightning (fast)' : 'Quality (slow)'}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-zinc-600">Lightning needs a Lightning checkpoint; Quality suits regular SDXL.</p>
              </div>

              <SliderField label="Fix strength (denoise)" value={denoise} onChange={setDenoise} min={0.2} max={0.8} step={0.05} />
              <p className="text-[9px] text-zinc-600">~0.4 = subtle cleanup · ~0.6 = stronger redraw (can shift the face)</p>

              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
              >
                {showAdvanced ? '− Advanced' : '+ Advanced'}
              </button>
              {showAdvanced && (
                <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
                  <SliderField label="Detection sensitivity" value={bboxThreshold} onChange={setBboxThreshold} min={0.2} max={0.9} step={0.05} />
                  <SliderField label="Context around face" value={cropFactor} onChange={setCropFactor} min={1.5} max={4.0} step={0.5} />
                  <div className="sm:col-span-2"><SeedField value={seed} onChange={setSeed} /></div>
                </div>
              )}
            </div>
          </WorkflowSection>
        </div>

        <GenerateButton
          onClick={handleGenerate}
          disabled={!canGenerate}
          isGenerating={isGenerating}
          label="Fix faces"
          generatingLabel="Fixing faces…"
          requirementHint={!image ? 'Upload a photo first' : undefined}
        />
      </div>
    </WorkflowShell>
  );
};
