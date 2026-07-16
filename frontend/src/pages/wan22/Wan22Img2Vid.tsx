import { useState, useEffect, useRef } from 'react';
import {
  Video, RefreshCw, Film, Loader2, Wand2, FlameKindling,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { UploadSlot } from '../../components/ui/WorkflowControls';
import { FeddaButton, FeddaPanel, FeddaSectionTitle, NeutralButton } from '../../components/ui/FeddaPrimitives';
import { VideoOutputPanel } from '../../components/layout/VideoOutputPanel';
import { WorkflowShell } from '../../components/layout/WorkflowShell';
import { LiveSamplingPreview } from '../../components/workflows/LiveSamplingPreview';

const SCENE_COUNT = 3;
void SCENE_COUNT;

// ── Scene slot ────────────────────────────────────────────────────────────────
function SceneSlot({ index, url, isActive, isPending }: {
  index: number; url?: string; isActive: boolean; isPending: boolean;
}) {
  return (
    <div className={`rounded-xl overflow-hidden border transition-all duration-500 ${
      url ? 'border-violet-500/30 bg-black/60' :
      isActive ? 'border-violet-500/20 bg-white/[0.03]' : 'border-white/5 bg-white/[0.02]'
    }`}>
      {url ? (
        <video src={url} className="w-full aspect-video object-cover" autoPlay loop muted playsInline />
      ) : (
        <div className="w-full aspect-video flex items-center justify-center">
          {isPending ? <Loader2 className="w-5 h-5 text-violet-400/60 animate-spin" /> : <Film className="w-5 h-5 text-white/10" />}
        </div>
      )}
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Scene {index + 1}</span>
        {url && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-pulse" />
            <span className="text-[7px] font-mono text-violet-400/40">live</span>
          </div>
        )}
      </div>
    </div>
  );
}
void SceneSlot;

