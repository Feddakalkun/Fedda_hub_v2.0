import { useState, useEffect, useRef } from 'react';
import {
  RefreshCw, Loader2,
  ChevronDown, ChevronUp, Check, FlameKindling,
  Layers, Sparkles, Film,
  Trash2, Plus, Zap, Play, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { PromptAssistant } from '../../components/ui/PromptAssistant';
import { LoraSelector } from '../../components/ui/LoraSelector';

const FRAME_COUNT = 6;

// ── Page ──────────────────────────────────────────────────────────────────────
export const Wan226FramesPage = () => {
  const [prompts, setPrompts] = usePersistentState<string[]>('wan22_6f_prompts', Array(FRAME_COUNT).fill(''));
  const [images, setImages] = usePersistentState<string[]>('wan22_6f_images', Array(FRAME_COUNT).fill(''));
  const [imageNames, setImageNames] = usePersistentState<string[]>('wan22_6f_image_names', Array(FRAME_COUNT).fill(''));
  
  const [seed, setSeed]             = usePersistentState('wan22_6f_seed', -1);
  const [nsfw, setNsfw]             = usePersistentState('wan22_6f_nsfw', true);
  const [loraHigh, setLoraHigh]     = usePersistentState('wan22_6f_lora_high', '');
  const [loraLow, setLoraLow]       = usePersistentState('wan22_6f_lora_low', '');
  const [loraStrengthHigh, setLoraStrengthHigh] = usePersistentState('wan22_6f_lora_high_strength', 1.0);
  const [loraStrengthLow, setLoraStrengthLow]   = usePersistentState('wan22_6f_lora_low_strength', 1.0);

  const [expanded, setExpanded] = useState<boolean[]>(Array(FRAME_COUNT).fill(true));
  const toggleExpand = (i: number) => setExpanded(prev => prev.map((v, idx) => idx === i ? !v : v));

  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);
  const [sessionVideos, setSessionVideos] = useState<string[]>([]);
  const [, setHistory] = usePersistentState<string[]>('wan22_6f_history', []);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const [isStoryboarding, setIsStoryboarding] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadRef = useRef<number>(-1);
  const sessionRef = useRef<string[]>([]);
  const prevCountRef = useRef(0);

  const { toast } = useToast();
  const { state: execState, clearOutputs, lastOutputVideos, outputReadyCount } = useComfyExecution();

  useEffect(() => {
    comfyService.getLoras().then((loras) => {
      const filtered = loras.filter((l) => {
        const n = l.replace(/\\/g, '/').toLowerCase();
        return n.startsWith('wan22/') || n.includes('wan2.2') || n.includes('wan22');
      });
      setAvailableLoras(filtered);
      if (!loraHigh) {
        const guessHigh = filtered.find((f) => /high/i.test(f));
        if (guessHigh) setLoraHigh(guessHigh);
      }
      if (!loraLow) {
        const guessLow = filtered.find((f) => /low/i.test(f));
        if (guessLow) setLoraLow(guessLow);
      }
    }).catch(() => {});
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────
  const triggerUpload = (index: number) => {
    activeUploadRef.current = index;
    fileInputRef.current?.click();
  };

  const handleUpload = async (file: File, index: number) => {
    setUploadingIdx(index);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      
      setImageNames(prev => {
        const n = [...prev];
        n[index] = data.filename;
        return n;
      });
      setImages(prev => {
        const n = [...prev];
        if (n[index] && n[index].startsWith('blob:')) URL.revokeObjectURL(n[index]);
        n[index] = URL.createObjectURL(file);
        return n;
      });
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingIdx(null);
    }
  };

  // ── Auto Storyboarding ────────────────────────────────────────────────────
  const generateStoryboard = async () => {
    if (isStoryboarding) return;
    setIsStoryboarding(true);
    
    try {
      // Step 1: Gather raw captions for all uploaded images
      const rawCaptions: string[] = [];
      const validIndices: number[] = [];
      toast('Analyzing images...', 'info');
      
      // Step 1: Gather raw captions for all uploaded images in PARALLEL
      toast('Analyzing scenes in parallel...', 'info');
      
      const captionPromises = Array.from({ length: FRAME_COUNT }).map(async (_, i) => {
        if (!imageNames[i]) return null;
        
        try {
          const fileUrl = images[i].startsWith('blob:') 
            ? images[i] 
            : `/comfy/view?filename=${encodeURIComponent(imageNames[i])}&type=input`;
            
          const res = await fetch(fileUrl);
          if (!res.ok) return null;
          
          const blob = await res.blob();
          const file = new File([blob], imageNames[i], { type: blob.type });
          
          const fd = new FormData();
          fd.append('file', file);
          fd.append('context', 'wan-scene');
          
          // Add a 30s timeout to captioning
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);
          
          const capRes = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_CAPTION}`, {
            method: 'POST', 
            body: fd,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (capRes.ok) {
            const capData = await capRes.json();
            return { index: i, caption: capData.caption };
          }
        } catch (e) {
          console.error(`Failed frame ${i+1}`, e);
        }
        return null;
      });

      const results = await Promise.all(captionPromises);
      
      for (const res of results) {
        if (res) {
          rawCaptions.push(`[FRAME ${res.index + 1} VISUALS]: ${res.caption}`);
          validIndices.push(res.index);
        }
      }
      
      if (rawCaptions.length === 0) {
        throw new Error('No valid images (or sessions expired). Please re-upload.');
      }

      toast('Directing story...', 'info');

      // Step 2: Ask the LLM to write a storyboard sequence based on these frames
      const combinedNarrative = rawCaptions.join('\n');
      const systemContext = `You are a high-end Hollywood cinematic director and AI prompt engineer.
Analyze these ${validIndices.length} keyframes and weave them into a TIGHT, Contiguous, and Thrilling cinematic sequence.
Describe the continuous motion, the fluid camera work, and the atmospheric evolution linking them.

EXACT OUTPUT FORMAT:
SCENE 1: [Dynamic visual prompt with motion and direction]
SCENE 2: [Dynamic visual prompt with motion and direction]
...and so on.

RULES:
- NO markdown. NO extra talk.
- Focus on FLUID MOTION and CONTIGUOUS ACTION.
- Keep each scene under 45 words.

Input frames:
${combinedNarrative}`;
      
      const payload = {
        context: 'wan-story',
        mode: 'inspire',
        current_prompt: systemContext
      };
      
      const promptRes = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.OLLAMA_PROMPT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!promptRes.ok) throw new Error('Failed to generate story');
      
      // Parse the SSE stream to get the final text natively
      const reader = promptRes.body!.getReader();
      const dec = new TextDecoder();
      let streamText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) streamText += parsed.token;
            } catch (e) {}
          }
        }
      }
      
      // Step 3: Map the output using the SCENE X: markers
      const storyText = streamText.trim();
      const storyParts = storyText.split(/SCENE \d+:/i).map(p => p.trim()).filter(p => p.length > 0);
      
      setPrompts(prev => {
        const newPrompts = [...prev];
        let pIdx = 0;
        for (const idx of validIndices) {
          if (pIdx < storyParts.length) {
            newPrompts[idx] = storyParts[pIdx];
            pIdx++;
          }
        }
        return newPrompts;
      });
      
      toast('Storyboard generated successfully!', 'success');
      
    } catch (err: any) {
      toast(err.message || 'Storyboarding failed', 'error');
    } finally {
      setIsStoryboarding(false);
    }
  };

  // ── Stream videos ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isGenerating && !pendingPromptId) return;
    if (!lastOutputVideos?.length) return;
    const newVids = lastOutputVideos.slice(prevCountRef.current);
    if (!newVids.length) return;
    prevCountRef.current = lastOutputVideos.length;
    const urls = newVids.map(v =>
      `/comfy/view?filename=${encodeURIComponent(v.filename)}&subfolder=${encodeURIComponent(v.subfolder)}&type=${v.type}`
    );
    sessionRef.current = [...sessionRef.current, ...urls];
    setSessionVideos([...sessionRef.current]);
    setHistory(prev => [...urls, ...prev.filter(u => !urls.includes(u))].slice(0, 40));
  }, [outputReadyCount, lastOutputVideos, isGenerating, pendingPromptId, setHistory]);

  // ── Completion ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingPromptId) return;
    if (execState === 'done') {
      setIsGenerating(false);
      setPendingPromptId(null);
      toast(`Done — ${sessionRef.current.length} video${sessionRef.current.length !== 1 ? 's' : ''} generated`, 'success');
    }
    if (execState === 'error') { setIsGenerating(false); setPendingPromptId(null); }
  }, [execState, pendingPromptId, toast]);

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    // Need at least first frame image and prompt
    if (!imageNames[0] || !prompts[0].trim() || isGenerating) return;
    
    sessionRef.current = [];
    prevCountRef.current = 0;
    setSessionVideos([]);
    setIsGenerating(true);
    clearOutputs();

    try {
      const bSeed = seed === -1 ? Math.floor(Math.random() * 1000000000) : Number(seed);
      const params: any = {
        seed: bSeed,
        nsfw: !!nsfw,
        client_id: comfyService.clientId,
      };

      for (let i = 0; i < FRAME_COUNT; i++) {
        params[`image${i+1}`] = imageNames[i] || imageNames[0]; // fallback to frame 1 if missing
        params[`prompt${i+1}`] = prompts[i].trim() || prompts[0].trim();
      }

      if (loraHigh) params.lora_high = { on: true, lora: loraHigh, strength: loraStrengthHigh };
      if (loraLow) params.lora_low = { on: true, lora: loraLow, strength: loraStrengthLow };

      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'wan22-img2vid-6frames',
          params
        }),
      });
      const data = await res.json();
      if (data.success) setPendingPromptId(data.prompt_id);
      else throw new Error(data.detail || 'Failed');
    } catch (err: any) {
      toast(err.message || 'Failed', 'error');
      setIsGenerating(false);
    }
  };

  const updatePrompt = (idx: number, val: string) => {
    setPrompts(prev => {
      const n = [...prev];
      n[idx] = val;
      return n;
    });
  };

  const clearShot = (idx: number) => {
    setImages(prev => {
      const n = [...prev];
      if (n[idx] && n[idx].startsWith('blob:')) URL.revokeObjectURL(n[idx]);
      n[idx] = '';
      return n;
    });
    setImageNames(prev => {
      const n = [...prev];
      n[idx] = '';
      return n;
    });
  };

  const resetAll = () => {
    if (!confirm('Clear all shots and prompts?')) return;
    images.forEach(img => { if (img?.startsWith('blob:')) URL.revokeObjectURL(img); });
    setImages(new Array(FRAME_COUNT).fill(''));
    setImageNames(new Array(FRAME_COUNT).fill(''));
    setPrompts(new Array(FRAME_COUNT).fill(''));
    toast('Project reset', 'info');
  };

  const currentGenVideo = sessionVideos.length > 0 ? sessionVideos[sessionVideos.length - 1] : null;

  return (
    <div className="flex h-full bg-[#030303] overflow-hidden">
      {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1 min-w-0 flex flex-col border-r border-white-[0.03] overflow-y-auto custom-scrollbar relative"
      >
        {/* Subtle Background Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-fuchsia-600/5 blur-[100px] pointer-events-none" />

        <div className="px-8 py-8 space-y-8 relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-violet-600/10 border border-violet-500/20">
                  <Layers className="w-4 h-4 text-violet-400" />
                </div>
                <h2 className="fedda-kicker">WAN 2.2 Storyboard</h2>
              </div>
              <p className="text-[10px] text-white/20 font-medium ml-8">Narrative-driven 6-frame cinematic sequence</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={resetAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest fedda-btn-ghost hover:text-rose-300"
                title="Reset everything"
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={generateStoryboard}
                disabled={isStoryboarding || imageNames.filter(Boolean).length === 0}
                className={`group flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  isStoryboarding || imageNames.filter(Boolean).length === 0
                    ? 'fedda-btn-ghost opacity-40 cursor-not-allowed'
                    : 'fedda-btn-soft-cyan shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_30px_rgba(139,92,246,0.2)]'
                }`}
              >
                {isStoryboarding ? (
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-violet-400 group-hover:text-violet-300 transition-colors" />
                )}
                {isStoryboarding ? 'Analyzing Sequence...' : 'Auto-Storyboard'}
              </motion.button>
            </div>
          </div>

          <input 
            ref={fileInputRef} 
            type="file" 
            accept="image/*" 
            className="hidden"
            onChange={e => {
              if (e.target.files?.[0] && activeUploadRef.current >= 0) {
                handleUpload(e.target.files[0], activeUploadRef.current);
              }
            }} 
          />

          {/* ── 6 SCENE SLOTS ── */}
          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence mode="popLayout">
              {Array.from({ length: FRAME_COUNT }).map((_, i) => (
                <motion.div 
                  key={`frame-card-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group relative"
                >
                  <div className={`relative bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden p-5 transition-all duration-500 ${images[i] ? 'hover:border-violet-500/30 hover:bg-white/[0.03]' : ''}`}>
                    
                    {/* Frame Index Badge */}
                    <div className="absolute top-5 right-5 z-20">
                      <div className="px-2 py-1 rounded bg-black/40 backdrop-blur-md border border-white/10">
                        <span className="text-[10px] font-mono font-bold text-white/30">#0{i + 1}</span>
                      </div>
                    </div>

                    <div className="flex gap-6">
                      
                      {/* Image Upload Block */}
                      <div className="w-[180px] flex-shrink-0">
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/5 group-hover:ring-violet-500/20 transition-all">
                          {!images[i] ? (
                            <div
                              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleUpload(f, i); }}
                              onDragOver={e => e.preventDefault()}
                              onClick={() => triggerUpload(i)}
                              className="w-full h-full cursor-pointer flex flex-col items-center justify-center p-4 group/drop"
                            >
                              {uploadingIdx === i ? (
                                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                              ) : (
                                <>
                                  <div className="w-10 h-10 rounded-full bg-white/[0.03] flex items-center justify-center mb-3 group-hover/drop:bg-violet-500/10 transition-colors">
                                    <Plus className="w-5 h-5 text-white/20 group-hover/drop:text-violet-400" />
                                  </div>
                                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Add Shot</p>
                                </>
                              )}
                            </div>
                          ) : (
                            <div 
                              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleUpload(f, i); }}
                              onDragOver={e => e.preventDefault()}
                              className="relative w-full h-full"
                            >
                              <div className="absolute top-2 right-2 z-[30] opacity-0 group-hover/drop:opacity-100 transition-opacity">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); clearShot(i); }}
                                  className="p-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white/40 hover:text-rose-400 hover:border-rose-400/20 transition-all"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="w-full h-full cursor-pointer" onClick={() => triggerUpload(i)}>
                                <img 
                                  src={images[i]} 
                                  alt={`Frame ${i+1}`} 
                                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                                  onError={(e) => {
                                    // Handle missing/expired blobs
                                    (e.target as HTMLImageElement).style.opacity = '0.2';
                                  }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2">
                                  <div className="p-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                                    <RefreshCw className="w-4 h-4 text-white" />
                                  </div>
                                  <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Switch Scene</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prompt Content Area */}
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${prompts[i].trim() ? 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.5)]' : 'bg-white/10'}`} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Cinematic Prompt</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {prompts[i].trim() && (
                              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-[8px] font-black text-emerald-400/80 uppercase">Ready</span>
                              </motion.div>
                            )}
                            <button 
                              onClick={() => toggleExpand(i)}
                              className="p-1 rounded hover:bg-white/5 transition-colors"
                            >
                              {expanded[i] ? <ChevronUp className="w-4 h-4 text-white/20" /> : <ChevronDown className="w-4 h-4 text-white/20" />}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {expanded[i] && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <PromptAssistant
                                context="wan-scene"
                                accent="violet"
                                compact={true}
                                value={prompts[i]}
                                onChange={(v) => updatePrompt(i, v)}
                                placeholder={i === 0 ? 'Describe the opening scene action...' : `Sequential evolution from shot ${i}...`}
                                minRows={4}
                                enableCaption={false}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        
                        {!expanded[i] && prompts[i] && (
                          <p className="text-[11px] text-white/40 line-clamp-1 italic font-serif pr-8">
                            {prompts[i]}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* ────── Divider ────── */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

          {/* LoRA Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <Zap className="w-3 h-3 text-violet-400" />
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">High Noise LoRA</p>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                <LoraSelector label="" value={loraHigh} onChange={setLoraHigh} strength={loraStrengthHigh} onStrengthChange={setLoraStrengthHigh} options={availableLoras} accent="violet" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <Zap className="w-3 h-3 text-fuchsia-400" />
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Low Noise LoRA</p>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                <LoraSelector label="" value={loraLow} onChange={setLoraLow} strength={loraStrengthLow} onStrengthChange={setLoraStrengthLow} options={availableLoras} accent="violet" />
              </div>
            </div>
          </div>

          {/* ── System Toggles ── */}
          <div className="flex gap-4">
            <div className="flex-1">
              <button 
                onClick={() => setNsfw(!nsfw)} 
                className={`w-full group flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-300 ${
                  nsfw 
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.05)]' 
                    : 'bg-white/[0.02] border-white/5 text-slate-500 grayscale hover:grayscale-0'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg transition-colors ${nsfw ? 'bg-rose-500/20' : 'bg-white/5'}`}>
                    <FlameKindling className={`w-4 h-4 ${nsfw ? 'text-rose-400' : 'text-slate-600'}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest">NSFW Mode</p>
                    <p className="text-[9px] opacity-40 font-medium">Toggle adult safety filters</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-all relative ${nsfw ? 'bg-rose-500' : 'bg-white/10'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${nsfw ? 'left-6' : 'left-1'}`} />
                </div>
              </button>
            </div>
            
            <div className="flex-1">
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-1.5 flex gap-1.5">
                <div className="flex-1 flex items-center gap-3 pl-4">
                  <RefreshCw className="w-3.5 h-3.5 text-white/20" />
                  <div className="text-left">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Global Seed</p>
                    <input 
                      type="number" 
                      value={seed} 
                      onChange={e => setSeed(parseInt(e.target.value))} 
                      className="bg-transparent border-none p-0 text-[11px] font-mono focus:ring-0 outline-none text-white w-full"
                    />
                  </div>
                </div>
                <button 
                  onClick={() => setSeed(-1)} 
                  className={`px-4 py-3 rounded-xl transition-all ${seed === -1 ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}
                >
                  <RefreshCw className={`w-4 h-4 ${seed === -1 ? 'animate-spin-slow' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* ── GENERATE ACT ── */}
          <div className="pt-4 pb-12">
            <motion.button 
              whileHover={(!imageNames[0] || !prompts[0].trim() || isGenerating) ? {} : { scale: 1.01, y: -2 }}
              whileTap={(!imageNames[0] || !prompts[0].trim() || isGenerating) ? {} : { scale: 0.99 }}
              disabled={!imageNames[0] || !prompts[0].trim() || isGenerating} 
              onClick={handleGenerate}
              className={`relative w-full py-6 rounded-3xl font-black text-sm uppercase tracking-[0.5em] transition-all duration-700 flex items-center justify-center gap-4 overflow-hidden shadow-2xl ${
                !imageNames[0] || !prompts[0].trim() || isGenerating 
                  ? 'bg-white/5 text-white/10 cursor-not-allowed border border-white-[0.03]' 
                  : 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 bg-[length:200%_auto] hover:bg-right text-white shadow-violet-600/30'
              }`}
            >
              {isGenerating && (
                <div className="absolute inset-0 bg-black/20 overflow-hidden">
                  <motion.div 
                    animate={{ x: ['-100%', '100%'] }} 
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"
                  />
                </div>
              )}
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              <span className="relative z-10">{isGenerating ? 'Rendering Story...' : 'Execute Sequence'}</span>
            </motion.button>
          </div>

        </div>
      </motion.div>

      {/* ══ RIGHT PREVIEW ════════════════════════════════════════════════════ */}
      <div className="w-[45%] flex flex-col bg-black relative">
        <div className="absolute inset-0 bg-[#050505]" />
        
        {/* Animated Background Gradients */}
        <div className="absolute top-1/4 left-1/4 w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[160px] animate-pulse" />
        
        {/* Output Previews */}
        <div className="p-12 flex-1 flex flex-col items-center justify-center relative z-10">
          <AnimatePresence mode="wait">
            {currentGenVideo ? (
              <motion.div 
                key="player"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full relative group"
              >
                <div className="absolute -inset-1 bg-gradient-to-tr from-violet-600/20 to-fuchsia-600/20 rounded-[2rem] blur-xl opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative rounded-[1.8rem] overflow-hidden bg-black ring-1 ring-white/10 shadow-2xl">
                  <video src={currentGenVideo} className="w-full aspect-video bg-black object-contain" autoPlay loop controls />
                  <div className="absolute top-6 left-6 flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-xl">
                    <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Cinematic Master</span>
                  </div>
                </div>
                
                {/* Result Controls */}
                <div className="mt-8 flex justify-center gap-4">
                  <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white/70 text-[10px] font-black uppercase tracking-widest">
                    <Trash2 className="w-4 h-4" /> Clear
                  </button>
                  <button className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/20 text-[10px] font-black uppercase tracking-widest">
                    <Eye className="w-4 h-4" /> Fullscreen
                  </button>
                </div>
              </motion.div>
            ) : isGenerating ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-8"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-violet-600/20 blur-2xl animate-pulse" />
                  <div className="relative w-24 h-24 rounded-full border-2 border-dashed border-violet-500/30 animate-spin-slow flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-xl font-serif italic text-white/80">"The art of storytelling is the art of sequence."</p>
                  <p className="text-[10px] font-black text-violet-400/50 uppercase tracking-[0.3em]">Processing Frames {outputReadyCount} of 1</p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                className="text-center space-y-6"
              >
                <div className="w-32 h-32 rounded-3xl border border-dashed border-white/10 flex items-center justify-center mx-auto">
                  <Film className="w-12 h-12 text-white/10" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50">Director's Monitor</p>
                  <p className="text-[10px] text-white/20 font-medium">Ready for capture sequence</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
