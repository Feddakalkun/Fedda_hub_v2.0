import { Download, ExternalLink, Loader2, Video } from 'lucide-react';
import { triggerMediaDownload } from '../../utils/mediaStore';

interface VideoOutputPanelProps {
  title: string;
  currentVideo: string | null;
  history: string[];
  isGenerating: boolean;
  onSelectVideo?: (url: string) => void;
  emptyHint?: string;
}

export const VideoOutputPanel = ({
  title,
  currentVideo,
  history,
  isGenerating,
  onSelectVideo,
  emptyHint = 'No video yet.',
}: VideoOutputPanelProps) => {
  const items = history.slice(0, 20);

  return (
    <aside className="flex h-full w-[420px] max-w-[40vw] shrink-0 flex-col border-l border-white/5 bg-[#05060a]">
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-[11px] text-slate-400">Preview, history and export</p>
      </div>

      <div className="p-3 border-b border-white/10">
        {currentVideo ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
              <video src={currentVideo} className="w-full aspect-video object-contain" controls playsInline />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => window.open(currentVideo, '_blank', 'noopener,noreferrer')}
                className="px-2 py-1.5 rounded-lg border border-white/10 text-[11px] text-slate-200 hover:bg-white/5 inline-flex items-center justify-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Open
              </button>
              <button
                onClick={() => triggerMediaDownload(currentVideo, 'fedda-video-latest.mp4')}
                className="px-2 py-1.5 rounded-lg border border-cyan-400/30 text-[11px] text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 inline-flex items-center justify-center gap-1"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/30 p-6 text-center text-slate-500 text-sm">
            {isGenerating ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering in progress...
              </span>
            ) : (
              emptyHint
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 text-xs">
            Waiting for first output
          </div>
        ) : (
          items.map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              onClick={() => onSelectVideo ? onSelectVideo(url) : window.open(url, '_blank', 'noopener,noreferrer')}
              className="w-full text-left rounded-lg border border-white/10 bg-black/30 hover:bg-white/5 p-2 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Video className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span className="text-[11px] text-slate-200 truncate">Output {items.length - idx}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
};
