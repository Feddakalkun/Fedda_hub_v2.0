import { useState } from 'react';
import { ImageOff, Link2 } from 'lucide-react';
import { previewUrl } from '../../lib/characters';
import { toLabel } from '../../lib/loraLabel';
import { cn } from '../../lib/styles';

export type LoraTileProps = {
  /** Native relative path, as ComfyUI reports it. */
  path: string;
  label?: string;
  sizeMb?: number;
  isLink?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Right-hand slot for a badge or action. */
  trailing?: React.ReactNode;
};

/**
 * Display tile for an installed LoRA.
 *
 * Not built on ui/LoraCharacterCard: that is a *picker* bound to
 * value/strength/onChange for workflow pages, and bending it into a browser card
 * would couple the Library to a control it doesn't want.
 */
export const LoraTile = ({
  path,
  label,
  sizeMb,
  isLink,
  selected,
  onClick,
  trailing,
}: LoraTileProps) => {
  const [imgFailed, setImgFailed] = useState(false);
  const name = label ?? toLabel(path);

  return (
    <button
      type="button"
      onClick={onClick}
      title={path}
      className={cn(
        // block + w-full: a <button> is inline-block, so it would shrink-wrap its
        // w-full child and collapse the whole tile to a few pixels.
        'group relative block w-full overflow-hidden rounded-xl border bg-[#0a0a0e] text-left transition',
        selected
          ? 'border-white/30 ring-1 ring-white/20'
          : 'border-white/10 hover:-translate-y-0.5 hover:border-white/25',
      )}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
        {imgFailed ? (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-6 w-6 text-white/15" />
          </div>
        ) : (
          <img
            src={previewUrl(path)}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />
        {isLink && (
          <span
            title="Linked from outside the loras folder"
            className="absolute left-1.5 top-1.5 rounded bg-black/70 p-1 text-cyan-300"
          >
            <Link2 className="h-2.5 w-2.5" />
          </span>
        )}
        {trailing && <div className="absolute right-1.5 top-1.5">{trailing}</div>}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="truncate text-[11px] font-semibold text-white/90">{name}</p>
        {sizeMb != null && <p className="text-[9px] text-white/35">{sizeMb} MB</p>}
      </div>
    </button>
  );
};
