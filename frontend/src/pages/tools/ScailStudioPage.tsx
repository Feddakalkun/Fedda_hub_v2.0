/**
 * ScailStudioPage — clean, step-by-step character studio (SCAIL-2 motion comes later).
 * Step 1: get a starter image (upload OR generate with Z-Image + a character LoRA).
 * Step 2: change her outfit with automask inpaint (face/hair/background stay locked).
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Film, ImagePlus, Link2, Loader2, Shirt, Sparkles, Upload, Wand2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useToast } from '../../components/ui/Toast';
import { comfyService } from '../../services/comfyService';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { UploadSlot } from '../../components/ui/WorkflowControls';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { cn, inputBase } from '../../lib/styles';

const OUTFIT_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: 'Red Latex', prompt: 'a skin-tight glossy red latex mini dress, deep neckline, real specular highlights, stiletto heels' },
  { label: 'Lingerie', prompt: 'a black lace lingerie set with sheer thigh-high stockings and a thin gold body chain' },
  { label: 'Bikini', prompt: 'a tiny bronze string bikini, sunlit skin with a natural sheen' },
  { label: 'Club Dress', prompt: 'a backless skin-tight black satin mini dress, strappy heels' },
  { label: 'Sporty', prompt: 'a matching seamless sports bra and high-waisted gym leggings, light sweat sheen' },
  { label: 'Evening Gown', prompt: 'a floor-length silk gown with a thigh-high slit and a plunging back' },
];

const IMG_NEGATIVE = 'blurry, low quality, deformed, extra limbs, watermark, text';

// Base models for the starter image. loraToken = substring a LoRA path must contain
// to belong to this family (null = the workflow has no LoRA support). size = send width/height.
const MODELS: Array<{ id: string; label: string; loraToken: string | null; size: boolean; steps: number; cfg: number }> = [
  { id: 'z-image', label: 'Z-Image', loraToken: 'zimage', size: true, steps: 11, cfg: 1.0 },
  { id: 'flux2klein-txt2img', label: 'FLUX2 Klein', loraToken: 'flux', size: false, steps: 20, cfg: 1.0 },
  { id: 'qwen-txt2img', label: 'Qwen', loraToken: 'qwen', size: true, steps: 8, cfg: 1.0 },
  { id: 'chroma1-hd-txt2img', label: 'Chroma HD', loraToken: null, size: true, steps: 26, cfg: 4.0 },
  { id: 'sdxl-txt2img', label: 'SDXL', loraToken: 'sdxl', size: true, steps: 25, cfg: 6.0 },
];

// Poll a prompt to completion and return its output images (backend status endpoint).
async function pollImages(promptId: string, workflowId: string, maxTicks = 120): Promise<Array<{ filename: string; subfolder: string; type: string }>> {
  for (let i = 0; i < maxTicks; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/generate/status/${promptId}?workflow_id=${encodeURIComponent(workflowId)}`);
      const data = await res.json();
      if (data.status === 'completed') return data.images ?? [];
    } catch { /* transient */ }
  }
  throw new Error('Timed out');
}

// Re-upload a /comfy/view output URL back into ComfyUI input so the next step can use it.
async function stageAsInput(viewUrl: string, name: string): Promise<string> {
  const blob = await (await fetch(viewUrl)).blob();
  const form = new FormData();
  form.append('file', new File([blob], name, { type: blob.type || 'image/png' }));
  const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Could not stage image');
  return data.filename as string;
}

