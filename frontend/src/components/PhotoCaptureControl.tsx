import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';

interface PhotoCaptureControlProps {
  /** Called with one or more selected/captured image Files. */
  onFiles: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  disabled?: boolean;
  uploading?: boolean;
  /** Default camera direction: 'environment' for properties, 'user' for avatars. */
  defaultFacingMode?: 'environment' | 'user';
  uploadLabel?: string;
  captureLabel?: string;
  /** 'tile' renders dashed upload + camera tiles (for photo grids); 'buttons' renders compact inline buttons. */
  variant?: 'buttons' | 'tile';
  className?: string;
}

/**
 * Reusable photo uploader that always offers both "Upload photo" (gallery/file picker)
 * and "Take photo" (in-app live camera modal with front/rear switch + instant preview,
 * falling back seamlessly to the native mobile camera input when getUserMedia is unavailable).
 */
export default function PhotoCaptureControl({
  onFiles,
  multiple = false,
  disabled = false,
  uploading = false,
  defaultFacingMode = 'environment',
  uploadLabel,
  captureLabel = 'Take photo',
  variant = 'buttons',
  className = '',
}: PhotoCaptureControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (picked.length > 0) await onFiles(picked);
  };

  const openCamera = () => {
    const canUseWebRtc =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    if (canUseWebRtc) {
      setCameraOpen(true);
    } else {
      nativeCameraRef.current?.click();
    }
  };

  const resolvedUploadLabel = uploadLabel ?? (multiple ? 'Upload photos' : 'Upload photo');

  return (
    <>
      {variant === 'tile' ? (
        <div className={`grid grid-cols-2 gap-2 ${className}`}>
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#D5D2E3] bg-[#F8F7FC] px-3 py-4 text-xs font-semibold text-[#5D5A73] transition hover:border-violet-500 hover:bg-violet-50/70 hover:text-violet-700 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-violet-400 dark:hover:text-violet-300"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> : <ImagePlus className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
            <span>{uploading ? 'Uploading…' : resolvedUploadLabel}</span>
          </button>

          <button
            type="button"
            disabled={disabled || uploading}
            onClick={openCamera}
            className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-300/90 bg-gradient-to-br from-violet-50/90 via-purple-50/60 to-fuchsia-50/60 px-3 py-4 text-xs font-semibold text-violet-800 transition hover:border-violet-500 hover:from-violet-100/80 hover:to-fuchsia-100/70 disabled:opacity-60 dark:border-violet-500/35 dark:from-violet-500/15 dark:via-purple-500/10 dark:to-fuchsia-500/10 dark:text-violet-200"
          >
            <Camera className="h-4 w-4 text-violet-700 dark:text-violet-300" />
            <span>{captureLabel}</span>
          </button>
        </div>
      ) : (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D5D2E3] bg-white px-3.5 text-xs font-semibold text-[#161426] shadow-2xs transition hover:border-violet-400 hover:bg-[#F8F7FC] disabled:opacity-60 dark:border-white/15 dark:bg-[#181922] dark:text-slate-100 dark:hover:bg-white/5 sm:text-sm"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> : <ImagePlus className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
            <span>{uploading ? 'Uploading…' : resolvedUploadLabel}</span>
          </button>

          <button
            type="button"
            disabled={disabled || uploading}
            onClick={openCamera}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 px-3.5 text-xs font-semibold text-white shadow-xs shadow-violet-700/20 transition hover:from-violet-800 hover:via-purple-700 hover:to-fuchsia-700 disabled:opacity-60 sm:text-sm"
          >
            <Camera className="h-4 w-4" />
            <span>{captureLabel}</span>
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        disabled={disabled || uploading}
        onChange={handleInputChange}
      />

      <input
        ref={nativeCameraRef}
        type="file"
        accept="image/*"
        capture={defaultFacingMode}
        hidden
        disabled={disabled || uploading}
        onChange={handleInputChange}
      />

      {cameraOpen && (
        <CameraCaptureModal
          initialFacingMode={defaultFacingMode}
          onClose={() => setCameraOpen(false)}
          onFallbackToNative={() => {
            setCameraOpen(false);
            nativeCameraRef.current?.click();
          }}
          onCaptured={async (file) => {
            setCameraOpen(false);
            await onFiles([file]);
          }}
        />
      )}
    </>
  );
}

interface CameraCaptureModalProps {
  initialFacingMode: 'environment' | 'user';
  onClose: () => void;
  onFallbackToNative: () => void;
  onCaptured: (file: File) => void | Promise<void>;
}

function CameraCaptureModal({
  initialFacingMode,
  onClose,
  onFallbackToNative,
  onCaptured,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(initialFacingMode);
  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (previewUrl) return;
    let cancelled = false;
    setStarting(true);
    setCameraError(null);

    const start = async () => {
      stopStream();
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 1600 }, height: { ideal: 1200 } },
            audio: false,
          });
        } catch {
          // Fallback to any available camera (e.g., laptops with only a front webcam)
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err: any) {
        if (!cancelled) {
          const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
          setCameraError(
            denied
              ? 'Camera permission was blocked. Allow camera access in your browser, or use your device camera below.'
              : 'Could not open the live camera on this device. You can still take a photo with your device camera below.',
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    void start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facingMode, previewUrl, stopStream]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopStream();
    };
  }, [onClose, stopStream]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const snapPhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error('Camera is still loading. Try again in a moment.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('Could not capture photo.');
          return;
        }
        stopStream();
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedFile(file);
        setPreviewUrl(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.9,
    );
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedFile(null);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#0C0A18]/80 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[#131122] text-white shadow-2xl ring-1 ring-white/10 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600">
              <Camera className="h-4 w-4 text-white" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Take a photo</h3>
              <p className="text-[11px] text-slate-400">Snap directly and upload immediately</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-slate-200 transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black sm:aspect-[16/11]">
          {previewUrl ? (
            <img src={previewUrl} alt="Captured preview" className="h-full w-full object-contain bg-black" />
          ) : cameraError ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <Camera className="h-8 w-8 text-violet-400" />
              <p className="mt-3 text-sm font-medium text-white">{cameraError}</p>
              <button
                type="button"
                onClick={onFallbackToNative}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-xs font-semibold text-white"
              >
                <Camera className="h-4 w-4" />
                Open device camera
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
              {starting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                  <span className="text-xs text-slate-300">Starting camera…</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {previewUrl && capturedFile ? (
            <>
              <button
                type="button"
                onClick={retake}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <RotateCcw className="h-4 w-4" />
                Retake
              </button>
              <button
                type="button"
                onClick={() => void onCaptured(capturedFile)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-700/30 transition hover:brightness-110"
              >
                <Check className="h-4 w-4" />
                Use photo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                disabled={starting || Boolean(cameraError)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                Flip
              </button>

              <button
                type="button"
                onClick={snapPhoto}
                disabled={starting || Boolean(cameraError)}
                aria-label="Capture photo"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 p-1 shadow-lg shadow-violet-600/40 transition active:scale-95 disabled:opacity-40"
              >
                <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-white bg-white/15">
                  <Camera className="h-5 w-5 text-white" />
                </span>
              </button>

              <button
                type="button"
                onClick={onFallbackToNative}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3.5 text-xs font-semibold text-slate-200 transition hover:bg-white/15"
              >
                Device cam
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
