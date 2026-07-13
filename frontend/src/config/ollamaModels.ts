export interface OllamaCatalogEntry {
  id: string;
  label: string;
  description: string;
  tag: 'SFW' | 'Uncensored';
}

export const TEXT_MODELS: OllamaCatalogEntry[] = [
  // ── Popular SFW ──────────────────────────────────────────────────────────
  { id: 'llama3.1:8b', label: 'Llama 3.1 8B', description: 'Meta\'s all-rounder - fast, reliable prompt writing.', tag: 'SFW' },
  { id: 'qwen2.5:7b', label: 'Qwen 2.5 7B', description: 'Great instruction following, strong at structured prompts.', tag: 'SFW' },
  { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B', description: 'Bigger Qwen - noticeably smarter stories, still fits 24GB.', tag: 'SFW' },
  { id: 'gemma2:9b', label: 'Gemma 2 9B', description: 'Google\'s mid-size - creative, natural language.', tag: 'SFW' },
  { id: 'mistral-nemo:12b', label: 'Mistral Nemo 12B', description: 'Long context, vivid descriptive writing.', tag: 'SFW' },
  { id: 'phi4', label: 'Phi-4 14B', description: 'Microsoft\'s reasoning model - precise, follows format rules well.', tag: 'SFW' },
  // ── Popular Uncensored / NSFW ────────────────────────────────────────────
  { id: 'dolphin3:8b', label: 'Dolphin 3.0 8B', description: 'The go-to uncensored Llama 3.1 - obedient and creative.', tag: 'Uncensored' },
  { id: 'goonsai/qwen2.5-3B-goonsai-nsfw-100k', label: 'Qwen 2.5 3B NSFW (Goonsai)', description: 'NSFW-tuned Qwen, great for creative prompts/roleplay.', tag: 'Uncensored' },
  { id: 'zarigata/unfiltered-llama3', label: 'Unfiltered Llama 3', description: 'Fully unrestricted Llama3, no filters.', tag: 'Uncensored' },
  { id: 'cognitivecomputations/dolphin-2.9.3-mistral-nemo-12b', label: 'Dolphin Mistral Nemo 12B', description: 'Strong for anything-goes tasks (active 2026).', tag: 'Uncensored' },
  { id: 'ehartford/dolphin-2.7-mixtral-8x7b', label: 'Dolphin Mixtral 8x7B', description: 'Classic uncensored Mixtral, top for creative/NSFW (heavy download).', tag: 'Uncensored' },
  { id: 'llama2-uncensored', label: 'Llama 2 Uncensored 7B', description: 'Small, fast, zero refusals - light on VRAM.', tag: 'Uncensored' },
];

export const VISION_MODELS: OllamaCatalogEntry[] = [
  { id: 'llama3.2-vision', label: 'Llama 3.2 Vision (Original)', description: 'Meta\'s vision model, excels at detailed captioning.', tag: 'SFW' },
  { id: 'llama3.2-vision:11b', label: 'Llama 3.2 Vision 11B (Light)', description: 'Lighter 11B version, good for ComfyUI workflows.', tag: 'SFW' },
  { id: 'llava', label: 'LLaVA (General)', description: 'Solid for general image descriptions.', tag: 'SFW' },
  { id: 'minicpm-v:8b', label: 'MiniCPM-V 8B', description: 'Fast, accurate captioner - light on VRAM.', tag: 'SFW' },
  { id: 'user-v4/joycaption-beta', label: 'JoyCaption Beta', description: 'Uncensored JoyCaption (Llama-based VLM) - describes anything.', tag: 'Uncensored' },
];
