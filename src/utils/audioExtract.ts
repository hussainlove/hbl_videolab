import { isAudioTrack, isVisualTrack, MediaAsset, TimelineClip } from '../types/editor';
import { clamp } from './time';

function encodeWavMono16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = clamp(samples[i], -1, 1);
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

async function decodeAssetAudio(
  asset: MediaAsset,
  cache: Map<string, AudioBuffer>
): Promise<AudioBuffer | null> {
  const cached = cache.get(asset.id);
  if (cached) return cached;

  try {
    const res = await fetch(asset.url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuf);
      cache.set(asset.id, decoded);
      return decoded;
    } finally {
      await ctx.close();
    }
  } catch {
    return null;
  }
}

export async function extractMediaAudioViaFfmpeg(
  asset: MediaAsset,
  sourceOffset = 0,
  duration = 900
): Promise<{ audioBase64: string; mimeType: string; duration: number }> {
  const res = await fetch(asset.url);
  if (!res.ok) {
    throw new Error('Could not read source media file for FFmpeg audio extraction.');
  }
  const blob = await res.blob();
  const form = new FormData();
  form.append('media', blob, asset.name || 'media.bin');
  form.append('startOffset', String(Math.max(0, sourceOffset)));
  form.append('duration', String(clamp(duration, 0.5, 900)));

  const apiRes = await fetch('/api/captions/extract-audio', {
    method: 'POST',
    body: form,
  });
  const data = (await apiRes.json()) as {
    error?: string;
    audioBase64?: string;
    mimeType?: string;
    duration?: number;
  };
  if (!apiRes.ok || !data.audioBase64) {
    throw new Error(data.error || 'FFmpeg could not extract audio from this media.');
  }

  return {
    audioBase64: data.audioBase64,
    mimeType: data.mimeType || 'audio/mpeg',
    duration: Number(data.duration) || duration,
  };
}

export interface ExtractedTimelineAudio {
  audioBase64: string;
  mimeType: string;
  duration: number;
  startOffset: number;
  method: 'browser' | 'ffmpeg';
  pcm16k?: Float32Array;
}

export async function decodeBase64AudioToPcm16k(
  audioBase64: string
): Promise<Float32Array | null> {
  try {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const sampleRate = 16000;
      const dur = clamp(decoded.duration, 0.5, 900);
      const frameCount = Math.max(1, Math.ceil(dur * sampleRate));
      const offline = new OfflineAudioContext(1, frameCount, sampleRate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0, 0, dur);
      const rendered = await offline.startRendering();
      return rendered.getChannelData(0).slice();
    } finally {
      await ctx.close();
    }
  } catch {
    return null;
  }
}

