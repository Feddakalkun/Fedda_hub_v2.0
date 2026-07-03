import { useState, useRef, useEffect } from 'react';
import { FeddaButton, FeddaPanel } from '../components/ui/FeddaPrimitives';
import { useToast } from '../components/ui/Toast';
import { Send, Loader2, Trash2, Image as ImageIcon, Globe, Settings } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

const VENICE_CHAT_MODELS = [
  { id: 'zai-org-glm-5-1', label: 'GLM 5.1 (Strong Reasoning & Tools)' },
  { id: 'kimi-k2-6', label: 'Kimi K2.6' },
  { id: 'qwen3-6-27b', label: 'Qwen 3 27B' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Anonymized)' },
];

export function VeniceChatPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your Venice Agent. I can chat, search the web, analyze images, and more. What would you like to do?" }
  ]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('zai-org-glm-5-1');
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    e.target.value = ''; // reset
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearChat = () => {
    setMessages([
      { role: 'assistant', content: "Chat cleared. How can I help you today?" }
    ]);
    setAttachedImages([]);
  };

  const sendMessage = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      toast('Set your Venice.ai API key in the top bar first', 'error');
      return;
    }
    if (!input.trim() && attachedImages.length === 0) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setAttachedImages([]);

    setIsGenerating(true);

    // Build messages for API
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

    const body: any = {
      model,
      messages: apiMessages,
      stream: true,
      temperature,
      venice_parameters: {
        enable_web_search: enableWebSearch ? 'auto' : 'off',
        enable_web_citations: true,
        include_venice_system_prompt: true,
      }
    };

    try {
      const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
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

      // Add empty assistant message for streaming
      const assistantMsgIndex = newMessages.length;
      setMessages([...newMessages, { role: 'assistant', content: '' }]);

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                done = true;
                break;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  assistantContent += delta;
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[assistantMsgIndex] = {
                      role: 'assistant',
                      content: assistantContent,
                    };
                    return updated;
                  });
                }
              } catch {
                // ignore parse errors for partial chunks
              }
            }
          }
        }
      }

      // Final cleanup
      if (assistantContent) {
        setMessages(prev => {
          const updated = [...prev];
          updated[assistantMsgIndex] = { role: 'assistant', content: assistantContent };
          return updated;
        });
      }
    } catch (e: any) {
      console.error(e);
      toast(e.message || 'Failed to get response from Venice', 'error');
      // Remove the failed assistant placeholder if it exists
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto h-[calc(100vh-120px)] flex flex-col">
      <FeddaPanel className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
              <Settings className="h-4 w-4 text-violet-300" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">Venice Agent</div>
              <div className="text-[10px] text-white/40 -mt-0.5">Chat • Tools • Vision • Web Search</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableWebSearch}
                  onChange={(e) => setEnableWebSearch(e.target.checked)}
                  className="accent-violet-500"
                />
                <Globe className="h-3.5 w-3.5" />
                Web Search
              </label>
            </div>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg fedda-input px-3 py-1.5 text-sm focus:border-violet-500/40"
            >
              {VENICE_CHAT_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            <FeddaButton size="sm" variant="ghost" onClick={clearChat} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </FeddaButton>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' 
                ? 'bg-white/10 text-white' 
                : 'bg-white/5 border border-white/10'}`}>
                
                {msg.images && msg.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {msg.images.map((img, i) => (
                      <img key={i} src={img} className="max-h-32 rounded-lg border border-white/10" alt="attached" />
                    ))}
                  </div>
                )}

                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-white/10 p-4 bg-black/20">
          {/* Attached images preview */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img} className="h-14 w-14 object-cover rounded-lg border border-white/10" />
                  <button
                    onClick={() => removeAttachedImage(i)}
                    className="absolute -top-1 -right-1 bg-red-500/80 text-white text-[10px] px-1 rounded-full opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
              title="Attach image (for vision models)"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageAttach}
            />

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the Venice Agent anything... (Shift+Enter for new line)"
              className="flex-1 resize-y min-h-[48px] max-h-[140px] rounded-2xl fedda-input p-3 text-sm focus:border-violet-500/40"
              rows={1}
            />

            <FeddaButton
              onClick={sendMessage}
              disabled={isGenerating || (!input.trim() && attachedImages.length === 0)}
              variant="violet"
              className="h-10 px-5 gap-2"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </FeddaButton>
          </div>

          <div className="text-[10px] text-white/40 mt-2 flex items-center justify-between px-1">
            <div>Powered by Venice API • Same key as image generation</div>
            <div>Web search: {enableWebSearch ? 'Auto' : 'Off'}</div>
          </div>
        </div>
      </FeddaPanel>
    </div>
  );
}
