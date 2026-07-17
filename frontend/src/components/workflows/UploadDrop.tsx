import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Upload } from 'lucide-react';

/**
 * Click-to-pick upload button with a dashed drop-zone look and an optional
 * inline preview. Lifted verbatim from the identical local copies in
 * Wan21Scail2Page + Wan21SteadyDancerPage so both share one implementation.
 */
export const UploadDrop = ({
  accept,
  label,
  filename,
  preview,
  busy,
  onFile,
}: {
  accept: string;
  label: string;
  filename: string | null;
  preview?: ReactNode;
  busy: boolean;
  onFile: (file: File) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-[92px] w-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-4 text-center transition hover:border-white/30 hover:bg-white/[0.03]"
      >
        {busy ? (
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading
          </span>
        ) : preview ? (
          preview
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Upload className="h-4 w-4" />
            {label}
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
      />
      {filename ? <p className="truncate text-[11px] text-zinc-500">{filename}</p> : null}
    </div>
  );
};
