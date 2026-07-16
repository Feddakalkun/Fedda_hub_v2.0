/**
 * LoRA path/label helpers.
 *
 * `toLabel` previously existed as byte-identical copies in LoraSelector.tsx and
 * LoraCharacterCard.tsx; the Library needed a third. One copy now.
 */

/** Forward slashes, no leading/trailing slash, lowercase — for comparison only. */
export function normalizeLoraPath(path: string): string {
  return (path || '').replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

/** Bare filename of a LoRA path, separators-agnostic. */
export function loraFileName(path: string): string {
  return (path || '').replace(/\\/g, '/').split('/').pop() ?? path;
}

/** Human label: drop the folder, the extension, and the pack's PMv suffix. */
export function toLabel(path: string): string {
  const stem = loraFileName(path).replace(/\.safetensors$/i, '');
  return stem.replace(/_PMv\d+[ab]_ZImage$/i, '').replace(/_/g, ' ');
}

/**
 * Does a LoRA path match a family filter?
 *
 * Substring, not prefix, and deliberately so: character LoRAs live under
 * `app/<Name>/` rather than `qwen/`, so `app/Aurora/aurora_krea2_x.safetensors`
 * must still match the krea2 filter. Mirrors matchesLoraFilter in ZImageTxt2Img.
 */
export function matchesFamily(path: string, prefixes: string[]): boolean {
  if (!prefixes.length) return true;
  const norm = normalizeLoraPath(path);
  return prefixes.some((p) => norm.includes(normalizeLoraPath(p)));
}
