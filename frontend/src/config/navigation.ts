import { Bot, Images, LayoutDashboard, Sparkles, Video, type LucideIcon } from 'lucide-react';

export interface PageMeta {
  label: string;
  description: string;
  Icon: LucideIcon;
}

export interface NavNode {
  id: string;
  label: string;
  subitems?: NavNode[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  subitems?: NavNode[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const SIDEBAR_SECTIONS: NavSection[] = [
  {
    label: 'STUDIO',
    items: [
      {
        id: 'image',
        label: 'Image Studio',
        icon: Sparkles,
        subitems: [
          { id: 'z-image-txt2img', label: 'Z-Image Txt2Img' },
          { id: 'z-image-dual-lora', label: 'Z-Image Dual LoRA' },
          { id: 'flux-txt2img', label: 'FLUX2-KLEIN' },
          { id: 'qwen-image-ref', label: 'Qwen Reference' },
          { id: 'qwen-multi-angle', label: 'Qwen Multi Angle' },
          { id: 'sdxl-controlnet-depth', label: 'ControlNet Depth' },
          { id: 'sdxl-controlnet-openpose', label: 'ControlNet OpenPose' },
        ],
      },
      {
        id: 'video',
        label: 'Video Studio',
        icon: Video,
        subitems: [
          { id: 'wan22-img2vid', label: 'WAN Img2Vid' },
          { id: 'wan22xxx-img2vid', label: 'WAN XXX Img2Vid' },
          { id: 'wan22-vid2vid', label: 'WAN Vid2Vid' },
          { id: 'wan22-img2vid-6frames', label: 'WAN Story' },
          { id: 'wan21-steady-dancer', label: 'Steady Dancer' },
          { id: 'wan21-scail2', label: 'SCAIL-2' },
          { id: 'ltx-img2vid', label: 'LTX Img2Vid' },
          { id: 'ltx-flf', label: 'LTX First / Last' },
          { id: 'hunyuan-i2v', label: 'Hunyuan I2V' },
        ],
      },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'gallery', label: 'Gallery', icon: Images },
      { id: 'library', label: 'LoRA & Character', icon: LayoutDashboard },
      { id: 'ollama', label: 'Ollama Models', icon: Bot },
    ],
  },
];

const collectNodeIds = (nodes: NavNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...(node.subitems ? collectNodeIds(node.subitems) : [])]);

const collectedTabIds = SIDEBAR_SECTIONS.flatMap((section) =>
  section.items.flatMap((item) => [item.id, ...(item.subitems ? collectNodeIds(item.subitems) : [])]),
);

export const VALID_TABS = new Set<string>([...collectedTabIds, 'z-image', 'flux', 'qwen', 'ltx']);

export const PAGE_META: Record<string, PageMeta> = {
  image: { label: 'Image Studio', description: 'Generate and edit images with ComfyUI workflows.', Icon: Sparkles },
  video: { label: 'Video Studio', description: 'Create and animate videos with ComfyUI workflows.', Icon: Video },
  gallery: { label: 'Gallery', description: 'Browse generated images and videos.', Icon: Images },
  library: { label: 'LoRA & Character', description: 'Manage character and style LoRAs.', Icon: LayoutDashboard },
  ollama: { label: 'Ollama Models', description: 'Manage local text and vision models.', Icon: Bot },
};

export const TOP_QUICK_LINKS = ['gallery', 'library', 'ollama'] as const;

