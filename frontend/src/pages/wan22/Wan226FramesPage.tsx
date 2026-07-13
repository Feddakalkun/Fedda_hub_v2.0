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

const MAX_FRAMES = 24;

type StoryRatio = '1:1' | '3:4' | '9:16' | '4:3' | '16:9';
const RATIOS: StoryRatio[] = ['1:1', '3:4', '9:16', '4:3', '16:9'];
const RATIO_ASPECT: Record<StoryRatio, string> = { '1:1': '1:1', '3:4': '4:3', '9:16': '16:9', '4:3': '4:3', '16:9': '16:9' };
const RATIO_DIRECTION: Record<StoryRatio, string> = { '1:1': 'Horizontal', '3:4': 'Vertical', '9:16': 'Vertical', '4:3': 'Horizontal', '16:9': 'Horizontal' };
const RES_PRESETS = ['480', '576', '640', '720', '832'] as const;

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
  const [segSeconds, setSegSeconds] = usePersistentState('wanstory_seg_seconds', 5);
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

  // ── Auto-Storyboard: caption every frame, then LLM writes the transitions ──
  const generateStoryboard = async () => {
    if (isStoryboarding || frames.length < 2) return;
    setIsStoryboarding(true);
    try {
      toast('Analyzing frames...', 'info');
      const captions = await Promise.all(frames.map(async (name, i) => {
        try {
          const blob = await (await fetch(frameUrl(name))).blob();
          const fd = new FormData();
          fd.append('file', new File([blob], name, { type: blob.type }));
          fd.append('context', 'wan-scene');
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 60000);
          const r = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`, { method: 'POST', body: fd, signal: controller.signal });
          clearTimeout(tid);
          if (r.ok) return `[FRAME ${i + 1}]: ${(await r.json()).caption}`;
        } catch { /* skip frame */ }
        return `[FRAME ${i + 1}]: (no caption)`;
      }));

      toast('Directing story...', 'info');
      const n = frames.length;
      const systemContext = `You are a cinematic director writing motion prompts for a keyframe-to-video model.
These ${n} keyframes play in order. Write exactly ${n - 1} transitions: transition i describes the continuous motion from FRAME i to FRAME i+1 (camera movement, subject motion, atmosphere). One single subject throughout — never introduce additional people.

EXACT OUTPUT FORMAT:
SCENE 1: [motion from frame 1 to frame 2]
SCENE 2: [motion from frame 2 to frame 3]
...exactly ${n - 1} scenes, nothing else.

RULES: no markdown, fluid contiguous action, each scene under 40 words.

Frames:
${captions.join('\n')}`;

      const promptRes = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_PROMPT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'wan-story', mode: 'inspire', current_prompt: systemContext }),
      });
      if (!promptRes.ok) throw new Error('Failed to generate story');

      const reader = promptRes.body!.getReader();
      const dec = new TextDecoder();
      let streamText = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try { const p = JSON.parse(data); if (p.token) streamText += p.token; } catch { /* partial */ }
          }
        }
      }
      const parts = streamText.trim().split(/SCENE \d+:/i).map((p) => p.trim()).filter(Boolean);
      setPrompts(parts.slice(0, n - 1));
      toast('Storyboard generated!', 'success');
    } catch (err: any) {
      toast(err.message || 'Storyboarding failed', 'error');
    } finally {
      setIsStoryboarding(false);
    }
  };

  // ── generation ──────────────────────────────────────────────────────────
  const runWorkflow = async (workflowId: string, params: Record<string, unknown>): Promise<SegmentVideo> => {
    const r = await fetch(`${BACKEND_API.BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_id: workflowId, params }),
    });
    const d = await r.json();
    if (!d.prompt_id) throw new Error(d.detail || d.error || 'Submit failed');
    for (;;) {
      if (cancelRef.current) throw new Error('Cancelled');
      await sleep(5000);
      const s = await (await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE_STATUS}/${d.prompt_id}`)).json();
      if (s.status === 'completed') {
        const vid = s.videos?.[0];
        if (!vid) throw new Error('Segment finished but produced no video');
        return vid;
      }
      if (s.status === 'error') throw new Error(s.error || 'Segment failed in ComfyUI');
    }
  };

  const baseParams = () => ({
    negative: '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作,画面，静止，整体发灰，最差质量，低质量',
    seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
    aspect_ratio: RATIO_ASPECT[ratio],
    direction: RATIO_DIRECTION[ratio],
    width: parseInt(resolution, 10),
    length: segSeconds,
    ...(loraHigh ? { lora_high: { on: true, lora: loraHigh, strength: loraHighStr } } : {}),
    ...(loraLow ? { lora_low: { on: true, lora: loraLow, strength: loraLowStr } } : {}),
  });

  const generate = async () => {
    if (isGenerating || frames.length === 0) return;
    cancelRef.current = false;
    setIsGenerating(true);
    setCurrentVideo(null);
    try {
      if (frames.length === 1) {
        // single frame -> plain single-shot img2vid
        setProgress('Animating single frame…');
        const vid = await runWorkflow('wan22xxx-img2vid', {
          ...baseParams(),
          image: frames[0],
          prompt: (prompts[0] || DEFAULT_TRANSITION).trim(),
        });
        const url = videoUrl(vid);
        setCurrentVideo(url);
        setHistory((prev) => [url, ...prev.filter((u) => u !== url)].slice(0, 40));
        toast('Video ready', 'success');
        return;
      }

      // N frames -> N-1 sequential segments, then stitch
      const segVideos: SegmentVideo[] = [];
      for (let i = 0; i < segments; i++) {
        setProgress(`Segment ${i + 1} / ${segments}…`);
        const vid = await runWorkflow('wan22-flf-segment', {
          ...baseParams(),
          image_start: frames[i],
          image_end: frames[i + 1],
          prompt: (prompts[i] || DEFAULT_TRANSITION).trim(),
        });
        segVideos.push(vid);
        const segUrl = videoUrl(vid);
        setCurrentVideo(segUrl); // live feedback while the story builds
        setHistory((prev) => [segUrl, ...prev.filter((u) => u !== segUrl)].slice(0, 40));
      }

      setProgress('Stitching story…');
      const c = await (await fetch(`${BACKEND_API.BASE_URL}/api/video/concat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: segVideos.map((v) => ({ filename: v.filename, subfolder: v.subfolder || '' })), prefix: 'wanstory' }),
      })).json();
      if (!c.success) throw new Error(c.detail || 'Stitch failed');
      const finalUrl = videoUrl(c);
      setCurrentVideo(finalUrl);
      setHistory((prev) => [finalUrl, ...prev.filter((u) => u !== finalUrl)].slice(0, 40));
      toast(`Story ready — ${segments} segments stitched`, 'success');
    } catch (err: any) {
      if (err.message !== 'Cancelled') toast(err.message || 'Generation failed', 'error');
      else toast('Stopped', 'info');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const canGenerate = frames.length > 0 && !isGenerating;

  return (
    <WorkflowShell
      title="Storyboard"
      eyebrow="WAN 2.2"
      description={`Chain 1-${MAX_FRAMES} keyframes into one continuous video — each transition gets its own motion prompt, segments render one by one and stitch automatically.`}
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
                    <button type="button" onClick={() => pickFile(i)} title="Replace frame"
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
                disabled={uploadingIdx !== null}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-xs font-semibold text-zinc-500 transition hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-40"
              >
                {uploadingIdx === -1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add keyframe {frames.length + 1}
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
              <ChipGroup options={[...RES_PRESETS]} value={resolution} onChange={setResolution} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SliderField label="Seconds per transition" value={segSeconds} onChange={setSegSeconds} min={2} max={10} step={1} format={(v) => `${v}s`} />
              <SeedField value={seed} onChange={setSeed} />
            </div>
            {segments > 0 && (
              <p className="text-[11px] text-zinc-600">
                {segments} transition{segments === 1 ? '' : 's'} × {segSeconds}s ≈ {segments * segSeconds}s final video. Segments render one at a time.
              </p>
            )}
          </div>
        </WorkflowSection>

        <WorkflowSection title="Run">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <GenerateButton
                onClick={() => void generate()}
                disabled={!canGenerate}
                isGenerating={isGenerating}
                label={frames.length <= 1 ? 'Generate Video' : `Generate Story (${segments} segments)`}
                requirementHint="Add at least one keyframe"
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
