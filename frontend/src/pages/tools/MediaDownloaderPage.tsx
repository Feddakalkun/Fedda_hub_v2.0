/**
 * MediaDownloaderPage — download TikTok / YouTube / Instagram / any yt-dlp URL.
 * The downloaded video lands in ComfyUI input and can be sent to any video workflow.
 */

import { useState } from 'react';
import { Download, Link2, Loader2, Video, X } from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { SendToWorkflowMenu } from '../../components/ui/SendToWorkflowMenu';
import { useToast } from '../../components/ui/Toast';

interface DownloadResult {
  filename: string;
  title: string;
  duration: number;
  videoUrl: string;
}

const PLATFORM_HINTS = [
  'TikTok', 'YouTube', 'Instagram', 'Twitter / X', 'Reddit', 'Facebook',
];

export const MediaDownloaderPage = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [history, setHistory] = useState<DownloadResult[]>([]);

  const { toast } = useToast();

  const download = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.MEDIA_DOWNLOAD_VIDEO}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Download failed');

      const videoUrl = `/comfy/view?filename=${encodeURIComponent(data.filename)}&type=input`;
      const entry: DownloadResult = {
        filename: data.filename,
        title: data.title || data.filename,
        duration: data.duration ?? 0,
        videoUrl,
      };
      setResult(entry);
      setHistory((prev) => [entry, ...prev].slice(0, 20));
      setUrl('');
      toast('Downloaded successfully', 'success');
    } catch (err: any) {
      toast(err.message || 'Download failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#050506]">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20 mb-1">Tools</p>
          <h1 className="text-2xl font-bold text-white tracking-tight">Media Downloader</h1>
          <p className="text-sm text-white/35 mt-1">
            Download videos from TikTok, YouTube, Instagram, and more — straight into your workflows.
          </p>
        </div>

        {/* URL input */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && download()}
                placeholder="Paste a TikTok, YouTube, or Instagram URL…"
                className="w-full bg-white/[0.03] border border-white/8 rounded-xl pl-9 pr-4 py-3 text-sm text-white/90 placeholder-white/20 outline-none focus:border-white/20 transition-colors"
              />
              {url && (
                <button
                  onClick={() => setUrl('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={download}
              disabled={!url.trim() || loading}
              className="px-5 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 disabled:bg-white/10 disabled:text-white/20 transition-all flex items-center gap-2 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {loading ? 'Downloading…' : 'Download'}
            </button>
          </div>
          <p className="text-[9px] text-white/20 flex flex-wrap gap-x-2">
            {PLATFORM_HINTS.map((p) => (
              <span key={p} className="before:content-['·'] before:mr-1">{p}</span>
            ))}
          </p>
        </div>

        {/* Current result */}
        {result && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
            <div className="aspect-video bg-black">
              <video
                key={result.videoUrl}
                src={result.videoUrl}
                className="w-full h-full object-contain"
                controls
                autoPlay
                playsInline
              />
            </div>
            <div className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/90 truncate">{result.title}</p>
                <p className="text-[10px] text-white/30 font-mono mt-0.5">
                  {result.filename}
                  {result.duration > 0 && ` · ${formatDuration(result.duration)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={result.videoUrl}
                  download={result.filename}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/10 hover:bg-white/[0.12] text-white/60 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  <Download className="h-2.5 w-2.5" />
                  Save
                </a>
                <SendToWorkflowMenu url={result.videoUrl} kind="video" />
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
              Session downloads
            </p>
            <div className="space-y-2">
              {history.map((item, idx) => (
                <div
                  key={`${item.filename}-${idx}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.015] hover:bg-white/[0.03] transition-colors"
                >
                  <Video className="h-4 w-4 text-white/20 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white/70 truncate">{item.title}</p>
                    <p className="text-[9px] text-white/25 font-mono">
                      {item.duration > 0 && formatDuration(item.duration)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setResult(item)}
                      className="text-[8px] text-white/30 hover:text-white/70 transition-colors uppercase tracking-widest font-bold"
                    >
                      Preview
                    </button>
                    <SendToWorkflowMenu url={item.videoUrl} kind="video" compact />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && history.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center">
              <Video className="h-5 w-5 text-white/15" />
            </div>
            <p className="text-sm text-white/25">Paste a link above to download a video</p>
            <p className="text-[10px] text-white/15 max-w-xs">
              Downloaded videos land in ComfyUI input and can be sent directly to WAN Vid2Vid, Steady Dancer, or any video workflow.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
