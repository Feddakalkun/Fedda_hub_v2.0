import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Music, Play, Upload } from 'lucide-react';
import { cn, inputBase } from '../../lib/styles';
import { FeddaButton } from './FeddaPrimitives';

/**
 * Shared workflow control kit — the Ideogram page look, reusable.
 * Every workflow page should build its controls from these so the UI
 * stays consistent across all 30+ workflows.
 */

interface ChipGroupProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  renderLabel?: (option: T) => ReactNode;
}

/** Preset chip row (Ideogram BG_PRESETS style) — violet selected state. */
export function ChipGroup<T extends string>({ options, value, onChange, renderLabel }: ChipGroupProps<T>) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'rounded border px-2 py-0.5 text-[10px] transition',
            value === option
              ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
              : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300',
          )}
        >
          {renderLabel ? renderLabel(option) : option}
        </button>
      ))}
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

/** Labeled slider with a monospace value readout. */
export const SliderField = ({ label, value, onChange, min, max, step = 0.01, format }: SliderFieldProps) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</span>
      <span className="font-mono text-[11px] text-zinc-300">{format ? format(value) : value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-violet-400"
    />
  </div>
);

interface SeedFieldProps {
  value: number;
  onChange: (value: number) => void;
}

/** Seed input with Random reset (-1 = random at generate time). */
export const SeedField = ({ value, onChange }: SeedFieldProps) => (
  <div className="flex gap-2">
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || -1)}
      className={cn(inputBase, 'flex-1 font-mono')}
      title="-1 = random seed each run"
    />
    <button
      type="button"
      onClick={() => onChange(-1)}
      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
    >
      Random
    </button>
  </div>
);

interface UploadSlotProps {
  preview: string | null;
  uploading: boolean;
  onFile: (file: File) => void;
  onUrl?: (url: string) => void;
  accept?: string;
  label?: string;
  hint?: string;
  height?: number;
  previewKind?: 'image' | 'video' | 'audio';
  filename?: string;
}

/** Click/drag-drop upload slot with preview (generalized from the LTX reference slot). */
export const UploadSlot = ({
  preview,
  uploading,
  onFile,
  onUrl,
  accept = 'image/*',
  label = 'Reference Image',
  hint = 'Click or drop file',
  height = 150,
  previewKind = 'image',
  filename,
}: UploadSlotProps) => {
  const ref = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file) { onFile(file); return; }
        const url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
        if (url && onUrl) onUrl(url.trim());
      }}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border border-dashed transition-all',
        dragOver
          ? 'border-violet-400/60 bg-violet-500/10'
          : preview
            ? 'border-zinc-500/40 bg-black/40'
            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/25',
      )}
      style={{ height }}
    >
      {preview && previewKind === 'audio' ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
          <Music className="h-6 w-6 text-emerald-400/70" />
          <span className="max-w-full truncate text-[10px] font-semibold text-white/60">{filename || label}</span>
          <audio
            src={preview}
            controls
            onClick={(e) => e.stopPropagation()}
            className="h-7 w-full max-w-[220px]"
          />
          <span className="text-[9px] uppercase tracking-[0.16em] text-white/25">Click elsewhere to replace</span>
        </div>
      ) : preview ? (
        <>
          {previewKind === 'video' ? (
            <video src={preview} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-all group-hover:opacity-100">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Replace</span>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-white/45" /> : <Upload className="h-6 w-6 text-white/15" />}
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">
            {uploading ? 'Uploading...' : label}
          </span>
          <span className="text-[9px] text-white/[0.12]">{hint}</span>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
      />
    </div>
  );
};

interface GenerateButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  label?: string;
  generatingLabel?: string;
  requirementHint?: string;
}

/** Standard violet generate button + optional requirement hint underneath. */
export const GenerateButton = ({
  onClick,
  disabled = false,
  isGenerating = false,
  label = 'Generate',
  generatingLabel = 'Generating...',
  requirementHint,
}: GenerateButtonProps) => (
  <div>
    <FeddaButton
      variant="violet"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl py-3.5 text-sm font-semibold"
    >
      {isGenerating ? (
        <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {generatingLabel}</span>
      ) : (
        <span className="flex items-center justify-center gap-2"><Play className="h-4 w-4" /> {label}</span>
      )}
    </FeddaButton>
    {disabled && !isGenerating && requirementHint && (
      <p className="mt-2 text-center text-[10px] text-white/25">{requirementHint}</p>
    )}
  </div>
);
