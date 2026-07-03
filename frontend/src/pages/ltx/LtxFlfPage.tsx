import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Play, RefreshCw, Upload } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { comfyService } from '../../services/comfyService';
import { FeddaButton, FeddaSectionTitle } from '../../components/ui/FeddaPrimitives';
import { WorkflowWorkbench } from '../../components/layout/WorkflowWorkbench';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { LTX_RATIOS, LTX_RESOLUTIONS, getLtxDimensions, getSafeLtxAspect, type LtxResolution } from '../../config/ltx';

function FrameSlot({ label, preview, uploading, onFile, onUrl }: {
  label: string;
  preview: string | null;
  uploading: boolean;
  onFile: (file: File) => void;
  onUrl?: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file?.type.startsWith('image/')) { onFile(file); return; }
        const url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
        if (url && onUrl) onUrl(url.trim());
      }}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      className={`relative min-h-[124px] flex-1 cursor-pointer overflow-hidden rounded-xl border border-dashed transition-all group ${
        dragOver ? 'border-violet-400/60 bg-violet-500/10' :
        preview ? 'border-zinc-500/40 bg-black/40' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/25'
      }`}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-all group-hover:opacity-100">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/70">Replace</span>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white/45" /> : <Upload className="h-5 w-5 text-white/15" />}
          <span className="text-[8px] font-black uppercase tracking-widest text-white/25">
            {uploading ? 'Uploading...' : label}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1">
        <span className="text-[7px] font-black uppercase tracking-widest text-white/40">{label}</span>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
      />
    </div>
  );
}

