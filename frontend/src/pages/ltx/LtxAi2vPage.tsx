import { useEffect, useState } from 'react';
import { Loader2, Music, Volume2, Wand2 } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { Field, NeutralButton } from '../../components/ui/FeddaPrimitives';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { BatchQueuePanel, ChipGroup, GenerateButton, SeedField, SliderField, UploadSlot } from '../../components/ui/WorkflowControls';
import { cn, inputBase } from '../../lib/styles';

const WIDTH_PRESETS = ['512', '640', '768', '1024', '1280'] as const;

// Younger / casual-sounding Edge voices surfaced at the top of the picker
export const SUGGESTED_EDGE_VOICES = [
  'en-US-AnaNeural',
  'en-GB-MaisieNeural',
  'en-US-JennyNeural',
  'en-US-AriaNeural',
  'en-US-AvaNeural',
  'en-US-EmmaNeural',
  'en-AU-NatashaNeural',
  'nb-NO-PernilleNeural',
  'nb-NO-IselinNeural',
];
const DEFAULT_NEGATIVE = 'blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles';

export const LtxAi2vPage = () => {
  const [prompt, setPrompt] = usePersistentState('ltx_ai2v_prompt', '');
  const [batchRaw, setBatchRaw] = usePersistentState('ltx_ai2v_batch_raw', '');
  const [negative, setNegative] = usePersistentState('ltx_ai2v_negative', DEFAULT_NEGATIVE);
  const [seed, setSeed] = usePersistentState('ltx_ai2v_seed', -1);
  const [steps, setSteps] = usePersistentState('ltx_ai2v_steps', 4);
  const [duration, setDuration] = usePersistentState('ltx_ai2v_duration', 5);
  const [width, setWidth] = usePersistentState('ltx_ai2v_width', '1024');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [imageFilename, setImageFilename] = usePersistentState<string | null>('ltx_ai2v_image_file', null);
  const [imageUploading, setImageUploading] = useState(false);
  const [audioFilename, setAudioFilename] = usePersistentState<string | null>('ltx_ai2v_audio_file', null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [referenceCaptioning, setReferenceCaptioning] = useState(false);

  // In-page text-to-speech for the audio slot (Edge = fast, Chatterbox = natural GPU voice)
  const [ttsText, setTtsText] = usePersistentState('ltx_ai2v_tts_text', '');
  const [ttsVoice, setTtsVoice] = usePersistentState('ltx_ai2v_tts_voice', 'en-US-AvaNeural');
  const [ttsEngine, setTtsEngine] = usePersistentState<'edge' | 'chatterbox'>('ltx_ai2v_tts_engine', 'edge');
  const [ttsCbVoice, setTtsCbVoice] = usePersistentState('ltx_ai2v_tts_cb_voice', '');
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const [edgeVoices, setEdgeVoices] = useState<Array<{ id: string; name: string }>>([]);
  const [cbVoices, setCbVoices] = useState<Array<{ id: string; name: string }>>([]);

  const { toast } = useToast();
  const run = useWorkflowRun({
    workflowId: 'ltx-ai2v',
    currentKey: 'ltx_ai2v_current_video',
    historyKey: 'ltx_ai2v_history',
    outputKind: 'video',
    readyMessage: 'Video ready',
  });

  const imagePreview = imageFilename ? `/comfy/view?filename=${encodeURIComponent(imageFilename)}&type=input` : null;
  const audioPreview = audioFilename ? `/comfy/view?filename=${encodeURIComponent(audioFilename)}&type=input` : null;

  const uploadTo = async (
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

  const uploadFromUrl = async (
    url: string,
    setFile: (filename: string) => void,
    setUploading: (value: boolean) => void,
    fallbackName: string,
  ) => {
    setUploading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const blob = await res.blob();
      await uploadTo(new File([blob], fallbackName, { type: blob.type || 'application/octet-stream' }), setFile, setUploading);
    } catch (err: any) {
      toast(err.message || 'Could not load file from URL', 'error');
      setUploading(false);
    }
  };

  useEffect(() => {
    fetch(`${BACKEND_API.BASE_URL}/api/tts/edge-voices`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.voices)) setEdgeVoices(data.voices);
      })
      .catch(() => {});
    fetch(`${BACKEND_API.BASE_URL}/api/tts/voices`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.voices)) setCbVoices(data.voices);
      })
      .catch(() => {});
  }, []);

  /** Generates the TTS clip and loads it into the audio slot; returns the uploaded filename. */
  const generateVoiceClip = async (): Promise<string | null> => {
    if (!ttsText.trim() || ttsGenerating) return null;
    let uploadedName: string | null = null;
    setTtsGenerating(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/chat/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsText.trim(),
          tts_engine: ttsEngine,
          voice_name: ttsVoice,
          reference_audio: ttsEngine === 'chatterbox' ? ttsCbVoice : '',
          cfg_scale: 0.5,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.audio_base64) throw new Error(data.error || 'Voice generation failed');
      const bytes = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'tts-voice.mp3', { type: data.mime_type || 'audio/mpeg' });
      await uploadTo(file, (name) => { uploadedName = name; setAudioFilename(name); }, setAudioUploading);
      toast('Voice clip generated and loaded', 'success');
    } catch (err: any) {
      toast(err.message || 'Voice generation failed', 'error');
    } finally {
      setTtsGenerating(false);
    }
    return uploadedName;
  };

  /** One click: generate the voice clip, then immediately start the video with it. */
  const voiceAndGenerate = async () => {
    if (!imageFilename || !prompt.trim() || run.isGenerating) return;
    const audioName = await generateVoiceClip();
    if (!audioName) return;
    run.start({ ...buildParams(prompt), audio: audioName });
  };

  // Consume a "Send to Workflow" handoff (image or TTS audio) on first mount
  useEffect(() => {
    const url = consumeHandoff('image');
    if (url) uploadFromUrl(url, setImageFilename, setImageUploading, 'handoff-image.png');
    const audioUrl = consumeHandoff('audio');
    if (audioUrl) uploadFromUrl(audioUrl, setAudioFilename, setAudioUploading, 'tts-voice.mp3');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPromptFromReference = async () => {
    if (!imageFilename || !imagePreview || referenceCaptioning) return;
    setReferenceCaptioning(true);
    try {
      const imageResponse = await fetch(imagePreview);
      if (!imageResponse.ok) throw new Error('Could not read reference image');
      const blob = await imageResponse.blob();
      const file = new File([blob], imageFilename, { type: blob.type || 'image/png' });
      const form = new FormData();
      form.append('file', file);
      form.append('context', 'ltx-lipsync');
      const response = await fetch(
        `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`,
        { method: 'POST', body: form },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || 'Prompt caption failed');
      setPrompt(data.caption ?? '');
      toast(data.model ? `Prompt built with ${data.model}` : 'Prompt built from reference image', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not build prompt from reference image', 'error');
    } finally {
      setReferenceCaptioning(false);
    }
  };

  const buildParams = (promptText: string) => ({
    image: imageFilename,
    audio: audioFilename,
    prompt: promptText.trim(),
    negative: negative.trim(),
    seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
    steps,
    width: parseInt(width, 10),
    duration,
  });

  const handleGenerate = () => {
    if (!imageFilename || !audioFilename || !prompt.trim() || run.isGenerating) return;
    run.start(buildParams(prompt));
  };

  const handleBatchRun = (prompts: string[]) => {
    if (run.isGenerating) return;
    if (!imageFilename || !audioFilename) {
      toast('Upload a reference image and an audio clip first', 'error');
      return;
    }
    void run.startBatch(prompts.map(buildParams));
  };

  const canGenerate = !!imageFilename && !!audioFilename && !!prompt.trim() && !run.isGenerating;

  return (
    <WorkflowShell
      title="Audio to Video"
      eyebrow="LTX 2.3"
      description="Animate a reference image driven by an audio clip — motion and expression follow the audio track."
      icon={Music}
      isGenerating={run.isGenerating}
      canGenerate={canGenerate}
      workflowId="ltx-ai2v"
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="LTX AI2V Output"
          emptyHint="Upload an image and an audio clip, then generate to see results here."
        />
      )}
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkflowSection title="Reference Image">
            <UploadSlot
              preview={imagePreview}
              uploading={imageUploading}
              onFile={(file) => uploadTo(file, setImageFilename, setImageUploading)}
              onUrl={(url) => uploadFromUrl(url, setImageFilename, setImageUploading, 'gallery-image.png')}
              label="Reference Image"
              hint="Click or drop jpg/png"
            />
            {imageFilename && <p className="mt-2 truncate font-mono text-[9px] text-zinc-600">{imageFilename}</p>}
          </WorkflowSection>

          <WorkflowSection title="Audio Clip">
            <UploadSlot
              preview={audioPreview}
              uploading={audioUploading}
              onFile={(file) => uploadTo(file, setAudioFilename, setAudioUploading)}
              onUrl={(url) => uploadFromUrl(url, setAudioFilename, setAudioUploading, 'gallery-audio.mp3')}
              accept="audio/*,video/*"
              label="Audio Clip"
              hint="Click or drop mp3/wav/mp4 — full clip is used"
              previewKind="audio"
              filename={audioFilename ?? undefined}
            />
            <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/25">Or generate voice from text</p>
              <textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Write what she should say..."
                rows={2}
                className={cn(inputBase, 'min-h-[52px] resize-y text-[12px]')}
              />
              <div className="flex gap-2">
                <select
                  value={ttsEngine}
                  onChange={(e) => setTtsEngine(e.target.value as 'edge' | 'chatterbox')}
                  className={cn(inputBase, 'w-[130px] text-[11px]')}
                >
                  <option value="edge">Edge (fast)</option>
                  <option value="chatterbox">Chatterbox (natural)</option>
                </select>
                {ttsEngine === 'chatterbox' ? (
                  <select
                    value={ttsCbVoice}
                    onChange={(e) => setTtsCbVoice(e.target.value)}
                    className={cn(inputBase, 'flex-1 text-[11px]')}
                  >
                    <option value="">Default — natural female</option>
                    {cbVoices.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                    className={cn(inputBase, 'flex-1 text-[11px]')}
                  >
                    {edgeVoices.length === 0 && <option value="en-US-AvaNeural">en-US-Ava (default)</option>}
                    {edgeVoices.length > 0 && (
                      <optgroup label="★ Suggested — young / casual">
                        {edgeVoices.filter((v) => SUGGESTED_EDGE_VOICES.includes(v.id)).map((v) => (
                          <option key={`s-${v.id}`} value={v.id}>{v.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {edgeVoices.length > 0 && (
                      <optgroup label="All voices">
                        {edgeVoices.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => { void generateVoiceClip(); }}
                  disabled={!ttsText.trim() || ttsGenerating}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ttsGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                  Voice
                </button>
                <button
                  type="button"
                  onClick={() => { void voiceAndGenerate(); }}
                  disabled={!ttsText.trim() || !imageFilename || !prompt.trim() || ttsGenerating || run.isGenerating}
                  title="Generate the voice clip and immediately start the video with it"
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {(ttsGenerating || run.isGenerating) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Music className="h-3 w-3" />}
                  Voice + Video
                </button>
              </div>
            </div>
          </WorkflowSection>
        </div>

        <WorkflowSection
          title="Prompt"
          actions={(
            <NeutralButton
              onClick={buildPromptFromReference}
              disabled={!imageFilename || referenceCaptioning}
            >
              {referenceCaptioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Build From Reference
            </NeutralButton>
          )}
        >
          <PromptAssistant
            context="ltx-lipsync"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe the expression, energy, and presence you want synced to the audio..."
            minRows={4}
            accent="violet"
            label="Prompt"
            enableCaption
          />
          <div className="mt-3">
            <BatchQueuePanel
              value={batchRaw}
              onChange={setBatchRaw}
              onRun={handleBatchRun}
              isGenerating={run.isGenerating}
              progress={run.batchProgress}
              autoFillContext="ltx-lipsync"
            />
          </div>
        </WorkflowSection>

        <WorkflowSection
          title="Run Settings"
          actions={(
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
            >
              {showAdvanced ? '− Seed' : '+ Seed'}
            </button>
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Negative Prompt">
              <div className="space-y-1.5">
                <textarea
                  value={negative}
                  onChange={(event) => setNegative(event.target.value)}
                  className={cn(inputBase, 'min-h-[72px] resize-y')}
                  placeholder="Artifacts to avoid..."
                />
                <button
                  type="button"
                  onClick={() => setNegative(DEFAULT_NEGATIVE)}
                  className="text-[10px] text-zinc-600 transition hover:text-zinc-400"
                >
                  Reset to default
                </button>
              </div>
            </Field>

            <div className="space-y-3">
              <Field label="Target Width — height follows the image's aspect ratio">
                <ChipGroup options={WIDTH_PRESETS} value={width} onChange={setWidth} />
              </Field>
              <SliderField
                label="Video Length"
                value={duration}
                onChange={setDuration}
                min={0}
                max={30}
                step={1}
                format={(v) => (v === 0 ? 'full audio clip' : `first ${v}s of audio`)}
              />
              <SliderField
                label="Steps"
                value={steps}
                onChange={setSteps}
                min={4}
                max={12}
                step={1}
                format={(v) => `${v} (distilled turbo — 4 is fastest)`}
              />
            </div>
          </div>

          {showAdvanced && (
            <div className="mt-4">
              <Field label="Seed (-1 = random)">
                <SeedField value={seed} onChange={setSeed} />
              </Field>
            </div>
          )}

          <div className="mt-4">
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate}
              isGenerating={run.isGenerating}
              label="Generate Video"
              requirementHint="Upload a reference image, an audio clip, and enter a prompt"
            />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
