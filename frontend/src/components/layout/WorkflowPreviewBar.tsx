import { useState } from 'react';
import { ChevronDown, ChevronUp, Expand, Loader2 } from 'lucide-react';
import { Lightbox } from '../ui/Lightbox';
import { SendToWorkflowMenu } from '../ui/SendToWorkflowMenu';

interface WorkflowPreviewBarProps {
  title?: string;
  images: string[];
  currentImage?: string | null;
  liveImage?: string | null;
  historyCount?: number;
  storageKey?: string;
  maxItems?: number;
  emptyHint?: string;
  onSelectImage?: (url: string) => void;
}

export const WorkflowPreviewBar = ({
  title = 'Recent generations',
  images,
  currentImage,
  liveImage,
  historyCount,
  storageKey = 'workflow-preview',
  maxItems = 12,
  emptyHint = 'Generate something to see previews here.',
  onSelectImage,
}: WorkflowPreviewBarProps) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(`${storageKey}_collapsed`) === '1';
    } catch {
      return false;
    }
  });
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const items = images.slice(0, maxItems);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(`${storageKey}_collapsed`, next ? '1' : '0');
      } catch {
        // Local preview collapse state is optional.
      }
      return next;
    });
  };

  const openImage = (url: string) => {
    onSelectImage?.(url);
    setLightboxImage(url);
  };

  return (
    <>
      <div className="workflow-preview-bar">
        <div className="workflow-preview-bar-header">
          <button type="button" onClick={toggleCollapsed} className="workflow-preview-bar-toggle">
            {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            {title}
          </button>
          <span className="workflow-preview-bar-count">
            {liveImage ? 'Live' : 'Recent'} · {historyCount ?? items.length}
          </span>
        </div>

        {!collapsed && (
          items.length === 0 ? (
            <div className="workflow-preview-bar-empty">{emptyHint}</div>
          ) : (
            <div className="workflow-preview-bar-scroll custom-scrollbar">
              {items.map((url, idx) => {
                const isLive = !!liveImage && url === liveImage && idx === 0;
                const isSelected = currentImage === url;
                return (
                  <button
                    type="button"
                    key={`${url}-${idx}`}
                    onClick={() => openImage(url)}
                    className={`workflow-preview-thumb ${isLive ? 'is-live' : ''} ${isSelected ? 'is-selected' : ''}`.trim()}
                    title={`Preview ${idx + 1}`}
                  >
                    <img src={url} alt={`Preview ${idx + 1}`} />
                    <span className="workflow-preview-thumb-action flex items-center gap-1">
                      <Expand className="h-2.5 w-2.5" />
                      <span onClick={(e) => e.stopPropagation()}>
                        <SendToWorkflowMenu url={url} kind="image" compact />
                      </span>
                    </span>
                    {isLive && (
                      <span className="workflow-preview-thumb-live">
                        <Loader2 className="h-2 w-2 animate-spin" />
                        Live
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {lightboxImage ? <Lightbox imageUrl={lightboxImage} onClose={() => setLightboxImage(null)} /> : null}
    </>
  );
};
