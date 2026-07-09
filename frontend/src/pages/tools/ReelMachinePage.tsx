/**
 * ReelMachinePage — automated viral reels: Photo → Sound → Make Reel.
 * Formats:
 *  - Beat Switch: outfit hard-cuts on every beat (N quick Qwen edits + /api/media/beat-cut). Fast.
 *  - Transformation: character frame → LTX FLF morph → beat mux (real motion, slower).
 */

import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, Film, Link2, Loader2, Music, X } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useToast } from '../../components/ui/Toast';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { UploadSlot, SliderField } from '../../components/ui/WorkflowControls';
import { cn, inputBase } from '../../lib/styles';
import { getLtxDimensions, getSafeLtxAspect } from '../../config/ltx';
import { CHARACTER_PRESETS, TRANSITION_STYLES } from './reelPresets';
import { PipelineCancelled, pollGeneration, stageAsInput, submitGenerate, viewUrl } from './reelPipeline';

const NEGATIVE = 'blurry, low quality, deformed, different pose, different person, same clothes, unchanged outfit, '
  + 'costume party look, cosplay prop, plastic, CGI, 3d render, doll, airbrushed, cartoon, illustration';

const outfitEditPrompt = (outfit: string) =>
  `Change her outfit: she is now wearing ${outfit}. `
  + 'Completely replace her clothing. The result must look like a REAL PHOTOGRAPH of her - real fabric with natural '
  + 'folds, weight and sheen, natural skin texture, the outfit fitting her body believably, and the same lighting, '
  + 'color grade and grain as the original photo. '
  + 'Keep the exact same pose, same face, same body position, same camera framing and same background.';

