const previewFlag = (import.meta as any)?.env?.VITE_PREVIEW_MODE;

export const isPreviewMode = previewFlag === '1' || previewFlag === 'true';

/**
 * Guard actions that should be blocked in public preview/demo mode.
 * In normal local app mode this is a no-op.
 */
export function assertPreviewAllowed(_action: string): void {
    if (!isPreviewMode) return;
    throw new Error('Preview mode: action disabled');
}

