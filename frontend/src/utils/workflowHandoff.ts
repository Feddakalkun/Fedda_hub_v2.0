/**
 * Workflow handoff — pass an image or video from one page to a receiving workflow.
 *
 * Flow:
 *   Sender:   setHandoff(url, 'image')  → window.location.hash = '#/tab/<dest>'
 *   Receiver: useEffect(() => { const url = consumeHandoff('image'); ... }, [])
 *
 * The TTL (5 s) prevents a stale handoff from re-populating on a later visit.
 */

const HANDOFF_KEY = 'fedda_workflow_handoff';
const HANDOFF_TTL = 5_000;

interface HandoffPayload {
  url: string;
  kind: 'image' | 'video';
  ts: number;
}

export function setHandoff(url: string, kind: 'image' | 'video'): void {
  try {
    const payload: HandoffPayload = { url, kind, ts: Date.now() };
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
}

/** Consume and return the URL if a fresh handoff of the given kind exists. */
export function consumeHandoff(kind: 'image' | 'video'): string | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const payload: HandoffPayload = JSON.parse(raw);
    if (payload.kind !== kind) return null;
    if (Date.now() - payload.ts > HANDOFF_TTL) {
      localStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    localStorage.removeItem(HANDOFF_KEY);
    return payload.url;
  } catch {
    return null;
  }
}

/** Navigate to a workflow tab (uses hash routing already in use by the app). */
export function navigateToTab(tabId: string): void {
  window.location.hash = `#/tab/${encodeURIComponent(tabId)}`;
}
