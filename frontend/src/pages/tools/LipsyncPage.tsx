import { useEffect, useRef, useState } from 'react';
import { Mic, Scissors, UserPlus } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';

const MODELS = [
  { id: 'lipsync-infinitetalk', label: 'InfiniteTalk', note: 'WAN 2.1 - sharpest lipsync, long clips' },
  { id: 'lipsync-multitalk', label: 'MultiTalk', note: 'WAN 2.1 - strong text control over expression' },
] as const;
type ModelId = typeof MODELS[number]['id'];

type LipsyncRatio = '1:1' | '3:4' | '9:16' | '4:3' | '16:9';
const RATIOS: LipsyncRatio[] = ['1:1', '3:4', '9:16', '4:3', '16:9'];
// AspectRatioResizeImage: base aspect string + direction produce the final shape
const RATIO_ASPECT: Record<LipsyncRatio, string> = { '1:1': '1:1', '3:4': '4:3', '9:16': '16:9', '4:3': '4:3', '16:9': '16:9' };
const RATIO_DIRECTION: Record<LipsyncRatio, string> = { '1:1': 'Horizontal', '3:4': 'Vertical', '9:16': 'Vertical', '4:3': 'Horizontal', '16:9': 'Horizontal' };

const RES_PRESETS = ['384', '480', '512', '640', '720'] as const;

interface VoiceOpt { id: string; name: string }

/** Encode an AudioBuffer slice to 16-bit PCM WAV. */
const encodeWav = (buf: AudioBuffer, start: number, end: number): Blob => {
  const sr = buf.sampleRate;
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.min(buf.length, Math.ceil(end * sr));
  const len = Math.max(0, s1 - s0);
  const ch = Math.min(2, buf.numberOfChannels);
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); wr(8, 'WAVEfmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true);
  data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  wr(36, 'data'); data.setUint32(40, len * ch * 2, true);
  let o = 44;
  for (let i = s0; i < s1; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
    }
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
};

