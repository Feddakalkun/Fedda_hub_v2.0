import { Bot, Download, Film, Images, LayoutDashboard, Sparkles, Video, Volume2, Heart, Wand2, type LucideIcon } from 'lucide-react';

export type ModulePack = 'core' | 'booster';
export type ModuleArea = 'home' | 'image' | 'video' | 'system' | 'automation';

export type SourceModuleId =
  | 'core-shell'
  | 'z-image-core'
  | 'z-image-advanced'
  | 'sdxl-pack'
  | 'chroma-image'
  | 'firered-image'
  | 'qwen-image'
  | 'wan-video'
  | 'ltx-video'
  | 'flux-klein'
  | 'flux-klein-uncensored'
  | 'krea2-txt2img'
  | 'ideogram';

export interface FeddaModule {
  id: string;
  sourceModuleId: SourceModuleId;
  requiresAnyOf?: SourceModuleId[];
  label: string;
  description: string;
  area: ModuleArea;
  pack: ModulePack;
  tabs: string[];
  workflows?: string[];
  defaultTab: string;

  Icon: LucideIcon;
  card?: {
    poster?: string;
    video?: string;
  };
}

export const APP_VERSION_LABEL = 'FEDDA Hub v2.0';
export const ACTIVE_TAB_STORAGE_KEY = 'fedda_v21_active_tab';

const veniceCard = (index: number) => ({
  poster: `/cards/new/venice/${index}.jpeg`,
  video: `/cards/new/venice/${index}.mp4`,
});