export const LtxFlfPage = () => {
  const [prompt, setPrompt] = usePersistentState('ltx_flf_prompt', '');
  const [aspectRatio, setAspectRatio] = usePersistentState('ltx_flf_ar', '16:9');
  const [resolution, setResolution] = usePersistentState<LtxResolution>('ltx_flf_res', 'M');
  const [direction, setDirection] = usePersistentState('ltx_flf_dir', 'Horizontal');
  const [lengthSec, setLengthSec] = usePersistentState('ltx_flf_len', 5);
  const [seed, setSeed] = usePersistentState('ltx_flf_seed', -1);
  const [guideFirst, setGuideFirst] = usePersistentState('ltx_flf_gf', 0.7);
  const [guideLast, setGuideLast] = usePersistentState('ltx_flf_gl', 0.7);
  const [loraName, setLoraName] = usePersistentState('ltx_flf_lora_name', '');
  const [loraStrength, setLoraStrength] = usePersistentState('ltx_flf_lora_strength', 1.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [firstFilename, setFirstFilename] = usePersistentState<string | null>('ltx_flf_first_file', null);
  const [lastFilename, setLastFilename] = usePersistentState<string | null>('ltx_flf_last_file', null);
  const [firstUploading, setFirstUploading] = useState(false);
  const [lastUploading, setLastUploading] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'ltx-flf',
    currentKey: 'ltx_flf_current_video',
    historyKey: 'ltx_flf_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const firstPreview = firstFilename ? `/comfy/view?filename=${encodeURIComponent(firstFilename)}&type=input` : null;
  const lastPreview = lastFilename ? `/comfy/view?filename=${encodeURIComponent(lastFilename)}&type=input` : null;
  const ratios = LTX_RATIOS;

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((lora) => {
        const normalized = lora.replace(/\\/g, '/').toLowerCase();
        return normalized.startsWith('ltx/') || normalized.includes('ltx');
      });
      setAvailableLoras(filtered);
    }).catch(() => {});
  }, []);

  const uploadFrame = async (
    file: File,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
  ) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setFile(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const uploadFrameFromUrl = async (
    url: string,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
  ) => {
    setUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
      const blob = await res.blob();
      await uploadFrame(new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' }), setFile, setUploading);
    } catch (err: any) {
      toast(err.message || 'Could not load image from URL', 'error');
      setUploading(false);
    }
  };

  const handleGenerate = () => {
    if (!firstFilename || !lastFilename || !prompt.trim() || run.isGenerating) return;
    const dims = getLtxDimensions(aspectRatio, resolution);
    const safeAspect = getSafeLtxAspect(aspectRatio);
    run.start({
      image_first: firstFilename,
      image_last: lastFilename,
      prompt: prompt.trim(),
      aspect_ratio: safeAspect,
      direction,
      width: dims.width,
      height: dims.height,
      length_seconds: lengthSec,
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
      guide_strength_first: guideFirst,
      guide_strength_last: guideLast,
      ...(loraName ? { lora_slot2: { on: true, lora: loraName, strength: loraStrength } } : {}),
    });
  };

  const canGenerate = !!firstFilename && !!lastFilename && !!prompt.trim() && !run.isGenerating;

  return (
    <WorkflowWorkbench
      title="LTX First / Last Frame"
      eyebrow="LTX Video 2.3"
      description="Generate motion between two keyframes with controlled duration and direction."
      icon={Play}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      preview={(
        <WorkflowVideoPreviewStrip
          title="LTX First / Last Output"
          currentVideo={run.currentMedia}
          history={run.history}
          isGenerating={run.isGenerating}
          onSelectVideo={run.setCurrentMedia}
          emptyHint="Upload both frames and generate to see motion here."
        />
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <section className="workflow-section">
          <div className="workflow-section-header">
            <FeddaSectionTitle className="text-white/30">Keyframes</FeddaSectionTitle>
          </div>
          <div className="flex gap-2">
            <FrameSlot
              label="First"
              preview={firstPreview}
              uploading={firstUploading}
              onFile={(file) => uploadFrame(file, setFirstFilename, setFirstUploading)}
              onUrl={(url) => uploadFrameFromUrl(url, setFirstFilename, setFirstUploading)}
            />
            <FrameSlot
              label="Last"
              preview={lastPreview}
              uploading={lastUploading}
              onFile={(file) => uploadFrame(file, setLastFilename, setLastUploading)}
              onUrl={(url) => uploadFrameFromUrl(url, setLastFilename, setLastUploading)}
            />
          </div>
          {firstFilename && lastFilename && <p className="mt-2 font-mono text-[8px] text-white/35">Both frames ready</p>}
        </section>

        <section className="workflow-section">
          <PromptAssistant
            context="ltx-flf"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the motion between the two frames..."
            minRows={4}
            accent="violet"
            label="Motion Prompt"
            enableCaption={false}
          />
        </section>
      </div>

      <section className="workflow-section">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <FeddaSectionTitle className="text-white/30">Format</FeddaSectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {ratios.map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`rounded-lg border px-2.5 py-1 text-[8px] font-black uppercase tracking-wider transition-all ${
                    aspectRatio === ratio
                      ? 'border-white/30 bg-white/[0.12] text-white'
                      : 'border-white/[0.08] bg-white/[0.03] text-white/35 hover:text-white/65'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/25">Res</span>
              <div className="flex gap-1">
                {LTX_RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={`rounded-lg border px-2.5 py-1 text-[8px] font-black uppercase tracking-wider transition-all ${
                      resolution === r
                        ? 'border-white/30 bg-white/[0.12] text-white'
                        : 'border-white/[0.08] bg-white/[0.03] text-white/35 hover:text-white/65'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] text-white/40">
                {getLtxDimensions(aspectRatio, resolution).width}×{getLtxDimensions(aspectRatio, resolution).height}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Direction</p>
                <div className="flex gap-1">
                  {['Horizontal', 'Vertical'].map((item) => (
                    <button
                      key={item}
                      onClick={() => setDirection(item)}
                      className={`flex-1 rounded-lg border py-1.5 text-[8px] font-black uppercase tracking-wider transition-all ${
                        direction === item
                          ? 'border-white/30 bg-white/[0.12] text-white'
                          : 'border-white/[0.08] bg-white/[0.03] text-white/35 hover:text-white/65'
                      }`}
                    >
                      {item === 'Horizontal' ? 'H' : 'V'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Length</p>
                  <span className="font-mono text-[8px] text-white/55">{lengthSec}s</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={15}
                  step={1}
                  value={lengthSec}
                  onChange={(event) => setLengthSec(Number(event.target.value))}
                  className="w-full accent-zinc-400"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <FeddaSectionTitle className="text-white/30">LoRA</FeddaSectionTitle>
            <LoraSelector
              label="LTX LoRA"
              value={loraName}
              onChange={setLoraName}
              strength={loraStrength}
              onStrengthChange={setLoraStrength}
              options={availableLoras}
              accent="violet"
            />
          </div>
        </div>
      </section>

      <section className="workflow-section">
        <div className="flex gap-2">
          <input
            type="number"
            value={seed}
            onChange={(event) => setSeed(parseInt(event.target.value) || -1)}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 font-mono text-[11px] text-white/65 outline-none focus:border-white/22"
          />
          <FeddaButton onClick={() => setSeed(-1)} variant={seed === -1 ? 'violet' : 'ghost'} className="rounded-xl p-2.5 transition-all">
            <RefreshCw className="h-3.5 w-3.5" />
          </FeddaButton>
        </div>

        <FeddaButton
          onClick={() => setShowAdvanced((value) => !value)}
          variant="ghost"
          className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2 text-white/35 transition-colors hover:text-white/65"
        >
          <span className="text-[8px] font-black uppercase tracking-widest">Guide Strengths</span>
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </FeddaButton>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-2 gap-3 px-1">
            {[
              { label: 'First Frame', value: guideFirst, set: setGuideFirst },
              { label: 'Last Frame', value: guideLast, set: setGuideLast },
            ].map(({ label, value, set }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/25">{label}</p>
                  <span className="font-mono text-[8px] text-white/55">{value.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={value}
                  onChange={(event) => set(Number(event.target.value))}
                  className="w-full accent-zinc-400"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <FeddaButton
            disabled={!canGenerate}
            onClick={handleGenerate}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-zinc-200 py-4 text-[11px] font-black uppercase tracking-[0.35em] text-black transition-all duration-300 hover:bg-white disabled:bg-white/[0.03] disabled:text-white/15"
          >
            {run.isGenerating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /><span>Generating...</span></>
            ) : (
              <><Play className="h-4 w-4" /><span>Generate</span></>
            )}
          </FeddaButton>
          {(!firstFilename || !lastFilename) && (
            <p className="mt-2 text-center text-[8px] uppercase tracking-widest text-white/20">
              Upload both frames to start
            </p>
          )}
        </div>
      </section>
    </WorkflowWorkbench>
  );
};
