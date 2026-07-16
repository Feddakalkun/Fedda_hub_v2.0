/**
 * Characters — folders of LoRAs that belong to one person.
 *
 * Detection lives in the BACKEND (lora_service.get_characters): a character is a
 * folder holding a lone .md sheet + LoRAs, OR a direct child of app/. Only the
 * backend can see .md files, so the rule can't live here. This module is the
 * client for /api/lora/characters plus the sheet read/write helpers.
 */

import { BACKEND_API } from '../config/api';
import { matchesFamily } from './loraLabel';

export type CharacterLora = {
  /** Native relative path as ComfyUI reports it — what workflows store. */
  path: string;
  file: string;
  size_mb?: number;
};

export type Character = {
  name: string;
  folder: string;
  /** Relative path of the shared .md, or null when the character has no sheet. */
  sheet: string | null;
  has_sheet: boolean;
  loras: CharacterLora[];
};

export type Sheet = {
  exists: boolean;
  trigger: string;
  appearance: string;
};

export async function fetchCharacters(): Promise<Character[]> {
  const res = await fetch(`${BACKEND_API.BASE_URL}/api/lora/characters`);
  const data = await res.json();
  if (!data?.success) throw new Error(data?.detail || 'Could not load characters');
  return (data.characters ?? []) as Character[];
}

/** Does any of the character's LoRAs match the family filter? */
export function characterMatchesFamily(c: Character, prefixes: string[]): boolean {
  if (!prefixes.length) return true;
  return c.loras.some((l) => matchesFamily(l.path, prefixes));
}

/**
 * Read a character's sheet. Any of its LoRAs resolves to the same file — the
 * backend falls back to the folder's lone .md.
 */
export async function loadSheet(c: Character): Promise<Sheet> {
  if (!c.loras.length) return { exists: false, trigger: '', appearance: '' };
  try {
    const res = await fetch(
      `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_SHEET}?file=${encodeURIComponent(
        c.loras[0].path,
      )}`,
    );
    const data = await res.json();
    if (data?.success && data.exists) {
      return {
        exists: true,
        trigger: data.trigger || c.name.toLowerCase(),
        appearance: (data.appearance || '').replace(/\s+/g, ' ').trim(),
      };
    }
  } catch {
    /* fall through */
  }
  return { exists: false, trigger: c.name.toLowerCase(), appearance: '' };
}

export async function saveSheet(c: Character, sheet: Pick<Sheet, 'trigger' | 'appearance'>) {
  const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_SHEET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: c.loras[0].path,
      trigger: sheet.trigger,
      appearance: sheet.appearance,
    }),
  });
  // This route answers 200 with {success:false, error} rather than raising,
  // so the error key is `error`, not FastAPI's `detail`.
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || data.detail || 'Could not save sheet');
  return data;
}

/**
 * Ollama vision: describe an image into sheet appearance text.
 * The route takes only the image and returns `description`; it is deliberately
 * appearance-only (no clothing/pose/background) so the sheet stays scene-agnostic.
 */
export async function describeImage(image: File): Promise<string> {
  const form = new FormData();
  form.append('file', image);
  const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_SHEET}/describe`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || data.detail || 'Could not describe image');
  return (data.description || '').trim();
}

/** Store an image as the LoRA's preview. */
export async function savePreview(loraPath: string, image: File) {
  const form = new FormData();
  form.append('file', loraPath);
  form.append('image', image);
  const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_PREVIEW}`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.detail || 'Could not save preview');
  return data;
}

/** Preview image URL for a LoRA — 404s until one is saved. */
export function previewUrl(loraPath: string, bust?: number): string {
  const base = `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.LORA_PREVIEW}?file=${encodeURIComponent(
    loraPath,
  )}`;
  return bust ? `${base}&v=${bust}` : base;
}
