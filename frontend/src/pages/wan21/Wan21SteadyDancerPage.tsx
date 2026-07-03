import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Play,
  Scissors,
  Upload,
  Video,
} from 'lucide-react';
import { BACKEND_API } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { comfyService } from '../../services/comfyService';
import { consumeHandoff } from '../../utils/workflowHandoff';
import { WorkflowShell } from '../../components/layout/WorkflowShell';
import { triggerMediaDownload } from '../../utils/mediaStore';
import { inputBase, smallLabel, panel, cn } from '../../lib/styles';
import { Field, NeutralButton } from '../../components/ui/FeddaPrimitives';

type ComfyImage = { filename: string; subfolder?: string; type?: string };

const CONTROL_MODES = [
  { label: 'DWPose', value: 2 },
  { label: 'Lotus Depth', value: 1 },
  { label: 'Canny', value: 3 },
  { label: 'Canny Edge', value: 4 },
  { label: 'HED Soft Edge', value: 5 },
];

const STYLES = [
  'No Style',
  'Hyper Portrait Master',
  'Natural Beauty Unfiltered',
  'Kodak Portra Film',
  'Soft Diffused Intimacy',
  'Authentic Unposed Moment',
];

function comfyViewUrl(filename: string | null, type: 'input' | 'output' = 'input', subfolder = '') {
  if (!filename) return null;
  return `/comfy/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;
}

function outputUrl(file: ComfyImage) {
  if (file.type === 'input') return comfyViewUrl(file.filename, 'input', file.subfolder || '') || '';
  return comfyService.getImageUrl(file);
}

function isVitPosePreviewUrl(url: string) {
  return /vitpose/i.test(url);
}

function isLikelySteadyDancerUrl(url: string) {
  return /(dancer|wanvideowrapper_steadydancer|video%2fdancer|video\/dancer)/i.test(url);
}

function isGeneratedPoseFilename(filename?: string | null) {
  return Boolean(filename && /^fedda_approved_pose_/i.test(filename));
}

function fmtTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const StageHeader = ({ step, title, detail }: { step: string; title: string; detail?: string }) => (
  <div className="mb-3 flex items-start justify-between gap-3">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">{step}</p>
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  </div>
);

const UploadDrop = ({
  accept,
  label,
  filename,
  preview,
  busy,
  onFile,
}: {
  accept: string;
  label: string;
  filename: string | null;
  preview?: ReactNode;
  busy: boolean;
  onFile: (file: File) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-[92px] w-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-4 text-center transition hover:border-white/30 hover:bg-white/[0.03]"
      >
        {busy ? (
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading
          </span>
        ) : preview ? (
          preview
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Upload className="h-4 w-4" />
            {label}
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
      />
      {filename ? <p className="truncate text-[11px] text-zinc-500">{filename}</p> : null}
    </div>
  );
};

const SteadyVideoPreviewStrip = ({
  currentVideo,
  history,
  isGenerating,
  onSelectVideo,
}: {
  currentVideo: string | null;
  history: string[];
  isGenerating: boolean;
  onSelectVideo: (url: string) => void;
}) => (
  <section className="rounded-xl border border-white/10 bg-[#09090b] p-3">
    <div className="mb-2 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => currentVideo && window.open(currentVideo, '_blank', 'noopener,noreferrer')}
        disabled={!currentVideo}
        className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 transition hover:text-zinc-200 disabled:pointer-events-none"
      >
        <Video className="h-3.5 w-3.5" />
        Output Preview
      </button>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-zinc-600">
          {isGenerating ? 'Rendering' : 'Recent'} · {history.length}
        </span>
        {currentVideo ? (
          <>
            <button
              type="button"
              onClick={() => window.open(currentVideo, '_blank', 'noopener,noreferrer')}
              className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 transition hover:text-zinc-100"
              title="Open output"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => triggerMediaDownload(currentVideo, 'fedda-steady-dancer.mp4')}
              className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 transition hover:text-zinc-100"
              title="Download output"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </div>

    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
      {currentVideo ? (
        <button
          type="button"
          onClick={() => onSelectVideo(currentVideo)}
          className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-white/25 bg-black"
        >
          <video src={currentVideo} className="h-full w-full object-cover" muted playsInline />
          <div className="absolute left-1.5 top-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-black">
            Selected
          </div>
        </button>
      ) : (
        <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/35 text-center text-[11px] text-zinc-700">
          {isGenerating ? 'Rendering output' : 'No output yet'}
        </div>
      )}

      {history.filter((url) => url !== currentVideo).slice(0, 10).map((url, index) => (
        <button
          key={`${url}-${index}`}
          type="button"
          onClick={() => onSelectVideo(url)}
          className="h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black transition hover:border-white/30"
        >
          <video src={url} className="h-full w-full object-cover" muted playsInline />
        </button>
      ))}
    </div>
  </section>
);

export function Wan21SteadyDancerPage() {
  const { toast } = useToast();
  const {
    state: execState,
    error: execError,
    lastOutputVideos,
    outputReadyCount,
    registerNodeMap,
  } = useComfyExecution();

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);
  const prevVideoCountRef = useRef(0);
  const sessionRef = useRef<string[]>([]);

  const [sourceUrl, setSourceUrl] = useState('');
  const [subjectImageFile, setSubjectImageFile] = usePersistentState<string | null>('wan21sd_subject_image', null);
  const [motionVideoFile, setMotionVideoFile] = usePersistentState<string | null>('wan21sd_motion_video', null);
  const [trimmedMotionFile, setTrimmedMotionFile] = usePersistentState<string | null>('wan21sd_trimmed_motion_video', null);
  const [capturedFrameFile, setCapturedFrameFile] = usePersistentState<string | null>('wan21sd_pose_frame', null);
  const [approvedSubjectFile, setApprovedSubjectFile] = usePersistentState<string | null>('wan21sd_approved_subject', null);

  const [uploadingSubject, setUploadingSubject] = useState(false);
  const [uploadingMotion, setUploadingMotion] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isGeneratingPose, setIsGeneratingPose] = useState(false);
  const [isImportingPose, setIsImportingPose] = useState(false);
  const [isRecoveringPose, setIsRecoveringPose] = useState(false);

  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  const [prompt, setPrompt] = usePersistentState('wan21sd_prompt', 'a cinematic dance video, natural movement, realistic lighting');
  const [width, setWidth] = usePersistentState('wan21sd_width', 480);
  const [height, setHeight] = usePersistentState('wan21sd_height', 832);
  const [videoLength, setVideoLength] = usePersistentState('wan21sd_length', 4);
  const [fps, setFps] = usePersistentState('wan21sd_fps', 16);
  const [steps, setSteps] = usePersistentState('wan21sd_steps', 12);
  const [cfg, setCfg] = usePersistentState('wan21sd_cfg', 1);
  const [poseSpatial, setPoseSpatial] = usePersistentState('wan21sd_pose_spatial', 1);
  const [poseTemporal, setPoseTemporal] = usePersistentState('wan21sd_pose_temporal', 1);
  const [seed, setSeed] = usePersistentState('wan21sd_seed', -1);
  const [loraName, setLoraName] = usePersistentState('wan21sd_lora', '');
  const [loraStrength, setLoraStrength] = usePersistentState('wan21sd_lora_strength', 1);

  const [posePrompt, setPosePrompt] = usePersistentState(
    'wan21sd_pose_prompt',
    'realistic full body photo of the character, same exact pose as the reference, natural anatomy, detailed face, cinematic studio lighting',
  );
  const [controlMode, setControlMode] = usePersistentState('wan21sd_control_mode', 2);
  const [controlStyle, setControlStyle] = usePersistentState('wan21sd_control_style', 'No Style');
  const [controlStrength, setControlStrength] = usePersistentState('wan21sd_control_strength', 0.7);
  const [poseWidth, setPoseWidth] = usePersistentState('wan21sd_pose_width', 1500);
  const [poseHeight, setPoseHeight] = usePersistentState('wan21sd_pose_height', 1500);
  const [poseSteps, setPoseSteps] = usePersistentState('wan21sd_pose_steps', 9);
  const [poseCfg, setPoseCfg] = usePersistentState('wan21sd_pose_cfg', 1);
  const [poseDenoise, setPoseDenoise] = usePersistentState('wan21sd_pose_denoise', 1);
  const [poseSeed, setPoseSeed] = usePersistentState('wan21sd_pose_seed', -1);
  const [characterLora, setCharacterLora] = usePersistentState('wan21sd_character_lora', '');
  const [characterLoraStrength, setCharacterLoraStrength] = usePersistentState('wan21sd_character_lora_strength', 1);

  const [poseImages, setPoseImages] = useState<ComfyImage[]>([]);
  const [currentVideo, setCurrentVideo] = useState<string | null>(null);
  const [history, setHistory] = usePersistentState<string[]>('wan21sd_history', []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);

  const sourceVideoUrl = comfyViewUrl(motionVideoFile, 'input');
  const trimmedVideoUrl = comfyViewUrl(trimmedMotionFile, 'input');
  const capturedFrameUrl = comfyViewUrl(capturedFrameFile, 'input');
  const directSubjectFile = isGeneratedPoseFilename(subjectImageFile) ? null : subjectImageFile;
  const posePipelineStarted = Boolean(capturedFrameFile || approvedSubjectFile || poseImages.length > 0 || isGeneratingPose);
  const finalSubjectFile = posePipelineStarted ? approvedSubjectFile : directSubjectFile;
  const subjectPreviewUrl = comfyViewUrl(finalSubjectFile, 'input');
  const finalMotionFile = trimmedMotionFile || motionVideoFile;
  const clipLength = Math.max(0, endTime - startTime);
  const requestedFrames = Math.round(Number(fps || 0) * Number(videoLength || 0));
  const subjectModeLabel = finalSubjectFile
    ? (posePipelineStarted ? 'Using approved pose image' : 'Using direct subject image')
    : (posePipelineStarted ? 'Approve a generated pose image before final run' : 'Add a subject image');

  const clearPoseStage = useCallback(() => {
    setCapturedFrameFile(null);
    setApprovedSubjectFile(null);
    if (isGeneratedPoseFilename(subjectImageFile)) {
      setSubjectImageFile(null);
    }
    setPoseImages([]);
  }, [setApprovedSubjectFile, setCapturedFrameFile, setSubjectImageFile, subjectImageFile]);

  const wanLoras = useMemo(() => availableLoras.filter((name) => {
    const n = name.replace(/\\/g, '/').toLowerCase();
    return n.includes('wan') || n.includes('lightx2v') || n.includes('steady');
  }), [availableLoras]);

  const characterLoras = useMemo(() => [...availableLoras].sort((a, b) => a.localeCompare(b)), [availableLoras]);

  useEffect(() => {
    comfyService.getLoras().then(setAvailableLoras).catch(() => setAvailableLoras([]));
  }, []);

  useEffect(() => {
    if (!isGenerating && !pendingPromptId) return;
    if (!lastOutputVideos?.length) return;
    const newVideos = lastOutputVideos.slice(prevVideoCountRef.current);
    if (newVideos.length === 0) return;
    prevVideoCountRef.current = lastOutputVideos.length;
    const urls = newVideos.map((videoFile) => comfyService.getImageUrl(videoFile));
    const nonVitpose = urls.filter((url) => !isVitPosePreviewUrl(url));
    const preferred = nonVitpose.length > 0 ? nonVitpose : urls;
    if (preferred.length === 0) return;

    sessionRef.current = [...sessionRef.current, ...preferred];

    const likelyFinal = preferred.find((url) => isLikelySteadyDancerUrl(url));
    setCurrentVideo(likelyFinal || preferred[preferred.length - 1]);
    setHistory((prev) => [...preferred, ...prev].slice(0, 40));
  }, [outputReadyCount, lastOutputVideos, isGenerating, pendingPromptId, setHistory]);

  useEffect(() => {
    if (!pendingPromptId) return;
    if (execState === 'done') {
      setIsGenerating(false);
      setPendingPromptId(null);
      toast(`Steady Dancer done (${sessionRef.current.length || 1} output)`, 'success');
    }
    if (execState === 'error') {
      setIsGenerating(false);
      setPendingPromptId(null);
      const message = typeof execError === 'string' ? execError : execError?.message || 'Steady Dancer failed';
      toast(message, 'error');
    }
  }, [execError, execState, pendingPromptId, toast]);

  useEffect(() => {
    if (!pendingPromptId || !isGenerating) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 360; // ~30 minutes @ 5s

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/api/generate/status/${encodeURIComponent(pendingPromptId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) return;

        if (data.status === 'completed') {
          const videos = Array.isArray(data.videos) ? data.videos : [];
          const urls = videos
            .map((videoFile: any) => comfyService.getImageUrl(videoFile))
            .filter((url: string) => !isVitPosePreviewUrl(url));

          if (urls.length > 0) {
            sessionRef.current = [...sessionRef.current, ...urls];
            const likelyFinal = urls.find((url: string) => isLikelySteadyDancerUrl(url));
            setCurrentVideo(likelyFinal || urls[urls.length - 1]);
            setHistory((prev) => [...urls, ...prev].slice(0, 40));
            setIsGenerating(false);
            setPendingPromptId(null);
            toast(`Steady Dancer done (${urls.length} output)`, 'success');
            return;
          }

          // Completed but no final video surfaced.
          setIsGenerating(false);
          setPendingPromptId(null);
          toast('Run completed, but no final video was detected in outputs.', 'error');
          return;
        }
      } catch {
        // Keep polling on transient errors.
      }

      if (!cancelled && attempts >= maxAttempts) {
        setIsGenerating(false);
        setPendingPromptId(null);
        toast('Timed out waiting for Steady Dancer output.', 'error');
      }
    };

    const timer = window.setInterval(poll, 5000);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isGenerating, pendingPromptId, setHistory, toast]);

  const uploadToComfy = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Upload failed');
    return String(data.filename);
  };

  const uploadSubject = async (file: File) => {
    setUploadingSubject(true);
    try {
      const filename = await uploadToComfy(file);
      setSubjectImageFile(filename);
      if (!posePipelineStarted) {
        setApprovedSubjectFile(null);
        setPoseImages([]);
        toast('Subject image uploaded', 'success');
      } else {
        toast('Direct subject uploaded. Reset the pose stage to use it for final run.', 'success');
      }
    } catch (err: any) {
      toast(err.message || 'Subject upload failed', 'error');
    } finally {
      setUploadingSubject(false);
    }
  };

  const uploadMotion = async (file: File) => {
    setUploadingMotion(true);
    try {
      const filename = await uploadToComfy(file);
      setMotionVideoFile(filename);
      setTrimmedMotionFile(null);
      clearPoseStage();
      toast('Motion video uploaded', 'success');
    } catch (err: any) {
      toast(err.message || 'Motion upload failed', 'error');
    } finally {
      setUploadingMotion(false);
    }
  };

  // Consume a "Send to Workflow" handoff — video → motion clip, image → subject
  useEffect(() => {
    const videoUrl = consumeHandoff('video');
    if (videoUrl) {
      fetch(videoUrl)
        .then((r) => r.blob())
        .then((blob) => uploadMotion(new File([blob], 'handoff-motion.mp4', { type: blob.type || 'video/mp4' })))
        .catch(() => {});
      return;
    }
    const imageUrl = consumeHandoff('image');
    if (imageUrl) {
      fetch(imageUrl)
        .then((r) => r.blob())
        .then((blob) => uploadSubject(new File([blob], 'handoff-subject.png', { type: blob.type || 'image/png' })))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadMotion = async () => {
    if (!sourceUrl.trim()) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/download-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Download failed');
      setMotionVideoFile(data.filename);
      setTrimmedMotionFile(null);
      clearPoseStage();
      if (data.duration) {
        setVideoDuration(Number(data.duration));
        setStartTime(0);
        setEndTime(Math.min(Number(data.duration), 8));
      }
      toast(data.title ? `Downloaded: ${data.title}` : 'Video downloaded', 'success');
    } catch (err: any) {
      toast(err.message || 'Download failed', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const onVideoLoaded = () => {
    const duration = videoRef.current?.duration || 0;
    setVideoDuration(duration);
    setCurrentTime(0);
    setStartTime(0);
    setEndTime(Math.min(duration, 8));
  };

  const getSeconds = useCallback((event: MouseEvent | React.MouseEvent) => {
    const track = trackRef.current;
    if (!track || videoDuration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * videoDuration;
  }, [videoDuration]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const seconds = getSeconds(event);
      if (dragging.current === 'start') {
        const value = Math.min(seconds, Math.max(0, endTime - 0.25));
        setStartTime(value);
        if (videoRef.current) videoRef.current.currentTime = value;
      } else {
        const value = Math.max(seconds, startTime + 0.25);
        setEndTime(value);
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
  }, [endTime, getSeconds, startTime]);

  const trimMotion = async () => {
    if (!motionVideoFile || endTime <= startTime) return;
    setIsTrimming(true);
    try {
      const data = await trimMotionRequest(motionVideoFile, startTime, endTime);
      setTrimmedMotionFile(data.filename);
      setVideoLength(Math.max(1, Math.round(Number(data.duration || clipLength) * 10) / 10));
      toast('Trimmed clip ready', 'success');
    } catch (err: any) {
      toast(err.message || 'Trim failed', 'error');
    } finally {
      setIsTrimming(false);
    }
  };

  const trimMotionRequest = async (filename: string, startSec: number, endSec: number) => {
    const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/trim-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, start_sec: startSec, end_sec: endSec }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Trim failed');
    return data;
  };

  const ensureTrimmedMotionForRun = async () => {
    if (trimmedMotionFile) return trimmedMotionFile;
    if (!motionVideoFile) return null;
    if (endTime <= startTime || clipLength <= 0) return motionVideoFile;

    setIsTrimming(true);
    try {
      const data = await trimMotionRequest(motionVideoFile, startTime, endTime);
      setTrimmedMotionFile(data.filename);
      setVideoLength(Math.max(1, Math.round(Number(data.duration || clipLength) * 10) / 10));
      return String(data.filename);
    } finally {
      setIsTrimming(false);
    }
  };

  const captureFrame = async () => {
    if (!motionVideoFile) return;
    setIsCapturing(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/capture-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: motionVideoFile, time_sec: startTime }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Capture failed');
      setCapturedFrameFile(data.filename);
      setApprovedSubjectFile(null);
      if (isGeneratedPoseFilename(subjectImageFile)) {
        setSubjectImageFile(null);
      }
      setPoseImages([]);
      toast('Pose frame captured', 'success');
    } catch (err: any) {
      toast(err.message || 'Capture failed', 'error');
    } finally {
      setIsCapturing(false);
    }
  };

  const pollPoseImages = async (promptId: string) => {
    for (let i = 0; i < 180; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/generate/status/${encodeURIComponent(promptId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Status failed');
      if (data.status === 'completed') {
        const images = Array.isArray(data.images) ? data.images as ComfyImage[] : [];
        if (images.length === 0) throw new Error('Z-Image finished without image output');
        const outputImages = images.filter((image) => image.type === 'output');
        return outputImages.length > 0 ? outputImages : images;
      }
      if (data.status === 'not_found' && i > 8) throw new Error('Prompt disappeared from Comfy history');
    }
    throw new Error('Timed out waiting for Z-Image output');
  };

  const importPoseCandidates = async (images: ComfyImage[]) => {
    const imported: ComfyImage[] = [];
    for (const image of images.slice(0, 4)) {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/import-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(image),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not import generated image');
      imported.push({ filename: data.filename, subfolder: '', type: 'input' });
    }
    return imported;
  };

  const recoverLatestPoseOutput = async (silent = false) => {
    if (isRecoveringPose) return false;
    setIsRecoveringPose(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/import-latest-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subfolder: 'IMAGE/Z-IMAGE' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'No Z-Image output found');
      setPoseImages([{ filename: data.filename, subfolder: '', type: 'input' }]);
      if (!silent) toast(`Recovered ${data.source_filename || 'latest Z-Image output'}`, 'success');
      return true;
    } catch (err: any) {
      if (!silent) toast(err.message || 'Could not recover latest Z-Image output', 'error');
      return false;
    } finally {
      setIsRecoveringPose(false);
    }
  };

  const generatePoseImage = async () => {
    if (!capturedFrameFile || isGeneratingPose) return;
    setIsGeneratingPose(true);
    setApprovedSubjectFile(null);
    if (isGeneratedPoseFilename(subjectImageFile)) {
      setSubjectImageFile(null);
    }
    setPoseImages([]);
    try {
      const loras = characterLora ? [{ name: characterLora, strength: characterLoraStrength }] : [];
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'z-image-controlnet-pose',
          params: {
            image: capturedFrameFile,
            prompt: posePrompt.trim(),
            style: controlStyle,
            control_mode: controlMode,
            control_strength: controlStrength,
            width: poseWidth,
            height: poseHeight,
            seed: poseSeed === -1 ? Math.floor(Math.random() * 10_000_000_000) : poseSeed,
            steps: poseSteps,
            cfg: poseCfg,
            denoise: poseDenoise,
            loras,
            client_id: comfyService.clientId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Z-Image generation failed');
      if (data.debug?.zimage_pose) {
        console.info('Z-Image pose payload', data.debug.zimage_pose);
      }
      const images = await pollPoseImages(String(data.prompt_id));
      const imported = await importPoseCandidates(images);
      setPoseImages(imported);
      toast('Character pose image ready for review', 'success');
    } catch (err: any) {
      toast(err.message || 'Z-Image generation failed', 'error');
    } finally {
      setIsGeneratingPose(false);
    }
  };

  const approvePoseImage = async (image: ComfyImage) => {
    if (image.type === 'input') {
      setApprovedSubjectFile(image.filename);
      toast('Generated image is now the Steady Dancer subject', 'success');
      return;
    }
    setIsImportingPose(true);
    try {
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/media/import-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(image),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not approve generated image');
      setApprovedSubjectFile(data.filename);
      toast('Generated image is now the Steady Dancer subject', 'success');
    } catch (err: any) {
      toast(err.message || 'Could not approve generated image', 'error');
    } finally {
      setIsImportingPose(false);
    }
  };

  const runSteadyDancer = async () => {
    if (!finalSubjectFile || !finalMotionFile || !prompt.trim() || isGenerating) return;
    if (posePipelineStarted && !approvedSubjectFile) {
      toast('Approve a generated pose image before running Steady Dancer.', 'error');
      return;
    }
    if (requestedFrames < 16) {
      toast('Steady Dancer needs at least 16 frames. Increase length or FPS.', 'error');
      return;
    }
    if (clipLength > 0 && clipLength + 0.1 < Number(videoLength || 0)) {
      toast('Selected motion clip is shorter than the final length. Trim/select a longer clip or lower length.', 'error');
      return;
    }
    sessionRef.current = [];
    prevVideoCountRef.current = lastOutputVideos?.length ?? 0;
    setIsGenerating(true);
    fetch(`${BACKEND_API.BASE_URL}/api/workflow/node-map/wan21-steady-dancer`)
      .then((r) => r.json())
      .then((data) => { if (data.success) registerNodeMap(data.node_map); })
      .catch(() => {});

    try {
      const motionForRun = await ensureTrimmedMotionForRun();
      if (!motionForRun) throw new Error('Missing motion reference');
      const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.GENERATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'wan21-steady-dancer',
          params: {
            image: finalSubjectFile,
            reference_video: motionForRun,
            prompt: prompt.trim(),
            width,
            height,
            video_length_seconds: videoLength,
            fps,
            steps,
            cfg: 1,
            pose_strength_spatial: poseSpatial,
            pose_strength_temporal: poseTemporal,
            seed: seed === -1 ? Math.floor(Math.random() * 10_000_000_000) : seed,
            ...(loraName ? { lora_name: loraName, lora_strength: loraStrength } : {}),
            client_id: comfyService.clientId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Steady Dancer failed');
      setPendingPromptId(String(data.prompt_id));
    } catch (err: any) {
      setIsGenerating(false);
      toast(err.message || 'Steady Dancer failed', 'error');
    }
  };

  const startPct = videoDuration > 0 ? (startTime / videoDuration) * 100 : 0;
  const endPct = videoDuration > 0 ? (endTime / videoDuration) * 100 : 100;
  const currentPct = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;
  const canRun = !!finalSubjectFile && !!finalMotionFile && !!prompt.trim() && requestedFrames >= 16 && !isGenerating;

  return (
    <WorkflowShell
      title="WAN 2.1 Steady Dancer"
      eyebrow="Advanced motion transfer"
      description="Build the clip in stages, approve the generated start image, then run the final dance transfer."
      icon={Film}
      isGenerating={isGenerating}
      canGenerate={canRun}
      leftClassName="bg-[#050505]"
      workflowId="wan21-steady-dancer"
      hideOutputPane
      output={null}
    >
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-8">
        <SteadyVideoPreviewStrip
          currentVideo={currentVideo || history[0] || null}
          history={history}
          isGenerating={isGenerating}
          onSelectVideo={setCurrentVideo}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className={panel}>
            <StageHeader
              step="Stage 1"
              title="Motion Source"
              detail="Download or upload a motion clip, then select the usable section."
            />
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="TikTok, Instagram Reel, YouTube Shorts or direct video URL"
                    className={inputBase}
                  />
                  <NeutralButton onClick={downloadMotion} disabled={!sourceUrl.trim() || isDownloading}>
                    {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Download
                  </NeutralButton>
                </div>
                <UploadDrop
                  accept="video/*"
                  label="Upload motion video"
                  filename={motionVideoFile}
                  busy={uploadingMotion}
                  onFile={uploadMotion}
                />
                <div className="grid grid-cols-2 gap-2">
                  <NeutralButton onClick={trimMotion} disabled={!motionVideoFile || isTrimming || endTime <= startTime}>
                    {isTrimming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
                    Trim Clip
                  </NeutralButton>
                  <NeutralButton onClick={captureFrame} disabled={!motionVideoFile || isCapturing}>
                    {isCapturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    Capture Start
                  </NeutralButton>
                </div>
              </div>

              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                  {sourceVideoUrl ? (
                    <video
                      ref={videoRef}
                      src={sourceVideoUrl}
                      className="aspect-video w-full object-contain"
                      controls
                      playsInline
                      onLoadedMetadata={onVideoLoaded}
                      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm text-zinc-700">No motion source loaded</div>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div
                    ref={trackRef}
                    className="relative h-8 cursor-pointer rounded-full bg-white/[0.06]"
                    onMouseDown={(event) => {
                      const seconds = getSeconds(event);
                      if (Math.abs(seconds - startTime) < Math.abs(seconds - endTime)) dragging.current = 'start';
                      else dragging.current = 'end';
                    }}
                  >
                    <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/15" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
                    <div className="absolute top-0 h-8 w-px bg-white/60" style={{ left: `${currentPct}%` }} />
                    <button type="button" onMouseDown={() => { dragging.current = 'start'; }} className="absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-200" style={{ left: `${startPct}%` }} />
                    <button type="button" onMouseDown={() => { dragging.current = 'end'; }} className="absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-200" style={{ left: `${endPct}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Start {fmtTime(startTime)}</span>
                    <span>Clip {clipLength.toFixed(1)}s</span>
                    <span>End {fmtTime(endTime)}</span>
                  </div>
                </div>
                {trimmedMotionFile ? <p className="text-[11px] text-zinc-500">Trimmed reference ready: {trimmedMotionFile}</p> : null}
              </div>
            </div>
          </section>

          <section className={panel}>
            <StageHeader
              step="Stage 2"
              title="Pose Frame"
              detail="Direct upload is available before staging; captured pose runs require approval."
            />
            <div className="grid gap-3 sm:grid-cols-[160px_1fr] xl:grid-cols-1">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                {capturedFrameUrl ? (
                  <img src={capturedFrameUrl} alt="Captured pose frame" className="aspect-[3/4] w-full object-contain" />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center px-4 text-center text-sm text-zinc-700">Capture a frame from the motion clip</div>
                )}
              </div>
              <div className="space-y-3">
                <Field label="Final subject image">
                  <UploadDrop
                    accept="image/*"
                    label="Direct subject upload"
                    filename={finalSubjectFile}
                    busy={uploadingSubject}
                    onFile={uploadSubject}
                    preview={subjectPreviewUrl ? <img src={subjectPreviewUrl} alt="Subject" className="max-h-40 w-full object-contain" /> : undefined}
                  />
                </Field>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-zinc-500">
                  {posePipelineStarted
                    ? 'Pose pipeline is active. Final run will only use an approved generated pose image.'
                    : 'Direct upload can run immediately, or capture a pose to start the staged pipeline.'}
                  {approvedSubjectFile ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-zinc-300">
                      <Check className="h-3.5 w-3.5" />
                      Approved generated start image
                    </div>
                  ) : null}
                  {posePipelineStarted ? (
                    <NeutralButton onClick={clearPoseStage} className="mt-3 w-full">
                      Reset pose stage
                    </NeutralButton>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className={panel}>
          <StageHeader
            step="Stage 3"
            title="Character Pose Image"
            detail="Generate a new character image from the captured pose. Nothing is used automatically."
          />
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-3">
              <Field label="Character prompt">
                <textarea
                  value={posePrompt}
                  onChange={(event) => setPosePrompt(event.target.value)}
                  rows={4}
                  className={cn(inputBase, 'resize-y leading-relaxed')}
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Control tool">
                  <select value={controlMode} onChange={(event) => setControlMode(Number(event.target.value))} className={inputBase}>
                    {CONTROL_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </Field>
                <Field label="Style">
                  <select value={controlStyle} onChange={(event) => setControlStyle(event.target.value)} className={inputBase}>
                    {STYLES.map((style) => <option key={style}>{style}</option>)}
                  </select>
                </Field>
                <Field label="Strength">
                  <input type="number" min={0} max={2} step={0.05} value={controlStrength} onChange={(event) => setControlStrength(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Seed">
                  <input type="number" value={poseSeed} onChange={(event) => setPoseSeed(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Width">
                  <input type="number" min={512} step={64} value={poseWidth} onChange={(event) => setPoseWidth(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Height">
                  <input type="number" min={512} step={64} value={poseHeight} onChange={(event) => setPoseHeight(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Steps">
                  <input type="number" min={1} max={40} value={poseSteps} onChange={(event) => setPoseSteps(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="CFG">
                  <input type="number" min={0} max={10} step={0.1} value={poseCfg} onChange={(event) => setPoseCfg(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Denoise">
                  <input type="number" min={0} max={1} step={0.05} value={poseDenoise} onChange={(event) => setPoseDenoise(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Character LoRA" className="md:col-span-2">
                  <select value={characterLora} onChange={(event) => setCharacterLora(event.target.value)} className={inputBase}>
                    <option value="">Workflow default / none</option>
                    {characterLoras.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </Field>
                <Field label="LoRA strength">
                  <input type="number" min={0} max={2} step={0.05} value={characterLoraStrength} onChange={(event) => setCharacterLoraStrength(Number(event.target.value))} className={inputBase} />
                </Field>
              </div>
              <NeutralButton onClick={generatePoseImage} disabled={!capturedFrameFile || !posePrompt.trim() || isGeneratingPose} className="w-full py-2.5">
                {isGeneratingPose ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Generate Character Pose Image
              </NeutralButton>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-[11px] leading-relaxed text-zinc-500">
                <div className="truncate">Pose frame sent: <span className="font-mono text-zinc-300">{capturedFrameFile || 'none'}</span></div>
                <div className="truncate">Character LoRA sent: <span className="font-mono text-zinc-300">{characterLora || 'none'}</span></div>
                <div>Control strength: <span className="font-mono text-zinc-300">{controlStrength}</span></div>
              </div>
            </div>
            <div className="space-y-3">
              {poseImages.length === 0 ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/30 px-6 text-center text-sm text-zinc-700">
                  <span>Generated pose candidates will appear here.</span>
                  <NeutralButton onClick={() => recoverLatestPoseOutput(false)} disabled={isRecoveringPose}>
                    {isRecoveringPose ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    Recover latest Z-Image output
                  </NeutralButton>
                </div>
              ) : (
                poseImages.map((image, index) => (
                  <div key={`${image.filename}-${index}`} className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-2">
                    <img src={outputUrl(image)} alt="Generated character pose" className="max-h-[420px] w-full rounded-lg object-contain" />
                    <NeutralButton onClick={() => approvePoseImage(image)} disabled={isImportingPose} className="w-full">
                      {isImportingPose ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Use as Steady Dancer start image
                    </NeutralButton>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className={panel}>
          <StageHeader
            step="Stage 4"
            title="Motion Transfer"
            detail="Final WAN 2.1 Steady Dancer run. The visible subject preview is the exact image sent to node 76."
          />
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <Field label="Steady Dancer prompt">
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} className={cn(inputBase, 'resize-y leading-relaxed')} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Width">
                  <input type="number" min={256} step={16} value={width} onChange={(event) => setWidth(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Height">
                  <input type="number" min={256} step={16} value={height} onChange={(event) => setHeight(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Length">
                  <input type="number" min={1} step={0.5} value={videoLength} onChange={(event) => setVideoLength(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="FPS">
                  <input type="number" min={8} max={30} value={fps} onChange={(event) => setFps(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Steps">
                  <input type="number" min={1} max={80} value={steps} onChange={(event) => setSteps(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="CFG">
                  <input type="number" min={1} max={1} step={0.1} value={Number(cfg) === 1 ? cfg : 1} onChange={() => setCfg(1)} disabled className={inputBase} />
                </Field>
                <Field label="Pose spatial">
                  <input type="number" min={0} max={2} step={0.05} value={poseSpatial} onChange={(event) => setPoseSpatial(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Pose temporal">
                  <input type="number" min={0} max={2} step={0.05} value={poseTemporal} onChange={(event) => setPoseTemporal(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="Seed">
                  <input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} className={inputBase} />
                </Field>
                <Field label="WAN LoRA" className="sm:col-span-2">
                  <select value={loraName} onChange={(event) => setLoraName(event.target.value)} className={inputBase}>
                    <option value="">Workflow default / none</option>
                    {wanLoras.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </Field>
                <Field label="LoRA strength">
                  <input type="number" min={0} max={2} step={0.05} value={loraStrength} onChange={(event) => setLoraStrength(Number(event.target.value))} className={inputBase} />
                </Field>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className={smallLabel}>Subject image</p>
                {subjectPreviewUrl ? <img src={subjectPreviewUrl} alt="Final subject" className="mt-2 aspect-[3/4] w-full rounded-lg object-contain" /> : <div className="mt-2 flex aspect-[3/4] items-center justify-center text-sm text-zinc-700">Missing</div>}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className={smallLabel}>Motion reference</p>
                {trimmedVideoUrl || sourceVideoUrl ? <video src={trimmedVideoUrl || sourceVideoUrl || undefined} className="mt-2 aspect-video w-full rounded-lg object-contain" controls playsInline /> : <div className="mt-2 flex aspect-video items-center justify-center text-sm text-zinc-700">Missing</div>}
                <p className="mt-2 truncate text-[11px] text-zinc-600">{finalMotionFile || 'No video selected'}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-2">
              <Check className={cn('h-3.5 w-3.5', finalSubjectFile ? 'text-zinc-300' : 'text-zinc-700')} />
              {subjectModeLabel}
            </span>
            <span className="font-mono text-zinc-600">{requestedFrames} frames @ {fps} fps</span>
          </div>
          <NeutralButton onClick={runSteadyDancer} disabled={!canRun} className="mt-4 w-full py-3 text-sm">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Steady Dancer
          </NeutralButton>
        </section>
      </div>
    </WorkflowShell>
  );
}

export default Wan21SteadyDancerPage;
