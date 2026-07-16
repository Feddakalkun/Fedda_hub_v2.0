import { useEffect, useState } from 'react';
import { FeddaButton, FeddaPanel } from '../components/ui/FeddaPrimitives';
import { useToast } from '../components/ui/Toast';
import { Volume2, Upload, Play, Download, Loader2, Clapperboard } from 'lucide-react';
import { saveAudioToGallery } from '../utils/mediaStore';
import { setHandoff, navigateToTab } from '../utils/workflowHandoff';

type TtsEngine = 'edge' | 'chatterbox';

interface EdgeVoice {
  id: string;
  name: string;
  locale: string;
}

export function ZonosTTSPage() {
  const { toast } = useToast();
  const [engine, setEngine] = useState<TtsEngine>('edge');
  const [text, setText] = useState('Hey! Okay so I have to tell you about this — it turned out so much better than I expected.');
  const [edgeVoices, setEdgeVoices] = useState<EdgeVoice[]>([]);
  const [edgeVoice, setEdgeVoice] = useState('en-US-AvaNeural');
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [pitch, setPitch] = useState(0.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBase64, setAudioBase64] = useState('');
  const [exaggeration, setExaggeration] = useState(0.5);
  const [cbPace, setCbPace] = useState(0.5);
  const [cbRefName, setCbRefName] = useState('');
  const [cbRefUploading, setCbRefUploading] = useState(false);
  const [cbVoices, setCbVoices] = useState<Array<{ id: string; name: string }>>([]);

  const refreshCbVoices = () => {
    fetch('/api/tts/voices')
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.voices)) setCbVoices(data.voices);
      })
      .catch(() => {});
  };
  useEffect(refreshCbVoices, []);

  useEffect(() => {
    fetch('/api/tts/edge-voices')
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.voices)) setEdgeVoices(data.voices);
      })
      .catch(() => {});
  }, []);

  const handleCbRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCbRefUploading(true);
    try {
      const suggested = file.name.replace(/\.[^.]+$/, '');
      const name = window.prompt('Name this voice:', suggested) ?? suggested;
      const form = new FormData();
      form.append('file', file);
      form.append('name', name);
      const res = await fetch('/api/tts/voices', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Upload failed');
      setCbRefName(data.voice.id);
      refreshCbVoices();
      toast(`Voice "${data.voice.name}" saved to library`, 'success');
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setCbRefUploading(false);
    }
  };

  const generate = async () => {
    if (!text.trim()) {
      toast('Text is required', 'error');
      return;
    }
    setIsGenerating(true);
    setAudioUrl('');
    setAudioBase64('');

    try {
      const res = await fetch('/api/chat/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_name: engine === 'edge' ? edgeVoice : '',
          tts_engine: engine,
          reference_audio: engine === 'chatterbox' ? cbRefName : '',
          speaking_rate: speakingRate,
          pitch: pitch,
          cfg_scale: engine === 'chatterbox' ? cbPace : 1.0,
          exaggeration: exaggeration,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'TTS generation failed');
      }
      if (data.audio_url) {
        setAudioUrl(data.audio_url);
        saveAudioToGallery(data.audio_url, data.provider || engine);
        toast('Audio generated!', 'success');
      } else if (data.audio_base64) {
        const mime = data.mime_type || 'audio/wav';
        const full = `data:${mime};base64,${data.audio_base64}`;
        setAudioBase64(full);
        saveAudioToGallery(full, data.provider || engine);
        toast('Audio generated!', 'success');
      } else {
        throw new Error('No audio returned');
      }
    } catch (e: any) {
      toast(e.message || 'Failed to generate speech.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const playAudio = () => {
    const url = audioUrl || audioBase64;
    if (url) {
      const audio = new Audio(url);
      audio.play().catch(() => toast('Could not play audio', 'error'));
    }
  };

  const downloadAudio = () => {
    const url = audioUrl || audioBase64;
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = engine === 'edge' ? 'voice_edge.mp3' : 'voice_chatterbox.wav';
      a.click();
    }
  };

  const sendToAudio2Video = () => {
    const url = audioUrl || audioBase64;
    if (!url) return;
    setHandoff(url, 'audio');
    navigateToTab('ltx-ai2v');
    toast('Voice clip sent to Audio to Video', 'success');
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 max-w-3xl mx-auto">
      <FeddaPanel>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Volume2 className="h-6 w-6 text-violet-300" />
            <div>
              <div className="font-semibold text-lg">Voice Studio</div>
              <div className="text-[10px] text-white/40">Generate speech from text — fast Edge voices or natural Chatterbox with voice cloning</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Engine</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEngine('edge')}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                  engine === 'edge'
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                Edge TTS
                <span className="block text-[9px] uppercase tracking-wider opacity-60">fast · many languages</span>
              </button>
              <button
                type="button"
                onClick={() => setEngine('chatterbox')}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                  engine === 'chatterbox'
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                Chatterbox
                <span className="block text-[9px] uppercase tracking-wider opacity-60">natural · voice clone · GPU</span>
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Text</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full min-h-[120px] rounded-xl fedda-input p-4 text-sm"
              placeholder="Enter the text you want spoken..."
            />
          </div>

          {engine === 'chatterbox' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">
                  Voice <span className="opacity-50">(saved reference clips — add a 5–15s clip to create a new voice)</span>
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    value={cbRefName}
                    onChange={(e) => setCbRefName(e.target.value)}
                    className="flex-1 rounded-xl fedda-input p-3 text-sm"
                  >
                    <option value="">Default — built-in natural female voice</option>
                    {cbVoices.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm">
                    {cbRefUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Add Voice
                    <input type="file" accept="audio/*" className="hidden" onChange={handleCbRefUpload} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Exaggeration</div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={exaggeration}
                    onChange={(e) => setExaggeration(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-white/50 text-center">{exaggeration.toFixed(2)} — flat ↔ dramatic</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Pace / Adherence</div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={cbPace}
                    onChange={(e) => setCbPace(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-white/50 text-center">{cbPace.toFixed(2)} — fast/loose ↔ slow/precise</div>
                </div>
              </div>
            </div>
          )}

          {engine === 'edge' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">
                  Voice {edgeVoices.length > 0 && <span className="opacity-50">({edgeVoices.length} available)</span>}
                </div>
                <select
                  value={edgeVoice}
                  onChange={(e) => setEdgeVoice(e.target.value)}
                  className="w-full rounded-xl fedda-input p-3 text-sm"
                >
                  {edgeVoices.length === 0 && <option value="en-US-AvaNeural">en-US-Ava (default)</option>}
                  {edgeVoices.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Speaking Rate</div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={speakingRate}
                    onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-white/50 text-center">{speakingRate.toFixed(1)}x</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Pitch</div>
                  <input
                    type="range"
                    min="-0.5"
                    max="0.5"
                    step="0.05"
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-white/50 text-center">{pitch.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          <FeddaButton
            onClick={generate}
            disabled={isGenerating || !text.trim()}
            variant="violet"
            className="w-full h-12 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating speech...
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" /> Generate Speech
              </>
            )}
          </FeddaButton>

          {(audioUrl || audioBase64) && (
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
              <div className="text-sm text-white/70">Generated Audio</div>
              <div className="flex gap-2">
                <FeddaButton onClick={playAudio} variant="ghost" className="flex-1">
                  <Play className="h-4 w-4 mr-2" /> Play
                </FeddaButton>
                <FeddaButton onClick={downloadAudio} variant="ghost" className="flex-1">
                  <Download className="h-4 w-4 mr-2" /> Download
                </FeddaButton>
                <FeddaButton onClick={sendToAudio2Video} variant="violet" className="flex-1">
                  <Clapperboard className="h-4 w-4 mr-2" /> Send to Audio2Video
                </FeddaButton>
              </div>
              <audio controls src={audioUrl || audioBase64} className="w-full" />
            </div>
          )}

          {engine === 'edge' ? (
            <div className="text-[10px] text-white/40">
              Edge TTS uses Microsoft's neural voices — fast, hundreds of voices in most languages
              (including Norwegian). No voice cloning; use Chatterbox for that.
            </div>
          ) : (
            <div className="text-[10px] text-white/40">
              Chatterbox runs fully on your GPU (~3 GB VRAM, first use loads the model). The most natural casual speech —
              add a 5–15 s reference clip to lock a consistent voice for your character. English only. Expect ~5× realtime
              (a 6 s line takes ~30 s).
            </div>
          )}
        </div>
      </FeddaPanel>
    </div>
  );
}
