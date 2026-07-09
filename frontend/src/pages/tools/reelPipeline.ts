/**
 * Shared awaitable generation helpers for reel pipelines (Reel Machine, Transform Reel).
 * Pure fetch/poll logic, no React. Direct polling deliberately bypasses useWorkflowRun:
 * these submissions never set the hook's pending state, so its collectors stay dormant
 * and nothing is double-counted.
 */

import { BACKEND_API } from '../../config/api';

export class PipelineCancelled extends Error {
  constructor() { super('cancelled'); this.name = 'PipelineCancelled'; }
}

export interface OutputFile { filename: string; subfolder: string; type: string }

export const viewUrl = (f: OutputFile) =>
  `/comfy/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder)}&type=${f.type}`;

/** POST /api/generate — returns the prompt id or throws. */
export async function submitGenerate(workflowId: string, params: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_id: workflowId, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Generation failed to start');
  return data.prompt_id as string;
}

/** Poll /api/generate/status until completed; resolve with the output files. */
export async function pollGeneration(opts: {
  promptId: string;
  workflowId: string;
  resultKey: 'images' | 'videos';
  intervalMs?: number;
  maxTicks?: number;
  cancelRef?: { current: boolean };
}): Promise<OutputFile[]> {
  const { promptId, workflowId, resultKey, intervalMs = 5000, maxTicks = 120, cancelRef } = opts;
  for (let tick = 0; tick < maxTicks; tick++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (cancelRef?.current) throw new PipelineCancelled();
    try {
      const res = await fetch(
        `${BACKEND_API.BASE_URL}/api/generate/status/${promptId}?workflow_id=${encodeURIComponent(workflowId)}`,
      );
      const data = await res.json();
      if (data.status === 'failed' || data.status === 'error') {
        throw new Error(data.detail || 'Generation failed');
      }
      if (data.status === 'completed') {
        const files: OutputFile[] = data[resultKey] ?? [];
        if (!files.length) throw new Error('Generation finished but produced no output');
        return files;
      }
    } catch (e) {
      if (e instanceof PipelineCancelled) throw e;
      if (e instanceof Error && (e.message.includes('failed') || e.message.includes('no output'))) throw e;
      // transient fetch/parse hiccups: keep polling
    }
  }
  throw new Error('Generation timed out');
}

/** Re-upload a /comfy/view output back into ComfyUI input so the next step can consume it. */
export async function stageAsInput(outUrl: string, name: string): Promise<string> {
  const blob = await (await fetch(outUrl)).blob();
  const form = new FormData();
  form.append('file', new File([blob], name, { type: blob.type || 'image/png' }));
  const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Could not stage image');
  return data.filename as string;
}
