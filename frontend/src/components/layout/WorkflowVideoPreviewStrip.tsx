import { Download, ExternalLink, Loader2, Video } from 'lucide-react';
import { triggerMediaDownload } from '../../utils/mediaStore';
import { SendToWorkflowMenu } from '../ui/SendToWorkflowMenu';

interface WorkflowVideoPreviewStripProps {
  title?: string;
  currentVideo: string | null;
  history: string[];
  isGenerating?: boolean;
  onSelectVideo?: (url: string) => void;
  emptyHint?: string;
}

export const WorkflowVideoPreviewStrip = ({
  title = 'Preview',
  currentVideo,
  history,
  isGenerating = false,
  onSelectVideo,
  emptyHint = 'Waiting for output',
}: WorkflowVideoPreviewStripProps) => {
  const items = history.slice(0, 12);

  return (
    <section className="workflow-preview-strip">
      <div className="workflow-preview-main">
        <div className="workflow-preview-title-row">
          <div>
            <p className="workflow-preview-kicker">Output</p>
            <h2>{title}</h2>
          </div>
          {currentVideo ? (
            <div className="workflow-preview-actions">
              <button onClick={() => window.open(currentVideo, '_blank', 'noopener,noreferrer')} title="Open output">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => triggerMediaDownload(currentVideo, 'fedda-video-latest.mp4')} title="Download output">
                <Download className="h-3.5 w-3.5" />
              </button>
              <SendToWorkflowMenu url={currentVideo} kind="video" compact />
            </div>
          ) : null}
        </div>

        <div className="workflow-preview-stage">
          {currentVideo ? (
            <video src={currentVideo} className="h-full w-full object-contain" controls playsInline />
          ) : (
            <div className="workflow-preview-empty">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rendering
                </>
              ) : (
                emptyHint
              )}
            </div>
          )}
        </div>
      </div>

      <div className="workflow-preview-history">
        {items.length === 0 ? (
          <div className="workflow-preview-history-empty">No history</div>
        ) : (
          items.map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              onClick={() => onSelectVideo?.(url)}
              className={url === currentVideo ? 'is-active' : ''}
              title={`Output ${items.length - idx}`}
            >
              <Video className="h-3.5 w-3.5" />
              <span>{items.length - idx}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
};
