import { useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { useToast } from '../ui/Toast';
import { uploadToComfy } from '../../utils/comfyUpload';
import { inputBase } from '../../lib/styles';
import { UploadDrop } from './UploadDrop';

export type MediaMeta = { title?: string; duration?: number; fps?: number };

/**
 * One media-input row: upload a file OR paste a TikTok/Reel/YouTube URL, both
 * resolving to a ComfyUI input filename reported via onResolved. Consolidates
 * the upload + `/api/media/download-video` handlers that were duplicated in
 * Wan21Scail2Page + Wan21SteadyDancerPage. (Handoff consumption stays in the
 * pages — it routes to page-specific slots.)
 */
export const MediaSource = ({
  accept,
  uploadLabel,
  filename,
  preview,
  enableUrl = true,
  urlPlaceholder = 'TikTok, Instagram Reel, YouTube Shorts or direct URL',
  onResolved,
}: {
  accept: string;
  uploadLabel: string;
  filename: string | null;
  preview?: ReactNode;
  enableUrl?: boolean;
  urlPlaceholder?: string;
  onResolved: (filename: string, meta: MediaMeta) => void;
}) => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const name = await uploadToComfy(file);
      onResolved(name, {});
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const download = async () => {
    if (!url.trim()) return;
    setDownloading(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/download-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Download failed');
      onResolved(String(data.filename), { title: data.title, duration: data.duration, fps: data.fps });
      toast(data.title ? `Downloaded: ${data.title}` : 'Video downloaded', 'success');
    } catch (err: any) {
      toast(err.message || 'Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-2">
      <UploadDrop accept={accept} label={uploadLabel} filename={filename} preview={preview} busy={uploading} onFile={upload} />
      {enableUrl && (
        <div className="flex gap-2">
          <input
            className={inputBase}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={urlPlaceholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void download();
            }}
          />
          <button
            type="button"
            onClick={download}
            disabled={downloading || !url.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download
          </button>
        </div>
      )}
    </div>
  );
};
