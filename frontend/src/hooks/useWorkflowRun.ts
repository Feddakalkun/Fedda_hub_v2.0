import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_API } from '../config/api';
import { useComfyExecution } from '../contexts/ComfyExecutionContext';
import { comfyService } from '../services/comfyService';
import { usePersistentState } from './usePersistentState';
import { useToast } from '../components/ui/Toast';
import type { GenerateResponse, GenerateStatusResponse, NodeMapResponse } from '../types/api';

type OutputKind = 'video';

interface UseWorkflowRunOptions {
  workflowId: string;
  historyKey: string;
  currentKey: string;
  outputKind: OutputKind;
  maxHistory?: number;
  readyMessage?: string;
}

interface StartWorkflowOptions {
  clearCurrent?: boolean;
}

const outputUrl = (file: { filename: string; subfolder?: string; type?: string }) =>
  `/comfy/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${file.type || 'output'}`;

export const useWorkflowRun = ({
  workflowId,
  historyKey,
  currentKey,
  outputKind,
  maxHistory = 40,
  readyMessage = 'Generation ready',
}: UseWorkflowRunOptions) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);
  const [currentMedia, setCurrentMedia] = usePersistentState<string | null>(currentKey, null);
  const [history, setHistory] = usePersistentState<string[]>(historyKey, []);

  // Batch queue: param-sets waiting to run one after another
  const queueRef = useRef<Record<string, unknown>[]>([]);
  const batchTotalRef = useRef(0);
  const advanceQueueRef = useRef<() => boolean>(() => false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  const prevOutputCountRef = useRef(0);
  const sessionUrlsRef = useRef<string[]>([]);
  // Guards against the WebSocket and HTTP-polling completion paths both firing for one job
  const completionHandledRef = useRef(false);
  const {
    state: execState,
    lastOutputVideos,
    outputReadyCount,
    registerNodeMap,
  } = useComfyExecution();

  const collectUrls = useCallback((urls: string[]) => {
    if (!urls.length) return;
    sessionUrlsRef.current = [...sessionUrlsRef.current, ...urls];
    setCurrentMedia(urls[0]);
    setHistory((prev) => [...urls, ...prev.filter((url) => !urls.includes(url))].slice(0, maxHistory));
  }, [maxHistory, setCurrentMedia, setHistory]);

  useEffect(() => {
    if (outputKind !== 'video') return;
    if (!isGenerating && !pendingPromptId) return;
    if (!lastOutputVideos?.length) return;

    const newOutputs = lastOutputVideos.slice(prevOutputCountRef.current);
    if (!newOutputs.length) return;
    prevOutputCountRef.current = lastOutputVideos.length;
    collectUrls(newOutputs.map(outputUrl));
  }, [collectUrls, isGenerating, lastOutputVideos, outputKind, outputReadyCount, pendingPromptId]);

  useEffect(() => {
    if (!pendingPromptId) return;
    if (execState === 'error') {
      setIsGenerating(false);
      setPendingPromptId(null);
      queueRef.current = [];
      batchTotalRef.current = 0;
      setBatchProgress(null);
      return;
    }
    if (execState !== 'done') return;
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;

    const promptId = pendingPromptId;
    setIsGenerating(false);
    setPendingPromptId(null);

    fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE_STATUS}/${promptId}`)
      .then((r) => r.json() as Promise<GenerateStatusResponse>)
      .then((data) => {
        if (outputKind === 'video' && data.status === 'completed' && data.videos?.length) {
          collectUrls(data.videos.map(outputUrl));
        }
        toast(readyMessage, 'success');
      })
      .catch(() => toast(readyMessage, 'success'))
      .finally(() => { advanceQueueRef.current(); });
  }, [collectUrls, execState, outputKind, pendingPromptId, readyMessage, toast]);

  // HTTP fallback polling — handles completion when WebSocket is unavailable (e.g. ComfyUI 403 on origin mismatch)
  useEffect(() => {
    if (!pendingPromptId) return;
    const capturedId = pendingPromptId;
    const id = setInterval(async () => {
      if (completionHandledRef.current) { clearInterval(id); return; }
      try {
        const resp = await fetch(
          `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE_STATUS}/${capturedId}`
        );
        const data = await resp.json() as GenerateStatusResponse;
        if (data.status !== 'completed') return;
        if (completionHandledRef.current) { clearInterval(id); return; }
        completionHandledRef.current = true;
        clearInterval(id);
        setIsGenerating(false);
        setPendingPromptId(null);
        if (outputKind === 'video' && data.videos?.length) {
          collectUrls(data.videos.map(outputUrl));
        }
        toast(readyMessage, 'success');
        advanceQueueRef.current();
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [pendingPromptId, collectUrls, outputKind, readyMessage, toast]);

  // Internal submit — no isGenerating guard so the batch chain can call it
  const submit = useCallback(async (params: Record<string, unknown>, options: StartWorkflowOptions = {}) => {
    completionHandledRef.current = false;
    sessionUrlsRef.current = [];
    prevOutputCountRef.current = outputKind === 'video' ? (lastOutputVideos?.length ?? 0) : 0;
    if (options.clearCurrent !== false) {
      setCurrentMedia(null);
    }
    setIsGenerating(true);

    fetch(`${BACKEND_API.BASE_URL}/api/workflow/node-map/${workflowId}`)
      .then((r) => r.json() as Promise<NodeMapResponse>)
      .then((data) => {
        if (data.success) registerNodeMap(data.node_map);
      })
      .catch(() => {});

    try {
      const response = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          params: { ...params, client_id: comfyService.clientId },
        }),
      });
      const data = await response.json() as GenerateResponse;
      if (!data.success) {
        throw new Error(data.detail || 'Failed to start generation');
      }
      setPendingPromptId(data.prompt_id);
      return data.prompt_id;
    } catch (err: any) {
      toast(err.message || 'Failed to generate', 'error');
      setIsGenerating(false);
      setPendingPromptId(null);
      queueRef.current = [];
      setBatchProgress(null);
      return null;
    }
  }, [lastOutputVideos, outputKind, registerNodeMap, setCurrentMedia, toast, workflowId]);

  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; });

  /** After a job completes, start the next queued one (returns true if it did). */
  const advanceQueue = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      if (batchTotalRef.current > 0) {
        batchTotalRef.current = 0;
        setBatchProgress(null);
        toast('Batch complete', 'success');
      }
      return false;
    }
    setBatchProgress({
      current: batchTotalRef.current - queueRef.current.length,
      total: batchTotalRef.current,
    });
    setTimeout(() => { void submitRef.current(next, { clearCurrent: false }); }, 400);
    return true;
  }, [toast]);
  advanceQueueRef.current = advanceQueue;

  const start = useCallback(async (params: Record<string, unknown>, options: StartWorkflowOptions = {}) => {
    if (isGenerating) return null;
    queueRef.current = [];
    batchTotalRef.current = 0;
    setBatchProgress(null);
    return submit(params, options);
  }, [isGenerating, submit]);

  /** Queue several param-sets; they run one after another. */
  const startBatch = useCallback(async (paramsList: Record<string, unknown>[]) => {
    if (isGenerating || !paramsList.length) return;
    queueRef.current = paramsList.slice(1);
    batchTotalRef.current = paramsList.length;
    setBatchProgress({ current: 1, total: paramsList.length });
    await submit(paramsList[0]);
  }, [isGenerating, submit]);

  return {
    isGenerating,
    pendingPromptId,
    currentMedia,
    setCurrentMedia,
    history,
    setHistory,
    start,
    startBatch,
    batchProgress,
  };
};
