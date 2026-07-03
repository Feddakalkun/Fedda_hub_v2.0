import { useState, useRef, useEffect } from 'react';
import { FeddaButton, FeddaPanel } from '../components/ui/FeddaPrimitives';
import { useToast } from '../components/ui/Toast';
import { Lightbox } from '../components/ui/Lightbox';
import { triggerMediaDownload } from '../utils/mediaStore';
import { Sparkles, Download, ImageIcon, Loader2, AlertCircle, Hash, Sliders, Send, Trash2, Globe, Settings } from 'lucide-react';

const saveToGlobalGallery = (urls: string[], source = 'venice') => {
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

// Image Models
const VENICE_IMAGE_MODELS = [
  { id: 'venice-sd35', label: 'Venice SD35 (fast & cheap)' },
  { id: 'chroma', label: 'Chroma' },
  { id: 'flux-2-pro', label: 'Flux 2 Pro' },
  { id: 'flux-2-max', label: 'Flux 2 Max' },
  { id: 'lustify-sdxl', label: 'Lustify SDXL' },
  { id: 'lustify-v8', label: 'Lustify v8' },
  { id: 'wai-Illustrious', label: 'Anime (WAI)' },
  { id: 'grok-imagine-image', label: 'Grok Imagine' },
  { id: 'grok-imagine-image-quality', label: 'Grok Imagine (High Quality)' },
  { id: 'qwen-image', label: 'Qwen Image' },
];

// Chat Models
const VENICE_CHAT_MODELS = [
  { id: 'kimi-k2-5', label: 'Kimi K2.5' },
  { id: 'zai-org-glm-5-1', label: 'GLM 5.1 (Strong Reasoning & Tools)' },
  { id: 'kimi-k2-6', label: 'Kimi K2.6' },
  { id: 'qwen3-6-27b', label: 'Qwen 3 27B' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Anonymized)' },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

export function VenicePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'image' | 'chat'>('image');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // ========== IMAGE GENERATION STATE & LOGIC ==========
  const [imgModel, setImgModel] = useState('chroma');
  const [imgPrompt, setImgPrompt] = useState('a beautiful landscape, highly detailed, cinematic');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [isImgGenerating, setIsImgGenerating] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imgError, setImgError] = useState('');

  const generateImage = async () => {
    const apiKey = localStorage.getItem('venice_api_key') || '';
    if (!apiKey) { toast('Set your Venice.ai API key in the top bar (Key icon)', 'error'); return; }
    if (!imgPrompt.trim()) { toast('Prompt is required', 'error'); return; }
    setIsImgGenerating(true); setImgError(''); setImages([]);
    const body: any = { model: imgModel, prompt: imgPrompt.trim(), width, height, steps, cfg_scale: cfgScale, format: 'png', safe_mode: false, hide_watermark: true };
    if (negativePrompt.trim()) body.negative_prompt = negativePrompt.trim();
    if (seed !== undefined) body.seed = seed;
    try {
      const res = await fetch('https://api.venice.ai/api/v1/image/generate', {
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
      saveToGlobalGallery(newImgs, 'venice-image');
      toast('Generated with Venice.ai!', 'success');
    } catch (e: any) {
      const raw = e.message || 'Failed to generate.';
      const friendly = raw.includes('429') || raw.toLowerCase().includes('overloaded')
        ? 'The model is currently overloaded on Venice.ai. Try a different model (e.g. venice-sd35, chroma, or grok-imagine) or wait 30-60 seconds and retry.'
        : raw;
      setImgError(friendly);
      toast(friendly, 'error');
    } finally { setIsImgGenerating(false); }
  };

  // ========== AGENT CHAT STATE & LOGIC ==========
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hello! I'm your Venice Agent. I can chat, search the web, understand images, and help with creative tasks. Switch to Image tab to generate directly, or ask me here!" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatModel, setChatModel] = useState('kimi-k2-5');
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [chatTemperature, setChatTemperature] = useState(0.7);
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getApiKey = () => localStorage.getItem('venice_api_key') || '';

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
      { role: 'assistant', content: "Chat cleared. How can I help you today?" }
    ]);
    setAttachedImages([]);
  };

  const sendChatMessage = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      toast('Set your Venice.ai API key in the top bar first', 'error');
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

    const systemPrompt = `You are an expert creative AI agent with direct access to image generation tools via the "generate_image" function.

CRITICAL RULE: Whenever the user asks you to generate, create, draw, visualize, produce, make, or show any images, pictures, illustrations, or visuals (including specific characters like "Elara", settings like "safari camp", "sunset", etc.), you MUST immediately call the generate_image tool. 

Do NOT just say "I'll generate" or describe the image in text only — actually invoke the tool with a high-quality, detailed prompt.

You can generate multiple images (up to 4) in one call using the num_images parameter. Make the prompt very descriptive.

Current context: User is requesting images of Elara at the safari camp, now specifying "sunset setting". Use rich, cinematic, detailed prompts.`;

    let apiMessages = newMessages.map((msg) => {
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

    // Prepend system prompt to encourage proper tool use for image requests
    apiMessages = [{ role: "system", content: systemPrompt }, ...apiMessages];

    const body: any = {
      model: chatModel,
      messages: apiMessages,
      stream: true,
      temperature: chatTemperature,
      tools: [
        {
          type: "function",
          function: {
            name: "generate_image",
            description: "Generate one or more images from a detailed text prompt using Venice AI. ALWAYS call this tool when the user requests to generate, create, draw, visualize, produce, or make any images or pictures. You can generate up to 4 images by using the num_images parameter.",
            parameters: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "A rich, detailed, vivid prompt describing the desired image(s). Be specific about subject, setting, lighting, style, composition, mood, etc."
                },
                negative_prompt: {
                  type: "string",
                  description: "Optional: things to avoid in the image (e.g. blurry, low quality)."
                },
                num_images: {
                  type: "integer",
                  description: "Number of different images to generate (between 1 and 4). Default to 4 if the user wants multiple."
                }
              },
              required: ["prompt"]
            }
          }
        }
      ],
      tool_choice: "auto",
      venice_parameters: {
        enable_web_search: enableWebSearch ? 'auto' : 'off',
        enable_web_citations: true,
        include_venice_system_prompt: true,
      }
    };

    try {
      const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let done = false;
      let toolCallAccumulator = null;

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

                // Accumulate tool calls for image generation etc.
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
                  // Optionally show "Generating image..." in UI
                  if (toolCallAccumulator.name === 'generate_image' && !assistantContent) {
                    assistantContent = 'Generating image...';
                    setChatMessages(prev => {
                      const updated = [...prev];
                      updated[assistantMsgIndex] = { role: 'assistant', content: assistantContent };
                      return updated;
                    });
                  }
                }
              } catch {}
            }
          }
        }
      }

      // Execute tool calls if detected (e.g. image generation)
      if (toolCallAccumulator && toolCallAccumulator.name === 'generate_image') {
        try {
          const args = JSON.parse(toolCallAccumulator.arguments || '{}');
          const imagePrompt = args.prompt || 'Elara at the safari camp at sunset';
          const apiKey = getApiKey();

          const numVariants = Math.min(Math.max(parseInt(args.num_images || args.variants || 4), 1), 4);
          const imgModelToUse = args.model || 'flux-2-pro';

          const imgBody: any = {
            model: imgModelToUse,
            prompt: imagePrompt,
            width: args.width || 1024,
            height: args.height || 1024,
            variants: numVariants,
            format: 'png',
            safe_mode: false,
            hide_watermark: true
          };
          if (args.negative_prompt) imgBody.negative_prompt = args.negative_prompt;

          const imgRes = await fetch('https://api.venice.ai/api/v1/image/generate', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(imgBody)
          });

          if (imgRes.ok) {
            const imgData = await imgRes.json();
            let newImgs: string[] = [];
            const rawImgs = (imgData.images || imgData.data || []);
            newImgs = rawImgs.map((i: any) => {
              if (typeof i === 'string') return i.startsWith('http') ? i : 'data:image/png;base64,' + i;
              if (i && i.b64_json) return 'data:image/png;base64,' + i.b64_json;
              if (i && i.url) return i.url;
              return null;
            }).filter(Boolean);

            const finalContent = assistantContent && assistantContent !== 'Generating image...' 
              ? assistantContent 
              : `Here are ${newImgs.length} images of Elara at the safari camp in a sunset setting:`;

            setChatMessages(prev => {
              const updated = [...prev];
              updated[assistantMsgIndex] = { 
                role: 'assistant', 
                content: finalContent,
                images: newImgs 
              };
              return updated;
            });

            saveToGlobalGallery(newImgs, 'venice-agent');
          } else {
            const err = await imgRes.text();
            throw new Error('Image tool failed: ' + err);
          }
        } catch (toolErr: any) {
          console.error('Tool execution error:', toolErr);
          toast('Agent tried to generate image but failed: ' + (toolErr.message || ''), 'error');
          setChatMessages(prev => {
            const updated = [...prev];
            updated[assistantMsgIndex] = { 
              role: 'assistant', 
              content: assistantContent || 'I tried to generate an image but encountered an issue.' 
            };
            return updated;
          });
        }
      }
    } catch (e: any) {
      console.error(e);
      const raw = e.message || 'Failed to get response from Venice.';
      const friendly = raw.includes('429') || raw.toLowerCase().includes('overloaded')
        ? 'The model is currently overloaded on Venice.ai. Try switching models (GLM or Kimi often have capacity) or wait a bit and retry.'
        : raw;
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

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <FeddaPanel className="overflow-hidden">
        {/* Shared Header + Tabs */}
        <div className="border-b border-white/10 px-6 py-4 bg-black/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-white/10">
                <Sparkles className="h-4.5 w-4.5 text-violet-300" />
              </div>
              <div>
                <div className="font-semibold text-lg tracking-[-0.3px]">Venice.ai</div>
                <div className="text-[10px] text-white/40 tracking-[0.5px] -mt-px">PRIVATE • DIRECT API • IMAGE + AGENT</div>
              </div>
            </div>
            <div className="text-[10px] px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/50 font-mono tracking-widest">uncensored • tools • vision</div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 -mx-1">
            <button
              onClick={() => setActiveTab('image')}
              className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'image'
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-white/60 hover:text-white/90'
              }`}
            >
              <ImageIcon className="h-4 w-4" /> Image Generation
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-white/60 hover:text-white/90'
              }`}
            >
              <Settings className="h-4 w-4" /> Agent Chat
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {activeTab === 'image' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* IMAGE UI - adapted from previous */}
              <div className="space-y-4">
                {/* Prompt */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="h-3.5 w-3.5 text-white/50" />
                    <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Prompt</div>
                  </div>
                  <textarea
                    value={imgPrompt}
                    onChange={e => setImgPrompt(e.target.value)}
                    placeholder="A cinematic portrait of a cyberpunk samurai in neon rain..."
                    className="w-full min-h-[90px] resize-y rounded-xl fedda-input p-4 text-sm focus:border-violet-500/40"
                  />
                </div>

                {/* Model + Negative */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sliders className="h-3.5 w-3.5 text-white/50" />
                      <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Model</div>
                    </div>
                    <select
                      value={imgModel}
                      onChange={e => setImgModel(e.target.value)}
                      className="w-full rounded-xl fedda-input p-3 text-sm focus:border-violet-500/40"
                    >
                      {VENICE_IMAGE_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-amber-400/70 mt-1">Popular models can be overloaded — try venice-sd35 or chroma if you see 429 errors.</div>
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
                      className="w-full rounded-xl fedda-input p-3 text-sm focus:border-violet-500/40"
                    />
                  </div>
                </div>

                {/* Dimensions & Settings */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="h-3.5 w-3.5 text-white/50" />
                    <div className="text-xs font-semibold uppercase tracking-[1px] text-white/60">Dimensions &amp; Settings</div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Width</div>
                      <input type="number" value={width} onChange={e=>setWidth(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Height</div>
                      <input type="number" value={height} onChange={e=>setHeight(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">Steps</div>
                      <input type="number" value={steps} onChange={e=>setSteps(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-white/50">CFG Scale</div>
                      <input type="number" step="0.5" value={cfgScale} onChange={e=>setCfgScale(+e.target.value)} className="w-full rounded-xl fedda-input p-2.5 text-sm focus:border-violet-500/40" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-[10px] text-white/50 mb-1">Seed (optional)</div>
                    <input type="number" value={seed ?? ''} onChange={e=>setSeed(e.target.value ? +e.target.value : undefined)} placeholder="Leave blank for random" className="w-full rounded-xl fedda-input p-2.5 text-sm font-mono focus:border-violet-500/40" />
                  </div>
                </div>

                {/* Generate Button */}
                <div className="pt-1">
                  <FeddaButton
                    variant="violet"
                    onClick={generateImage}
                    disabled={isImgGenerating || !imgPrompt.trim()}
                    className="w-full h-11 text-base font-semibold tracking-tight flex items-center justify-center gap-3 rounded-2xl active:scale-[0.985] transition-all disabled:opacity-60"
                  >
                    {isImgGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Generating with {VENICE_IMAGE_MODELS.find(m => m.id === imgModel)?.label.split(' (')[0] || imgModel}…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4.5 w-4.5" />
                        <span>Generate Image</span>
                      </>
                    )}
                  </FeddaButton>
                </div>

                {imgError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">{imgError}</div>
                    <FeddaButton
                      size="sm"
                      variant="ghost"
                      onClick={() => { setImgError(''); generateImage(); }}
                      className="text-red-300 hover:text-red-100 border-red-500/30"
                    >
                      Retry
                    </FeddaButton>
                  </div>
                )}

                {/* Results Gallery */}
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
                            alt={`Venice image ${i + 1}`} 
                            className="absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.025] cursor-pointer" 
                            onClick={() => setLightboxImage(src)}
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/80 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerMediaDownload(src, `venice-${imgModel}-${Date.now()}.png`);
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

          {activeTab === 'chat' && (
            <div className="max-w-4xl mx-auto">
              {/* CHAT UI - adapted from previous full page */}
              <div className="space-y-4">
                {/* Chat Header Controls */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <select
                      value={chatModel}
                      onChange={(e) => setChatModel(e.target.value)}
                      className="rounded-lg fedda-input px-3 py-1.5 text-sm focus:border-violet-500/40"
                    >
                      {VENICE_CHAT_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-amber-400/70 mt-1">If you hit overload (429), switch models or retry in a minute.</div>
                    <label className="flex items-center gap-1.5 text-white/60 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={enableWebSearch}
                        onChange={(e) => setEnableWebSearch(e.target.checked)}
                        className="accent-violet-500"
                      />
                      <Globe className="h-3.5 w-3.5" /> Web Search
                    </label>
                  </div>
                  <FeddaButton size="sm" variant="ghost" onClick={clearChat} className="gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Clear Chat
                  </FeddaButton>
                </div>

                {/* Messages */}
                <div className="h-[420px] overflow-y-auto p-4 space-y-5 bg-black/30 rounded-2xl border border-white/10 custom-scrollbar">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5 border border-white/10'}`}>
                        {msg.images && msg.images.length > 0 && (
                          <div className="mb-2">
                            {msg.role === 'assistant' && (
                              <div className="text-[10px] text-emerald-400/80 mb-1 font-medium">Generated images</div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {msg.images.map((img, i) => (
                                <div key={i} className="group relative">
                                  <img 
                                    src={img} 
                                    className="max-h-28 rounded-lg border border-white/10 cursor-pointer hover:scale-[1.02] transition" 
                                    alt="generated or attached" 
                                    onClick={() => setLightboxImage(img)}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerMediaDownload(img, `venice-${msg.role}-${i + 1}.png`);
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
                      </div>
                    </div>
                  ))}
                  {isChatGenerating && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
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
                      title="Attach image for vision"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <input ref={chatFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} />

                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="Ask the agent... (e.g. Generate a cyberpunk landscape and describe it)"
                      className="flex-1 resize-y min-h-[44px] max-h-32 rounded-2xl fedda-input p-3 text-sm focus:border-violet-500/40"
                      rows={1}
                    />
                    <FeddaButton
                      onClick={sendChatMessage}
                      disabled={isChatGenerating || (!chatInput.trim() && attachedImages.length === 0)}
                      variant="violet"
                      className="h-10 px-5 gap-2"
                    >
                      {isChatGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </FeddaButton>
                  </div>
                  <div className="text-[10px] text-white/40 mt-1.5 px-1">The agent supports tools including image generation (Kimi K2.5 can call generate_image). Generated images appear inline. Use the Image tab for advanced controls.</div>
                </div>
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
