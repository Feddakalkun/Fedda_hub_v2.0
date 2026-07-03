import { Download, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';
import { triggerMediaDownload } from '../../utils/mediaStore';

interface ImageOutputPanelProps {
  title: string;
  currentImage: string | null;
  history: string[];
  isGenerating: boolean;
  onSelectImage?: (url: string) => void;
  emptyHint?: string;
}

const imageNameFromUrl = (url: string, fallback: string) => {
  try {
    const parsed = new URL(url, window.location.href);
    const filename = parsed.searchParams.get('filename');
    if (filename) return filename;
    const pathName = parsed.pathname.split('/').filter(Boolean).pop();
    return pathName || fallback;
  } catch {
    return fallback;
  }
};

export const ImageOutputPanel = ({
  title,
  currentImage,
  history,
  isGenerating,
  onSelectImage,
  emptyHint = 'No image yet.',
}: ImageOutputPanelProps) => {
  const items = [
    ...(currentImage ? [currentImage] : []),
    ...history.filter((url) => url !== currentImage),
  ].slice(0, 24);

  return (
    <aside className="flex h-full w-[420px] max-w-[40vw] shrink-0 flex-col border-l border-white/5 bg-[#05060a]">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-[11px] text-slate-400">Preview, history and export</p>
      </div>

      <div className="border-b border-white/10 p-3">
        {currentImage ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onSelectImage?.(currentImage)}
              className="block w-full overflow-hidden rounded-lg border border-white/10 bg-black text-left transition hover:border-white/25"
              title="Open image preview"
            >
              <img src={currentImage} alt={title} className="aspect-square w-full object-contain" />
            </button>
            <div className="truncate text-[11px] text-slate-500">
              {imageNameFromUrl(currentImage, 'fedda-image-latest.png')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => window.open(currentImage, '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-white/5"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </button>
              <button
                type="button"
                onClick={() => triggerMediaDownload(currentImage, imageNameFromUrl(currentImage, 'fedda-image-latest.png'))}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1.5 text-[11px] text-cyan-200 hover:bg-cyan-500/20"
              >
                <Download className="h-3 w-3" />
                Download
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/30 p-6 text-center text-sm text-slate-500">
            {isGenerating ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Rendering in progress...
              </span>
            ) : (
              emptyHint
            )}
          </div>
        )}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">
            Waiting for first output
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((url, idx) => (
              <button
                key={`${url}-${idx}`}
                type="button"
                onClick={() => onSelectImage?.(url)}
                className={`group relative aspect-square overflow-hidden rounded-lg border bg-black transition ${
                  url === currentImage ? 'border-white/35' : 'border-white/10 hover:border-white/25'
                }`}
                title={imageNameFromUrl(url, `Output ${idx + 1}`)}
              >
                <img src={url} alt={`Output ${idx + 1}`} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                <div className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[8px] font-semibold text-white/75">
                  <ImageIcon className="h-2.5 w-2.5" />
                  {idx + 1}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
