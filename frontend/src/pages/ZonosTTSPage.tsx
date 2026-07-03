import { useState } from 'react';
import { FeddaButton, FeddaPanel } from '../components/ui/FeddaPrimitives';
import { useToast } from '../components/ui/Toast';
import { Volume2, Upload, Play, Download, Loader2 } from 'lucide-react';
import { triggerMediaDownload, saveAudioToGallery } from '../utils/mediaStore';

export function ZonosTTSPage() {
  const { toast } = useToast();
  const [text, setText] = useState('Hello, this is Zonos 2 speaking with natural expressiveness.');
  const [voiceName, setVoiceName] = useState('');
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
          voice_name: voiceName,
          tts_engine: 'zonos',
          use_voice_clone: useClone,
          reference_audio: referenceAudio,
          reference_text: referenceText,
          speaking_rate: speakingRate,
          pitch: pitch,
          emotion: emotion,
          temperature: temperature,
          top_p: topP,
          cfg_scale: cfgScale,
          // Additional params can be passed if backend supports
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'TTS generation failed');
      }
      if (data.audio_url) {
        setAudioUrl(data.audio_url);
        saveAudioToGallery(data.audio_url, 'zonos');
        toast('Zonos 2 audio generated!', 'success');
      } else if (data.audio_base64) {
        const mime = data.mime_type || 'audio/wav';
        const full = `data:${mime};base64,${data.audio_base64}`;
        setAudioBase64(full);
        saveAudioToGallery(full, 'zonos');
        toast('Zonos 2 audio generated!', 'success');
      } else {
        throw new Error('No audio returned from Zonos');
      }
    } catch (e: any) {
      toast(e.message || 'Failed to generate with Zonos 2. Ensure the WSL installer is set up and server running.', 'error');
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
      a.download = 'zonos2_output.wav';
      a.click();
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <FeddaPanel>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Volume2 className="h-6 w-6 text-violet-300" />
            <div>
              <div className="font-semibold text-lg">Zonos 2 TTS</div>
              <div className="text-[10px] text-white/40">High-fidelity voice cloning &amp; expressive speech (via WSL)</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60 mb-1">Text</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full min-h-[120px] rounded-xl fedda-input p-4 text-sm"
              placeholder="Enter the text you want Zonos 2 to speak..."
            />
          </div>

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

          {useClone && (
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
          </div>

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

          <FeddaButton
            onClick={generate}
            disabled={isGenerating || !text.trim()}
            variant="violet"
            className="w-full h-12 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating with Zonos 2...
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
              </div>
              <audio controls src={audioUrl || audioBase64} className="w-full" />
            </div>
          )}

          <div className="text-[10px] text-white/40">
            Requires Zonos 2 installed via the WSL tool at <a href="https://getgoingfast.pro/tools/zonos2/" target="_blank" className="underline">getgoingfast.pro/tools/zonos2/</a>. 
            Set ZONOS_URL env var (default http://localhost:7860) if the server runs on a different port. 
            For voice cloning, upload a short clear reference audio clip.
          </div>
        </div>
      </FeddaPanel>
    </div>
  );
}
