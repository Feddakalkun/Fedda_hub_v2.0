import { useState } from 'react';
import { LoRADownloader } from '../components/LoRADownloader';

type Family = 'z-image' | 'flux2klein' | 'sd15' | 'sdxl' | 'wan';

const FAMILIES: { key: Family; label: string; desc: string }[] = [
  { key: 'z-image', label: 'Z-Image', desc: 'Turbo character LoRAs for Z-Image workflows' },
  { key: 'flux2klein', label: 'FLUX2-KLEIN', desc: 'FLUX.2-klein specific LoRAs only' },
  { key: 'wan', label: 'WAN', desc: 'WAN video LoRA packs' },
  { key: 'sd15', label: 'SD 1.5', desc: 'Classic portrait and style LoRAs' },
  { key: 'sdxl', label: 'SDXL', desc: 'High-res XL character models' },
];

export const LibraryPage = () => {
  const [activeFamily, setActiveFamily] = useState<Family>('z-image');
  const active = FAMILIES.find((family) => family.key === activeFamily);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#07080d]">
      <div className="shrink-0 border-b border-white/5 px-8 py-6">
        <p className="v14-kicker text-white/45">LoRA & Character</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Manage workflow character models</h1>
            <p className="mt-2 text-sm text-slate-500">Install packs, import local LoRAs and keep ComfyUI model lists in sync.</p>
          </div>
          <div className="text-xs text-slate-500">{active?.desc}</div>
        </div>
      </div>

      <div className="shrink-0 px-8 pb-2 pt-5">
        <div className="flex flex-wrap gap-2">
          {FAMILIES.map((family) => (
            <button
              key={family.key}
              onClick={() => setActiveFamily(family.key)}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition ${activeFamily === family.key ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white'}`}
            >
              {family.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8 pt-4">
        <LoRADownloader family={activeFamily} />
      </div>
    </div>
  );
};
