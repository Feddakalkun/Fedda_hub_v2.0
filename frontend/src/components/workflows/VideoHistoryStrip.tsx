import { Download, ExternalLink, Video } from 'lucide-react';
import { triggerMediaDownload } from '../../utils/mediaStore';

/**
 * Output video + recent-history strip. Merges the two near-identical local
 * strips from Wan21Scail2Page + Wan21SteadyDancerPage; `downloadName` is the
 * only thing that differed between them.
 */
export const VideoHistoryStrip = ({
  currentVideo,
  history,
  isGenerating,
  onSelectVideo,
  downloadName,
}: {
  currentVideo: string | null;
  history: string[];
  isGenerating: boolean;
  onSelectVideo: (url: string) => void;
  downloadName: string;
}) => (
  <section className="rounded-xl border border-white/10 bg-[#09090b] p-3">
    <div className="mb-2 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => currentVideo && window.open(currentVideo, '_blank', 'noopener,noreferrer')}
        disabled={!currentVideo}
        className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 transition hover:text-zinc-200 disabled:pointer-events-none"
      >
        <Video className="h-3.5 w-3.5" />
        Output Preview
      </button>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-zinc-600">
          {isGenerating ? 'Rendering' : 'Recent'} · {history.length}
        </span>
        {currentVideo ? (
          <>
            <button
              type="button"
              onClick={() => window.open(currentVideo, '_blank', 'noopener,noreferrer')}
              className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 transition hover:text-zinc-100"
              title="Open output"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => triggerMediaDownload(currentVideo, downloadName)}
              className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 transition hover:text-zinc-100"
              title="Download output"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </div>

    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
      {currentVideo ? (
        <button
          type="button"
          onClick={() => onSelectVideo(currentVideo)}
          className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-white/25 bg-black"
        >
          <video src={currentVideo} className="h-full w-full object-cover" muted playsInline />
          <div className="absolute left-1.5 top-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-black">
            Selected
          </div>
        </button>
      ) : (
        <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/35 text-center text-[11px] text-zinc-700">
          {isGenerating ? 'Rendering output' : 'No output yet'}
        </div>
      )}

      {history.filter((url) => url !== currentVideo).slice(0, 10).map((url, index) => (
        <button
          key={`${url}-${index}`}
          type="button"
          onClick={() => onSelectVideo(url)}
          className="h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black transition hover:border-white/30"
        >
          <video src={url} className="h-full w-full object-cover" muted playsInline />
        </button>
      ))}
    </div>
  </section>
);