// ── Page ──────────────────────────────────────────────────────────────────────
export const Wan22Img2Vid = () => {
  const [prompt1, setPrompt1] = usePersistentState('wan22i2v_p1', '');
  const [lengthSec, setLengthSec] = usePersistentState('wan22i2v_len', 5);
  const [seed, setSeed]             = usePersistentState('wan22i2v_seed', -1);
  const [nsfw, setNsfw]             = usePersistentState('wan22i2v_nsfw', true);
  const [precision, setPrecision]  = usePersistentState<'gguf' | 'fp8'>('wan22i2v_precision', 'gguf');
  const workflowId = precision === 'gguf' ? 'wan22-img2vid-gguf' : 'wan22-img2vid';
  const [loraHigh, setLoraHigh]     = usePersistentState('wan22i2v_lora_high', '');
  const [loraLow, setLoraLow]       = usePersistentState('wan22i2v_lora_low', '');
  const [loraStrengthHigh, setLoraStrengthHigh] = usePersistentState('wan22i2v_lora_high_strength', 1.0);
  const [loraStrengthLow, setLoraStrengthLow]   = usePersistentState('wan22i2v_lora_low_strength', 1.0);


  const [uploadedImageName, setUploadedImageName] = usePersistentState<string | null>('wan22i2v_image_file', null);
  const [uploading,         setUploading]         = useState(false);
  const [captioning,        setCaptioning]        = useState(false);

  const [isGenerating,    setIsGenerating]    = useState(false);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);
  const [sessionVideos,   setSessionVideos]   = useState<string[]>([]);
  const [history, setHistory] = usePersistentState<string[]>('wan22i2v_history', []);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const uploadedImage = uploadedImageName ? `/comfy/view?filename=${encodeURIComponent(uploadedImageName)}&type=input` : null;

  const sessionRef    = useRef<string[]>([]);
  const prevCountRef  = useRef(0);

  const { toast } = useToast();
  const { state: execState, lastOutputVideos, outputReadyCount, registerNodeMap, previewUrl } = useComfyExecution();

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((l) => {
        const n = l.replace(/\\/g, '/').toLowerCase();
        return n.startsWith('wan22/') || n.includes('wan2.2') || n.includes('wan22');
      });
      setAvailableLoras(filtered);
      if (!loraHigh) {
        const guessHigh = filtered.find((f) => /high/i.test(f));
        if (guessHigh) setLoraHigh(guessHigh);
      }
      if (!loraLow) {
        const guessLow = filtered.find((f) => /low/i.test(f));
        if (guessLow) setLoraLow(guessLow);
      }
    }).catch(() => {});
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setUploadedImageName(data.filename);
    } catch (err: any) { toast(err.message || 'Upload failed', 'error'); }
    finally { setUploading(false); }
  };

  // ── Upload from URL ───────────────────────────────────────────────────────
  const uploadFromUrl = async (url: string) => {
    setUploading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], 'handoff-image.png', { type: blob.type || 'image/png' });
      const form = new FormData();
      form.append('file', file);
      const upload = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await upload.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setUploadedImageName(data.filename);
    } catch (err: any) { toast(err.message || 'Upload failed', 'error'); }
    finally { setUploading(false); }
  };

  // Consume a "Send to Workflow" handoff image on first mount
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) uploadFromUrl(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Caption the uploaded image into a WAN motion prompt (Scene 1) ──────────
  const buildPromptFromImage = async () => {
    if (!uploadedImage || captioning) return;
    setCaptioning(true);
    try {
      const imgRes = await fetch(uploadedImage);
      if (!imgRes.ok) throw new Error('Could not read the reference image');
      const blob = await imgRes.blob();
      const form = new FormData();
      form.append('file', new File([blob], uploadedImageName || 'reference.png', { type: blob.type || 'image/png' }));
      form.append('context', 'wan-i2v');
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Caption failed');
      setPrompt1(data.caption ?? '');
      toast(data.model ? `Prompt built with ${data.model}` : 'Prompt built from image', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not build prompt from image', 'error');
    } finally {
      setCaptioning(false);
    }
  };

  // ── Stream videos ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isGenerating && !pendingPromptId) return;
    if (!lastOutputVideos?.length) return;
    const newVids = lastOutputVideos.slice(prevCountRef.current);
    if (!newVids.length) return;
    prevCountRef.current = lastOutputVideos.length;
    const urls = newVids.map(v =>
      `/comfy/view?filename=${encodeURIComponent(v.filename)}&subfolder=${encodeURIComponent(v.subfolder)}&type=${v.type}`
    );
    sessionRef.current = [...sessionRef.current, ...urls];
    setSessionVideos([...sessionRef.current]);
    setHistory(prev => [...urls, ...prev.filter(u => !urls.includes(u))].slice(0, 40));
  }, [outputReadyCount, lastOutputVideos, isGenerating, pendingPromptId, setHistory]);

  // ── Completion ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingPromptId) return;
    if (execState === 'done') {
      setIsGenerating(false);
      setPendingPromptId(null);
      toast(`Done — ${sessionRef.current.length} video${sessionRef.current.length !== 1 ? 's' : ''} generated`, 'success');
    }
    if (execState === 'error') { setIsGenerating(false); setPendingPromptId(null); }
  }, [execState, pendingPromptId, toast]);

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!uploadedImageName || !prompt1.trim() || isGenerating) return;
    sessionRef.current   = [];
    prevCountRef.current = lastOutputVideos?.length ?? 0;
    setSessionVideos([]);
    setIsGenerating(true);

    fetch(`${BACKEND_API.BASE_URL}/api/workflow/node-map/${workflowId}`)
      .then(r => r.json()).then(d => { if (d.success) registerNodeMap(d.node_map); }).catch(() => {});

    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          params: {
            image:          uploadedImageName,
            length_seconds: lengthSec,
            prompt:         prompt1.trim(),
            seed:           seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
            nsfw,
            ...(loraHigh ? { lora_high: { on: true, lora: loraHigh, strength: loraStrengthHigh } } : {}),
            ...(loraLow ? { lora_low: { on: true, lora: loraLow, strength: loraStrengthLow } } : {}),
            client_id:   comfyService.clientId,
          },
        }),
      });
      const data = await res.json();
      if (data.success) setPendingPromptId(data.prompt_id);
      else throw new Error(data.detail || 'Failed');
    } catch (err: any) {
      toast(err.message || 'Failed', 'error');
      setIsGenerating(false);
    }
  };

  const currentVideo = sessionVideos.length > 0 ? sessionVideos[sessionVideos.length - 1] : (history[0] ?? null);
  const canGenerate = !!uploadedImageName && !!prompt1.trim() && !isGenerating;

  return (
    <WorkflowShell
      title="Image to Video"
      eyebrow="WAN 2.2"
      description="Animate a still image with three optional scene expansions."
      icon={Video}
      isGenerating={isGenerating}
      canGenerate={canGenerate}
      workflowId={workflowId}
      output={(
        <LiveSamplingPreview
          previewUrl={previewUrl}
          isRunning={isGenerating}
          hasOutput={!!currentVideo || history.length > 0}
          emptyState={
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
              <div className="text-center text-zinc-500">
                {isGenerating ? (
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-60" />
                ) : (
                  <Video className="mx-auto mb-3 h-8 w-8 opacity-60" />
                )}
                <div className="text-sm font-semibold text-zinc-400">
                  {isGenerating ? 'Waiting for video output' : 'No video output yet'}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {isGenerating ? 'Preview frames will appear here while sampling progresses.' : 'Upload an image and generate to see motion results here.'}
                </div>
              </div>
            </div>
          }
        >
          <VideoOutputPanel
            title="WAN Img2Vid Output"
            currentVideo={currentVideo}
            history={history}
            isGenerating={isGenerating}
          />
        </LiveSamplingPreview>
      )}
    >

      {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
      <div className="space-y-5">

          {/* ── IMAGE UPLOAD ── */}
          <div className="space-y-2">
            <UploadSlot
              preview={uploadedImage}
              uploading={uploading}
              onFile={handleUpload}
              onUrl={uploadFromUrl}
              label="Reference Image"
              hint="Click or drop jpg/png"
              height={260}
              onClear={() => setUploadedImageName(null)}
            />
            {uploadedImage && (
              <NeutralButton onClick={buildPromptFromImage} disabled={captioning} className="w-full justify-center">
                {captioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {captioning ? 'Reading image…' : 'Build Prompt From Image'}
              </NeutralButton>
            )}
          </div>

          {/* ── LENGTH (seconds) ── */}
          <FeddaPanel className="p-3 space-y-2">
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-600">
              <span>Length</span>
              <span className="font-mono text-violet-400/60">{lengthSec}s · 30fps</span>
            </div>
            <input type="range" min={2} max={15} step={1} value={lengthSec}
              onChange={e => setLengthSec(Number(e.target.value))}
              className="w-full accent-violet-500" />
            <div className="flex justify-between text-[8px] font-mono text-slate-600">
              <span>2s</span>
              <span className="text-white/15">8s</span>
              <span>15s</span>
            </div>
          </FeddaPanel>

          <div className="h-px bg-white/5" />

          {/* ── MOTION PROMPT ── */}
          <div className="space-y-2">
            <FeddaSectionTitle className="text-slate-500">Motion Prompt</FeddaSectionTitle>
            <PromptAssistant
              context="wan-scene"
              accent="violet"
              value={prompt1}
              onChange={setPrompt1}
              placeholder="Describe the motion / action..."
              minRows={4}
              enableCaption={false}
            />
          </div>

          <div className="h-px bg-white/5" />

          <div className="space-y-3">
            <FeddaSectionTitle className="text-slate-500">LoRA Loaders</FeddaSectionTitle>
            <LoraSelector
              label="High Noise LoRA"
              value={loraHigh}
              onChange={setLoraHigh}
              strength={loraStrengthHigh}
              onStrengthChange={setLoraStrengthHigh}
              options={availableLoras}
              accent="violet"
            />
            <LoraSelector
              label="Low Noise LoRA"
              value={loraLow}
              onChange={setLoraLow}
              strength={loraStrengthLow}
              onStrengthChange={setLoraStrengthLow}
              options={availableLoras}
              accent="violet"
            />
          </div>

          <div className="h-px bg-white/5" />

          {/* ── PRECISION ── */}
          <div>
            <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-600">Model precision</div>
            <div className="flex gap-2">
              <button
                onClick={() => setPrecision('gguf')}
                className={`flex-1 rounded-xl border px-3 py-2 text-[10px] font-bold transition-all ${
                  precision === 'gguf' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                GGUF Q4
                <span className="block text-[8px] font-normal uppercase tracking-wider opacity-60">fits 24GB · 3090</span>
              </button>
              <button
                onClick={() => setPrecision('fp8')}
                className={`flex-1 rounded-xl border px-3 py-2 text-[10px] font-bold transition-all ${
                  precision === 'fp8' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                fp8
                <span className="block text-[8px] font-normal uppercase tracking-wider opacity-60">faster · big GPU / RunPod</span>
              </button>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* ── NSFW + SEED ── */}
          <div className="space-y-2">
            {/* NSFW toggle */}
            <button
              onClick={() => setNsfw(!nsfw)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                nsfw
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-white/[0.02] border-white/5 text-slate-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <FlameKindling className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">NSFW</span>
              </div>
              <div className={`w-8 h-4 rounded-full transition-all relative ${nsfw ? 'bg-rose-500' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${nsfw ? 'left-4' : 'left-0.5'}`} />
              </div>
            </button>

            {/* Seed */}
            <div className="flex gap-1.5">
              <input type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value))}
                className="flex-1 rounded-xl fedda-input py-3 px-3 text-xs font-mono focus:border-violet-500/40 text-white/60" />
              <FeddaButton onClick={() => setSeed(-1)} variant={seed === -1 ? 'violet' : 'ghost'} className="p-3 rounded-xl transition-all">
                <RefreshCw className="w-3.5 h-3.5" />
              </FeddaButton>
            </div>
          </div>

          {/* ── GENERATE ── */}
          <div className="pb-6">
            <FeddaButton disabled={!canGenerate}
              onClick={handleGenerate}
              variant="violet"
              className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              <span>{isGenerating ? 'Generating...' : 'Generate'}</span>
            </FeddaButton>
          </div>

      </div>
    </WorkflowShell>
  );
};