export const LipsyncPage = () => {
  const { toast } = useToast();
  const [model, setModel] = usePersistentState<ModelId>('lipsync_model', 'lipsync-infinitetalk');
  const [prompt, setPrompt] = usePersistentState('lipsync_prompt', 'she is talking, lips moving in sync with the audio, natural mouth and jaw movement, subtle head motion and blinking');
  const [seed, setSeed] = usePersistentState('lipsync_seed', -1);
  const [imageFile, setImageFile] = usePersistentState<string | null>('lipsync_image', null);
  const [audioFile, setAudioFile] = usePersistentState<string | null>('lipsync_audio', null);
  const [imgUp, setImgUp] = useState(false);
  const [audUp, setAudUp] = useState(false);

  // audio source
  const [audioMode, setAudioMode] = usePersistentState<'tts' | 'upload'>('lipsync_audio_mode', 'tts');
  const [ttsText, setTtsText] = usePersistentState('lipsync_tts_text', '');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsEngine, setTtsEngine] = usePersistentState<'edge' | 'chatterbox'>('lipsync_tts_engine', 'edge');
  const [edgeVoice, setEdgeVoice] = usePersistentState('lipsync_edge_voice', '');
  const [edgeRate, setEdgeRate] = usePersistentState('lipsync_edge_rate', 1.0);
  const [edgePitch, setEdgePitch] = usePersistentState('lipsync_edge_pitch', 0);
  const [cbVoice, setCbVoice] = usePersistentState('lipsync_cb_voice', '');
  const [cbExaggeration, setCbExaggeration] = usePersistentState('lipsync_cb_exagg', 0.5);
  const [cbPace, setCbPace] = usePersistentState('lipsync_cb_pace', 0.5);
  const [edgeVoices, setEdgeVoices] = useState<VoiceOpt[]>([]);
  const [cbVoices, setCbVoices] = useState<VoiceOpt[]>([]);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [savingVoice, setSavingVoice] = useState(false);
  const voiceFileRef = useRef<HTMLInputElement>(null);

  // trim
  const [audioDuration, setAudioDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimming, setTrimming] = useState(false);

  // generation settings
  const [ratio, setRatio] = usePersistentState<LipsyncRatio>('lipsync_ratio', '1:1');
  const [resolution, setResolution] = usePersistentState('lipsync_resolution', '512');
  const [steps, setSteps] = usePersistentState('lipsync_steps', 4);

  const run = useWorkflowRun({
    workflowId: model,
    currentKey: `lipsync_current_${model}`,
    historyKey: 'lipsync_history',
    outputKind: 'video',
    readyMessage: 'Lipsync ready',
  });

  const imgPreview = imageFile ? `/comfy/view?filename=${encodeURIComponent(imageFile)}&type=input` : null;
  const audPreview = audioFile ? `/comfy/view?filename=${encodeURIComponent(audioFile)}&type=input` : null;

  // voice lists
  useEffect(() => {
    fetch('/api/tts/edge-voices').then((r) => r.json())
      .then((d) => { if (d.success) setEdgeVoices(d.voices || []); }).catch(() => {});
    refreshCbVoices();
  }, []);
  const refreshCbVoices = () => {
    fetch('/api/tts/voices').then((r) => r.json())
      .then((d) => { if (d.success) setCbVoices(d.voices || []); }).catch(() => {});
  };

  // read duration of the active audio for the trim editor
  useEffect(() => {
    setAudioDuration(0); setTrimStart(0); setTrimEnd(0);
    if (!audPreview) return;
    const el = new Audio(audPreview);
    el.addEventListener('loadedmetadata', () => {
      if (isFinite(el.duration)) { setAudioDuration(el.duration); setTrimEnd(el.duration); }
    });
  }, [audioFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file: File, set: (f: string) => void, setBusy: (b: boolean) => void) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const d = await r.json();
      if (!d.success) throw new Error(d.detail || 'Upload failed');
      set(d.filename);
    } catch (e: any) { toast(e.message || 'Upload failed', 'error'); }
    finally { setBusy(false); }
  };

  // Text-to-speech -> stage the resulting audio as the lipsync input
  const generateVoice = async () => {
    if (!ttsText.trim() || ttsBusy) return;
    if (ttsEngine === 'chatterbox' && !cbVoice) { toast('Pick a cloned voice first (or save one)', 'error'); return; }
    setTtsBusy(true);
    try {
      const r = await fetch('/api/chat/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsText.trim(),
          tts_engine: ttsEngine,
          voice_name: ttsEngine === 'edge' ? edgeVoice : '',
          reference_audio: ttsEngine === 'chatterbox' ? cbVoice : '',
          speaking_rate: edgeRate,
          pitch: edgePitch,
          exaggeration: cbExaggeration,
          cfg_scale: ttsEngine === 'chatterbox' ? cbPace : 1.0,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'TTS failed');
      const blob = d.audio_url
        ? await (await fetch(d.audio_url)).blob()
        : await (await fetch(`data:${d.mime_type || 'audio/wav'};base64,${d.audio_base64}`)).blob();
      await upload(new File([blob], 'tts_voice.wav', { type: blob.type || 'audio/wav' }), setAudioFile, setAudUp);
      toast('Voice generated', 'success');
    } catch (e: any) { toast(e.message || 'Voice generation failed', 'error'); }
    finally { setTtsBusy(false); }
  };

  // Save a reference clip as a named Chatterbox voice (voice cloning)
  const saveVoice = async (file: File) => {
    setSavingVoice(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', newVoiceName.trim() || file.name.replace(/\.[^.]+$/, ''));
      const r = await fetch('/api/tts/voices', { method: 'POST', body: form });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Save failed');
      refreshCbVoices();
      if (d.voice?.id) setCbVoice(d.voice.id);
      setNewVoiceName('');
      toast('Voice saved - it will now speak your text', 'success');
    } catch (e: any) { toast(e.message || 'Could not save voice', 'error'); }
    finally { setSavingVoice(false); }
  };

  // Cut the active audio to [trimStart, trimEnd] client-side and re-upload
  const applyTrim = async () => {
    if (!audPreview || trimming) return;
    setTrimming(true);
    try {
      const raw = await (await fetch(audPreview)).arrayBuffer();
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(raw);
      void ctx.close();
      const blob = encodeWav(buf, trimStart, trimEnd || buf.duration);
      await upload(new File([blob], 'trimmed_voice.wav', { type: 'audio/wav' }), setAudioFile, setAudUp);
      toast(`Trimmed to ${(Math.max(0, (trimEnd || buf.duration) - trimStart)).toFixed(1)}s`, 'success');
    } catch (e: any) { toast(e.message || 'Trim failed', 'error'); }
    finally { setTrimming(false); }
  };

  const generate = () => {
    if (!imageFile || !audioFile || run.isGenerating) return;
    run.start({
      image: imageFile,
      audio: audioFile,
      prompt: prompt.trim(),
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
      width: parseInt(resolution, 10),
      height: 0, // AspectRatioResizeImage auto-computes from aspect_ratio
      aspect_ratio: RATIO_ASPECT[ratio],
      direction: RATIO_DIRECTION[ratio],
      steps,
    });
  };

  const canGen = !!imageFile && !!audioFile && !run.isGenerating;
  const trimLen = Math.max(0, (trimEnd || audioDuration) - trimStart);
  const selectCls = 'w-full rounded-lg fedda-input px-2 py-1.5 text-xs';

  return (
    <WorkflowShell
      title="Lipsync"
      eyebrow="Talking Head"
      description="Type or upload a voice and drive a portrait's mouth - phoneme-accurate talking video."
      icon={Mic}
      isGenerating={run.isGenerating}
      canGenerate={canGen}
      workflowId={model}
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          onRemoveVideo={(url) => run.setHistory((prev) => prev.filter((v) => v !== url))}
          isGenerating={run.isGenerating}
          title="Lipsync Output"
          emptyHint="Upload a portrait and add a voice, then generate."
        />
      )}
    >
      <div className="space-y-4">
        <WorkflowSection title="Model">
          <ChipGroup options={MODELS.map((m) => m.id)} value={model} onChange={setModel}
            renderLabel={(id) => MODELS.find((m) => m.id === id)?.label ?? id} />
          <p className="mt-1.5 text-[10px] text-zinc-500">{MODELS.find((m) => m.id === model)?.note}</p>
        </WorkflowSection>

        <div className="grid gap-4 lg:grid-cols-2">
          <WorkflowSection title="Portrait">
            <UploadSlot preview={imgPreview} uploading={imgUp}
              onFile={(f) => upload(f, setImageFile, setImgUp)}
              onClear={() => setImageFile(null)}
              label="Portrait" hint="Click or drop a face photo" />
          </WorkflowSection>

          <WorkflowSection
            title="Voice"
            actions={(
              <div className="flex gap-1">
                {(['tts', 'upload'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setAudioMode(m)}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                      audioMode === m ? 'border-violet-500/50 bg-violet-500/10 text-violet-300' : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                    }`}>{m === 'tts' ? 'Text to Speech' : 'Upload'}</button>
                ))}
              </div>
            )}
          >
            {audioMode === 'tts' ? (
              <div className="space-y-2">
                <ChipGroup options={['edge', 'chatterbox'] as const} value={ttsEngine} onChange={setTtsEngine}
                  renderLabel={(e) => (e === 'edge' ? 'Edge (fast, many voices)' : 'Chatterbox (voice cloning)')} />

                {ttsEngine === 'edge' ? (
                  <>
                    <select value={edgeVoice} onChange={(e) => setEdgeVoice(e.target.value)} className={selectCls}>
                      <option value="">Default voice</option>
                      {edgeVoices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-3">
                      <SliderField label="Speed" value={edgeRate} onChange={setEdgeRate} min={0.5} max={1.8} step={0.05} format={(v) => `${v.toFixed(2)}x`} />
                      <SliderField label="Pitch" value={edgePitch} onChange={setEdgePitch} min={-30} max={30} step={1} format={(v) => `${v > 0 ? '+' : ''}${v}Hz`} />
                    </div>
                  </>
                ) : (
                  <>
                    <select value={cbVoice} onChange={(e) => setCbVoice(e.target.value)} className={selectCls}>
                      <option value="">Pick a cloned voice…</option>
                      {cbVoices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-3">
                      <SliderField label="Emotion" value={cbExaggeration} onChange={setCbExaggeration} min={0.25} max={1.0} step={0.05} />
                      <SliderField label="Pace" value={cbPace} onChange={setCbPace} min={0.2} max={1.0} step={0.05} />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2">
                      <UserPlus size={13} className="shrink-0 text-violet-400" />
                      <input value={newVoiceName} onChange={(e) => setNewVoiceName(e.target.value)}
                        placeholder="New voice name…" className="min-w-0 flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600" />
                      <button type="button" onClick={() => voiceFileRef.current?.click()} disabled={savingVoice}
                        className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40">
                        {savingVoice ? 'Saving…' : 'Clone from clip'}
                      </button>
                      <input ref={voiceFileRef} type="file" accept="audio/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void saveVoice(f); e.target.value = ''; }} />
                    </div>
                    <p className="text-[10px] text-zinc-600">Drop a 5-20s clean clip of any voice - it becomes a reusable named voice.</p>
                  </>
                )}

                <textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)}
                  className="w-full min-h-[80px] rounded-xl fedda-input p-3 text-sm"
                  placeholder="Type what she should say - this becomes her voice..." />
                <button type="button" onClick={() => void generateVoice()} disabled={ttsBusy || !ttsText.trim()}
                  className="w-full rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-40">
                  {ttsBusy ? 'Generating voice…' : audioFile ? '✓ Voice ready — regenerate' : 'Generate Voice'}
                </button>
              </div>
            ) : (
              <UploadSlot preview={audPreview} uploading={audUp}
                onFile={(f) => upload(f, setAudioFile, setAudUp)}
                onClear={() => setAudioFile(null)}
                accept="audio/*,video/*" label="Audio Clip" hint="mp3/wav - the voice to sync"
                previewKind="audio" filename={audioFile ?? undefined} />
            )}

            {audioFile && audPreview && (
              <div className="mt-2 space-y-2">
                <audio src={audPreview} controls className="h-8 w-full" />
                {audioDuration > 0 && (
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        <Scissors size={11} /> Trim clip
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">{trimLen.toFixed(1)}s of {audioDuration.toFixed(1)}s</span>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <label className="text-[10px] text-zinc-500">Start
                        <input type="number" min={0} max={audioDuration} step={0.1} value={trimStart}
                          onChange={(e) => setTrimStart(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="mt-0.5 w-full rounded-md fedda-input px-2 py-1 text-xs" />
                      </label>
                      <label className="text-[10px] text-zinc-500">End
                        <input type="number" min={0} max={audioDuration} step={0.1} value={trimEnd}
                          onChange={(e) => setTrimEnd(Math.min(audioDuration, parseFloat(e.target.value) || 0))}
                          className="mt-0.5 w-full rounded-md fedda-input px-2 py-1 text-xs" />
                      </label>
                      <button type="button" onClick={() => void applyTrim()}
                        disabled={trimming || trimLen <= 0 || (trimStart === 0 && trimEnd >= audioDuration)}
                        className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40">
                        {trimming ? 'Cutting…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </WorkflowSection>
        </div>

        <WorkflowSection title="Prompt">
          <PromptAssistant context="ltx-lipsync" value={prompt} onChange={setPrompt}
            placeholder="Describe expression and energy..." minRows={3} accent="violet" label="Prompt" />
        </WorkflowSection>

        <WorkflowSection title="Settings">
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Aspect Ratio</p>
              <ChipGroup options={RATIOS} value={ratio} onChange={setRatio} />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Resolution</p>
              <ChipGroup options={[...RES_PRESETS]} value={resolution} onChange={setResolution}
                renderLabel={(r) => (r === '384' ? '384 · fastest' : r === '720' ? '720 · slowest' : r)} />
              <p className="mt-1 text-[10px] text-zinc-600">Lower = much faster. 512 is a good speed/quality balance; video length always matches the audio.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SliderField label="Steps" value={steps} onChange={setSteps} min={2} max={10} step={1} format={(v) => `${v}`} />
              <SeedField value={seed} onChange={setSeed} />
            </div>
          </div>
        </WorkflowSection>

        <WorkflowSection title="Run">
          <GenerateButton onClick={generate} disabled={!canGen} isGenerating={run.isGenerating}
            label="Generate Lipsync" requirementHint="Add a portrait and a voice" />
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
