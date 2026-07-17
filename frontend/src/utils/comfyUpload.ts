import { BACKEND_API } from '../config/api';

/**
 * Upload a File into ComfyUI's input dir via the backend proxy, returning the
 * stored filename. Lifted verbatim from the identical copies that lived in
 * Wan21Scail2Page and Wan21SteadyDancerPage.
 */
export async function uploadToComfy(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.detail || 'Upload failed');
  return String(data.filename);
}
