import { useState, useRef, useEffect } from 'react';
import { FeddaButton, FeddaPanel } from '../components/ui/FeddaPrimitives';
import { useToast } from '../components/ui/Toast';
import { Lightbox } from '../components/ui/Lightbox';
import { triggerMediaDownload } from '../utils/mediaStore';
import { Sparkles, Download, ImageIcon, Loader2, AlertCircle, Hash, Sliders, Send, Trash2, Globe, Settings, KeyRound } from 'lucide-react';

const saveToGlobalGallery = (urls: string[], source = 'grok') => {
  if (typeof window === 'undefined' || !urls.length) return;
  try {
    const key = `gallery_${source}`;
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [...urls, ...existing.filter((u: string) => !urls.includes(u))].slice(0, 60);
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fedda:gallery-updated'));
  } catch (e) {
    console.warn('Failed to save to gallery', e);
  }
};

// Grok Chat Models (from xAI)
const GROK_CHAT_MODELS = [
  { id: 'grok-3', label: 'Grok 3' },
  { id: 'grok-3-mini', label: 'Grok 3 Mini' },
  { id: 'grok-4', label: 'Grok 4 (if available)' },
  { id: 'grok-beta', label: 'Grok Beta' },
];

// Grok Image Models
const GROK_IMAGE_MODELS = [
  { id: 'grok-imagine-image', label: 'Grok Imagine' },
  { id: 'grok-imagine-image-quality', label: 'Grok Imagine (High Quality)' },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  audio?: string;
}

