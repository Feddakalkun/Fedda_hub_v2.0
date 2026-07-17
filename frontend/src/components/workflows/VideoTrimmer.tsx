import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';

export type TrimmerMeta = {
  durationSec: number;
  width: number;
  height: number;
  /** fps is populated once the backend probe lands (Stage B); undefined until then. */
  fps?: number;
};

function fmtTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Draggable dual-handle video trimmer with live seek. Extracted verbatim (drag
 * loop, getSeconds, track JSX) from Wan21SteadyDancerPage so Scail2 can drop its
 * clunky twin number-sliders for the same UX.
 *
 * Controlled: parent owns startSec/endSec. The component owns the transient
 * playhead + drag state + the video element, and reports metadata up via
 * onLoaded (including fps when the parent passes it through from the probe).
 */
export const VideoTrimmer = ({
  videoUrl,
  startSec,
  endSec,
  onChange,
  onLoaded,
  onCapture,
  capturing = false,
  captureLabel = 'Capture start frame',
  emptyLabel = 'No motion source loaded',
}: {
  videoUrl: string | null;
  startSec: number;
  endSec: number;
  onChange: (start: number, end: number) => void;
  onLoaded?: (meta: TrimmerMeta) => void;
  /** Omit to hide the capture button (Scail2 has no pose-capture step). */
  onCapture?: () => void;
  capturing?: boolean;
  captureLabel?: string;
  emptyLabel?: string;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const onVideoLoaded = () => {
    const video = videoRef.current;
    const d = video?.duration || 0;
    const w = video?.videoWidth || 0;
    const h = video?.videoHeight || 0;
    setDuration(d);
    setCurrentTime(0);
    onLoaded?.({ durationSec: d, width: w, height: h });
  };

  const getSeconds = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration;
    },
    [duration],
  );

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const seconds = getSeconds(event);
      if (dragging.current === 'start') {
        const value = Math.min(seconds, Math.max(0, endSec - 0.25));
        onChange(value, endSec);
        if (videoRef.current) videoRef.current.currentTime = value;
      } else {
        const value = Math.max(seconds, startSec + 0.25);
        onChange(startSec, value);
        if (videoRef.current) videoRef.current.currentTime = value;
      }
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [endSec, getSeconds, startSec, onChange]);

  const clipLength = Math.max(0, endSec - startSec);
  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct = duration > 0 ? (endSec / duration) * 100 : 100;
  const currentPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
      {videoUrl ? (
        <div className="relative">
          <video
            ref={videoRef}
            src={videoUrl}
            className="aspect-video w-full object-contain"
            controls={false}
            playsInline
            onLoadedMetadata={onVideoLoaded}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          />
          {onCapture && (
            <button
              type="button"
              onClick={onCapture}
              disabled={capturing}
              className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {captureLabel}
            </button>
          )}
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/70 p-3 backdrop-blur">
            <div
              ref={trackRef}
              className="relative h-8 cursor-pointer rounded-full bg-white/[0.06]"
              onMouseDown={(event) => {
                const seconds = getSeconds(event);
                if (Math.abs(seconds - startSec) < Math.abs(seconds - endSec)) dragging.current = 'start';
                else dragging.current = 'end';
              }}
            >
              <div className="absolute inset-y-1 rounded-full bg-white/15" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
              <div className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${currentPct}%` }} />
              <button type="button" onMouseDown={() => { dragging.current = 'start'; }} className="absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100" style={{ left: `${startPct}%` }} />
              <button type="button" onMouseDown={() => { dragging.current = 'end'; }} className="absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100" style={{ left: `${endPct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Start {fmtTime(startSec)}</span>
              <span>Clip {clipLength.toFixed(1)}s</span>
              <span>End {fmtTime(endSec)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center text-sm text-zinc-700">{emptyLabel}</div>
      )}
    </div>
  );
};