export async function extractTimelineAudioForCaptioning(
  clips: TimelineClip[],
  assets: MediaAsset[],
  decodedCache: Map<string, AudioBuffer>,
  maxSeconds = 900,
  hiddenTracks?: Record<string, boolean>
): Promise<ExtractedTimelineAudio> {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const audioCandidates = clips
    .filter(
      (c) =>
        (isAudioTrack(c.track) || isVisualTrack(c.track)) &&
        !hiddenTracks?.[c.track] &&
        !c.muted &&
        c.volume > 0 &&
        (() => {
          const asset = assetMap.get(c.assetId);
          return Boolean(asset && (asset.type === 'audio' || asset.type === 'video'));
        })()
    )
    .sort((a, b) => a.startTime - b.startTime);

  // If no timeline clips carry audio, fall back to the first audio/video asset in MediaBin
  if (audioCandidates.length === 0) {
    const fallbackAsset = assets.find((a) => a.type === 'audio' || a.type === 'video');
    if (!fallbackAsset) {
      throw new Error('Add a video or audio clip first to auto-detect speech.');
    }

    const browserMax = Math.min(180, maxSeconds);
    const decoded =
      fallbackAsset.duration <= browserMax
        ? await decodeAssetAudio(fallbackAsset, decodedCache)
        : null;

    if (decoded && decoded.duration <= browserMax) {
      const sampleRate = 16000;
      const dur = clamp(decoded.duration, 0.5, browserMax);
      const frameCount = Math.max(1, Math.ceil(dur * sampleRate));
      const offline = new OfflineAudioContext(1, frameCount, sampleRate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0, 0, dur);
      const rendered = await offline.startRendering();
      const mono = rendered.getChannelData(0);
      const wav = encodeWavMono16(mono, sampleRate);
      return {
        audioBase64: arrayBufferToBase64(wav),
        mimeType: 'audio/wav',
        duration: Number(dur.toFixed(2)),
        startOffset: 0,
        method: 'browser',
        pcm16k: mono.slice(),
      };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error(
        'Offline mode: Could not decode this media format locally in browser. Convert or use MP3/WAV/M4A/WebM for offline speech detection.'
      );
    }

    const ffmpegOut = await extractMediaAudioViaFfmpeg(
      fallbackAsset,
      0,
      Math.min(fallbackAsset.duration || maxSeconds, maxSeconds)
    );
    return {
      ...ffmpegOut,
      startOffset: 0,
      method: 'ffmpeg',
    };
  }

  const minStart = Math.min(...audioCandidates.map((c) => c.startTime));
  const rawEnd = Math.max(...audioCandidates.map((c) => c.startTime + c.duration));
  const totalSpan = clamp(rawEnd - minStart, 0.5, maxSeconds);

  // Try fast in-browser OfflineAudioContext mix for multi-clip timelines up to 300s
  if (totalSpan <= 300) {
    const decodedByClip: Array<{ clip: TimelineClip; buffer: AudioBuffer }> = [];
    for (const clip of audioCandidates) {
      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;
      const buf = await decodeAssetAudio(asset, decodedCache);
      if (buf) {
        decodedByClip.push({ clip, buffer: buf });
      }
    }

    if (decodedByClip.length > 0) {
      try {
        const sampleRate = 16000;
        const frameCount = Math.max(1, Math.ceil(totalSpan * sampleRate));
        const offline = new OfflineAudioContext(1, frameCount, sampleRate);

        for (const { clip, buffer } of decodedByClip) {
          const relStart = clip.startTime - minStart;
          if (relStart >= totalSpan) continue;
          const usableDur = Math.min(clip.duration, totalSpan - relStart);
          if (usableDur <= 0.05) continue;

          const source = offline.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = clamp(clip.speed, 0.25, 4);

          const gain = offline.createGain();
          gain.gain.value = clamp(clip.volume / 100, 0, 2);

          source.connect(gain);
          gain.connect(offline.destination);

          const srcOffset = clamp(clip.sourceOffset, 0, Math.max(0, buffer.duration - 0.05));
          const srcSpan = Math.min(
            usableDur * clip.speed,
            Math.max(0.05, buffer.duration - srcOffset)
          );
          source.start(Math.max(0, relStart), srcOffset, srcSpan);
        }

        const rendered = await offline.startRendering();
        const mono = rendered.getChannelData(0);

        let peak = 0;
        for (let i = 0; i < mono.length; i += 8) {
          const abs = Math.abs(mono[i]);
          if (abs > peak) peak = abs;
        }
        if (peak < 0.0005) {
          throw new Error('The active audio track appears completely silent.');
        }

        const wavBuffer = encodeWavMono16(mono, sampleRate);
        return {
          audioBase64: arrayBufferToBase64(wavBuffer),
          mimeType: 'audio/wav',
          duration: Number(totalSpan.toFixed(2)),
          startOffset: Number(minStart.toFixed(2)),
          method: 'browser',
          pcm16k: mono.slice(),
        };
      } catch (err) {
        if (err instanceof Error && err.message.includes('silent')) {
          throw err;
        }
        // Fall through to FFmpeg server extraction on Web Audio failure
      }
    }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(
      'Offline mode: Browser could not decode this audio container locally. Use MP3/WAV/M4A or Script Captions offline.'
    );
  }

  // Fallback to server FFmpeg extraction (unsupported codecs/containers or >300s spans up to 900s)
  const primaryClip = audioCandidates[0];
  const primaryAsset = assetMap.get(primaryClip.assetId);
  if (!primaryAsset) {
    throw new Error('No playable audio stream found in the active timeline clips.');
  }

  const ffmpegRes = await extractMediaAudioViaFfmpeg(
    primaryAsset,
    primaryClip.sourceOffset,
    Math.min(primaryClip.duration, maxSeconds)
  );
  return {
    audioBase64: ffmpegRes.audioBase64,
    mimeType: ffmpegRes.mimeType,
    duration: ffmpegRes.duration,
    startOffset: Number(primaryClip.startTime.toFixed(2)),
    method: 'ffmpeg',
  };
}

