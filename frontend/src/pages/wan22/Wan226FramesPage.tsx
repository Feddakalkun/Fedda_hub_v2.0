import { useEffect, useRef, useState } from 'react';
import { Layers, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { ChipGroup, GenerateButton, SeedField, SliderField } from '../../components/ui/WorkflowControls';

// Dynamic single-pass graph (backend builds N-1 transitions, ImageBatch join = unbroken motion).
const MAX_FRAMES = 20;

type StoryRatio = '1:1' | '3:4' | '9:16' | '4:3' | '16:9';
const RATIOS: StoryRatio[] = ['1:1', '3:4', '9:16', '4:3', '16:9'];
const RATIO_ASPECT: Record<StoryRatio, string> = { '1:1': '1:1', '3:4': '4:3', '9:16': '16:9', '4:3': '4:3', '16:9': '16:9' };
const RATIO_DIRECTION: Record<StoryRatio, string> = { '1:1': 'Horizontal', '3:4': 'Vertical', '9:16': 'Vertical', '4:3': 'Horizontal', '16:9': 'Horizontal' };
const RES_PRESETS = ['480', '576', '640', '720'] as const;

const DEFAULT_TRANSITION = 'smooth cinematic transition, natural motion, consistent subject';

interface SegmentVideo { filename: string; subfolder: string; type?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Wan226FramesPage = () => {
  // frames = uploaded server filenames; prompts[i] = transition frame i -> i+1
  const [frames, setFrames] = usePersistentState<string[]>('wanstory_frames', []);
  const [prompts, setPrompts] = usePersistentState<string[]>('wanstory_prompts', []);
  const [seed, setSeed] = usePersistentState('wanstory_seed', -1);
  const [ratio, setRatio] = usePersistentState<StoryRatio>('wanstory_ratio', '9:16');
  const [resolution, setResolution] = usePersistentState('wanstory_resolution', '640');
  const [seconds, setSeconds] = usePersistentState('wanstory_seconds', 5);
  const [loraHigh, setLoraHigh] = usePersistentState('wanstory_lora_high', '');
  const [loraLow, setLoraLow] = usePersistentState('wanstory_lora_low', '');
  const [loraHighStr, setLoraHighStr] = usePersistentState('wanstory_lora_high_str', 1.0);
  const [loraLowStr, setLoraLowStr] = usePersistentState('wanstory_lora_low_str', 1.0);

  const [currentVideo, setCurrentVideo] = useState<string | null>(null);
  const [history, setHistory] = usePersistentState<string[]>('wanstory_history', []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [isStoryboarding, setIsStoryboarding] = useState(false);
  const [storyStyle, setStoryStyle] = usePersistentState('wanstory_style', '');
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<number>(-1); // -1 = append
  const cancelRef = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((l) => {
        const n = l.replace(/\\/g, '/').toLowerCase();
        return n.startsWith('wan22/') || n.includes('wan2.2') || n.includes('wan22');
      });
      setAvailableLoras(filtered.length ? filtered : loras);
    }).catch(() => {});
  }, []);

  const frameUrl = (name: string) => `/comfy/view?filename=${encodeURIComponent(name)}&type=input`;
  const videoUrl = (v: SegmentVideo) =>
    `/comfy/view?filename=${encodeURIComponent(v.filename)}&subfolder=${encodeURIComponent(v.subfolder || '')}&type=${v.type || 'output'}`;

  // ── frames ──────────────────────────────────────────────────────────────
  const pickFile = (index: number) => {
    uploadTargetRef.current = index;
    fileInputRef.current?.click();
  };

  const handleUpload = async (file: File) => {
    const index = uploadTargetRef.current;
    setUploadingIdx(index);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setFrames((prev) => {
        if (index === -1) return prev.length < MAX_FRAMES ? [...prev, data.filename] : prev;
        const n = [...prev]; n[index] = data.filename; return n;
      });
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      uploadTargetRef.current = index;
      void handleUpload(file);
    }
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  const removeFrame = (index: number) => {
    setFrames((prev) => prev.filter((_, i) => i !== index));
    setPrompts((prev) => prev.filter((_, i) => i !== index));
  };

  const setPrompt = (index: number, value: string) => {
    setPrompts((prev) => {
      const n = [...prev];
      while (n.length <= index) n.push('');
      n[index] = value;
      return n;
    });
  };

  const segments = Math.max(0, frames.length - 1);

  // ── Auto-Storyboard: backend brain reads every frame and writes one continuous story ──
  const generateStoryboard = async () => {
    if (isStoryboarding || frames.length < 2) return;
    setIsStoryboarding(true);
    try {
      toast('Reading frames and directing the story…', 'info');
      const r = await fetch(`${BACKEND_API.BASE_URL}/api/ollama/storyboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: frames, style: storyStyle.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.detail || 'Storyboarding failed');
      setPrompts(d.transitions);
      toast('Storyboard written — tweak any transition before generating', 'success');
    } catch (err: any) {
      toast(err.message || 'Storyboarding failed', 'error');
    } finally {
      setIsStoryboarding(false);
    }
  };

  // ── generation ──────────────────────────────────────────────────────────
  const generate = async () => {
    if (isGenerating || frames.length < 2) return;
    cancelRef.current = false;
    setIsGenerating(true);
    setCurrentVideo(null);
    const segs = frames.length - 1;
    setProgress(`Rendering continuous story — ${segs} transition${segs === 1 ? '' : 's'}, single pass…`);
    try {
      // Dynamic backend graph: N-1 transitions rendered in one ComfyUI pass, joined
      // in pixel space (ImageBatch) -> unbroken motion for any 2..20 frames.
      const r = await fetch(`${BACKEND_API.BASE_URL}/api/wan-story/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: frames,
          prompts: frames.slice(0, -1).map((_, i) => (prompts[i] || DEFAULT_TRANSITION).trim()),
          seed: seed === -1 ? -1 : seed,
          aspect_ratio: RATIO_ASPECT[ratio],
          direction: RATIO_DIRECTION[ratio],
          width: parseInt(resolution, 10),
          seconds,
          ...(loraHigh ? { lora_high: { lora: loraHigh, strength: loraHighStr } } : {}),
          ...(loraLow ? { lora_low: { lora: loraLow, strength: loraLowStr } } : {}),
        }),
      });
      const d = await r.json();
      if (!d.prompt_id) throw new Error(d.detail || d.error || 'Submit failed');

      for (;;) {
        if (cancelRef.current) throw new Error('Cancelled');
        await sleep(5000);
        const s = await (await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE_STATUS}/${d.prompt_id}`)).json();
        if (s.status === 'completed') {
          const vid = s.videos?.[0];
          if (!vid) throw new Error('Story finished but produced no video');
          const url = videoUrl(vid);
          setCurrentVideo(url);
          setHistory((prev) => [url, ...prev.filter((u) => u !== url)].slice(0, 40));
          toast('Story ready — continuous motion', 'success');
          break;
        }
        if (s.status === 'error') throw new Error(s.error || 'Story failed in ComfyUI');
      }
    } catch (err: any) {
      if (err.message !== 'Cancelled') toast(err.message || 'Generation failed', 'error');
      else toast('Stopped', 'info');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const canGenerate = frames.length >= 2 && !isGenerating;

  return (
    <WorkflowShell
      title="Storyboard"
      eyebrow="WAN 2.2"
      description={`Chain 2–${MAX_FRAMES} keyframes into one continuous video — single-pass render for smooth unbroken motion, each transition gets its own prompt.`}
      icon={Layers}
      isGenerating={isGenerating}
      canGenerate={canGenerate}
      workflowId="wan22-flf-segment"
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={currentVideo}
          history={history}
          onSelectVideo={setCurrentVideo}
          onRemoveVideo={(url) => setHistory((prev) => prev.filter((v) => v !== url))}
          isGenerating={isGenerating}
          title={progress || 'Story Output'}
          emptyHint="Add keyframes below and generate."
        />
      )}
    >
      <div className="space-y-4">
        <input
          ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }}
        />

        <WorkflowSection
          title={`Keyframes (${frames.length}/${MAX_FRAMES})`}
          actions={(
            <div className="flex items-center gap-2">
              <input
                value={storyStyle}
                onChange={(e) => setStoryStyle(e.target.value)}
                placeholder="Story mood (optional): moody night vibe, playful dance…"
                className="hidden w-64 rounded-lg fedda-input px-2 py-1.5 text-[11px] sm:block"
              />
              <button
                type="button"
                onClick={() => void generateStoryboard()}
                disabled={isStoryboarding || frames.length < 2}
                className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-40"
              >
                {isStoryboarding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Auto-Storyboard
              </button>
              <button
                type="button"
                onClick={() => { setFrames([]); setPrompts([]); }}
                disabled={isGenerating || frames.length === 0}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-rose-300 disabled:opacity-40"
                title="Remove all frames"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>
          )}
        >
          <div className="space-y-3">
            {frames.map((name, i) => (
              <div key={`${name}-${i}`}>
                <div className="flex items-start gap-3">
                  <div className="group relative shrink-0">
                    <button type="button" onClick={() => pickFile(i)} onDrop={handleDrop(i)} onDragOver={allowDrop} title="Replace frame (or drop an image)"
                      className="block h-20 w-20 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      {uploadingIdx === i
                        ? <span className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-violet-400" /></span>
                        : <img src={frameUrl(name)} alt={`Frame ${i + 1}`} className="h-full w-full object-cover" />}
                    </button>
                    <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-black text-white">{i + 1}</span>
                    <button type="button" onClick={() => removeFrame(i)} title="Remove frame"
                      className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/80 text-zinc-400 hover:text-white group-hover:flex">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {i < frames.length - 1 && (
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Transition {i + 1} → {i + 2}</p>
                      <PromptAssistant
                        context="wan-scene"
                        value={prompts[i] || ''}
                        onChange={(v) => setPrompt(i, v)}
                        placeholder={DEFAULT_TRANSITION}
                        minRows={2}
                        accent="violet"
                        label=""
                      />
                    </div>
                  )}
                  {i === frames.length - 1 && frames.length > 1 && (
                    <p className="self-center text-[11px] text-zinc-600">Final frame — the story ends here.</p>
                  )}
                </div>
              </div>
            ))}

            {frames.length < MAX_FRAMES && (
              <button
                type="button"
                onClick={() => pickFile(-1)}
                onDrop={handleDrop(-1)}
                onDragOver={allowDrop}
                disabled={uploadingIdx !== null}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-xs font-semibold text-zinc-500 transition hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-40"
              >
                {uploadingIdx === -1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add keyframe {frames.length + 1} — click or drop an image
              </button>
            )}
          </div>
        </WorkflowSection>

        <WorkflowSection title="Character LoRA (optional)">
          <div className="grid gap-3 lg:grid-cols-2">
            <LoraSelector label="High Noise LoRA" options={availableLoras} value={loraHigh} onChange={setLoraHigh}
              strength={loraHighStr} onStrengthChange={setLoraHighStr} />
            <LoraSelector label="Low Noise LoRA" options={availableLoras} value={loraLow} onChange={setLoraLow}
              strength={loraLowStr} onStrengthChange={setLoraLowStr} />
          </div>
        </WorkflowSection>

        <WorkflowSection title="Settings">
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Aspect Ratio</p>
              <ChipGroup options={RATIOS} value={ratio} onChange={setRatio} />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Resolution</p>
              <ChipGroup options={[...RES_PRESETS]} value={resolution} onChange={setResolution} renderLabel={(r) => `${r}px`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SliderField label="Seconds per transition" value={seconds} onChange={setSeconds} min={2} max={8} step={1} format={(v) => `${v}s`} />
              <SeedField value={seed} onChange={setSeed} />
            </div>
            <p className="text-[11px] text-zinc-600">
              {segments + 1} frames → {segments} transition{segments === 1 ? '' : 's'} rendered in one continuous pass (unbroken motion). Big frame counts are slower — lower resolution if you hit VRAM limits.
            </p>
          </div>
        </WorkflowSection>

        <WorkflowSection title="Run">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <GenerateButton
                onClick={() => void generate()}
                disabled={!canGenerate}
                isGenerating={isGenerating}
                label={`Generate Story (${segments} transition${segments === 1 ? '' : 's'})`}
                requirementHint="Add at least 2 keyframes"
              />
            </div>
            {isGenerating && (
              <button type="button" onClick={() => { cancelRef.current = true; }}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20">
                Stop
              </button>
            )}
          </div>
          {progress && <p className="mt-2 animate-pulse text-[11px] font-semibold text-violet-300">{progress}</p>}
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
