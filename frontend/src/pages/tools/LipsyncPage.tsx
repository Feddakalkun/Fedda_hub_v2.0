import { useState } from 'react';
import { Mic } from 'lucide-react';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useWorkflowRun } from '../../hooks/useWorkflowRun';
import { WorkflowShell, WorkflowSection } from '../../components/layout/WorkflowShell';
import { WorkflowVideoPreviewStrip } from '../../components/layout/WorkflowVideoPreviewStrip';
import { ChipGroup, GenerateButton, SeedField, UploadSlot } from '../../components/ui/WorkflowControls';

const MODELS = [
  { id: 'lipsync-infinitetalk', label: 'InfiniteTalk', note: 'WAN 2.1 - sharpest lipsync' },
  { id: 'lipsync-multitalk', label: 'MultiTalk', note: 'WAN 2.1 - text-controllable' },
  { id: 'lipsync-sonic', label: 'Sonic (SVD)', note: 'lighter, no prompt' },
] as const;
type ModelId = typeof MODELS[number]['id'];

export const LipsyncPage = () => {
  const { toast } = useToast();
  const [model, setModel] = usePersistentState<ModelId>('lipsync_model', 'lipsync-infinitetalk');
  const [prompt, setPrompt] = usePersistentState('lipsync_prompt', 'she is talking, lips moving in sync with the audio, natural mouth and jaw movement, subtle head motion and blinking');
  const [seed, setSeed] = usePersistentState('lipsync_seed', -1);
  const [imageFile, setImageFile] = usePersistentState<string | null>('lipsync_image', null);
  const [audioFile, setAudioFile] = usePersistentState<string | null>('lipsync_audio', null);
  const [imgUp, setImgUp] = useState(false);
  const [audUp, setAudUp] = useState(false);

  const usesPrompt = model !== 'lipsync-sonic';
  const run = useWorkflowRun({
    workflowId: model,
    currentKey: `lipsync_current_${model}`,
    historyKey: 'lipsync_history',
    outputKind: 'video',
    readyMessage: 'Lipsync ready',
  });

  const imgPreview = imageFile ? `/comfy/view?filename=${encodeURIComponent(imageFile)}&type=input` : null;
  const audPreview = audioFile ? `/comfy/view?filename=${encodeURIComponent(audioFile)}&type=input` : null;

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

  const generate = () => {
    if (!imageFile || !audioFile || run.isGenerating) return;
    run.start({
      image: imageFile,
      audio: audioFile,
      ...(usesPrompt ? { prompt: prompt.trim() } : {}),
      seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
    });
  };

  const canGen = !!imageFile && !!audioFile && !run.isGenerating;

  return (
    <WorkflowShell
      title="Lipsync"
      eyebrow="Talking Head"
      description="Drive a portrait's mouth from an audio clip - phoneme-accurate talking video."
      icon={Mic}
      isGenerating={run.isGenerating}
      canGenerate={canGen}
      workflowId={model}
      output={(
        <WorkflowVideoPreviewStrip
          currentVideo={run.currentMedia}
          history={run.history}
          onSelectVideo={run.setCurrentMedia}
          isGenerating={run.isGenerating}
          title="Lipsync Output"
          emptyHint="Upload a portrait and an audio clip, then generate."
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
              label="Portrait" hint="Click or drop a face photo" />
          </WorkflowSection>
          <WorkflowSection title="Audio">
            <UploadSlot preview={audPreview} uploading={audUp}
              onFile={(f) => upload(f, setAudioFile, setAudUp)}
              accept="audio/*,video/*" label="Audio Clip" hint="mp3/wav - the voice to sync"
              previewKind="audio" filename={audioFile ?? undefined} />
          </WorkflowSection>
        </div>

        {usesPrompt && (
          <WorkflowSection title="Prompt">
            <PromptAssistant context="ltx-lipsync" value={prompt} onChange={setPrompt}
              placeholder="Describe expression and energy..." minRows={3} accent="violet" label="Prompt" />
          </WorkflowSection>
        )}

        <WorkflowSection title="Run">
          <SeedField value={seed} onChange={setSeed} />
          <div className="mt-3">
            <GenerateButton onClick={generate} disabled={!canGen} isGenerating={run.isGenerating}
              label="Generate Lipsync" requirementHint="Upload a portrait and an audio clip" />
          </div>
        </WorkflowSection>
      </div>
    </WorkflowShell>
  );
};