export function GrokPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'chat' | 'image'>('chat');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Key management (separate from Venice)
  const [grokApiKey, setGrokApiKey] = useState(() => localStorage.getItem('grok_api_key') || '');
  const saveGrokKey = (key: string) => {
    setGrokApiKey(key);
    if (key) localStorage.setItem('grok_api_key', key);
    else localStorage.removeItem('grok_api_key');
  };

  // ========== CHAT STATE & LOGIC ==========
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hello! I'm Grok. Ask me anything, or request images and I'll generate them using Grok Imagine tools." }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatModel, setChatModel] = useState('grok-3');
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [chatTemperature, setChatTemperature] = useState(0.7);
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getGrokApiKey = () => {
    let key = grokApiKey || localStorage.getItem('grok_api_key') || '';
    key = key.trim();
    if (key.toLowerCase().startsWith('bearer ')) {
      key = key.slice(7).trim();
    }
    return key;
  };

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setAttachedImages(prev => [...prev, base64]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearChat = () => {
    setChatMessages([
      { role: 'assistant', content: "Chat cleared. What can I help with today?" }
    ]);
    setAttachedImages([]);
  };

  const sendChatMessage = async () => {
    const apiKey = getGrokApiKey();
    if (!apiKey) {
      toast('Enter your xAI API key above (from console.x.ai)', 'error');
      return;
    }
    if (!chatInput.trim() && attachedImages.length === 0) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput.trim(),
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
    };

    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setChatInput('');
    setAttachedImages([]);

    setIsChatGenerating(true);

    const apiMessages = newMessages.map((msg) => {
      if (msg.images && msg.images.length > 0) {
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content },
            ...msg.images.map(img => ({ type: 'image_url', image_url: { url: img } }))
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    let tools: any[] = [];
    if (enableWebSearch) {
      tools.push({
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for up-to-date or real-time information. Use this when the user asks about current events, recent news, or facts that might have changed.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to look up."
              }
            },
            required: ["query"]
          }
        }
      });
    }
    tools.push({
      type: "function",
      function: {
        name: "generate_tts",
        description: "Generate speech audio from text using Zonos TTS. Use this when the user asks to speak, say, voice, read, or convert text to audio/voice/speech. Supports voice cloning with reference audio if provided.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The text to convert to speech."
            },
            voice_name: {
              type: "string",
              description: "Voice name or style, e.g. 'Kore' or cloned voice."
            },
            use_voice_clone: {
              type: "boolean",
              description: "Whether to use voice cloning with reference audio."
            },
            reference_audio: {
              type: "string",
              description: "Path or name of reference audio file for cloning."
            },
            speaking_rate: {
              type: "number",
              description: "Speaking speed multiplier, default 1.0"
            }
          },
          required: ["text"]
        }
      }
    });

    const body: any = {
      model: chatModel,
      messages: apiMessages,
      stream: true,
      temperature: chatTemperature,
      ...(tools.length > 0 && { tools })
    };

    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`API error ${res.status}: ${err}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let done = false;
      let toolCallAccumulator: any = null;

      const assistantMsgIndex = newMessages.length;
      setChatMessages([...newMessages, { role: 'assistant', content: '' }]);

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') { done = true; break; }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                if (delta?.content) {
                  assistantContent += delta.content;
                  setChatMessages(prev => {
                    const updated = [...prev];
                    updated[assistantMsgIndex] = { role: 'assistant', content: assistantContent };
                    return updated;
                  });
                }

                if (delta?.tool_calls && delta.tool_calls.length > 0) {
                  const tc = delta.tool_calls[0];
                  if (!toolCallAccumulator) {
                    toolCallAccumulator = {
                      id: tc.id || '',
                      name: tc.function?.name || '',
                      arguments: ''
                    };
                  }
                  if (tc.function?.arguments) {
                    toolCallAccumulator.arguments += tc.function.arguments;
                  }
                }
              } catch {}
            }
          }
        }
      }

      // Execute generate_tts tool if the model called it
      if (toolCallAccumulator && toolCallAccumulator.name === 'generate_tts') {
        try {
          const args = JSON.parse(toolCallAccumulator.arguments || '{}');
          const ttsText = args.text || assistantContent || chatInput;
          const ttsVoice = args.voice_name || 'Kore';
          const useClone = args.use_voice_clone || false;
          const refAudio = args.reference_audio || '';
          const rate = args.speaking_rate || 1.0;

          const res = await fetch('/api/chat/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: ttsText,
              voice_name: ttsVoice,
              tts_engine: 'zonos',
              use_voice_clone: useClone,
              reference_audio: refAudio,
              speaking_rate: rate
            })
          });
          const ttsData = await res.json();
          if (ttsData.success) {
            const audio = ttsData.audio_url || (ttsData.audio_base64 ? `data:${ttsData.mime_type || 'audio/wav'};base64,${ttsData.audio_base64}` : '');
            setChatMessages(prev => {
              const updated = [...prev];
              updated[assistantMsgIndex] = {
                role: 'assistant',
                content: assistantContent || `Speaking: ${ttsText.substring(0, 100)}...`,
                audio: audio
              };
              return updated;
            });
            if (audio) {
              const a = new Audio(audio);
              a.play().catch(() => {});
              // Auto save
              if (typeof window !== 'undefined') {
                const { saveAudioToGallery } = await import('../utils/mediaStore');
                saveAudioToGallery(audio, 'zonos');
              }
            }
          }
        } catch (toolErr) {
          console.error('generate_tts tool error', toolErr);
        }
      }
    } catch (e: any) {
      console.error(e);
      const raw = e.message || 'Failed to get response from Grok.';
      let friendly = raw;
      if (raw.includes('429') || raw.toLowerCase().includes('overloaded')) {
        friendly = 'Grok is currently overloaded. Try again later or use a different model.';
      } else if (raw.includes('403') || raw.includes('permission-denied') || raw.includes('credits')) {
        friendly = 'Your xAI team has no credits or licenses yet. Please purchase/add credits at https://console.x.ai/';
      }
      toast(friendly, 'error');
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsChatGenerating(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // ========== IMAGE GENERATION (Grok Imagine) ==========
  const [imgModel, setImgModel] = useState('grok-imagine-image');
  const [imgPrompt, setImgPrompt] = useState('a beautiful landscape, highly detailed, cinematic');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [isImgGenerating, setIsImgGenerating] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imgError, setImgError] = useState('');

  const generateImage = async () => {
    const apiKey = getGrokApiKey();
    if (!apiKey) { toast('Enter your Grok API key above', 'error'); return; }
    if (!imgPrompt.trim()) { toast('Prompt is required', 'error'); return; }
    setIsImgGenerating(true); setImgError(''); setImages([]);
    // For Grok, we use the xAI compatible or note. Here using similar to Venice for Grok Imagine models
    // In practice, for direct Grok, image gen may be through their platform or specific endpoint.
    // Using the model name for now, endpoint is placeholder for Grok direct.
    const body: any = { 
      model: imgModel, 
      prompt: imgPrompt.trim(), 
      width, 
      height, 
      // Grok specific params if supported
    };
    if (negativePrompt.trim()) body.negative_prompt = negativePrompt.trim();
    try {
      // Note: For direct xAI Grok image, the endpoint may differ. 
      // For now, using a compatible call. Update if exact Grok image endpoint is provided.
      // For Supergrok, the limits are higher on the official, but for API use the key.
      const res = await fetch('https://api.x.ai/v1/images/generations', {  // May need adjustment for actual Grok image endpoint
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        let errMsg = `API error ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg += `: ${errData.error}`;
        } catch {
          const txt = await res.text();
          errMsg += `: ${txt}`;
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      let newImgs: string[] = [];
      const rawImgs = (data.images || data.data || []);
      newImgs = rawImgs.map((i: any) => {
        if (typeof i === 'string') return i.startsWith('http') ? i : 'data:image/png;base64,' + i;
        if (i && i.b64_json) return 'data:image/png;base64,' + i.b64_json;
        if (i && i.url) return i.url;
        return null;
      }).filter(Boolean);
      setImages(newImgs);
      saveToGlobalGallery(newImgs, 'grok-image');
      toast('Generated with Grok!', 'success');
    } catch (e: any) {
      const raw = e.message || 'Failed to generate.';
      let friendly = raw;
      if (raw.includes('429') || raw.toLowerCase().includes('overloaded')) {
        friendly = 'Grok is currently overloaded. Try again later or use a different model.';
      } else if (raw.includes('403') || raw.includes('permission-denied') || raw.includes('credits')) {
        friendly = 'Your xAI team has no credits or licenses yet. Please purchase/add credits at https://console.x.ai/';
      }
      setImgError(friendly);
      toast(friendly, 'error');
    } finally { setIsImgGenerating(false); }
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <FeddaPanel className="overflow-hidden">
        {/* Header with Key */}
        <div className="border-b border-white/10 px-6 py-4 bg-black/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10">
                <Sparkles className="h-4.5 w-4.5 text-blue-300" />
              </div>
              <div>
                <div className="font-semibold text-lg tracking-[-0.3px]">Grok</div>
                <div className="text-[10px] text-white/40 tracking-[0.5px] -mt-px">xAI • Chat + Imagine</div>
              </div>
            </div>
            <div className="text-[10px] px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/50 font-mono tracking-widest">Supergrok ready</div>
          </div>

          {/* API Key Input */}
          <div className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4 text-white/50" />
            <div className="flex flex-col flex-1">
              <div className="text-[10px] text-white/60 mb-0.5">Grok Token (paste full "Bearer ..." from grok.com)</div>
              <input
                type="password"
                value={grokApiKey}
                onChange={e => saveGrokKey(e.target.value)}
                placeholder="Bearer eyJ..."
                className="rounded-lg fedda-input p-2 text-sm font-mono focus:border-blue-500/40"
              />
            </div>
            <div className="text-[10px] text-white/40">Stored locally only</div>
          </div>
          <div className="text-[10px] text-amber-400/70 mt-1">
            <strong>To use SuperGrok Heavy free credits (the 21% used, resets Jul 1):</strong><br/>
            1. Log into <a href="https://grok.com" target="_blank" className="underline">grok.com</a> with your SuperGrok account<br/>
            2. Press F12 (opens DevTools)<br/>
            3. At the top of DevTools, click the <strong>Network</strong> tab<br/>
            4. In the filter box (top left of Network), type <code>api.x.ai</code><br/>
            5. Send a message on grok.com<br/>
            6. In the list, click one of the "session" or "list?conversationId=..." rows that appeared after you chatted.<br/>
            7. On the **right panel**, click the <strong>Headers</strong> tab.<br/>
            8. Scroll down in "Request Headers".<br/>
            9. Look for a line that says <strong>authorization: Bearer eyJ...</strong> (it might be lower down, not at the top).<br/>
            10. Copy the ENTIRE value (starting with "Bearer eyJ..." all the way to the end).<br/>
            11. Paste that full string into the Grok token field in this page (the password input right above these instructions, next to the key icon).<br/>
            Note: Even if the :authority shows grok.com, the authorization header on chat-related requests is what we need.
          </div>
          <div className="text-[10px] text-red-400/80 mt-0.5 font-medium">
            Note: This is different from buying credits on console.x.ai. The token from grok.com uses your subscription usage.
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 -mx-1 px-6">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'chat' ? 'border-blue-500 text-white' : 'border-transparent text-white/60 hover:text-white/90'
            }`}
          >
            <Settings className="h-4 w-4" /> Chat
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'image' ? 'border-blue-500 text-white' : 'border-transparent text-white/60 hover:text-white/90'
            }`}
          >
            <ImageIcon className="h-4 w-4" /> Image Generation
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'chat' && (
            <div className="max-w-4xl mx-auto">
              <div className="space-y-4">
                {/* Chat Controls */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <select
                      value={chatModel}
                      onChange={(e) => setChatModel(e.target.value)}
                      className="rounded-lg fedda-input px-3 py-1.5 text-sm focus:border-blue-500/40"
                    >
                      {GROK_CHAT_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-white/60 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={enableWebSearch}
                        onChange={(e) => setEnableWebSearch(e.target.checked)}
                        className="accent-blue-500"
                      />
                      <Globe className="h-3.5 w-3.5" /> Web Search
                    </label>
                  </div>
                  <FeddaButton size="sm" variant="ghost" onClick={clearChat} className="gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </FeddaButton>
                </div>

                {/* Messages */}
                <div className="h-[420px] overflow-y-auto p-4 space-y-5 bg-black/30 rounded-2xl border border-white/10 custom-scrollbar">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5 border border-white/10'}`}>
                        {msg.images && msg.images.length > 0 && (
                          <div className="mb-2">
                            <div className="text-[10px] text-blue-400/80 mb-1 font-medium">Generated images</div>
                            <div className="flex flex-wrap gap-2">
                              {msg.images.map((img, i) => (
                                <div key={i} className="group relative">
                                  <img 
                                    src={img} 
                                    className="max-h-28 rounded-lg border border-white/10 cursor-pointer hover:scale-[1.02] transition" 
                                    alt="grok generated" 
                                    onClick={() => setLightboxImage(img)}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerMediaDownload(img, `grok-${msg.role}-${i + 1}.png`);
                                    }}
                                    className="absolute bottom-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition flex items-center justify-center"
                                    title="Download"
                                  >
                                    <Download className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        {msg.audio && (
                          <div className="mt-2">
                            <audio controls src={msg.audio} className="w-full max-w-[300px]" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isChatGenerating && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin" /> Thinking with Grok...
                      </div>
                    </div>
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                {/* Input */}
                <div>
                  {attachedImages.length > 0 && (
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {attachedImages.map((img, i) => (
                        <div key={i} className="relative group">
                          <img src={img} className="h-12 w-12 object-cover rounded-lg border border-white/10" />
                          <button onClick={() => removeAttachedImage(i)} className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 rounded-full opacity-80">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => chatFileInputRef.current?.click()}
                      className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                      title="Attach image"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <input ref={chatFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} />

                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="Ask Grok anything... (try 'generate an image of ... at sunset')"
                      className="flex-1 resize-y min-h-[44px] max-h-32 rounded-2xl fedda-input p-3 text-sm focus:border-blue-500/40"
                      rows={1}
                    />
                    <FeddaButton
                      onClick={sendChatMessage}
                      disabled={isChatGenerating || (!chatInput.trim() && attachedImages.length === 0) || !grokApiKey}
                      variant="cyan"
                      className="h-10 px-5 gap-2"
                    >
                      {isChatGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </FeddaButton>
                  </div>
                  <div className="text-[10px] text-white/40 mt-1.5 px-1">Uses your Grok API key. Supports image gen requests via tools if available in your subscription tier.</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'image' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="h-3.5 w-3.5 text-white/50" />
                    <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Prompt</div>
                  </div>
                  <textarea
                    value={imgPrompt}
                    onChange={e => setImgPrompt(e.target.value)}
                    placeholder="A cinematic portrait of a cyberpunk samurai in neon rain..."
                    className="w-full min-h-[90px] resize-y rounded-xl fedda-input p-4 text-sm focus:border-blue-500/40"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sliders className="h-3.5 w-3.5 text-white/50" />
                      <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Model</div>
                    </div>
                    <select
                      value={imgModel}
                      onChange={e => setImgModel(e.target.value)}
                      className="w-full rounded-xl fedda-input p-3 text-sm focus:border-blue-500/40"
                    >
                      {GROK_IMAGE_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-amber-400/70 mt-1">Grok Imagine via xAI. Higher limits with SuperGrok.</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Negative Prompt</div>
                    </div>
                    <input
                      type="text"
                      value={negativePrompt}
                      onChange={e => setNegativePrompt(e.target.value)}
                      placeholder="blurry, low quality, deformed"
                      className="w-full rounded-xl fedda-input p-3 text-sm focus:border-blue-500/40"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="h-3.5 w-3.5 text-white/50" />
                    <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Dimensions</div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Width</div>
                      <input type="number" value={width} onChange={e=>setWidth(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-blue-500/40" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Height</div>
                      <input type="number" value={height} onChange={e=>setHeight(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-blue-500/40" />
                    </div>
                  </div>
                </div>

                <div className="pt-1">
                  <FeddaButton
                    variant="cyan"
                    onClick={generateImage}
                    disabled={isImgGenerating || !imgPrompt.trim() || !grokApiKey}
                    className="w-full h-11 text-base font-semibold tracking-tight flex items-center justify-center gap-3 rounded-2xl active:scale-[0.985] transition-all disabled:opacity-60"
                  >
                    {isImgGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Generating with Grok Imagine...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4.5 w-4.5" />
                        <span>Generate Image with Grok</span>
                      </>
                    )}
                  </FeddaButton>
                </div>

                {imgError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">{imgError}</div>
                    <FeddaButton size="sm" variant="ghost" onClick={() => { setImgError(''); generateImage(); }} className="text-red-300 hover:text-red-100 border-red-500/30">
                      Retry
                    </FeddaButton>
                  </div>
                )}

                {images.length > 0 && (
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Generated Images</div>
                        <div className="text-[10px] px-1.5 py-px rounded bg-white/5 text-white/40 font-mono">{images.length}</div>
                      </div>
                      <button onClick={() => setImages([])} className="text-xs text-white/50 hover:text-white/80 transition">CLEAR</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {images.map((src, i) => (
                        <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/50 aspect-square">
                          <img 
                            src={src} 
                            alt={`Grok image ${i + 1}`} 
                            className="absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.025] cursor-pointer" 
                            onClick={() => setLightboxImage(src)}
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/80 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerMediaDownload(src, `grok-${imgModel}-${Date.now()}.png`);
                            }}
                            className="absolute bottom-3 right-3 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 text-black text-xs font-semibold tracking-wide hover:bg-white transition shadow-lg active:scale-95"
                          >
                            <Download className="h-3.5 w-3.5" /> DOWNLOAD
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxImage(src);
                            }}
                            className="absolute top-3 right-3 px-2 py-1 rounded-full bg-white/80 text-black text-[10px] font-medium hover:bg-white transition opacity-0 group-hover:opacity-100"
                          >
                            Fullscreen
                          </button>
                          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/60 text-[10px] font-mono text-white/60 backdrop-blur">
                            {i + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </FeddaPanel>

      {lightboxImage && (
        <Lightbox 
          imageUrl={lightboxImage} 
          onClose={() => setLightboxImage(null)} 
        />
      )}
    </div>
  );
}
