// LTX Video 2.3 stable aspect / resolution helpers.
// Dimensions must be multiples of 32. Three resolution tiers:
//   S (~480p short side), M (~720p — previous default), L (~1080p).
// Strategy: always send explicit width + height; aspect_ratio string is only
// needed for ComfyUI nodes that still require a validated enum.

export type LtxRatio =
  | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9' | '3:2' | '2:3';

export type LtxResolution = 'S' | 'M' | 'L';

export const LTX_RATIOS: LtxRatio[] = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', '3:2', '2:3'];
export const LTX_RESOLUTIONS: LtxResolution[] = ['S', 'M', 'L'];

const BASE_DIMS: Record<LtxResolution, Record<LtxRatio, [number, number]>> = {
  S: {
    '1:1':  [512, 512],
    '4:3':  [640, 480],
    '3:4':  [480, 640],
    '16:9': [832, 480],
    '9:16': [480, 832],
    '21:9': [896, 384],
    '3:2':  [768, 512],
    '2:3':  [512, 768],
  },
  M: {
    '1:1':  [768, 768],
    '4:3':  [1024, 768],
    '3:4':  [768, 1024],
    '16:9': [1280, 704],
    '9:16': [704, 1280],
    '21:9': [1344, 576],
    '3:2':  [1152, 768],
    '2:3':  [768, 1152],
  },
  L: {
    '1:1':  [1024, 1024],
    '4:3':  [1280, 960],
    '3:4':  [960, 1280],
    '16:9': [1920, 1088],
    '9:16': [1088, 1920],
    '21:9': [1792, 768],
    '3:2':  [1536, 1024],
    '2:3':  [1024, 1536],
  },
};

// Safe strings accepted by common AspectRatio* nodes
const SAFE_ASPECT: Record<LtxRatio, string> = {
  '1:1': '1:1',
  '4:3': '4:3',
  '3:4': '4:3',
  '16:9': '16:9',
  '9:16': '16:9',
  '21:9': '21:9',
  '3:2': '3:2',
  '2:3': '3:2',
};

export function getLtxDimensions(ratio: LtxRatio | string, resolution: LtxResolution = 'M') {
  const r = (LTX_RATIOS.includes(ratio as LtxRatio) ? ratio : '16:9') as LtxRatio;
  const res = (LTX_RESOLUTIONS.includes(resolution as LtxResolution) ? resolution : 'M') as LtxResolution;
  const [w, h] = BASE_DIMS[res][r] ?? [1024, 1024];
  const snap = (n: number) => Math.max(32, Math.round(n / 32) * 32);
  return { width: snap(w), height: snap(h) };
}

export function getSafeLtxAspect(ratio: LtxRatio | string): string {
  const key = (LTX_RATIOS.includes(ratio as LtxRatio) ? ratio : '16:9') as LtxRatio;
  return SAFE_ASPECT[key] ?? '16:9';
}

export function getLtxLabel(ratio: LtxRatio | string, resolution: LtxResolution = 'M') {
  const { width, height } = getLtxDimensions(ratio, resolution);
  return `${ratio} · ${width}×${height}`;
}
