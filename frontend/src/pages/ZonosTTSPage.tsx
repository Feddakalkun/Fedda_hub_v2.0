import { useEffect, useState } from 'react';
import { FeddaButton, FeddaPanel } from '../components/ui/FeddaPrimitives';
import { useToast } from '../components/ui/Toast';
import { Volume2, Upload, Play, Download, Loader2, Clapperboard } from 'lucide-react';
import { saveAudioToGallery } from '../utils/mediaStore';
import { setHandoff, navigateToTab } from '../utils/workflowHandoff';

type TtsEngine = 'edge' | 'chatterbox' | 'zonos';

interface EdgeVoice {
  id: string;
  name: string;
  locale: string;
}

export function ZonosTTSPage() {
  const { toast } = useToast();
  const [engine, setEngine] = useState<TtsEngine>('edge');
  const [text, setText] = useState('Hello, this is a locally generated voice speaking with natural expressiveness.');
  const [voiceName, setVoiceName] = useState('');
  const [edgeVoices, setEdgeVoices] = useState<EdgeVoice[]>([]);
  const [edgeVoice, setEdgeVoice] = useState('en-US-AvaNeural');
  const [useClone, setUseClone] = useState(false);
  const [referenceAudio, setReferenceAudio] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [pitch, setPitch] = useState(0.0);
  const [emotion, setEmotion] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [cfgScale, setCfgScale] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBase64, setAudioBase64] = useState('');
  const [exaggeration, setExaggeration] = useState(0.5);
  const [cbPace, setCbPace] = useState(0.5);
  const [cbRefName, setCbRefName] = useState('');
  const [cbRefUploading, setCbRefUploading] = useState(false);

  useEffect(() => {
    fetch('/api/tts/edge-voices')
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.voices)) setEdgeVoices(data.voices);
      })
      .catch(() => {});
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      toast('Please upload an audio file for voice reference', 'error');
      return;
    }
    // For simplicity, use file name; in real, upload to input folder like other
    setReferenceAudio(file.name);
    toast('Reference audio selected. Make sure it is in ComfyUI input or Zonos accessible.', 'info');
  };

  const handleCbRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCbRefUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setCbRefName(data.filename);
      toast('Reference voice uploaded', 'success');
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
          voice_name: engine === 'edge' ? edgeVoice : voiceName,
          tts_engine: engine,
          use_voice_clone: engine === 'zonos' && useClone,
          reference_audio: engine === 'chatterbox' ? cbRefName : referenceAudio,
          reference_text: referenceText,
          speaking_rate: speakingRate,
          pitch: pitch,
          emotion: emotion,
          temperature: engine === 'chatterbox' ? 0.8 : temperature,
          top_p: topP,
          cfg_scale: engine === 'chatterbox' ? cbPace : cfgScale,
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
      toast(
        e.message || (engine === 'zonos'
          ? 'Failed to generate with Zonos 2. Ensure the WSL installer is set up and server running.'
          : 'Failed to generate with Edge TTS.'),
        'error',
      );
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
      a.download = engine === 'edge' ? 'edge_tts_output.mp3' : 'zonos2_output.wav';
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
    <div className="p-6 max-w-3xl mx-auto">
      <FeddaPanel>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Volume2 className="h-6 w-6 text-violet-300" />
            <div>
              <div className="font-semibold text-lg">Text to Speech</div>
              <div className="text-[10px] text-white/40">Local Edge neural voices, or Zonos 2 voice cloning (via WSL)</div>
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
              <button
                type="button"
                onClick={() => setEngine('zonos')}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                  engine === 'zonos'
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                Zonos 2
                <span className="block text-[9px] uppercase tracking-wider opacity-60">voice cloning · WSL server</span>
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
                  Voice Reference <span className="opacity-50">(optional — clone a voice from a 5–15s clip)</span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 rounded-xl fedda-input p-3 text-sm text-white/60 truncate">
                    {cbRefName || 'No reference — built-in natural female voice'}
                  </div>
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm">
                    {cbRefUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Upload
                    <input type="file" accept="audio/*" className="hidden" onChange={handleCbRefUpload} />
                  </label>
                  {cbRefName && (
                    <button
                      type="button"
                      onClick={() => setCbRefName('')}
                      className="px-3 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/50"
                    >
                      Clear
                    </button>
                  )}
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
          )}

          {engine === 'zonos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Voice / Speaker</div>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="Voice name or leave for default/clone"
                  className="w-full rounded-xl fedda-input p-3 text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useClone}
                    onChange={(e) => setUseClone(e.target.checked)}
                  />
                  Use voice cloning
                </label>
              </div>
            </div>
          )}

          {engine === 'zonos' && useClone && (
            <div className="space-y-3 border border-white/10 rounded-xl p-4 bg-black/20">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Reference Audio (for cloning)</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referenceAudio}
                    onChange={(e) => setReferenceAudio(e.target.value)}
                    placeholder="reference.wav (place in accessible folder)"
                    className="flex-1 rounded-xl fedda-input p-3 text-sm"
                  />
                  <label className="cursor-pointer flex items-center gap-2 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm">
                    <Upload className="h-4 w-4" />
                    Upload
                    <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Reference Text (optional, for better cloning)</div>
                <input
                  type="text"
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  placeholder="What the reference audio says..."
                  className="w-full rounded-xl fedda-input p-3 text-sm"
                />
              </div>
            </div>
          )}

          {engine !== 'chatterbox' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            {engine === 'zonos' && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Emotion / Style</div>
                <input
                  type="text"
                  value={emotion}
                  onChange={(e) => setEmotion(e.target.value)}
                  placeholder="happy, sad, excited, calm..."
                  className="w-full rounded-xl fedda-input p-3 text-sm"
                />
              </div>
            )}
          </div>
          )}

          {engine === 'zonos' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Temperature</div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.1"
                  value={temperature || 0.7}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-white/50 text-center">{(temperature || 0.7).toFixed(1)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Top P</div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={topP || 0.9}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-white/50 text-center">{(topP || 0.9).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">CFG Scale</div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={cfgScale || 1.0}
                  onChange={(e) => setCfgScale(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-white/50 text-center">{(cfgScale || 1.0).toFixed(1)}</div>
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

          {engine === 'zonos' && (
            <div className="text-[10px] text-white/40">
              Requires Zonos 2 installed via the WSL tool at <a href="https://getgoingfast.pro/tools/zonos2/" target="_blank" className="underline">getgoingfast.pro/tools/zonos2/</a>.
              Set ZONOS_URL env var (default http://localhost:7860) if the server runs on a different port.
              For voice cloning, upload a short clear reference audio clip.
            </div>
          )}
          {engine === 'edge' && (
            <div className="text-[10px] text-white/40">
              Edge TTS uses Microsoft's neural voices — fast, hundreds of voices in most languages
              (including Norwegian). No voice cloning; use Chatterbox for that.
            </div>
          )}
          {engine === 'chatterbox' && (
            <div className="text-[10px] text-white/40">
              Chatterbox runs fully on your GPU (~3 GB VRAM, first use loads the model). The most natural casual speech —
              upload a 5–15 s reference clip to lock a consistent voice for your character. English only. Expect ~5× realtime
              (a 6 s line takes ~30 s).
            </div>
          )}
        </div>
      </FeddaPanel>
    </div>
  );
}
