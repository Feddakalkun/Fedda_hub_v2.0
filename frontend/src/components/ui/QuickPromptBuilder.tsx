/**
 * QuickPromptBuilder — zero-typing prompt composer.
 * Pick Girl (from LoRA character sheets) / Outfit / Scene / Style (+ Motion on
 * video pages), or roll the dice, and a ready prompt is written into the box.
 * Rendered inside PromptAssistant so every image & video workflow gets it.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Dices, Zap } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { comfyService } from '../../services/comfyService';
import { CHARACTER_PRESETS } from '../../pages/tools/reelPresets';

export const QUICK_SCENES = [
  'in a bright modern bedroom with soft window light',
  'in a luxury hotel room, warm evening lamps',
  'poolside on a bright summer day',
  'on a sandy beach at golden sunset',
  'in a dim nightclub with colorful neon lights',
  'in a cozy cafe with warm bokeh background',
  'on a city street at golden hour',
  'on a rooftop at night, city lights behind',
  'in a photo studio with clean grey backdrop',
  'in a marble bathroom with big mirror, soft glam light',
  'in a gym with hard directional light',
  'in an autumn park with warm fallen leaves',
  'backstage in a moody concert venue',
  'in a snowy street with soft winter light',
];

export const QUICK_STYLES = [
  'photorealistic, natural skin texture, sharp focus',
  'candid iPhone photo, natural flash, slightly grainy',
  '35mm film photography look, warm color grade',
  'high-end editorial photo, clean studio lighting',
  'moody low-key lighting, dramatic shadows',
  'bright airy daylight, soft pastel tones',
];

export const QUICK_POSES = [
  'standing in a confident pose looking at the camera',
  'sitting on the edge of the bed, relaxed',
  'leaning against the wall, one knee bent',
  'looking back over her shoulder with a smile',
  'kneeling with hands resting on her thighs',
  'lying on her side propped on one elbow',
  'walking toward the camera, candid',
  'hands lifted into her hair, back slightly arched',
  'taking a mirror selfie, phone in hand',
  'stretching with arms above her head',
];

export const QUICK_MOTIONS = [
  'She dances slowly to the beat, hips swaying, hair moving naturally.',
  'She walks toward the camera with confident steps, keeping eye contact.',
  'She spins around once, hair whipping, then lands a pose and smiles.',
  'She flips her hair back and laughs candidly.',
  'She blows a kiss at the camera and winks.',
  'She turns from facing away to facing the camera over her shoulder.',
  'She sways sensually side to side, running her hands along her body.',
  'She stretches her arms overhead, arching slightly, then relaxes with a smile.',
  'She poses through three quick model poses, snapping between them.',
  'She leans toward the camera slowly, holding eye contact, lips parted.',
];

const VIDEO_CONTEXTS = new Set([
  'ltx-img2vid', 'ltx-flf', 'ltx-lipsync',
  'wan-scene', 'wan-i2v', 'wan-story',
  'hunyuan-i2v', 'steady-dancer',
]);

type Character = { name: string; lora: string; trigger: string; appearance: string; loaded: boolean };

// Module-level cache — fetched once per session, shared by every prompt box.
let charCache: Character[] | null = null;
let charCachePromise: Promise<Character[]> | null = null;

async function fetchCharacters(): Promise<Character[]> {
  if (charCache) return charCache;
  if (!charCachePromise) {
    charCachePromise = (async () => {
      const all = await comfyService.getLoras().catch(() => [] as string[]);
      const byFolder = new Map<string, string>();
      for (const l of all) {
        const norm = l.replace(/\\/g, '/');
        const m = norm.match(/^app\/([^/]+)\//);
        if (m && !byFolder.has(m[1])) byFolder.set(m[1], l);
      }
      const chars = [...byFolder.entries()].map(([name, lora]) => ({
        name, lora, trigger: '', appearance: '', loaded: false,
      }));
      charCache = chars.sort((a, b) => a.name.localeCompare(b.name));
      return charCache;
    })();
  }
  return charCachePromise;
}

async function loadSheet(c: Character): Promise<Character> {
  if (c.loaded) return c;
  try {
    const res = await fetch(`${BACKEND_API.BASE_URL}/api/lora/sheet?file=${encodeURIComponent(c.lora)}`);
    const data = await res.json();
    if (data.success && data.exists) {
      c.trigger = data.trigger || c.name.toLowerCase();
      c.appearance = (data.appearance || '').replace(/\s+/g, ' ').trim();
    } else {
      c.trigger = c.name.toLowerCase();
    }
  } catch {
    c.trigger = c.name.toLowerCase();
  }
  c.loaded = true;
  return c;
}

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

// Trim a long sheet appearance to whole sentences under ~maxLen chars.
function shortAppearance(text: string, maxLen = 420): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastDot = cut.lastIndexOf('. ');
  return lastDot > 80 ? cut.slice(0, lastDot + 1) : cut;
}

interface QuickPromptBuilderProps {
  context: string;
  onCompose: (prompt: string) => void;
}

export const QuickPromptBuilder = ({ context, onCompose }: QuickPromptBuilderProps) => {
  const isVideo = VIDEO_CONTEXTS.has(context);
  const [open, setOpen] = useState(false);
  const [chars, setChars] = useState<Character[]>([]);
  const [charName, setCharName] = useState('');
  const [outfit, setOutfit] = useState(CHARACTER_PRESETS[0]?.label ?? '');
  const [scene, setScene] = useState(QUICK_SCENES[0]);
  const [style, setStyle] = useState(QUICK_STYLES[0]);
  const [pose, setPose] = useState(QUICK_POSES[0]);
  const [motion, setMotion] = useState(QUICK_MOTIONS[0]);

  useEffect(() => {
    if (open && chars.length === 0) void fetchCharacters().then(setChars);
  }, [open, chars.length]);

  const outfitPrompt = useMemo(
    () => CHARACTER_PRESETS.find((o) => o.label === outfit)?.prompt ?? outfit,
    [outfit],
  );

  const compose = async (randomize = false) => {
    let o = outfit, sc = scene, st = style, po = pose, mo = motion;
    if (randomize) {
      o = pick(CHARACTER_PRESETS).label; sc = pick(QUICK_SCENES); st = pick(QUICK_STYLES);
      po = pick(QUICK_POSES); mo = pick(QUICK_MOTIONS);
      setOutfit(o); setScene(sc); setStyle(st); setPose(po); setMotion(mo);
    }
    const oPrompt = CHARACTER_PRESETS.find((x) => x.label === o)?.prompt ?? o;

    let girl = '';
    if (charName) {
      const c = chars.find((x) => x.name === charName);
      if (c) {
        const loaded = await loadSheet(c);
        girl = [loaded.trigger, 'woman', shortAppearance(loaded.appearance)].filter(Boolean).join(', ');
      }
    }

    if (isVideo) {
      // Video: action first — the model animates; identity comes from the input image/LoRA.
      const parts = [mo, `She is wearing ${oPrompt}.`, `Setting: ${sc}.`, st];
      onCompose(parts.join(' '));
    } else {
      const parts = [girl || 'a beautiful woman', `wearing ${oPrompt}`, po, sc, st];
      onCompose(parts.filter(Boolean).join(', '));
    }
  };

  const sel = 'w-full h-8 rounded-lg bg-black/40 border border-white/10 text-[11px] text-white/80 px-2 outline-none focus:border-white/25';
  const lbl = 'text-[8px] font-black uppercase tracking-widest text-white/30';

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
      >
        <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Quick Build — no typing</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className={`grid gap-2 ${isVideo ? 'md:grid-cols-2' : 'md:grid-cols-2'}`}>
            {!isVideo && (
              <label className="space-y-0.5">
                <span className={lbl}>Girl</span>
                <select value={charName} onChange={(e) => setCharName(e.target.value)} className={sel}>
                  <option value="">— any woman —</option>
                  {chars.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </label>
            )}
            {isVideo && (
              <label className="space-y-0.5">
                <span className={lbl}>Motion</span>
                <select value={motion} onChange={(e) => setMotion(e.target.value)} className={sel}>
                  {QUICK_MOTIONS.map((m) => <option key={m} value={m}>{m.slice(0, 60)}</option>)}
                </select>
              </label>
            )}
            <label className="space-y-0.5">
              <span className={lbl}>Outfit</span>
              <select value={outfit} onChange={(e) => setOutfit(e.target.value)} className={sel}>
                {CHARACTER_PRESETS.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
              </select>
            </label>
            {!isVideo && (
              <label className="space-y-0.5">
                <span className={lbl}>Pose</span>
                <select value={pose} onChange={(e) => setPose(e.target.value)} className={sel}>
                  {QUICK_POSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            )}
            <label className="space-y-0.5">
              <span className={lbl}>Scene</span>
              <select value={scene} onChange={(e) => setScene(e.target.value)} className={sel}>
                {QUICK_SCENES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="space-y-0.5">
              <span className={lbl}>Style</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className={sel}>
                {QUICK_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void compose(false)}
              className="flex-1 h-8 rounded-lg bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-white/85 transition-colors"
            >
              Build Prompt
            </button>
            <button
              onClick={() => void compose(true)}
              title="Random outfit + scene + style, then build"
              className="h-8 px-3 rounded-lg border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.1] transition-colors flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
            >
              <Dices className="w-3.5 h-3.5" /> Roll
            </button>
          </div>
          <p className="text-[8px] text-white/20 leading-relaxed">
            {outfitPrompt.slice(0, 110)}…
          </p>
        </div>
      )}
    </div>
  );
};
