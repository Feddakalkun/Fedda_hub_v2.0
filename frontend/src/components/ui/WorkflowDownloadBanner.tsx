import { AlertTriangle, DownloadCloud } from 'lucide-react';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { useWorkflowDownloadStatus } from '../../hooks/useWorkflowDownloadStatus';

function fmtBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

export const WorkflowDownloadBanner = ({ workflowId }: { workflowId: string }) => {
  const { isDownloaderNode } = useComfyExecution();
  const { preflight, liveFiles, missingCount, checked } = useWorkflowDownloadStatus(workflowId);

  // Active download — full-width live progress panel
  if (isDownloaderNode && liveFiles.length > 0) {
    const completed = liveFiles.filter((f) => f.exists).length;
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-5 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DownloadCloud className="h-3.5 w-3.5 text-amber-400 animate-pulse flex-shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
              Downloading Models
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-400/60">
            {completed} / {liveFiles.length} ready
          </span>
        </div>

        <div className="space-y-1.5">
          {liveFiles.map((f) => (
            <div key={`${f.folder}/${f.filename}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-zinc-300 truncate min-w-0 font-mono">{f.filename}</span>
                <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">
                  {f.exists
                    ? '✓ Done'
                    : f.currentBytes > 0
                      ? fmtBytes(f.currentBytes)
                      : 'Waiting…'}
                </span>
              </div>
              <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
                {f.exists ? (
                  <div className="h-full bg-emerald-500 w-full" />
                ) : f.currentBytes > 0 ? (
                  <div className="h-full bg-amber-400/60 animate-pulse w-2/3" />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-zinc-600">
          Runs automatically when downloads complete.
        </p>
      </div>
    );
  }

  // Pre-flight — missing models warning bar
  if (checked && missingCount > 0 && !isDownloaderNode) {
    const missing = preflight.filter((f) => !f.exists);
    return (
      <div className="border-b border-amber-500/15 bg-amber-500/[0.04] px-5 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500/80 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-amber-400/90">
            {missingCount} model{missingCount !== 1 ? 's' : ''} will auto-download on first run
          </span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-5">
          {missing.map((f) => (
            <span key={`${f.folder}/${f.filename}`} className="text-[10px] font-mono text-zinc-600 truncate">
              {f.filename}
            </span>
          ))}
        </div>

        <p className="text-[10px] text-zinc-600 pl-5">
          Click Generate — the app downloads and runs automatically.
        </p>
      </div>
    );
  }

  return null;
};