export interface OfflineSyncedSegment {
  startTime: number;
  endTime: number;
}

/**
 * 100% browser-offline Voice Activity / RMS energy segment detector.
 * Finds actual spoken phrase start/end timestamps from audio clips or MediaBin audio/video
 * with zero network or server calls.
 */
export async function detectOfflineSpeechSegments(
  clips: TimelineClip[],
  assets: MediaAsset[],
  decodedCache: Map<string, AudioBuffer>,
  hiddenTracks?: Record<string, boolean>
): Promise<{ segments: OfflineSyncedSegment[]; startOffset: number; duration: number }> {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const audioCandidates = clips
    .filter(
      (c) =>
        (isAudioTrack(c.track) || isVisualTrack(c.track)) &&
        !hiddenTracks?.[c.track] &&
        !c.muted &&
        c.volume > 0 &&
        (() => {
          const asset = assetMap.get(c.assetId);
          return Boolean(asset && (asset.type === 'audio' || asset.type === 'video'));
        })()
    )
    .sort((a, b) => a.startTime - b.startTime);

  let mono: Float32Array;
  let sampleRate = 16000;
  let startOffset = 0;
  let totalSpan = 0;

  if (audioCandidates.length === 0) {
    const fallbackAsset = assets.find((a) => a.type === 'audio' || a.type === 'video');
    if (!fallbackAsset) {
      throw new Error('Add an audio or video clip first to sync caption timing offline.');
    }
    const decoded = await decodeAssetAudio(fallbackAsset, decodedCache);
    if (!decoded) {
      throw new Error('Could not decode this media audio locally in browser.');
    }
    totalSpan = clamp(decoded.duration, 0.5, 900);
    const frameCount = Math.max(1, Math.ceil(totalSpan * sampleRate));
    const offline = new OfflineAudioContext(1, frameCount, sampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0, 0, totalSpan);
    const rendered = await offline.startRendering();
    mono = rendered.getChannelData(0);
  } else {
    const minStart = Math.min(...audioCandidates.map((c) => c.startTime));
    const rawEnd = Math.max(...audioCandidates.map((c) => c.startTime + c.duration));
    totalSpan = clamp(rawEnd - minStart, 0.5, 900);
    startOffset = minStart;

    const decodedByClip: Array<{ clip: TimelineClip; buffer: AudioBuffer }> = [];
    for (const clip of audioCandidates) {
      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;
      const buf = await decodeAssetAudio(asset, decodedCache);
      if (buf) decodedByClip.push({ clip, buffer: buf });
    }
    if (decodedByClip.length === 0) {
      throw new Error('Could not decode active timeline audio locally.');
    }

    const frameCount = Math.max(1, Math.ceil(totalSpan * sampleRate));
    const offline = new OfflineAudioContext(1, frameCount, sampleRate);
    for (const { clip, buffer } of decodedByClip) {
      const relStart = clip.startTime - minStart;
      if (relStart >= totalSpan) continue;
      const usableDur = Math.min(clip.duration, totalSpan - relStart);
      if (usableDur <= 0.05) continue;

      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clamp(clip.speed, 0.25, 4);
      const gain = offline.createGain();
      gain.gain.value = clamp(clip.volume / 100, 0, 2);
      source.connect(gain);
      gain.connect(offline.destination);

      const srcOffset = clamp(clip.sourceOffset, 0, Math.max(0, buffer.duration - 0.05));
      const srcSpan = Math.min(usableDur * clip.speed, Math.max(0.05, buffer.duration - srcOffset));
      source.start(Math.max(0, relStart), srcOffset, srcSpan);
    }
    const rendered = await offline.startRendering();
    mono = rendered.getChannelData(0);
  }

  // Compute 40ms RMS windows
  const winSec = 0.04;
  const winSamples = Math.max(1, Math.floor(sampleRate * winSec));
  const energies: number[] = [];
  for (let i = 0; i < mono.length; i += winSamples) {
    let sumSq = 0;
    const end = Math.min(mono.length, i + winSamples);
    for (let j = i; j < end; j++) {
      sumSq += mono[j] * mono[j];
    }
    energies.push(Math.sqrt(sumSq / Math.max(1, end - i)));
  }

  const sorted = [...energies].sort((a, b) => a - b);
  const peak = sorted[sorted.length - 1] ?? 0;
  if (peak < 0.0005) {
    throw new Error('The active audio track appears silent.');
  }

  const noiseFloor = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const threshold = Math.max(noiseFloor * 2.2, peak * 0.08, 0.006);

  // Merge active frames into speech intervals (allow pauses <= 0.36s inside a phrase)
  const rawSegments: OfflineSyncedSegment[] = [];
  let activeStart: number | null = null;
  let silenceRun = 0;
  const maxPauseSec = 0.36;

  for (let i = 0; i < energies.length; i++) {
    const t = i * winSec;
    if (energies[i] >= threshold) {
      if (activeStart === null) activeStart = t;
      silenceRun = 0;
    } else if (activeStart !== null) {
      silenceRun += winSec;
      if (silenceRun >= maxPauseSec) {
        const end = Math.max(activeStart + 0.4, t - silenceRun + 0.08);
        rawSegments.push({ startTime: activeStart, endTime: Math.min(totalSpan, end) });
        activeStart = null;
        silenceRun = 0;
      }
    }
  }
  if (activeStart !== null) {
    rawSegments.push({
      startTime: activeStart,
      endTime: Math.min(totalSpan, Math.max(activeStart + 0.4, totalSpan)),
    });
  }

  // Split any very long segments (> 4.2s) into clean caption-sized chunks
  const finalSegments: OfflineSyncedSegment[] = [];
  for (const seg of rawSegments) {
    const segDur = seg.endTime - seg.startTime;
    if (segDur < 0.3) continue;
    if (segDur <= 4.2) {
      finalSegments.push({
        startTime: Number((startOffset + seg.startTime).toFixed(2)),
        endTime: Number((startOffset + seg.endTime).toFixed(2)),
      });
    } else {
      const parts = Math.max(2, Math.ceil(segDur / 3.0));
      const step = segDur / parts;
      for (let p = 0; p < parts; p++) {
        finalSegments.push({
          startTime: Number((startOffset + seg.startTime + p * step).toFixed(2)),
          endTime: Number((startOffset + seg.startTime + (p + 1) * step).toFixed(2)),
        });
      }
    }
  }

  // Fallback to even 2.4s chunks if continuous background audio stayed uniformly above threshold
  if (finalSegments.length === 0) {
    const step = 2.4;
    for (let t = 0; t < totalSpan; t += step) {
      const end = Math.min(totalSpan, t + step);
      if (end - t >= 0.4) {
        finalSegments.push({
          startTime: Number((startOffset + t).toFixed(2)),
          endTime: Number((startOffset + end).toFixed(2)),
        });
      }
    }
  }

  return {
    segments: finalSegments,
    startOffset: Number(startOffset.toFixed(2)),
    duration: Number(totalSpan.toFixed(2)),
  };
}
