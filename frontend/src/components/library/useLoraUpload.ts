import { useCallback, useEffect, useState } from 'react';
import { BACKEND_API } from '../../config/api';

export type UploadState = {
  total: number;
  done: number;
  current: string | null;
};

/**
 * Multi-file LoRA upload.
 *
 * The old path took `files[0]` and silently discarded the rest of a multi-file
 * drop, and carried its own extension list that disagreed with both the file
 * picker's accept attr and the backend's. The allowlist now comes from the
 * backend (/api/lora/config) so there is exactly one source of truth.
 */
export function useLoraUpload(family: string, onDone?: () => void) {
  const [exts, setExts] = useState<string[]>(['.safetensors', '.ckpt', '.pt']);
  const [state, setState] = useState<UploadState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_CONFIG}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.upload_extensions) && d.upload_extensions.length) {
          setExts(d.upload_extensions);
        }
      })
      .catch(() => {
        /* keep the default; the backend rejects anything wrong anyway */
      });
  }, []);

  const accepts = useCallback(
    (name: string) => exts.some((e) => name.toLowerCase().endsWith(e)),
    [exts],
  );

  const upload = useCallback(
    async (files: File[]) => {
      const usable = files.filter((f) => accepts(f.name));
      const rejected = files.filter((f) => !accepts(f.name));
      setErrors(rejected.map((f) => `${f.name} — not a ${exts.join(' / ')} file`));
      if (!usable.length) return;

      setState({ total: usable.length, done: 0, current: usable[0].name });
      const failed: string[] = [];

      for (let i = 0; i < usable.length; i += 1) {
        const file = usable[i];
        setState({ total: usable.length, done: i, current: file.name });
        try {
          const form = new FormData();
          form.append('file', file);
          form.append('family', family);
          const res = await fetch(
            `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_UPLOAD_LOCAL}`,
            { method: 'POST', body: form },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) throw new Error(data.detail || 'Upload failed');
        } catch (err: any) {
          failed.push(`${file.name} — ${err?.message || 'upload failed'}`);
        }
      }

      setState(null);
      setErrors((prev) => [...prev, ...failed]);
      window.dispatchEvent(new CustomEvent('fedda:refresh-loras'));
      fetch(`${BACKEND_API.BASE_URL}/api/comfy/refresh-models`, { method: 'POST' }).catch(() => {});
      onDone?.();
    },
    [accepts, exts, family, onDone],
  );

  return { upload, state, errors, exts, accepts, clearErrors: () => setErrors([]) };
}
