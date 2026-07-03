import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Images, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { loadStoredMedia, triggerMediaDownload, type MediaItem } from '../../utils/mediaStore';
import { SendToWorkflowMenu } from '../ui/SendToWorkflowMenu';

const GALLERY_WIDTH_KEY = 'fedda_gallery_panel_width';
const GALLERY_COLLAPSED_KEY = 'fedda_gallery_panel_collapsed';

function readInt(key: string, fallback: number) {
  try { const v = parseInt(localStorage.getItem(key) ?? '', 10); return isNaN(v) ? fallback : v; } catch { return fallback; }
}
function readBool(key: string, fallback: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === 'true'; } catch { return fallback; }
}

function GalleryThumb({ item }: { item: MediaItem }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-white/[0.03] cursor-grab active:cursor-grabbing select-none"
      title={`Drag to use as input\n${item.source}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/uri-list', item.url);
        e.dataTransfer.setData('text/plain', item.url);
      }}
    >
      <div className="aspect-square bg-white/[0.02]">
        {item.kind === 'video' ? (
          <video src={item.url} className="w-full h-full object-cover" muted />
        ) : (
          <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
        )}
      </div>

      {hover && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 p-1">
          <div className="text-[9px] text-white/50 truncate w-full text-center">{item.source}</div>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); window.open(item.url, '_blank', 'noopener'); }}
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-white transition"
              title="Open full size"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); triggerMediaDownload(item.url, `fedda-output.${item.kind === 'video' ? 'mp4' : 'png'}`); }}
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-white transition"
              title="Download"
            >
              <Download className="h-2.5 w-2.5" />
            </button>
            <span onClick={(e) => e.stopPropagation()}>
              <SendToWorkflowMenu url={item.url} kind={item.kind} compact />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export const GlobalGalleryPanel = () => {
  const [items, setItems]         = useState<MediaItem[]>([]);
  const [collapsed, setCollapsed] = useState(() => readBool(GALLERY_COLLAPSED_KEY, false));
  const [width, setWidth]         = useState(() => readInt(GALLERY_WIDTH_KEY, 220));

  const isDragging = useRef(false);
  const startX     = useRef(0);
  const startW     = useRef(220);

  const refresh = useCallback(() => {
    setItems(loadStoredMedia(80));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('fedda:gallery-updated', refresh as EventListener);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('fedda:gallery-updated', refresh as EventListener);
    };
  }, [refresh]);

  useEffect(() => { try { localStorage.setItem(GALLERY_COLLAPSED_KEY, String(collapsed)); } catch {} }, [collapsed]);
  useEffect(() => { try { localStorage.setItem(GALLERY_WIDTH_KEY, String(width)); } catch {} }, [width]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(Math.max(150, Math.min(420, startW.current + delta)));
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const cols = width > 210 ? 2 : 1;

  return (
    <div
      className="flex-shrink-0 flex overflow-hidden border-l border-white/[0.06] bg-[#07080d] transition-[width] duration-150"
      style={{ width: collapsed ? '40px' : `${width}px` }}
    >
      {!collapsed && (
        <div
          className="w-1 flex-shrink-0 bg-white/[0.03] hover:bg-violet-500/30 cursor-col-resize transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-[54px] border-b border-white/5 flex items-center flex-shrink-0 px-2 gap-1">
          {!collapsed && (
            <div className="flex items-center gap-1.5 flex-1 pl-1 min-w-0">
              <Images className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 truncate">
                Gallery
              </span>
              {items.length > 0 && (
                <span className="text-[10px] text-slate-600 tabular-nums flex-shrink-0">
                  {items.length}
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand gallery' : 'Collapse gallery'}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition ml-auto flex-shrink-0"
          >
            {collapsed
              ? <PanelRightOpen className="h-3.5 w-3.5" />
              : <PanelRightClose className="h-3.5 w-3.5" />}
          </button>
        </div>

        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-center">
                <Images className="h-7 w-7 mb-2 opacity-25" />
                <p className="text-[11px]">No outputs yet</p>
                <p className="text-[10px] opacity-60 mt-0.5">Generate something</p>
              </div>
            ) : (
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {items.map((item, idx) => (
                  <GalleryThumb key={`${item.url}-${idx}`} item={item} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