export const FEDDA_MODULES: FeddaModule[] = [
  {
    id: 'image-studio',
    sourceModuleId: 'z-image-core',
    requiresAnyOf: ['z-image-core', 'z-image-advanced', 'sdxl-pack', 'qwen-image', 'chroma-image', 'firered-image', 'flux-klein', 'flux-klein-uncensored', 'ideogram'],
    label: 'Image Studio',
    description: 'Text, reference and LoRA-driven image workflows synced with ComfyUI.',
    area: 'home',
    pack: 'core',
    tabs: ['image'],
    defaultTab: 'image',
    Icon: Sparkles,
    card: veniceCard(1),
  },
  {
    id: 'video-studio',
    sourceModuleId: 'wan-video',
    requiresAnyOf: ['wan-video', 'ltx-video'],
    label: 'Video Studio',
    description: 'WAN and LTX motion workflows with a consistent workbench layout.',
    area: 'home',
    pack: 'booster',
    tabs: ['video'],
    defaultTab: 'video',
    Icon: Video,
    card: veniceCard(2),
  },
  {
    id: 'gallery',
    sourceModuleId: 'core-shell',
    label: 'Gallery',
    description: 'One unified place for generated images and videos.',
    area: 'system',
    pack: 'core',
    tabs: ['gallery'],
    defaultTab: 'gallery',
    Icon: Images,
    card: veniceCard(3),
  },
  {
    id: 'lora-character',
    sourceModuleId: 'core-shell',
    label: 'LoRA & Character',
    description: 'Install, import and manage LoRA character packs for active workflows.',
    area: 'system',
    pack: 'core',

    tabs: ['library'],
    defaultTab: 'library',
    Icon: LayoutDashboard,
    card: veniceCard(4),
  },
  {
    id: 'ollama-models',
    sourceModuleId: 'core-shell',
    label: 'Ollama Models',
    description: 'Download and remove local text and vision models used by FEDDA tools.',
    area: 'system',
    pack: 'core',

    tabs: ['ollama'],
    defaultTab: 'ollama',
    Icon: Bot,
    card: veniceCard(5),
  },
  {
    id: 'venice',
    sourceModuleId: 'core-shell',
    label: 'Venice.ai',
    description: 'Image generation + Agent chat with web search, vision & tools using your API key.',
    area: 'home',
    pack: 'core',

    tabs: ['venice'],
    defaultTab: 'venice',
    Icon: Sparkles,
    card: veniceCard(6),
  },
  {
    id: 'grok',
    sourceModuleId: 'core-shell',
    label: 'Grok',
    description: 'Chat with Grok and generate images using your xAI/SuperGrok subscription or API key.',
    area: 'home',
    pack: 'core',

    tabs: ['grok'],
    defaultTab: 'grok',
    Icon: Sparkles,
    card: veniceCard(24),
  },
  {
    id: 'zonos-tts',
    sourceModuleId: 'core-shell',
    label: 'Voice Studio',
    description: 'Generate speech from text — fast Edge neural voices or natural Chatterbox with voice cloning. Send clips straight to Audio to Video.',
    area: 'system',
    pack: 'core',

    tabs: ['zonos-tts'],
    defaultTab: 'zonos-tts',
    Icon: Volume2,
    card: veniceCard(35),
  },
  {
    id: 'media-downloader',
    sourceModuleId: 'core-shell',
    label: 'Media Downloader',
    description: 'Download TikTok, YouTube, Instagram and any yt-dlp URL. Send videos directly to WAN or LTX workflows.',
    area: 'home',
    pack: 'core',
    tabs: ['media-downloader'],
    defaultTab: 'media-downloader',
    Icon: Download,
    card: { poster: '/cards/new/venice/33.jpeg' },
  },
  {
    id: 'transform-reel',
    sourceModuleId: 'core-shell',
    label: 'Transform Reel',
    description: 'The viral beat-drop transformation: photo → character version of the same frame → seamless morph video, ready for reels.',
    area: 'automation',
    pack: 'core',
    tabs: ['transform-reel'],
    defaultTab: 'transform-reel',
    Icon: Wand2,
    card: veniceCard(36),
  },
  {
    id: 'reel-machine',
    sourceModuleId: 'core-shell',
    label: 'Reel Machine',
    description: 'Photo + sound in, finished viral reel out — outfit switches cut on every beat, or a full transformation morph. Fully automatic.',
    area: 'automation',
    pack: 'core',
    tabs: ['reel-machine'],
    defaultTab: 'reel-machine',
    Icon: Film,
  },
  {
    id: 'scail-studio',
    sourceModuleId: 'core-shell',
    label: 'Scail Studio',
    description: 'Make or upload a character, dress her with inpaint, then bring her to motion with SCAIL-2 (motion step coming next).',
    area: 'automation',
    pack: 'core',
    tabs: ['scail-studio'],
    defaultTab: 'scail-studio',
    Icon: Sparkles,
  },
  {
    id: 'companion',
    sourceModuleId: 'core-shell',
    label: 'Companion',
    description: 'Your persistent AI friend and partner. Remembers everything with MemPalace, speaks with a natural voice, full intrigue and long-term memory.',
    area: 'system',
    pack: 'core',

    tabs: ['companion'],
    defaultTab: 'companion',
    Icon: Heart,
    card: veniceCard(25),
  },
  {
    id: 'z-image-basic',
    sourceModuleId: 'z-image-core',
    label: 'Z-Image Txt2Img',
    description: 'Fast core text-to-image generation.',
    area: 'image',
    pack: 'core',

    tabs: ['z-image', 'z-image-txt2img'],
    workflows: ['z-image'],
    defaultTab: 'z-image-txt2img',
    Icon: Sparkles,
    card: veniceCard(7),
  },
  {
    id: 'z-image-dual-lora',
    sourceModuleId: 'z-image-advanced',
    label: 'Z-Image Dual LoRA',
    description: 'Two-person LoRA image with selected-person refinement.',
    area: 'image',
    pack: 'booster',

    tabs: ['z-image-dual-lora'],
    workflows: ['z-image-dual-lora'],
    defaultTab: 'z-image-dual-lora',
    Icon: Sparkles,
    card: veniceCard(8),
  },
  {
    id: 'chroma1-hd',
    sourceModuleId: 'chroma-image',
    label: 'Chroma1-HD',
    description: 'Official Lodestones Chroma1-HD text-to-image base workflow.',
    area: 'image',
    pack: 'booster',

    tabs: ['chroma', 'chroma-txt2img'],
    workflows: ['chroma1-hd-txt2img'],
    defaultTab: 'chroma-txt2img',
    Icon: Sparkles,
    card: veniceCard(9),
  },
  {
    id: 'chroma-simple',
    sourceModuleId: 'chroma-image',
    label: 'Chroma Simple',
    description: 'Native Chroma comparison graph with softer defaults.',
    area: 'image',
    pack: 'booster',

    tabs: ['chroma-simple-txt2img'],
    workflows: ['chroma-simple-txt2img'],
    defaultTab: 'chroma-simple-txt2img',
    Icon: Sparkles,
    card: veniceCard(10),
  },
  {
    id: 'flux2-klein',
    sourceModuleId: 'flux-klein',
    label: 'FLUX2-KLEIN',
    description: 'FLUX2-KLEIN 9B image generation.',
    area: 'image',
    pack: 'booster',

    tabs: ['flux', 'flux-txt2img'],
    workflows: ['flux2klein-txt2img'],
    defaultTab: 'flux-txt2img',
    Icon: Sparkles,
    card: veniceCard(11),
  },
  {
    id: 'flux-klein-uncensored',
    sourceModuleId: 'flux-klein-uncensored',
    label: 'FLUX KLEIN UNCENSORED',
    description: 'FLUX KLEIN UNCENSORED image generation.',
    area: 'image',
    pack: 'booster',

    tabs: ['flux', 'flux-txt2img'],
    workflows: ['flux2klein-uncensored-txt2img'],
    defaultTab: 'flux-txt2img',
    Icon: Sparkles,
    card: veniceCard(31),
  },
  {
    id: 'krea2',
    sourceModuleId: 'krea2-txt2img',
    label: 'Krea2 Turbo',
    description: 'Krea2 Turbo text-to-image (fast 8-step, LoRA-ready).',
    area: 'image',
    pack: 'booster',

    tabs: ['krea2-turbo-txt2img'],
    workflows: ['krea2-turbo-txt2img'],
    defaultTab: 'krea2-turbo-txt2img',
    Icon: Sparkles,
    card: veniceCard(38),
  },
  {
    id: 'ideogram',
    sourceModuleId: 'ideogram',
    label: 'IDEOGRAM',
    description: 'Ideogram AI image generation with advanced text and style control.',
    area: 'image',
    pack: 'booster',

    tabs: ['ideogram', 'ideogram-txt2img'],
    workflows: ['ideogram-txt2img'],
    defaultTab: 'ideogram-txt2img',
    Icon: Sparkles,
    card: veniceCard(32),
  },
  {
    id: 'firered-image-edit',
    sourceModuleId: 'firered-image',
    label: 'FireRed Edit',
    description: 'Instruction-based image editing with FireRed 1.1.',
    area: 'image',
    pack: 'booster',

    tabs: ['firered-image-edit'],
    workflows: ['firered-image-edit'],
    defaultTab: 'firered-image-edit',
    Icon: Sparkles,
    card: veniceCard(12),
  },
  {
    id: 'qwen-image',
    sourceModuleId: 'qwen-image',
    label: 'Qwen Image',
    description: 'Pure text-to-image with Qwen Image (4-step Lightning).',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen', 'qwen-txt2img'],
    workflows: ['qwen-txt2img'],
    defaultTab: 'qwen-txt2img',
    Icon: Sparkles,
    card: veniceCard(13),
  },
  {
    id: 'qwen-reference',
    sourceModuleId: 'qwen-image',
    label: 'Qwen Reference',
    description: 'Edit or generate from a reference image + prompt.',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen-image-ref'],
    workflows: ['qwen-edit-2509-image-reference'],
    defaultTab: 'qwen-image-ref',
    Icon: Sparkles,
    card: veniceCard(14),
  },
  {
    id: 'qwen-rapid-edit-v23',
    sourceModuleId: 'qwen-image',
    label: 'Qwen Rapid Edit',
    description: 'Rapid AIO v23 NSFW image editing.',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen-rapid-edit-v23'],
    workflows: ['qwen-rapid-edit-v23'],
    defaultTab: 'qwen-rapid-edit-v23',
    Icon: Sparkles,
    card: veniceCard(15),
  },
  {
    id: 'qwen-multi-angle',
    sourceModuleId: 'qwen-image',
    label: 'Qwen Multi Angle',
    description: 'Generate angle variants from one input.',
    area: 'image',
    pack: 'booster',

    tabs: ['qwen-multi-angle'],
    workflows: ['qwen-multi-angles', 'qwen-multi-angles-fast'],
    defaultTab: 'qwen-multi-angle',
    Icon: Sparkles,
    card: veniceCard(16),
  },
  {
    id: 'sdxl-inpaint-automask',
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL INPAINT AUTOMASK',
    description: 'SDXL inpainting with automatic mask generation for targeted edits.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-inpaint-automask'],
    workflows: ['sdxl-inpaint-automask'],
    defaultTab: 'sdxl-inpaint-automask',
    Icon: Sparkles,
    card: veniceCard(26),
  },
  {
    id: 'sdxl-outpaint',
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL OUTPAINT',
    description: 'Extend an image outward with SDXL according to a prompt.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-outpaint'],
    workflows: ['sdxl-outpaint'],
    defaultTab: 'sdxl-outpaint',
    Icon: Sparkles,
    card: veniceCard(27),
  },
  {
    id: 'sdxl-controlnet-depth',
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL ControlNet Depth',
    description: 'Control the 3D depth and spatial layers of the image using a depth map.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-controlnet-depth'],
    workflows: ['sdxl-controlnet-depth'],
    defaultTab: 'sdxl-controlnet-depth',
    Icon: Sparkles,
    card: veniceCard(28),
  },
  {
    id: 'sdxl-controlnet-openpose',
    sourceModuleId: 'sdxl-pack',
    label: 'SDXL ControlNet OpenPose',
    description: 'Control exact character poses using OpenPose skeletons.',
    area: 'image',
    pack: 'booster',

    tabs: ['sdxl-controlnet-openpose'],
    workflows: ['sdxl-controlnet-openpose'],
    defaultTab: 'sdxl-controlnet-openpose',
    Icon: Sparkles,
    card: veniceCard(29),
  },
  {
    id: 'wan22-img2vid',
    sourceModuleId: 'wan-video',
    label: 'WAN 2.2 Img2Vid',
    description: 'Animate a still image with WAN 2.2 — single-shot, dual high/low LoRA slots.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan22xxx-img2vid'],
    workflows: ['wan22xxx-img2vid'],
    defaultTab: 'wan22xxx-img2vid',
    Icon: Video,
    card: veniceCard(18),
  },
  {
    id: 'wan22-vid2vid',
    sourceModuleId: 'wan-video',
    label: 'WAN 2.2 Vid2Vid',
    description: 'Transform and extend a video clip.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan22-vid2vid'],
    workflows: ['wan22-vid2vid'],
    defaultTab: 'wan22-vid2vid',
    Icon: Video,
    card: veniceCard(19),
  },
  {
    id: 'wan22-story',
    sourceModuleId: 'wan-video',
    label: 'WAN Story',
    description: 'Build video from a six-frame story sequence.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan22-img2vid-6frames'],
    workflows: ['wan22-img2vid-6frames'],
    defaultTab: 'wan22-img2vid-6frames',
    Icon: Video,
    card: veniceCard(20),
  },
  {
    id: 'steady-dancer',
    sourceModuleId: 'wan-video',
    label: 'Steady Dancer',
    description: 'Transfer dance motion from reference video.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan21-steady-dancer'],
    workflows: ['wan21-steady-dancer', 'z-image-controlnet-pose'],
    defaultTab: 'wan21-steady-dancer',
    Icon: Video,
    card: veniceCard(21),
  },
  {
    id: 'wan21-scail2',
    sourceModuleId: 'wan-video',
    label: 'SCAIL-2',
    description: 'Animate a reference photo with dance/pose motion using SCAIL-2 GGUF.',
    area: 'video',
    pack: 'booster',

    tabs: ['wan21-scail2'],
    workflows: ['wan21-scail2'],
    defaultTab: 'wan21-scail2',
    Icon: Film,
    card: veniceCard(30),
  },
  {
    id: 'ltx-img2vid',
    sourceModuleId: 'ltx-video',
    label: 'LTX Img2Vid',
    description: 'Animate one reference image with LTX.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx', 'ltx-img2vid'],
    workflows: ['ltx-img2vid'],
    defaultTab: 'ltx-img2vid',
    Icon: Film,
    card: veniceCard(22),
  },
  {
    id: 'ltx-first-last',
    sourceModuleId: 'ltx-video',
    label: 'LTX First / Last',
    description: 'Interpolate motion between two keyframes.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx-flf'],
    workflows: ['ltx-flf'],
    defaultTab: 'ltx-flf',
    Icon: Film,
    card: veniceCard(23),
  },
  {
    id: 'ltx-audio-img2vid',
    sourceModuleId: 'ltx-video',
    label: 'LTX Audio + Image2Video',
    description: 'Animate a reference image driven by an audio clip — motion follows the sound.',
    area: 'video',
    pack: 'booster',

    tabs: ['ltx-ai2v'],
    workflows: ['ltx-ai2v'],
    defaultTab: 'ltx-ai2v',
    Icon: Film,
    card: { poster: '/cards/new/venice/34.jpeg' },
  },

  {
    id: 'lipsync',
    sourceModuleId: 'wan-video',
    label: 'Lipsync',
    description: 'Talking-head: drive a portrait mouth from an audio clip (InfiniteTalk, MultiTalk).',
    area: 'video',
    pack: 'booster',
    tabs: ['lipsync-infinitetalk', 'lipsync-multitalk'],
    workflows: ['lipsync-infinitetalk'],
    defaultTab: 'lipsync-infinitetalk',
    Icon: Film,
    card: { poster: '/cards/new/venice/37.jpeg' },
  },
];

export const HOME_MODULE_CANDIDATES = FEDDA_MODULES.filter(
  (module) => module.card && (module.area === 'home' || module.area === 'system'),
);
export const IMAGE_MODULE_CANDIDATES = FEDDA_MODULES.filter((module) => module.area === 'image' && module.card);
export const VIDEO_MODULE_CANDIDATES = FEDDA_MODULES.filter((module) => module.area === 'video' && module.card);

