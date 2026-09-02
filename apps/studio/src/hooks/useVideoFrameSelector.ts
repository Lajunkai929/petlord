import { useEffect, useRef, useState } from "react";

interface FrameSelection {
  uri: string;
  mimeType: string;
  timeMs: number;
  durationMs: number;
  pixelWidth: number;
  pixelHeight: number;
  hasAlpha: boolean;
}

export function useVideoFrameSelector(
  initialTimeMs: number | undefined,
  hasAlpha: boolean,
  onSelect: (selection: FrameSelection) => void,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [timeMs, setTimeMs] = useState(initialTimeMs ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (initialTimeMs !== undefined) setTimeMs(initialTimeMs);
  }, [initialTimeMs]);

  function loaded(video: HTMLVideoElement) {
    const nextDuration = Math.round(video.duration * 1000);
    const nextTime = Math.min(initialTimeMs ?? nextDuration, nextDuration);
    setDurationMs(nextDuration);
    setTimeMs(nextTime);
    video.currentTime = Math.min(nextTime, Math.max(0, nextDuration - 40)) / 1000;
  }

  function seek(next: number) {
    setTimeMs(next);
    if (videoRef.current) videoRef.current.currentTime = Math.min(next, Math.max(0, durationMs - 40)) / 1000;
  }

  async function selectCurrentFrame() {
    const video = videoRef.current;
    if (!video || !durationMs) return;
    setSaving(true);
    setError(undefined);
    try {
      const safeTimeMs = Math.min(timeMs, Math.max(0, durationMs - 40));
      if (Math.abs(video.currentTime * 1000 - safeTimeMs) > 20) {
        await new Promise<void>((resolve) => {
          video.addEventListener("seeked", () => resolve(), { once: true });
          video.currentTime = safeTimeMs / 1000;
        });
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法读取视频画面");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const response = await fetch("/api/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: canvas.toDataURL("image/png") }),
      });
      const payload = await response.json() as { uri?: string; mimeType?: string; error?: { message?: string } };
      if (!response.ok || !payload.uri) throw new Error(payload.error?.message ?? "截帧保存失败");
      onSelect({
        uri: payload.uri,
        mimeType: payload.mimeType ?? "image/png",
        timeMs: safeTimeMs,
        durationMs,
        pixelWidth: video.videoWidth,
        pixelHeight: video.videoHeight,
        hasAlpha,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "截帧保存失败");
    } finally {
      setSaving(false);
    }
  }

  return { videoRef, durationMs, timeMs, saving, error, loaded, seek, setTimeMs, selectCurrentFrame };
}