const viewUrl = (img: { filename: string; subfolder: string; type: string }) =>
  `/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;

export const ScailStudioPage = () => {
  const { toast } = useToast();

  // starter image state (the ComfyUI input filename everything downstream uses)
  const [starterFile, setStarterFile] = usePersistentState<string | null>('scail_starter_file', null);
  const [starterPreview, setStarterPreview] = usePersistentState<string | null>('scail_starter_preview', null);
  const [mode, setMode] = usePersistentState<'upload' | 'generate'>('scail_mode', 'generate');
  const [uploading, setUploading] = useState(false);

  // generate state
  const [genPrompt, setGenPrompt] = usePersistentState('scail_gen_prompt', '');
  const [modelId, setModelId] = usePersistentState('scail_gen_model', 'z-image');
  const [loraEntries, setLoraEntries] = usePersistentState<Array<{ name: string; strength: number }>>('scail_gen_loras', []);
  const [allLoras, setAllLoras] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
  const familyLoras = model.loraToken
    ? allLoras.filter((l) => l.replace(/\\/g, '/').toLowerCase().includes(model.loraToken!))
    : [];
  const shortLora = (p: string) => p.replace(/\\/g, '/').split('/').pop()?.replace(/\.safetensors$/i, '') ?? p;

  // outfit (inpaint) state
  const [outfitPrompt, setOutfitPrompt] = usePersistentState('scail_outfit_prompt', OUTFIT_PRESETS[0].prompt);
  const [applying, setApplying] = useState(false);

  // driving clip state (the motion video for SCAIL-2; we also grab a starter frame from it)
  const [clipUrl, setClipUrl] = useState('');
  const [clipFile, setClipFile] = usePersistentState<string | null>('scail_clip_file', null);
  const [clipDownloading, setClipDownloading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const busy = uploading || generating || applying || clipDownloading || capturing;
  const dimsRef = useRef<{ w: number; h: number }>({ w: 896, h: 1152 });
  const clipPreview = clipFile ? `/comfy/view?filename=${encodeURIComponent(clipFile)}&type=input` : null;

  useEffect(() => {
    comfyService.getLoras().then(setAllLoras).catch(() => {});
  }, []);

  // Accept a "Send to Workflow" image handoff
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) {
      setMode('upload');
      fetch(url).then((r) => r.blob()).then((blob) => uploadStarter(new File([blob], 'handoff.png', { type: blob.type || 'image/png' })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStarter = (file: string, preview: string) => {
    dimsRef.current = { w: 896, h: 1152 };
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      dimsRef.current = {
        w: Math.max(64, Math.round((img.naturalWidth * scale) / 8) * 8),
        h: Math.max(64, Math.round((img.naturalHeight * scale) / 8) * 8),
      };
    };
    img.src = preview;
    setStarterFile(file);
    setStarterPreview(preview);
  };

  const downloadClip = async () => {
    const u = clipUrl.trim();
    if (!u || clipDownloading) return;
    setClipDownloading(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/download-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Download failed');
      setClipFile(data.filename);
      toast('Clip downloaded', 'success');
    } catch (err: any) {
      toast(err.message || 'Download failed', 'error');
    } finally {
      setClipDownloading(false);
    }
  };

  const grabFrameBlob = async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return new Promise((r) => canvas.toBlob(r, 'image/png'));
  };

  // Grab the currently-shown video frame and use it directly as the starter image.
  const captureFrame = async () => {
    if (capturing || !videoRef.current?.videoWidth) return;
    setCapturing(true);
    try {
      const blob = await grabFrameBlob();
      if (!blob) throw new Error('Could not capture frame');
      await uploadStarter(new File([blob], 'clip-frame.png', { type: 'image/png' }));
      toast('Frame captured as starter', 'success');
    } catch (err: any) {
      toast(err.message || 'Capture failed', 'error');
    } finally {
      setCapturing(false);
    }
  };

  // Caption the current frame with a vision model and drop a recreation prompt into the Generate box.
  const captureFrameToPrompt = async () => {
    if (capturing || !videoRef.current?.videoWidth) return;
    setCapturing(true);
    try {
      const blob = await grabFrameBlob();
      if (!blob) throw new Error('Could not capture frame');
      const form = new FormData();
      form.append('file', new File([blob], 'clip-frame.png', { type: 'image/png' }));
      form.append('context', 'zimage');
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/caption`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Caption failed');
      setGenPrompt(data.caption ?? '');
      setMode('generate');
      toast(data.model ? `Prompt built with ${data.model}` : 'Prompt built from frame', 'success');
    } catch (err: any) {
      toast(err.message || 'Caption failed', 'error');
    } finally {
      setCapturing(false);
    }
  };

  const uploadStarter = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setStarter(data.filename, `/comfy/view?filename=${encodeURIComponent(data.filename)}&type=input`);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const generateStarter = async () => {
    if (!genPrompt.trim() || busy) return;
    setGenerating(true);
    try {
      const activeLoras = model.loraToken
        ? loraEntries.filter((e) => e.name && e.name.trim()).map((e) => ({ name: e.name, strength: e.strength }))
        : [];
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: model.id,
          params: {
            prompt: genPrompt.trim(),
            negative: IMG_NEGATIVE,
            ...(model.size ? { width: 896, height: 1152 } : {}),
            steps: model.steps,
            cfg: model.cfg,
            seed: Math.floor(Math.random() * 10_000_000_000),
            ...(activeLoras.length ? { loras: activeLoras } : {}),
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Generate failed');
      const images = await pollImages(data.prompt_id, model.id);
      if (!images.length) throw new Error('No image produced');
      const url = viewUrl(images[images.length - 1]);
      const staged = await stageAsInput(url, 'scail-starter.png');
      setStarter(staged, url);
      toast('Starter image ready', 'success');
    } catch (err: any) {
      toast(err.message || 'Generate failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const applyOutfit = async () => {
    if (!starterFile || !outfitPrompt.trim() || busy) return;
    setApplying(true);
    try {
      const { w, h } = dimsRef.current;
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'sdxl-inpaint-automask',
          params: {
            image: starterFile,
            width: w,
            height: h,
            preresize_min_width: w,
            preresize_min_height: h,
            denoise: 0.85,
            cfg: 2.0,
            steps: 25,
            seed: Math.floor(Math.random() * 10_000_000_000),
            prompt: `a woman wearing ${outfitPrompt.trim()}, real fabric with natural folds, natural skin, photorealistic, sharp focus`,
            negative: IMG_NEGATIVE,
            mask_clothes: true,
            mask_body: true,
            mask_face: false,
            mask_hair: false,
            mask_accessories: false,
            mask_background: false,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Apply failed');
      const images = await pollImages(data.prompt_id, 'sdxl-inpaint-automask');
      if (!images.length) throw new Error('No image produced');
      const url = viewUrl(images[images.length - 1]);
      const staged = await stageAsInput(url, 'scail-dressed.png'); // keep result as new starter so you can iterate
      setStarter(staged, url);
      toast('Outfit applied', 'success');
    } catch (err: any) {
      toast(err.message || 'Apply failed', 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <WorkflowShell
      title="Scail Studio"
      eyebrow="Z-Image + SCAIL-2"
      description="Make or upload a character, dress her, then bring her to motion (motion step coming next)."
      icon={Wand2}
      isGenerating={busy}
      canGenerate={false}
      hideOutputPane
      output={null}
    >
      <div className="mx-auto max-w-2xl space-y-4">
        {/* STEP 1 — driving clip */}
        <WorkflowSection title="1 · Driving Clip">
          <div className="space-y-3">
            <p className="text-[11px] text-white/35">
              Paste a TikTok / Reels / YouTube link — the motion clip SCAIL-2 will use. Then capture a frame to build your character on.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                <input
                  type="url"
                  value={clipUrl}
                  onChange={(e) => setClipUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !clipDownloading && downloadClip()}
                  placeholder="https://www.tiktok.com/..."
                  className={cn(inputBase, 'w-full pl-9 text-sm')}
                />
              </div>
              <button
                type="button"
                onClick={downloadClip}
                disabled={!clipUrl.trim() || clipDownloading}
                className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 text-xs font-bold uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {clipDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                {clipDownloading ? '' : 'Download'}
              </button>
            </div>

            {clipPreview && (
              <div className="space-y-2">
                <video ref={videoRef} src={clipPreview} controls playsInline className="max-h-[50vh] w-full rounded-xl bg-black" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={captureFrameToPrompt}
                    disabled={busy}
                    title="Describe this frame with a vision model and build a matching prompt to generate your own character"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Describe → Prompt
                  </button>
                  <button
                    type="button"
                    onClick={captureFrame}
                    disabled={busy}
                    title="Use this exact frame as the starter image (to edit directly)"
                    className="flex items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-sm font-bold text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Camera className="h-4 w-4" />
                    Use Frame
                  </button>
                </div>
                <p className="text-center text-[10px] text-white/25">
                  Scrub to the pose you want, pause, then: <span className="text-white/40">Describe → Prompt</span> recreates it as your character, or <span className="text-white/40">Use Frame</span> edits it directly.
                </p>
              </div>
            )}
          </div>
        </WorkflowSection>

        {/* STEP 2 — starter image */}
        <WorkflowSection title="2 · Starter Image">
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('generate')}
                className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all',
                  mode === 'generate' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10')}
              >
                <Sparkles className="h-4 w-4" /> Generate image
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all',
                  mode === 'upload' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10')}
              >
                <Upload className="h-4 w-4" /> Upload a photo
              </button>
            </div>

            {mode === 'upload' ? (
              <UploadSlot
                preview={starterPreview}
                uploading={uploading}
                onFile={uploadStarter}
                label="Upload a photo"
                hint="Click or drop jpg/png"
                height={260}
                onClear={() => { setStarterFile(null); setStarterPreview(null); }}
              />
            ) : (
              <div className="space-y-2.5">
                <PromptAssistant
                  context="zimage"
                  value={genPrompt}
                  onChange={setGenPrompt}
                  placeholder="Describe her — e.g. a 22 year old blonde woman, full body, standing in a studio..."
                  minRows={3}
                  accent="violet"
                  label="Describe your character"
                />
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-white/25">Model</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setModelId(m.id); setLoraEntries([]); }}
                        className={cn('rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                          modelId === m.id ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10')}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {model.loraToken ? (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/25">
                      LoRAs {familyLoras.length > 0 && <span className="opacity-50">({familyLoras.length} for {model.label})</span>}
                    </p>
                    {loraEntries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          value={entry.name}
                          onChange={(e) => setLoraEntries(loraEntries.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                          className={cn(inputBase, 'flex-1 text-[11px]')}
                        >
                          <option value="">Select LoRA…</option>
                          {familyLoras.map((l) => <option key={l} value={l}>{shortLora(l)}</option>)}
                        </select>
                        <input
                          type="range" min={0} max={1.5} step={0.05} value={entry.strength}
                          onChange={(e) => setLoraEntries(loraEntries.map((x, j) => j === i ? { ...x, strength: parseFloat(e.target.value) } : x))}
                          className="w-20"
                        />
                        <span className="w-8 text-right font-mono text-[10px] text-white/40">{entry.strength.toFixed(2)}</span>
                        <button type="button" onClick={() => setLoraEntries(loraEntries.filter((_, j) => j !== i))}
                          className="text-white/30 transition hover:text-red-400">✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLoraEntries([...loraEntries, { name: '', strength: 1.0 }])}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/40 transition hover:bg-white/10"
                    >
                      + Add LoRA
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-white/25">{model.label} has no LoRA support here.</p>
                )}
                <button
                  type="button"
                  onClick={generateStarter}
                  disabled={!genPrompt.trim() || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {generating ? 'Generating…' : 'Generate Starter Image'}
                </button>
              </div>
            )}
          </div>
        </WorkflowSection>

        {/* Current image */}
        {starterPreview && (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400/80">
                <Check className="h-3.5 w-3.5" /> Current image
              </span>
              <button
                type="button"
                onClick={() => { setStarterFile(null); setStarterPreview(null); }}
                className="text-[10px] font-bold uppercase tracking-widest text-white/30 transition hover:text-white/60"
              >
                Start over
              </button>
            </div>
            <img src={starterPreview} alt="current" className="max-h-[60vh] w-full object-contain" />
          </div>
        )}

        {/* STEP 2 — outfit */}
        {starterFile && (
          <WorkflowSection title="3 · Change Outfit">
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {OUTFIT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setOutfitPrompt(p.prompt)}
                    className={cn('rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                      outfitPrompt === p.prompt ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <PromptAssistant
                context="zimage"
                value={outfitPrompt}
                onChange={setOutfitPrompt}
                placeholder="Describe the outfit..."
                minRows={2}
                accent="violet"
                label="Outfit"
                enableCaption={false}
              />
              <button
                type="button"
                onClick={applyOutfit}
                disabled={!outfitPrompt.trim() || busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shirt className="h-4 w-4" />}
                {applying ? 'Applying…' : 'Apply Outfit'}
              </button>
              <p className="text-center text-[10px] text-white/25">
                Only the clothing changes — her face, hair and background stay exactly the same.
              </p>
            </div>
          </WorkflowSection>
        )}
      </div>
    </WorkflowShell>
  );
};