const shuffled = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const ReelMachinePage = () => {
  const { toast } = useToast();

  // Step 1 — photo
  const [photoFile, setPhotoFile] = usePersistentState<string | null>('reelm_photo', null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoPreview = photoFile ? `/comfy/view?filename=${encodeURIComponent(photoFile)}&type=input` : null;

  // Step 2 — sound
  const [soundUrl, setSoundUrl] = useState('');
  const [soundFile, setSoundFile] = usePersistentState<string | null>('reelm_sound', null);
  const [soundLoading, setSoundLoading] = useState(false);
  const [soundStart, setSoundStart] = usePersistentState('reelm_sound_start', 0);
  const [soundInfo, setSoundInfo] = useState<{ bpm: number; cuts: number } | null>(null);

  // Step 3 — style
  const [format, setFormat] = usePersistentState<'switch' | 'morph'>('reelm_format', 'switch');
  const [styleMode, setStyleMode] = usePersistentState<'random' | 'pick'>('reelm_style_mode', 'random');
  const [randCount, setRandCount] = usePersistentState('reelm_rand_count', 6);
  const [pickedOutfits, setPickedOutfits] = usePersistentState<string[]>('reelm_picked', []);
  const [reelLen, setReelLen] = usePersistentState('reelm_len', 8);

  // Output
  const [reels, setReels] = usePersistentState<string[]>('reelm_reels', []);
  const [currentReel, setCurrentReel] = usePersistentState<string | null>('reelm_current', null);
  const [making, setMaking] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const dimsRef = useRef<{ w: number; h: number }>({ w: 832, h: 1216 });

  // Accept a Send-to-Workflow image
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) {
      fetch(url).then((r) => r.blob()).then((blob) =>
        uploadPhoto(new File([blob], 'handoff.png', { type: blob.type || 'image/png' })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Measure photo dims (long side 1024, /8) for the outfit edits
  useEffect(() => {
    if (!photoPreview) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      dimsRef.current = {
        w: Math.max(64, Math.round((img.naturalWidth * scale) / 8) * 8),
        h: Math.max(64, Math.round((img.naturalHeight * scale) / 8) * 8),
      };
    };
    img.src = photoPreview;
  }, [photoPreview]);

  const uploadPhoto = async (file: File) => {
    setPhotoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setPhotoFile(data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setPhotoUploading(false);
    }
  };

  const probeSound = async (filename: string, start: number) => {
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/beat-cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [], audio_filename: filename, audio_offset_sec: start, max_seconds: reelLen }),
      });
      const data = await res.json();
      if (data?.success) setSoundInfo({ bpm: data.bpm, cuts: data.cuts });
    } catch { /* probe is best-effort */ }
  };

  const loadSoundFromUrl = async () => {
    const u = soundUrl.trim();
    if (!u || soundLoading) return;
    setSoundLoading(true);
    setSoundInfo(null);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/download-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not fetch the sound');
      setSoundFile(data.filename);
      toast('Sound loaded', 'success');
      void probeSound(data.filename, soundStart);
    } catch (err: any) {
      toast(err.message || 'Could not fetch the sound', 'error');
    } finally {
      setSoundLoading(false);
    }
  };

  const uploadSound = async (file: File) => {
    setSoundLoading(true);
    setSoundInfo(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setSoundFile(data.filename);
      void probeSound(data.filename, soundStart);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setSoundLoading(false);
    }
  };

  // Re-probe when the start point changes (debounced)
  useEffect(() => {
    if (!soundFile) return;
    const t = window.setTimeout(() => { void probeSound(soundFile, soundStart); }, 800);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundStart, soundFile, reelLen]);

  const pickJobs = (): Array<{ label: string; prompt: string }> => {
    if (styleMode === 'pick') {
      return CHARACTER_PRESETS.filter((p) => pickedOutfits.includes(p.label));
    }
    const base = shuffled(CHARACTER_PRESETS);
    const jobs: Array<{ label: string; prompt: string }> = [];
    while (jobs.length < randCount) jobs.push(...base.slice(0, randCount - jobs.length));
    return jobs.slice(0, randCount);
  };

  const addReel = (url: string) => {
    setCurrentReel(url);
    setReels((prev) => [url, ...prev.filter((u) => u !== url)].slice(0, 24));
  };

  const makeReel = async () => {
    if (!photoFile || !soundFile || making) return;
    const jobs = format === 'switch' ? pickJobs() : pickJobs().slice(0, 1);
    if (!jobs.length) { toast('Pick at least one outfit', 'error'); return; }
    cancelRef.current = false;
    const { w, h } = dimsRef.current;
    let failed = 0;

    try {
      // 1) outfit frames (sequential — one GPU job at a time)
      const staged: string[] = [];
      for (let i = 0; i < jobs.length; i++) {
        if (cancelRef.current) throw new PipelineCancelled();
        setMaking(`Outfit ${i + 1}/${jobs.length} — ${jobs[i].label}…`);
        try {
          const promptId = await submitGenerate('qwen-rapid-edit-v23', {
            image: photoFile,
            width: w,
            height: h,
            denoise: 0.85,
            cfg: 1.0,
            steps: 8,
            prompt: outfitEditPrompt(jobs[i].prompt),
            negative: NEGATIVE,
            seed: Math.floor(Math.random() * 10_000_000_000),
          });
          const images = await pollGeneration({ promptId, workflowId: 'qwen-rapid-edit-v23', resultKey: 'images', cancelRef });
          staged.push(await stageAsInput(viewUrl(images[images.length - 1]), `reelm-outfit-${i}.png`));
        } catch (err) {
          if (err instanceof PipelineCancelled) throw err;
          failed++;
          toast(`Outfit ${jobs[i].label} failed — skipping`, 'error');
        }
      }
      if (!staged.length) throw new Error('All outfit edits failed');
      if (cancelRef.current) throw new PipelineCancelled();

      if (format === 'switch') {
        // 2a) hard cuts on the beats — original photo leads, outfits follow
        setMaking('Cutting on the beat…');
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/beat-cut`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: [photoFile, ...staged],
            audio_filename: soundFile,
            audio_offset_sec: soundStart,
            max_seconds: reelLen,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.detail || 'Beat cut failed');
        addReel(viewUrl(data));
        toast(`Reel done — ${data.cuts} cuts @ ${data.bpm} BPM`, 'success');
      } else {
        // 2b) transformation morph, then mux the sound
        setMaking('Morphing (LTX)… this takes a while');
        const dims = getLtxDimensions('9:16', 'M');
        const morphLen = Math.min(reelLen, 6);
        const promptId = await submitGenerate('ltx-flf', {
          image_first: photoFile,
          image_last: staged[0],
          prompt: TRANSITION_STYLES[Math.floor(Math.random() * TRANSITION_STYLES.length)].prompt,
          aspect_ratio: getSafeLtxAspect('9:16'),
          direction: 'Vertical',
          width: dims.width,
          height: dims.height,
          length_seconds: morphLen,
          seed: Math.floor(Math.random() * 10_000_000_000),
          guide_strength_first: 0.85,
          guide_strength_last: 0.85,
        });
        const videos = await pollGeneration({
          promptId, workflowId: 'ltx-flf', resultKey: 'videos',
          maxTicks: Math.max(120, morphLen * 24), cancelRef,
        });
        const video = videos[videos.length - 1];
        setMaking('Adding the beat…');
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/mux-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_filename: video.filename,
            video_subfolder: video.subfolder,
            audio_filename: soundFile,
            audio_offset_sec: soundStart,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.detail || 'Mux failed');
        addReel(viewUrl(data));
        toast('Transformation reel done', 'success');
      }
    } catch (err: any) {
      if (err instanceof PipelineCancelled || cancelRef.current) {
        toast('Cancelled', 'info');
      } else {
        toast(err.message || 'Reel failed', 'error');
      }
    } finally {
      setMaking(null);
    }
    void failed;
  };

  // Warn on tab close while working
  useEffect(() => {
    if (!making) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [making]);

  const toggleOutfit = (label: string) =>
    setPickedOutfits((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);

  const canMake = !!photoFile && !!soundFile && !making
    && (styleMode === 'random' || pickedOutfits.length > 0);

  return (
    <WorkflowShell
      title="Reel Machine"
      eyebrow="Viral Automation"
      description="Photo + sound in, finished beat-synced reel out. Outfit switches cut on every beat, or a full transformation morph."
      icon={Clapperboard}
      isGenerating={!!making}
      canGenerate={canMake}
      hideOutputPane
      output={null}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        {/* ── PHONE STAGE ── */}
        <div className="lg:sticky lg:top-4 lg:self-start space-y-3">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[380px] overflow-hidden rounded-[2rem] border-4 border-white/10 bg-black shadow-2xl">
            {currentReel ? (
              <video key={currentReel} src={currentReel} controls autoPlay loop playsInline className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <Clapperboard className="h-8 w-8 text-white/10" />
                <p className="px-6 text-sm text-white/25">Your reel plays here</p>
              </div>
            )}
            {making && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
                <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                <p className="px-6 text-center text-sm font-semibold text-white/80">{making}</p>
                <button
                  type="button"
                  onClick={() => { cancelRef.current = true; }}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-300 transition hover:bg-red-500/20"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Feed */}
          {reels.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {reels.map((url) => (
                <div key={url} className={cn('relative w-16 shrink-0 overflow-hidden rounded-lg border', url === currentReel ? 'border-violet-500/60' : 'border-white/10')}>
                  <video src={url} muted playsInline className="aspect-[9/16] w-full cursor-pointer object-cover" onClick={() => setCurrentReel(url)} />
                  <a href={url} download className="absolute bottom-1 right-1 rounded bg-black/70 p-0.5 text-white/70 hover:text-white">
                    <Download className="h-2.5 w-2.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setReels((prev) => prev.filter((u) => u !== url))}
                    className="absolute right-1 top-1 rounded bg-black/70 p-0.5 text-white/50 hover:text-red-400"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── STEPS ── */}
        <div className="space-y-4">
          <WorkflowSection title="1 · Photo">
            <UploadSlot
              preview={photoPreview}
              uploading={photoUploading}
              onFile={uploadPhoto}
              label="Her photo"
              hint="Click or drop — the pose every outfit keeps"
              height={180}
              onClear={() => setPhotoFile(null)}
            />
          </WorkflowSection>

          <WorkflowSection title="2 · Sound">
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
                  <input
                    type="url"
                    value={soundUrl}
                    onChange={(e) => setSoundUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !soundLoading && loadSoundFromUrl()}
                    placeholder="TikTok / Reels / YouTube link with the sound…"
                    className={cn(inputBase, 'w-full pl-9 text-sm')}
                  />
                </div>
                <button
                  type="button"
                  onClick={loadSoundFromUrl}
                  disabled={!soundUrl.trim() || soundLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 text-xs font-bold uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {soundLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
                  Get
                </button>
              </div>
              <UploadSlot
                preview={soundFile ? `/comfy/view?filename=${encodeURIComponent(soundFile)}&type=input` : null}
                uploading={soundLoading}
                onFile={uploadSound}
                accept="audio/*,video/*"
                label="…or drop an audio file"
                hint="mp3 / wav / mp4"
                height={soundFile ? 110 : 80}
                previewKind="audio"
                filename={soundFile ?? undefined}
                onClear={() => { setSoundFile(null); setSoundInfo(null); }}
              />
              {soundFile && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">
                    {soundInfo ? `✓ ${soundInfo.bpm} BPM · ${soundInfo.cuts} cuts` : 'analyzing beat…'}
                  </span>
                  <div className="flex-1">
                    <SliderField
                      label="Start at (second in the song)"
                      value={soundStart}
                      onChange={setSoundStart}
                      min={0}
                      max={90}
                      step={1}
                      format={(v) => `${v}s`}
                    />
                  </div>
                </div>
              )}
            </div>
          </WorkflowSection>

          <WorkflowSection title="3 · Style">
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('switch')}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all',
                    format === 'switch' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10')}
                >
                  ⚡ Beat Switch
                  <span className="block text-[9px] font-normal uppercase tracking-wider opacity-60">outfit cuts on every beat · ~3 min</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('morph')}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all',
                    format === 'morph' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10')}
                >
                  ✨ Transformation
                  <span className="block text-[9px] font-normal uppercase tracking-wider opacity-60">real motion morph · slower</span>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStyleMode('random')}
                  className={cn('rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                    styleMode === 'random' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10')}
                >
                  🎲 Surprise me
                </button>
                <button
                  type="button"
                  onClick={() => setStyleMode('pick')}
                  className={cn('rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                    styleMode === 'pick' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10')}
                >
                  Pick outfits
                </button>
              </div>

              {styleMode === 'random' ? (
                format === 'switch' && (
                  <SliderField
                    label="Outfits in the reel"
                    value={randCount}
                    onChange={setRandCount}
                    min={3}
                    max={8}
                    step={1}
                    format={(v) => `${v} outfits`}
                  />
                )
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {CHARACTER_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => toggleOutfit(p.label)}
                      className={cn('rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                        pickedOutfits.includes(p.label) ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10')}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}

              <SliderField
                label="Reel length"
                value={reelLen}
                onChange={setReelLen}
                min={4}
                max={12}
                step={1}
                format={(v) => `${v}s`}
              />

              <button
                type="button"
                onClick={makeReel}
                disabled={!canMake}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                {making ? 'Making your reel…' : 'Make Reel'}
              </button>
              <p className="text-center text-[10px] text-white/25">
                Runs by itself — outfits generate one by one, then the cuts land on the beat. Keep this tab open.
              </p>
            </div>
          </WorkflowSection>
        </div>
      </div>
    </WorkflowShell>
  );
};
