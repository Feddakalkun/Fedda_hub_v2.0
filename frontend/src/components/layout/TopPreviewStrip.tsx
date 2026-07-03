import { useEffect } from 'react';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { WorkflowPreviewBar } from './WorkflowPreviewBar';

interface TopPreviewStripProps {
  maxItems?: number;
  storageKey?: string;
}

export const TopPreviewStrip = ({ maxItems = 8, storageKey = 'global' }: TopPreviewStripProps) => {
  const { state, previewUrl, lastOutputImages, outputReadyCount } = useComfyExecution();
  const [history, setHistory] = usePersistentState<string[]>(`${storageKey}_preview_history`, []);

  const stripImages = [
    ...(previewUrl ? [previewUrl] : []),
    ...history.filter((h) => h !== previewUrl),
  ].slice(0, maxItems);

  useEffect(() => {
    if (state !== 'executing' || lastOutputImages.length === 0) return;

    const newUrls = lastOutputImages.map((img) => comfyService.getImageUrl(img));
    setHistory((prev) => {
      const updated = [...newUrls, ...prev.filter((p) => !newUrls.includes(p))];
      return updated.slice(0, 30);
    });
  }, [outputReadyCount, lastOutputImages, state, setHistory]);

  return (
    <div className="px-8 pt-2">
      <WorkflowPreviewBar
        title="Recent generations"
        images={stripImages}
        liveImage={previewUrl}
        historyCount={stripImages.length}
        storageKey={`${storageKey}_preview`}
        maxItems={maxItems}
      />
    </div>
  );
};
