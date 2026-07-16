import { useCallback, useEffect, useState } from 'react';
import { BACKEND_API } from '../../config/api';

export type InstalledLora = {
  /** Native relative path — what ComfyUI/workflows use. */
  path: string;
  name: string;
  folder: string;
  size_mb: number;
  mtime: number;
  is_link: boolean;
};

/**
 * The installed LoRA index, in ONE request.
 *
 * The old Library fired a download-status request per LoRA every 8 seconds
 * regardless of whether anything was downloading. This fetches the whole index
 * once and refreshes on demand (plus on the app-wide refresh event that the
 * upload path already dispatches).
 */
export function useInstalledLoras() {
  const [loras, setLoras] = useState<InstalledLora[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_INSTALLED}`);
      const data = await res.json();
      const map = (data?.installed ?? data ?? {}) as Record<string, Omit<InstalledLora, never>>;
      const list = Object.values(map)
        .filter((v): v is InstalledLora => !!v && typeof (v as InstalledLora).path === 'string')
        .sort((a, b) => a.path.localeCompare(b.path));
      setLoras(list);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load installed LoRAs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // The upload/import paths already dispatch this; listening keeps every view in sync.
    const onRefresh = () => void refresh();
    window.addEventListener('fedda:refresh-loras', onRefresh);
    return () => window.removeEventListener('fedda:refresh-loras', onRefresh);
  }, [refresh]);

  return { loras, loading, error, refresh };
}
