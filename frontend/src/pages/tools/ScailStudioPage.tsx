/**
 * ScailStudioPage — clean, step-by-step character studio (SCAIL-2 motion comes later).
 * Step 1: get a starter image (upload OR generate with Z-Image + a character LoRA).
 * Step 2: change her outfit with automask inpaint (face/hair/background stay locked).
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Shirt, Sparkles, Upload, Wand2 } from 'lucide-react';
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

  // generate (z-image) state
  const [genPrompt, setGenPrompt] = usePersistentState('scail_gen_prompt', '');
  const [loraName, setLoraName] = usePersistentState('scail_gen_lora', '');
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // outfit (inpaint) state
  const [outfitPrompt, setOutfitPrompt] = usePersistentState('scail_outfit_prompt', OUTFIT_PRESETS[0].prompt);
  const [applying, setApplying] = useState(false);

  const busy = uploading || generating || applying;
  const dimsRef = useRef<{ w: number; h: number }>({ w: 896, h: 1152 });

  useEffect(() => {
    comfyService.getLoras()
      .then((loras) => setAvailableLoras(loras.filter((l) => {
        const n = l.replace(/\\/g, '/').toLowerCase();
        return n.includes('zimage') || n.includes('z-image');
      })))
      .catch(() => {});
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
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'z-image',
          params: {
            prompt: genPrompt.trim(),
            negative: IMG_NEGATIVE,
            width: 896,
            height: 1152,
            steps: 11,
            cfg: 1.0,
            seed: Math.floor(Math.random() * 10_000_000_000),
            ...(loraName ? { loras: [{ name: loraName, strength: 1.0 }] } : {}),
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Generate failed');
      const images = await pollImages(data.prompt_id, 'z-image');
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
        {/* STEP 1 — starter image */}
        <WorkflowSection title="1 · Starter Image">
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('generate')}
                className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all',
                  mode === 'generate' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10')}
              >
                <Sparkles className="h-4 w-4" /> Generate with Z-Image
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
                <select value={loraName} onChange={(e) => setLoraName(e.target.value)} className={cn(inputBase, 'text-sm')}>
                  <option value="">No character LoRA</option>
                  {availableLoras.map((l) => (
                    <option key={l} value={l}>{l.replace(/\\/g, '/').split('/').pop()?.replace(/\.safetensors$/i, '')}</option>
                  ))}
                </select>
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
          <WorkflowSection title="2 · Change Outfit">
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
