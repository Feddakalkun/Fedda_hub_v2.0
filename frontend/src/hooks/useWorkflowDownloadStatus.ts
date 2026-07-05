import { useCallback, useEffect, useRef, useState } from 'react';
import { useComfyExecution } from '../contexts/ComfyExecutionContext';
import { BACKEND_API } from '../config/api';

export interface DownloadFileStatus {
  filename: string;
  folder: string;
  exists: boolean;
  currentBytes: number;
}

export interface PreflightFileStatus {
  filename: string;
  folder: string;
  exists: boolean;
  size_bytes: number;
}

export interface WorkflowDownloadState {
  preflight: PreflightFileStatus[];
  liveFiles: DownloadFileStatus[];
  missingCount: number;
  allReady: boolean;
  checked: boolean;
  manualDownloading: boolean;
  startDownload: () => Promise<void>;
}

export function useWorkflowDownloadStatus(workflowId: string): WorkflowDownloadState {
  const { isDownloaderNode } = useComfyExecution();
  const [preflight, setPreflight] = useState<PreflightFileStatus[]>([]);
  const [liveFiles, setLiveFiles] = useState<DownloadFileStatus[]>([]);
  const [checked, setChecked] = useState(false);
  const [manualDownloading, setManualDownloading] = useState(false);
  const wasDownloadingRef = useRef(false);

  const fetchPreflight = useCallback(async () => {
    try {
      const resp = await fetch(
        `${BACKEND_API.BASE_URL}/api/workflow/model-status/${encodeURIComponent(workflowId)}`
      );
      if (!resp.ok) return;
      const data: { files?: Array<{ filename?: unknown; folder?: unknown; exists?: unknown; size_bytes?: unknown }> } = await resp.json();
      const files: PreflightFileStatus[] = (data.files ?? []).map((f) => ({
        filename: String(f.filename ?? ''),
        folder: String(f.folder ?? ''),
        exists: Boolean(f.exists),
        size_bytes: Number(f.size_bytes ?? 0),
      }));
      setPreflight(files);
      setChecked(true);
    } catch {
      // Network unavailable — silent, no crash
    }
  }, [workflowId]);

  // Initial preflight on mount
  useEffect(() => {
    fetchPreflight();
  }, [fetchPreflight]);

  // Refresh preflight when a download run completes
  useEffect(() => {
    const wasDownloading = wasDownloadingRef.current;
    wasDownloadingRef.current = isDownloaderNode;
    if (wasDownloading && !isDownloaderNode) {
      fetchPreflight();
    }
  }, [isDownloaderNode, fetchPreflight]);

  // Start a manual pre-download (no generation) of all missing models
  const startDownload = useCallback(async () => {
    try {
      const resp = await fetch(
        `${BACKEND_API.BASE_URL}/api/workflow/download-models/${encodeURIComponent(workflowId)}`,
        { method: 'POST' }
      );
      if (resp.ok) setManualDownloading(true);
    } catch {
      // Network unavailable — leave state unchanged
    }
  }, [workflowId]);

  // Poll live file sizes while the HuggingFaceDownloader node is executing
  // or a manual pre-download is in flight
  const pollingActive = isDownloaderNode || manualDownloading;
  useEffect(() => {
    if (!pollingActive) {
      setLiveFiles([]);
      return;
    }
    let mounted = true;
    const poll = async () => {
      try {
        const resp = await fetch(
          `${BACKEND_API.BASE_URL}/api/workflow/download-live-progress/${encodeURIComponent(workflowId)}`
        );
        if (!resp.ok || !mounted) return;
        const data: { files?: Array<{ filename?: unknown; folder?: unknown; exists?: unknown; currentBytes?: unknown }> } = await resp.json();
        if (!mounted) return;
        const files = (data.files ?? []).map((f) => ({
          filename: String(f.filename ?? ''),
          folder: String(f.folder ?? ''),
          exists: Boolean(f.exists),
          currentBytes: Number(f.currentBytes ?? 0),
        }));
        setLiveFiles(files);
        // Manual pre-download finishes when every file is on disk
        if (manualDownloading && files.length > 0 && files.every((f) => f.exists)) {
          setManualDownloading(false);
          fetchPreflight();
        }
      } catch {
        // Silent — polling failures don't matter
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollingActive, manualDownloading, workflowId, fetchPreflight]);

  const missingCount = preflight.filter((f) => !f.exists).length;

  return {
    preflight,
    liveFiles,
    missingCount,
    allReady: checked && missingCount === 0,
    checked,
    manualDownloading,
    startDownload,
  };
}
