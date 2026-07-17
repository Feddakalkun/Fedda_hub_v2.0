import { useEffect, useState } from 'react';
import { Loader2, Sparkles, UserPlus, Wand2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { useToast } from '../ui/Toast';
import { comfyService } from '../../services/comfyService';
import { matchesFamily, toLabel } from '../../lib/loraLabel';
import { cn, inputBase, smallLabel } from '../../lib/styles';

type ComfyImage = { filename: string; subfolder?: string; type?: string };

const CONTROL_MODES = [
  { label: 'DWPose', value: 2 },
  { label: 'Lotus Depth', value: 1 },
  { label: 'Canny', value: 3 },
  { label: 'HED Soft Edge', value: 5 },
];

type Mode = 'pose' | 'mask';

// Pose mode generates with z-image; mask mode inpaints with SDXL. LoRAs are
// filtered to the matching family (character LoRAs live under app/).
const LORA_PREFIXES: Record<Mode, string[]> = {
  pose: ['zimage', 'z-image', 'app/'],
  mask: ['sdxl'],
};

const viewUrl = (filename: string) =>
  `/comfy/view?filename=${encodeURIComponent(filename)}&subfolder=&type=input`;

/**
 * Generate a new person FROM a source image (typically the captured start frame),
 * to become an animation reference. Two modes, pose-match default. On a new
 * source it auto-captions the frame (uncensored vision model) to seed the prompt,
 * and offers a family-filtered LoRA so z-image / SDLX character LoRAs both work.
 */
export const GeneratePersonPanel = ({
  sourceImageFile,
  sourcePreviewUrl,
  onApprove,
  defaultPrompt = 'a beautiful woman, natural skin, cinematic lighting',
}: {
  sourceImageFile: string | null;
  sourcePreviewUrl: string | null;
  onApprove: (filename: string) => void;
  defaultPrompt?: string;
}) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('pose');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [controlMode, setControlMode] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [candidates, setCandidates] = useState<ComfyImage[]>([]);
  const [approving, setApproving] = useState<string | null>(null);

  const [allLoras, setAllLoras] = useState<string[]>([]);
  const [lora, setLora] = useState('');
  const [loraStrength, setLoraStrength] = useState(0.8);

  useEffect(() => {
    comfyService.getLoras().then(setAllLoras).catch(() => {});
  }, []);

  // Switching mode may invalidate the selected LoRA (different family).
  const modeLoras = allLoras.filter((l) => matchesFamily(l, LORA_PREFIXES[mode]));
  useEffect(() => {
    if (lora && !modeLoras.includes(lora)) setLora('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Caption the frame into the prompt whenever a NEW source arrives.
  const describeFrame = async (auto: boolean) => {
    if (!sourceImageFile || !sourcePreviewUrl) return;
    setCaptioning(true);
    try {
      const blob = await (await fetch(sourcePreviewUrl)).blob();
      const form = new FormData();
      form.append('file', new File([blob], 'frame.png', { type: blob.type || 'image/png' }));
      form.append('context', 'zimage');
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Caption failed');
      if (data.caption) {
        setPrompt(data.caption);
        if (!auto) toast('Prompt written from the frame', 'success');
      }
    } catch (err: any) {
      if (!auto) toast(err.message || 'Could not caption the frame', 'error');
    } finally {
      setCaptioning(false);
    }
  };

  useEffect(() => {
    if (sourceImageFile) void describeFrame(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImageFile]);

  const pollGeneration = async (promptId: string): Promise<ComfyImage[]> => {
    for (let i = 0; i < 180; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/generate/status/${encodeURIComponent(promptId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Status failed');
      if (data.status === 'completed') {
        const images = Array.isArray(data.images) ? (data.images as ComfyImage[]) : [];
        if (!images.length) throw new Error('Generation finished without image output');
        const outputs = images.filter((im) => im.type === 'output');
        return outputs.length ? outputs : images;
      }
      if (data.status === 'not_found' && i > 8) throw new Error('Prompt disappeared from Comfy history');
    }
    throw new Error('Timed out waiting for output');
  };

  const importCandidates = async (images: ComfyImage[]): Promise<ComfyImage[]> => {
    const imported: ComfyImage[] = [];
    for (const image of images.slice(0, 4)) {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/import-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(image),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not import generated image');
      imported.push({ filename: data.filename, subfolder: '', type: 'input' });
    }
    return imported;
  };

  const generate = async () => {
    if (!sourceImageFile || generating) return;
    setGenerating(true);
    setCandidates([]);
    try {
      const loras = lora ? [{ name: lora, strength: loraStrength }] : [];
      const params =
        mode === 'pose'
          ? {
              image: sourceImageFile,
              prompt: prompt.trim(),
              style: 'No Style',
              control_mode: controlMode,
              control_strength: 0.7,
              seed: Math.floor(Math.random() * 10_000_000_000),
              steps: 9,
              cfg: 1,
              denoise: 1,
              loras,
              client_id: comfyService.clientId,
            }
          : {
              image: sourceImageFile,
              prompt: prompt.trim(),
              negative: '',
              mask_body: true,
              mask_clothes: true,
              mask_confidence: 0.25,
              controlnet_strength: 0.8,
              seed: Math.floor(Math.random() * 10_000_000_000),
              steps: 25,
              cfg: 6,
              denoise: 1,
              loras,
              client_id: comfyService.clientId,
            };
      const workflowId = mode === 'pose' ? 'z-image-controlnet-pose' : 'sdxl-inpaint-automask';
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, params }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Generation failed');
      const images = await pollGeneration(String(data.prompt_id));
      setCandidates(await importCandidates(images));
      toast('Person generated — pick one to use as the reference', 'success');
    } catch (err: any) {
      toast(err.message || 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const approve = (image: ComfyImage) => {
    setApproving(image.filename);
    try {
      onApprove(image.filename);
      toast('Set as reference image', 'success');
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-zinc-400" />
        <p className="text-sm font-semibold text-white">Generate a person from the frame</p>
      </div>

      {!sourceImageFile ? (
        <p className="text-[11px] text-zinc-600">
          Capture a start frame from the motion clip first — it becomes the source for the new person.
        </p>
      ) : (
        <>
          {sourcePreviewUrl && (
            <img src={sourcePreviewUrl} alt="source frame" className="max-h-40 w-full rounded-lg object-contain" />
          )}

          <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
            {([['pose', 'Match pose (z-image)'], ['mask', 'Keep scene, swap (SDXL)']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition',
                  mode === m ? 'bg-white text-black' : 'text-white/50 hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={smallLabel}>Prompt {captioning && <span className="text-zinc-600">· reading frame…</span>}</label>
              <button
                onClick={() => void describeFrame(false)}
                disabled={captioning}
                className="inline-flex items-center gap-1 text-[10px] text-zinc-500 transition hover:text-zinc-200 disabled:opacity-50"
                title="Describe the frame into the prompt"
              >
                {captioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                Describe frame
              </button>
            </div>
            <textarea
              className={cn(inputBase, 'min-h-[64px] resize-y text-xs')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the person to generate…"
            />
          </div>

          {mode === 'pose' && (
            <div className="space-y-1">
              <label className={smallLabel}>Pose detection</label>
              <div className="flex flex-wrap gap-1">
                {CONTROL_MODES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setControlMode(c.value)}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[10px] transition',
                      controlMode === c.value
                        ? 'border-white/30 bg-white/10 text-white'
                        : 'border-white/10 text-white/45 hover:text-white/80',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Family-filtered LoRA */}
          <div className="space-y-1">
            <label className={smallLabel}>
              {mode === 'pose' ? 'Z-Image LoRA' : 'SDXL LoRA'} <span className="text-zinc-600">({modeLoras.length})</span>
            </label>
            <select className={cn(inputBase, 'text-xs')} value={lora} onChange={(e) => setLora(e.target.value)}>
              <option value="">None</option>
              {modeLoras.map((l) => (
                <option key={l} value={l}>
                  {toLabel(l)}
                </option>
              ))}
            </select>
            {lora && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-600">Strength</span>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={loraStrength}
                  onChange={(e) => setLoraStrength(Number(e.target.value))}
                  className="flex-1 accent-zinc-300"
                />
                <span className="w-8 text-right text-[9px] font-mono text-zinc-400">{loraStrength.toFixed(2)}</span>
              </div>
            )}
          </div>

          <button
            onClick={generate}
            disabled={generating}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition',
              generating ? 'cursor-not-allowed bg-white/10 text-white/40' : 'bg-white text-black hover:bg-white/90',
            )}
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? 'Generating…' : 'Generate person'}
          </button>

          {candidates.length > 0 && (
            <div className="space-y-1.5">
              <p className={smallLabel}>Pick one to use as the reference</p>
              <div className="grid grid-cols-2 gap-2">
                {candidates.map((im) => (
                  <button
                    key={im.filename}
                    onClick={() => approve(im)}
                    disabled={!!approving}
                    className="group relative overflow-hidden rounded-lg border border-white/10 transition hover:border-white/40"
                  >
                    <img src={viewUrl(im.filename)} alt="" className="aspect-[3/4] w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                      {approving === im.filename ? (
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      ) : (
                        <span className="text-[10px] font-semibold text-white">Use this</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
