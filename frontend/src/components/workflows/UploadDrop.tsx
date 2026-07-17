import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { cn } from '../../lib/styles';

/**
 * Click-to-pick OR drag-and-drop upload with a dashed drop-zone look and an
 * optional inline preview. Drag-drop lives here (the one shared upload surface)
 * so every page using UploadDrop / MediaSource gets it for free.
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
  const [dropping, setDropping] = useState(false);

  const takeFirst = (files: FileList | null | undefined) => {
    const file = files && files.length ? files[0] : null;
    if (file) onFile(file);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dropping) setDropping(true);
        }}
        onDragLeave={(e) => {
          // Only clear when the pointer actually leaves the button, not a child.
          if (e.currentTarget === e.target) setDropping(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          takeFirst(e.dataTransfer?.files);
        }}
        className={cn(
          'flex min-h-[92px] w-full items-center justify-center rounded-xl border border-dashed px-4 py-4 text-center transition',
          dropping
            ? 'border-white/50 bg-white/[0.06]'
            : 'border-white/15 bg-black/30 hover:border-white/30 hover:bg-white/[0.03]',
        )}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading
          </span>
        ) : dropping ? (
          <span className="inline-flex items-center gap-2 text-sm text-white">
            <Upload className="h-4 w-4" />
            Drop to upload
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
          takeFirst(event.target.files);
          event.currentTarget.value = '';
        }}
      />
      {filename ? <p className="truncate text-[11px] text-zinc-500">{filename}</p> : null}
    </div>
  );
};
