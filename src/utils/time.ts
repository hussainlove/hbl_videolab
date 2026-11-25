export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}

export function formatTimecode(seconds: number, fps = 30): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe - Math.floor(safe)) * fps);
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const ff = String(clamp(frames, 0, fps - 1)).padStart(2, '0');
  return `${mm}:${ss}:${ff}`;
}

export function formatShortTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  if (mins > 0) {
    return `${mins}:${String(secs).padStart(2, '0')}.${tenths}s`;
  }
  return `${secs}.${tenths}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function snapTime(
  time: number,
  snapPoints: number[],
  thresholdSeconds: number
): { time: number; snappedTo: number | null } {
  let closest: number | null = null;
  let minDiff = thresholdSeconds;
  for (const point of snapPoints) {
    const diff = Math.abs(time - point);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point;
    }
  }
  return {
    time: closest !== null ? closest : time,
    snappedTo: closest,
  };
}
