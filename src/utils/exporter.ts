import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer';
import {
  ASPECT_RATIO_DIMENSIONS,
  AspectRatio,
  ExportResult,
  ExportSettings,
  isAudioTrack,
  isVisualTrack,
  MediaAsset,
  RenderProgress,
  TimelineClip,
} from '../types/editor';
import { decodeBase64AudioToPcm16k, extractMediaAudioViaFfmpeg } from './audioExtract';
import { LoadedMediaMap, renderFrameToContext } from './compositor';
import { clamp } from './time';

export interface EncoderCapabilities {
  webCodecsSupported: boolean;
  mp4VideoCodec: string | null;
  mp4AudioCodec: string | null;
  mp4AudioMuxerCodec: 'aac' | 'opus' | null;
  mp4AudioSampleRate: number;
  webmVideoCodec: string | null;
  webmAudioCodec: string | null;
  webmAudioSampleRate: number;
}

const AVC_CANDIDATES = [
  'avc1.640028', // High L4.0 (1080p / fast hardware support)
  'avc1.4d002a', // Main L4.2 (1080p60)
  'avc1.640033', // High L5.1 (4K)
  'avc1.42001f', // Baseline L3.1 (720p)
  'avc1.42E01E',
];

const WEBM_VIDEO_CANDIDATES = [
  'vp8',
  'vp09.00.10.08',
];

export function computeExportDimensions(
  aspectRatio: AspectRatio,
  resolution: ExportSettings['resolution']
): { width: number; height: number } {
  const base = ASPECT_RATIO_DIMENSIONS[aspectRatio];
  const scale =
    resolution === '720p' ? 720 / 1080 : resolution === '4k' ? 2 : 1;

  // Ensure even dimensions for hardware video encoders
  const width = Math.max(2, Math.round((base.width * scale) / 2) * 2);
  const height = Math.max(2, Math.round((base.height * scale) / 2) * 2);
  return { width, height };
}

function getBitrate(resolution: ExportSettings['resolution'], quality: ExportSettings['quality']): number {
  const baseMbps = resolution === '720p' ? 5.5 : resolution === '4k' ? 24 : 10;
  const mult = quality === 'fast' ? 0.72 : quality === 'master' ? 1.75 : 1.0;
  return Math.round(baseMbps * mult * 1_000_000);
}

export async function probeEncoderCapabilities(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<EncoderCapabilities> {
  const webCodecsSupported = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  if (!webCodecsSupported) {
    return {
      webCodecsSupported: false,
      mp4VideoCodec: null,
      mp4AudioCodec: null,
      mp4AudioMuxerCodec: null,
      mp4AudioSampleRate: 48000,
      webmVideoCodec: null,
      webmAudioCodec: null,
      webmAudioSampleRate: 48000,
    };
  }

  let mp4VideoCodec: string | null = null;
  for (const codec of AVC_CANDIDATES) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'realtime',
      });
      if (res.supported) {
        mp4VideoCodec = codec;
        break;
      }
    } catch {
      // continue probing
    }
  }

  let webmVideoCodec: string | null = null;
  for (const codec of WEBM_VIDEO_CANDIDATES) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'realtime',
      });
      if (res.supported) {
        webmVideoCodec = codec;
        break;
      }
    } catch {
      // continue probing
    }
  }

  let mp4AudioCodec: string | null = null;
  let mp4AudioMuxerCodec: 'aac' | 'opus' | null = null;
  let mp4AudioSampleRate = 48000;
  let webmAudioCodec: string | null = null;
  const webmAudioSampleRate = 48000;

  if (typeof AudioEncoder !== 'undefined') {
    const mp4AudioCandidates: Array<{
      codec: string;
      muxerCodec: 'aac' | 'opus';
      sampleRate: number;
    }> = [
      { codec: 'mp4a.40.2', muxerCodec: 'aac', sampleRate: 48000 },
      { codec: 'mp4a.40.2', muxerCodec: 'aac', sampleRate: 44100 },
      { codec: 'mp4a.40.5', muxerCodec: 'aac', sampleRate: 48000 },
      { codec: 'opus', muxerCodec: 'opus', sampleRate: 48000 },
    ];

    for (const cand of mp4AudioCandidates) {
      try {
        const res = await AudioEncoder.isConfigSupported({
          codec: cand.codec,
          numberOfChannels: 2,
          sampleRate: cand.sampleRate,
          bitrate: 128_000,
        });
        if (res.supported) {
          mp4AudioCodec = cand.codec;
          mp4AudioMuxerCodec = cand.muxerCodec;
          mp4AudioSampleRate = cand.sampleRate;
          break;
        }
      } catch {
        // continue probing
      }
    }

    try {
      const opusRes = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        numberOfChannels: 2,
        sampleRate: webmAudioSampleRate,
        bitrate: 128_000,
      });
      if (opusRes.supported) webmAudioCodec = 'opus';
    } catch {
      // Opus unsupported
    }
  }

  return {
    webCodecsSupported,
    mp4VideoCodec,
    mp4AudioCodec,
    mp4AudioMuxerCodec,
    mp4AudioSampleRate,
    webmVideoCodec,
    webmAudioCodec,
    webmAudioSampleRate,
  };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function decodeAndMixTimelineAudio(
  clips: TimelineClip[],
  assets: MediaAsset[],
  totalDuration: number,
  hiddenTracks?: Record<string, boolean>,
  mutedTracks?: Record<string, boolean>,
  sampleRate = 48000
): Promise<AudioBuffer | null> {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const audibleClips = clips.filter((c) => {
    if (hiddenTracks?.[c.track] || mutedTracks?.[c.track]) return false;
    if (c.muted || c.volume <= 0 || c.duration <= 0) return false;
    const asset = assetById.get(c.assetId);
    if (!asset) return false;
    return asset.type === 'audio' || asset.type === 'video';
  });

  if (audibleClips.length === 0 || totalDuration <= 0) return null;

  const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  const uniqueAudibleAssetIds = Array.from(new Set(audibleClips.map((c) => c.assetId)));
  const decodedCache = new Map<string, AudioBuffer | null>();

  await Promise.all(
    uniqueAudibleAssetIds.map(async (assetId) => {
      const asset = assetById.get(assetId);
      if (!asset || !asset.url) return;
      try {
        const res = await fetch(asset.url);
        if (!res.ok) throw new Error('Asset fetch failed');
        const buf = await res.arrayBuffer();
        const decoded = await offlineCtx.decodeAudioData(buf);
        decodedCache.set(assetId, decoded);
      } catch {
        // Fallback to server-side FFmpeg audio extraction when browser cannot decode container audio directly
        try {
          const maxDur = clamp(asset.duration || totalDuration || 180, 1, 900);
          const extracted = await extractMediaAudioViaFfmpeg(asset, 0, maxDur);
          const mp3Buf = base64ToArrayBuffer(extracted.audioBase64);
          const decoded = await offlineCtx.decodeAudioData(mp3Buf);
          decodedCache.set(assetId, decoded);
        } catch {
          // Last-chance PCM decode helper
          try {
            const maxDur = clamp(asset.duration || totalDuration || 180, 1, 900);
            const extracted = await extractMediaAudioViaFfmpeg(asset, 0, maxDur);
            const pcm = await decodeBase64AudioToPcm16k(extracted.audioBase64);
            if (pcm && pcm.length > 0) {
              const buf = offlineCtx.createBuffer(1, pcm.length, 16000);
              buf.getChannelData(0).set(pcm);
              decodedCache.set(assetId, buf);
              return;
            }
          } catch {
            // ignore
          }
          decodedCache.set(assetId, null);
        }
      }
    })
  );

  let scheduledCount = 0;
  for (const clip of audibleClips) {
    const decoded = decodedCache.get(clip.assetId);
    if (!decoded || decoded.duration <= 0) continue;

    scheduledCount++;
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    const speed = clamp(clip.speed, 0.25, 4);
    source.playbackRate.value = speed;

    const gain = offlineCtx.createGain();
    const baseVol = clamp(clip.volume / 100, 0, 2);

    const startTime = Math.max(0, clip.startTime);
    const clipEnd = Math.max(startTime + 0.05, startTime + clip.duration);
    const fadeIn = Math.min(Math.max(0, clip.fadeIn), clip.duration * 0.45);
    const fadeOut = Math.min(Math.max(0, clip.fadeOut), clip.duration * 0.45);

    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(baseVol, startTime + fadeIn);
    } else {
      gain.gain.setValueAtTime(baseVol, startTime);
    }

    if (fadeOut > 0) {
      gain.gain.setValueAtTime(baseVol, Math.max(startTime + fadeIn, clipEnd - fadeOut));
      gain.gain.linearRampToValueAtTime(0, clipEnd);
    }

    source.connect(gain);
    gain.connect(offlineCtx.destination);

    const safeOffset = clamp(clip.sourceOffset, 0, Math.max(0, decoded.duration - 0.05));
    const sourceDuration = Math.min(
      clip.duration * speed,
      Math.max(0.05, decoded.duration - safeOffset)
    );
    source.start(startTime, safeOffset, sourceDuration);
  }

  if (scheduledCount === 0) return null;
  return await offlineCtx.startRendering();
}

interface EncodedAudioPacket {
  chunk: EncodedAudioChunk;
  meta?: EncodedAudioChunkMetadata;
}

async function encodeMixedAudioPackets(
  mixedAudio: AudioBuffer,
  codec: string,
  sampleRate: number,
  signal: AbortSignal
): Promise<EncodedAudioPacket[]> {
  const packets: EncodedAudioPacket[] = [];
  let encodeErr: Error | null = null;

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      packets.push({ chunk, meta });
    },
    error: (err) => {
      encodeErr = err instanceof Error ? err : new Error(String(err));
    },
  });

  try {
    encoder.configure({
      codec,
      numberOfChannels: 2,
      sampleRate,
      bitrate: 128_000,
    });

    const left = mixedAudio.getChannelData(0);
    const right = mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : left;
    const chunkSize = codec === 'opus' ? 960 : 1024;
    const totalSamples = mixedAudio.length;

    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      if (signal.aborted || encodeErr) break;
      const frames = Math.min(chunkSize, totalSamples - offset);
      const planar = new Float32Array(frames * 2);
      planar.set(left.subarray(offset, offset + frames), 0);
      planar.set(right.subarray(offset, offset + frames), frames);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels: 2,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: planar,
      });

      encoder.encode(audioData);
      audioData.close();

      if (encoder.encodeQueueSize > 32) {
        await waitForEncoderDrain(encoder, 24);
      }
    }

    if (!signal.aborted && !encodeErr) {
      await encoder.flush();
    }
    if (encodeErr) throw encodeErr;
    return packets;
  } finally {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      // ignore
    }
  }
}

function loadExportImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function preScaleBitmapForExport(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  maxScaleMult: number
): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap !== 'function') return img;
  const maxAllowedW = Math.round(targetW * Math.max(1.15, maxScaleMult));
  const maxAllowedH = Math.round(targetH * Math.max(1.15, maxScaleMult));
  if (img.naturalWidth <= maxAllowedW * 1.2 && img.naturalHeight <= maxAllowedH * 1.2) {
    try {
      return await createImageBitmap(img);
    } catch {
      return img;
    }
  }
  try {
    const ratio = Math.min(maxAllowedW / img.naturalWidth, maxAllowedH / img.naturalHeight);
    const resizeWidth = Math.max(2, Math.round(img.naturalWidth * ratio));
    const resizeHeight = Math.max(2, Math.round(img.naturalHeight * ratio));
    return await createImageBitmap(img, {
      resizeWidth,
      resizeHeight,
      resizeQuality: 'medium',
    });
  } catch {
    return img;
  }
}

function loadExportVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const onReady = () => {
      cleanup();
      resolve(video);
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onErr);
    };

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onErr);
    video.src = url;
    video.load();
  });
}

function seekVideoDeterministic(
  video: HTMLVideoElement,
  targetTime: number,
  toleranceSec: number
): Promise<void> {
  const safeTarget = clamp(targetTime, 0, Math.max(0, (video.duration || targetTime) - 0.01));
  if (Math.abs(video.currentTime - safeTarget) < toleranceSec) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 120);
    video.addEventListener('seeked', done);
    video.currentTime = safeTarget;
  });
}

// Zero-delay task yield without Chrome's 4ms nested setTimeout clamping
const yieldChannel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const yieldWaiters: Array<() => void> = [];
if (yieldChannel) {
  yieldChannel.port1.onmessage = () => {
    const cb = yieldWaiters.shift();
    if (cb) cb();
  };
}

function yieldToMain(): Promise<void> {
  if (!yieldChannel) {
    return new Promise((r) => setTimeout(r, 0));
  }
  return new Promise((resolve) => {
    yieldWaiters.push(resolve);
    yieldChannel.port2.postMessage(null);
  });
}

async function waitForEncoderDrain(
  encoder: VideoEncoder | AudioEncoder,
  maxQueue: number
): Promise<void> {
  if (encoder.encodeQueueSize <= maxQueue) return;
  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      encoder.removeEventListener('dequeue', onDequeue);
      clearTimeout(safety);
      resolve();
    };
    const onDequeue = () => {
      if (encoder.encodeQueueSize <= maxQueue) {
        finish();
      }
    };
    const safety = window.setTimeout(finish, 18);
    encoder.addEventListener('dequeue', onDequeue);
  });
}

const ANIMATED_FX_SET = new Set([
  'chromatic-shake',
  'vhs-glitch',
  'tv-static',
  'flash-strobe',
  'cinema-grain',
  'retro-scan',
  'lens-flare',
  'light-leak',
  'aurora-prism',
  'bokeh-blur',
  'neon-bloom',
  'golden-aura',
]);

const ANIMATED_FRAME_SET = new Set([
  'electro-frame',
  'electro-pulse',
  'rec-viewfinder',
  'film-strip',
]);

function isStaticFrameAtTime(
  t: number,
  prevT: number,
  clips: TimelineClip[],
  assetById: Map<string, MediaAsset>,
  prevSignature: string,
  hiddenTracks?: Record<string, boolean>
): { isStatic: boolean; signature: string } {
  const active = clips.filter(
    (c) =>
      !isAudioTrack(c.track) &&
      !hiddenTracks?.[c.track] &&
      t >= c.startTime &&
      t < c.startTime + c.duration
  );
  const signature = active.map((c) => c.id).join('|');
  if (signature !== prevSignature || active.length === 0) {
    return { isStatic: false, signature };
  }

  for (const c of active) {
    const asset = assetById.get(c.assetId);
    if (asset && (asset.type === 'video' || asset.type === 'motion')) {
      return { isStatic: false, signature };
    }
    if (c.kenBurns !== 'none') return { isStatic: false, signature };
    if (c.keyframes && c.keyframes.length > 1) return { isStatic: false, signature };
    if (c.animationCombo && c.animationCombo !== 'none') return { isStatic: false, signature };
    if (c.fxPreset && ANIMATED_FX_SET.has(c.fxPreset) && (c.fxIntensity ?? 0) > 0) {
      return { isStatic: false, signature };
    }
    if (c.framePreset && ANIMATED_FRAME_SET.has(c.framePreset)) {
      return { isStatic: false, signature };
    }

    const localT = t - c.startTime;
    const prevLocalT = prevT - c.startTime;

    if (c.fadeIn > 0 && (localT < c.fadeIn || prevLocalT < c.fadeIn)) {
      return { isStatic: false, signature };
    }
    if (c.fadeOut > 0 && (c.duration - localT < c.fadeOut || c.duration - prevLocalT < c.fadeOut)) {
      return { isStatic: false, signature };
    }
    if (
      c.transitionIn &&
      c.transitionIn !== 'none' &&
      (localT < (c.transitionInDuration ?? 0.5) || prevLocalT < (c.transitionInDuration ?? 0.5))
    ) {
      return { isStatic: false, signature };
    }
    if (
      c.transitionOut &&
      c.transitionOut !== 'none' &&
      (c.duration - localT < (c.transitionOutDuration ?? 0.5) ||
        c.duration - prevLocalT < (c.transitionOutDuration ?? 0.5))
    ) {
      return { isStatic: false, signature };
    }
    if (
      c.animationIn &&
      c.animationIn !== 'none' &&
      (localT < (c.animationInDuration ?? 0.5) || prevLocalT < (c.animationInDuration ?? 0.5))
    ) {
      return { isStatic: false, signature };
    }
    if (
      c.animationOut &&
      c.animationOut !== 'none' &&
      (c.duration - localT < (c.animationOutDuration ?? 0.5) ||
        c.duration - prevLocalT < (c.animationOutDuration ?? 0.5))
    ) {
      return { isStatic: false, signature };
    }
    if (c.textConfig) {
      if (c.textConfig.captionWordHighlight) return { isStatic: false, signature };
      const enterDur = Math.min(0.45, c.duration * 0.3);
      if (c.textConfig.animation !== 'none' && (localT < enterDur || prevLocalT < enterDur)) {
        return { isStatic: false, signature };
      }
    }
  }

  return { isStatic: true, signature };
}

export async function renderProjectVideo(params: {
  projectName: string;
  aspectRatio: AspectRatio;
  clips: TimelineClip[];
  assets: MediaAsset[];
  settings: ExportSettings;
  hiddenTracks?: Record<string, boolean>;
  mutedTracks?: Record<string, boolean>;
  signal: AbortSignal;
  onProgress: (progress: RenderProgress) => void;
}): Promise<ExportResult> {
  const {
    projectName,
    aspectRatio,
    clips,
    assets,
    settings,
    hiddenTracks,
    mutedTracks,
    signal,
    onProgress,
  } = params;

  const totalDuration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
  if (totalDuration <= 0) {
    throw new Error('Timeline is empty. Add at least one clip before exporting.');
  }

  const { width, height } = computeExportDimensions(aspectRatio, settings.resolution);
  const fps = settings.fps;
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
  const bitrate = getBitrate(settings.resolution, settings.quality);
  const startTimeMs = performance.now();

  onProgress({
    phase: 'preparing',
    currentFrame: 0,
    totalFrames,
    percent: 2,
    elapsedMs: 0,
    fpsSpeed: 0,
    realtimeFactor: 0,
  });

  const caps = await probeEncoderCapabilities(width, height, fps, bitrate);

  // Determine container & codecs (prefer user choice, gracefully fallback if needed)
  let container: 'mp4' | 'webm' = settings.format;
  if (container === 'mp4' && !caps.mp4VideoCodec) {
    if (caps.webmVideoCodec) {
      container = 'webm';
    }
  } else if (container === 'webm' && !caps.webmVideoCodec) {
    if (caps.mp4VideoCodec) {
      container = 'mp4';
    }
  }

  // Fallback to MediaRecorder if WebCodecs VideoEncoder isn't supported at all
  if (!caps.webCodecsSupported || (!caps.mp4VideoCodec && !caps.webmVideoCodec)) {
    return renderWithMediaRecorderFallback({
      projectName,
      width,
      height,
      fps,
      bitrate,
      totalDuration,
      totalFrames,
      clips,
      assets,
      hiddenTracks,
      mutedTracks,
      signal,
      onProgress,
      startTimeMs,
    });
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // 1. Pre-sort timeline clips and compute asset bounds for fast O(1) frame slicing + 1000+ image streaming
  const sortedRenderClips = [...clips]
    .filter((c) => !isAudioTrack(c.track) && !hiddenTracks?.[c.track])
    .sort((a, b) => a.startTime - b.startTime);

  const visibleV1Clips = sortedRenderClips.filter((c) => isVisualTrack(c.track));
  const usedAssetIds = new Set(visibleV1Clips.map((c) => c.assetId));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const maxAssetScale = new Map<string, number>();
  const lastEndTimeByAssetId = new Map<string, number>();
  for (const c of visibleV1Clips) {
    const prev = maxAssetScale.get(c.assetId) ?? 1;
    const kb = c.kenBurns !== 'none' ? 1.15 : 1;
    const kfMaxScale = (c.keyframes ?? []).reduce((m, kf) => Math.max(m, kf.scale), c.scale);
    const pzMaxScale =
      c.kenBurns === 'pan-zoom'
        ? Math.max(c.panZoomStartScale ?? 100, c.panZoomEndScale ?? 122)
        : 100;
    const effectiveScale = Math.max((kfMaxScale / 100) * kb, pzMaxScale / 100);
    maxAssetScale.set(c.assetId, Math.max(prev, effectiveScale));
    lastEndTimeByAssetId.set(
      c.assetId,
      Math.max(lastEndTimeByAssetId.get(c.assetId) ?? 0, c.startTime + c.duration)
    );
  }

  const orderedImageAssetIds: string[] = [];
  const seenImageIds = new Set<string>();
  const videoAssetsToLoad: MediaAsset[] = [];
  for (const c of visibleV1Clips) {
    const asset = assetById.get(c.assetId);
    if (!asset) continue;
    if (asset.type === 'image' && !seenImageIds.has(asset.id)) {
      seenImageIds.add(asset.id);
      orderedImageAssetIds.push(asset.id);
    } else if (asset.type === 'video' && !videoAssetsToLoad.some((v) => v.id === asset.id)) {
      videoAssetsToLoad.push(asset);
    }
  }
  // Include any remaining used image assets not yet ordered
  for (const asset of assets) {
    if (usedAssetIds.has(asset.id) && asset.type === 'image' && !seenImageIds.has(asset.id)) {
      seenImageIds.add(asset.id);
      orderedImageAssetIds.push(asset.id);
    }
  }

  const mediaMap: LoadedMediaMap = new Map();
  const isLargeImageProject = orderedImageAssetIds.length > 160;
  const initialImageBatch = isLargeImageProject
    ? orderedImageAssetIds.slice(0, 64)
    : orderedImageAssetIds;
  let nextPrefetchImageIdx = initialImageBatch.length;
  const inflightImageLoads = new Map<string, Promise<void>>();

  const loadSingleImageAsset = (assetId: string): Promise<void> => {
    if (mediaMap.has(assetId)) return Promise.resolve();
    const existing = inflightImageLoads.get(assetId);
    if (existing) return existing;
    const asset = assetById.get(assetId);
    if (!asset || asset.type !== 'image') return Promise.resolve();
    const p = (async () => {
      try {
        const img = await loadExportImage(asset.url);
        const scaled = await preScaleBitmapForExport(
          img,
          width,
          height,
          maxAssetScale.get(asset.id) ?? 1
        );
        mediaMap.set(asset.id, scaled);
      } finally {
        inflightImageLoads.delete(assetId);
      }
    })();
    inflightImageLoads.set(assetId, p);
    return p;
  };

  const loadImagesInChunks = async (ids: string[], concurrency = 16) => {
    for (let i = 0; i < ids.length; i += concurrency) {
      if (signal.aborted) return;
      await Promise.all(ids.slice(i, i + concurrency).map((id) => loadSingleImageAsset(id)));
    }
  };

  const maskTasks: Array<Promise<void>> = [];
  for (const clip of sortedRenderClips) {
    if (isVisualTrack(clip.track) && clip.maskShape === 'custom' && clip.customMaskId && clip.customMaskDataUrl) {
      const maskKey = `mask:${clip.customMaskId}`;
      if (!mediaMap.has(maskKey)) {
        maskTasks.push(
          loadExportImage(clip.customMaskDataUrl)
            .then((img) => {
              mediaMap.set(maskKey, img);
            })
            .catch(() => {
              // ignore unreadable custom mask
            })
        );
      }
    }
  }

  // Run media preloading AND offline audio mixing concurrently to minimize startup latency
  let targetAudioSampleRate =
    container === 'mp4' ? caps.mp4AudioSampleRate : caps.webmAudioSampleRate;

  onProgress({
    phase: 'audio',
    currentFrame: 0,
    totalFrames,
    percent: 5,
    elapsedMs: performance.now() - startTimeMs,
    fpsSpeed: 0,
    realtimeFactor: 0,
  });

  const [mixedAudioResult] = await Promise.all([
    decodeAndMixTimelineAudio(
      clips,
      assets,
      totalDuration,
      hiddenTracks,
      mutedTracks,
      targetAudioSampleRate
    ),
    loadImagesInChunks(initialImageBatch, 16),
    Promise.all(
      videoAssetsToLoad.map(async (asset) => {
        const vid = await loadExportVideo(asset.url);
        try {
          vid.pause();
        } catch {
          // ignore
        }
        mediaMap.set(asset.id, vid);
      })
    ),
    Promise.all(maskTasks),
  ]);

  let mixedAudio = mixedAudioResult;

  if (
    mixedAudio !== null &&
    container === 'mp4' &&
    !caps.mp4AudioCodec &&
    caps.webmVideoCodec &&
    caps.webmAudioCodec
  ) {
    container = 'webm';
    targetAudioSampleRate = caps.webmAudioSampleRate;
    if (targetAudioSampleRate !== mixedAudio.sampleRate) {
      mixedAudio = await decodeAndMixTimelineAudio(
        clips,
        assets,
        totalDuration,
        hiddenTracks,
        mutedTracks,
        targetAudioSampleRate
      );
    }
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // Pre-encode audio first (with AAC -> Opus fallback inside MP4) so audio tracks never silently fail
  let audioPackets: EncodedAudioPacket[] = [];
  let activeAudioMuxerCodec: 'aac' | 'opus' | null = null;
  let activeAudioSampleRate = targetAudioSampleRate;

  if (mixedAudio) {
    if (container === 'mp4' && caps.mp4AudioCodec && caps.mp4AudioMuxerCodec) {
      try {
        audioPackets = await encodeMixedAudioPackets(
          mixedAudio,
          caps.mp4AudioCodec,
          caps.mp4AudioSampleRate,
          signal
        );
        if (audioPackets.length > 0) {
          activeAudioMuxerCodec = caps.mp4AudioMuxerCodec;
          activeAudioSampleRate = caps.mp4AudioSampleRate;
        }
      } catch {
        audioPackets = [];
      }

      if (audioPackets.length === 0 && caps.mp4AudioMuxerCodec !== 'opus' && caps.webmAudioCodec) {
        try {
          const opusAudio =
            mixedAudio.sampleRate === 48000
              ? mixedAudio
              : await decodeAndMixTimelineAudio(
                  clips,
                  assets,
                  totalDuration,
                  hiddenTracks,
                  mutedTracks,
                  48000
                );
          if (opusAudio) {
            audioPackets = await encodeMixedAudioPackets(opusAudio, 'opus', 48000, signal);
            if (audioPackets.length > 0) {
              activeAudioMuxerCodec = 'opus';
              activeAudioSampleRate = 48000;
            }
          }
        } catch {
          audioPackets = [];
        }
      }
    } else if (container === 'webm' && caps.webmAudioCodec) {
      try {
        audioPackets = await encodeMixedAudioPackets(
          mixedAudio,
          caps.webmAudioCodec,
          caps.webmAudioSampleRate,
          signal
        );
        if (audioPackets.length > 0) {
          activeAudioMuxerCodec = 'opus';
          activeAudioSampleRate = caps.webmAudioSampleRate;
        }
      } catch {
        audioPackets = [];
      }
    }
  }

  const hasEncodedAudio = audioPackets.length > 0 && activeAudioMuxerCodec !== null;

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // 3. Configure Muxer + Hardware-Accelerated VideoEncoder
  const videoCodec = container === 'mp4' ? caps.mp4VideoCodec! : caps.webmVideoCodec!;

  const mp4Target = container === 'mp4' ? new Mp4Target() : null;
  const webmTarget = container === 'webm' ? new WebmTarget() : null;

  const mp4Muxer =
    container === 'mp4' && mp4Target
      ? new Mp4Muxer({
          target: mp4Target,
          video: {
            codec: 'avc',
            width,
            height,
            frameRate: fps,
          },
          audio:
            hasEncodedAudio && activeAudioMuxerCodec
              ? {
                  codec: activeAudioMuxerCodec,
                  numberOfChannels: 2,
                  sampleRate: activeAudioSampleRate,
                }
              : undefined,
          fastStart: 'in-memory',
          firstTimestampBehavior: 'offset',
        })
      : null;

  const webmMuxer =
    container === 'webm' && webmTarget
      ? new WebmMuxer({
          target: webmTarget,
          video: {
            codec: videoCodec.startsWith('vp09') ? 'V_VP9' : 'V_VP8',
            width,
            height,
            frameRate: fps,
          },
          audio: hasEncodedAudio
            ? {
                codec: 'A_OPUS',
                numberOfChannels: 2,
                sampleRate: activeAudioSampleRate,
              }
            : undefined,
          firstTimestampBehavior: 'offset',
        })
      : null;

  if (hasEncodedAudio) {
    for (const pkt of audioPackets) {
      if (mp4Muxer) mp4Muxer.addAudioChunk(pkt.chunk, pkt.meta);
      if (webmMuxer) webmMuxer.addAudioChunk(pkt.chunk, pkt.meta);
    }
  }

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (mp4Muxer) mp4Muxer.addVideoChunk(chunk, meta);
      if (webmMuxer) webmMuxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err;
    },
  });

  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate,
    bitrateMode: 'variable',
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: settings.quality === 'master' ? 'quality' : 'realtime',
  });

  // 4. Render & encode video frames at maximum GPU hardware speed
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx =
    canvas.getContext('2d', { alpha: false, desynchronized: true }) ??
    canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not initialize 2D rendering context');

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 240;
  thumbCanvas.height = Math.max(96, Math.round((240 * height) / width));
  const thumbCtx = thumbCanvas.getContext('2d');

  const frameDurationUs = Math.round((1 / fps) * 1_000_000);
  const keyFrameInterval = settings.quality === 'fast' ? fps * 3 : fps * 2;
  const videoClips = visibleV1Clips.filter((c) => assetById.get(c.assetId)?.type === 'video');
  const seekTolerance = Math.min(0.014, 0.42 / fps);
  const is4k = width >= 3000 || height >= 2000;
  const highQueueLimit = is4k ? 18 : 38;
  const lowQueueTarget = is4k ? 8 : 20;

  // Compute max clip duration to maintain a tight active-clip sliding window (huge speedup for 1000+ clips)
  const maxClipSpan = sortedRenderClips.reduce(
    (mx, c) => Math.max(mx, c.duration + Math.max(c.transitionInDuration ?? 0.5, c.transitionOutDuration ?? 0.5)),
    2
  );
  let windowScanStart = 0;

  let prevStaticSignature = '';
  let prevRenderedTime = -1;
  let cachedStaticFrame: VideoFrame | null = null;
  let lastUiUpdateMs = 0;
  let lastThumbUpdateMs = 0;
  let lastYieldMs = performance.now();

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal.aborted) {
        throw new DOMException('Render cancelled', 'AbortError');
      }
      if (encoderError) {
        throw encoderError;
      }

      const t = frameIdx / fps;

      // Advance sliding window start pointer so we only inspect clips near [t - maxClipSpan - 1, t + 1.5]
      const minWindowStart = t - maxClipSpan - 1.0;
      while (
        windowScanStart < sortedRenderClips.length &&
        sortedRenderClips[windowScanStart].startTime + sortedRenderClips[windowScanStart].duration <
          minWindowStart
      ) {
        windowScanStart++;
      }

      const windowRightBound = t + 1.5;
      const frameWindowClips: TimelineClip[] = [];
      for (let i = windowScanStart; i < sortedRenderClips.length; i++) {
        const c = sortedRenderClips[i];
        if (c.startTime > windowRightBound) break;
        if (c.startTime + c.duration >= t - 1.2) {
          frameWindowClips.push(c);
        }
      }

      // Stream & release image bitmaps on 1000+ image slideshows to keep RAM flat & FPS high
      if (isLargeImageProject) {
        // Ensure active window images are ready before drawing
        const missingLoads: Array<Promise<void>> = [];
        for (const c of frameWindowClips) {
          if (t >= c.startTime - 0.5 && t <= c.startTime + c.duration + 0.5) {
            const asset = assetById.get(c.assetId);
            if (asset?.type === 'image' && !mediaMap.has(asset.id)) {
              missingLoads.push(loadSingleImageAsset(asset.id));
            }
          }
        }
        if (missingLoads.length > 0) {
          await Promise.all(missingLoads);
        }
        // Background prefetch ahead + prune finished one-shot bitmaps
        let prefetched = 0;
        while (nextPrefetchImageIdx < orderedImageAssetIds.length && prefetched < 4) {
          const nextId = orderedImageAssetIds[nextPrefetchImageIdx++];
          if (!mediaMap.has(nextId)) {
            void loadSingleImageAsset(nextId);
            prefetched++;
          }
        }
        if (frameIdx % 30 === 0) {
          for (const [assetId, entry] of mediaMap.entries()) {
            if (assetId.startsWith('mask:')) continue;
            const lastEnd = lastEndTimeByAssetId.get(assetId);
            if (lastEnd !== undefined && lastEnd < t - 2.0 && typeof ImageBitmap !== 'undefined' && entry instanceof ImageBitmap) {
              entry.close();
              mediaMap.delete(assetId);
            }
          }
        }
      }

      // Parallel seek any active video clips at timestamp t
      if (videoClips.length > 0) {
        const seekPromises: Array<Promise<void>> = [];
        for (const clip of videoClips) {
          if (t >= clip.startTime && t < clip.startTime + clip.duration) {
            const videoEl = mediaMap.get(clip.assetId);
            if (videoEl instanceof HTMLVideoElement) {
              const mediaTime = clip.sourceOffset + (t - clip.startTime) * clip.speed;
              seekPromises.push(seekVideoDeterministic(videoEl, mediaTime, seekTolerance));
            }
          }
        }
        if (seekPromises.length > 0) {
          await Promise.all(seekPromises);
        }
      }

      // Check if frame is identical to previous frame -> zero Canvas2D redraw AND zero pixel readback!
      const staticCheck =
        frameIdx > 0
          ? isStaticFrameAtTime(t, prevRenderedTime, frameWindowClips, assetById, prevStaticSignature, hiddenTracks)
          : { isStatic: false, signature: '' };

      const timestampUs = Math.round(t * 1_000_000);
      let videoFrame: VideoFrame | null = null;

      if (staticCheck.isStatic && cachedStaticFrame) {
        try {
          videoFrame = new VideoFrame(cachedStaticFrame, {
            timestamp: timestampUs,
            duration: frameDurationUs,
          });
        } catch {
          videoFrame = null;
        }
      }

      if (!videoFrame) {
        if (!staticCheck.isStatic) {
          renderFrameToContext(ctx, width, height, t, frameWindowClips, assets, mediaMap, {
            hideSelectionOutline: true,
            hiddenTracks,
          });
        }
        videoFrame = new VideoFrame(canvas, {
          timestamp: timestampUs,
          duration: frameDurationUs,
        });
        if (cachedStaticFrame) {
          try {
            cachedStaticFrame.close();
          } catch {
            // ignore
          }
          cachedStaticFrame = null;
        }
        try {
          cachedStaticFrame = videoFrame.clone();
        } catch {
          cachedStaticFrame = null;
        }
      }

      prevStaticSignature = staticCheck.signature;
      prevRenderedTime = t;

      videoEncoder.encode(videoFrame, {
        keyFrame: frameIdx % keyFrameInterval === 0,
      });
      videoFrame.close();

      if (videoEncoder.encodeQueueSize > highQueueLimit) {
        await waitForEncoderDrain(videoEncoder, lowQueueTarget);
      }

      // Wall-clock throttled UI progress updates
      const nowMs = performance.now();
      const isLastFrame = frameIdx === totalFrames - 1;
      if (isLastFrame || nowMs - lastUiUpdateMs >= 180) {
        lastUiUpdateMs = nowMs;
        const elapsedMs = nowMs - startTimeMs;
        const fpsSpeed = elapsedMs > 0 ? ((frameIdx + 1) / elapsedMs) * 1000 : 0;
        const realtimeFactor = fpsSpeed / fps;

        let previewDataUrl: string | undefined;
        if (
          thumbCtx &&
          settings.quality !== 'fast' &&
          (isLastFrame || nowMs - lastThumbUpdateMs >= 1200)
        ) {
          lastThumbUpdateMs = nowMs;
          thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
          previewDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.5);
        }

        onProgress({
          phase: 'encoding',
          currentFrame: frameIdx + 1,
          totalFrames,
          percent: Math.min(95, 10 + Math.round(((frameIdx + 1) / totalFrames) * 85)),
          elapsedMs,
          fpsSpeed,
          realtimeFactor,
          previewDataUrl,
        });
      }

      // Yield instantaneously via MessageChannel only every ~40ms so encoder stays saturated without UI freeze
      if (nowMs - lastYieldMs >= 40) {
        lastYieldMs = nowMs;
        await yieldToMain();
      }
    }

    if (cachedStaticFrame) {
      try {
        cachedStaticFrame.close();
      } catch {
        // ignore
      }
      cachedStaticFrame = null;
    }

    onProgress({
      phase: 'muxing',
      currentFrame: totalFrames,
      totalFrames,
      percent: 97,
      elapsedMs: performance.now() - startTimeMs,
      fpsSpeed: 0,
      realtimeFactor: 0,
    });

    await videoEncoder.flush();

    if (mp4Muxer) mp4Muxer.finalize();
    if (webmMuxer) webmMuxer.finalize();

    const buffer = container === 'mp4' ? mp4Target!.buffer : webmTarget!.buffer;
    const mimeType = container === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const renderTimeMs = performance.now() - startTimeMs;
    const averageFps = (totalFrames / Math.max(1, renderTimeMs)) * 1000;
    const cleanName = (projectName || 'hbl-videolab-export')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '');

    onProgress({
      phase: 'done',
      currentFrame: totalFrames,
      totalFrames,
      percent: 100,
      elapsedMs: renderTimeMs,
      fpsSpeed: averageFps,
      realtimeFactor: averageFps / fps,
    });

    const audioDesc = !hasEncodedAudio
      ? 'Silent'
      : activeAudioMuxerCodec === 'opus'
      ? 'Opus'
      : 'AAC';

    return {
      blob,
      url,
      fileName: `${cleanName || 'hbl-videolab-export'}.${container}`,
      mimeType,
      fileSizeBytes: blob.size,
      renderTimeMs,
      frameCount: totalFrames,
      averageFps,
      realtimeFactor: averageFps / fps,
      codecLabel:
        container === 'mp4'
          ? `H.264 / ${audioDesc} (Turbo WebCodecs)`
          : `VP8/VP9 / ${audioDesc} (Turbo WebCodecs)`,
    };
  } finally {
    if (cachedStaticFrame) {
      try {
        cachedStaticFrame.close();
      } catch {
        // ignore
      }
      cachedStaticFrame = null;
    }
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore
    }
    // Release offscreen video elements & ImageBitmaps
    for (const el of mediaMap.values()) {
      if (el instanceof HTMLVideoElement) {
        el.src = '';
        el.load();
      } else if (typeof ImageBitmap !== 'undefined' && el instanceof ImageBitmap) {
        el.close();
      }
    }
  }
}

async function renderWithMediaRecorderFallback(params: {
  projectName: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  totalDuration: number;
  totalFrames: number;
  clips: TimelineClip[];
  assets: MediaAsset[];
  hiddenTracks?: Record<string, boolean>;
  mutedTracks?: Record<string, boolean>;
  signal: AbortSignal;
  onProgress: (progress: RenderProgress) => void;
  startTimeMs: number;
}): Promise<ExportResult> {
  const {
    projectName,
    width,
    height,
    fps,
    bitrate,
    totalDuration,
    totalFrames,
    clips,
    assets,
    hiddenTracks,
    mutedTracks,
    signal,
    onProgress,
    startTimeMs,
  } = params;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D unsupported');

  const mediaMap: LoadedMediaMap = new Map();
  await Promise.all(
    assets.map(async (asset) => {
      if (asset.type === 'image') {
        mediaMap.set(asset.id, await loadExportImage(asset.url));
      } else if (asset.type === 'video') {
        mediaMap.set(asset.id, await loadExportVideo(asset.url));
      }
    })
  );

  for (const clip of clips) {
    if (isVisualTrack(clip.track) && clip.maskShape === 'custom' && clip.customMaskId && clip.customMaskDataUrl) {
      const maskKey = `mask:${clip.customMaskId}`;
      if (!mediaMap.has(maskKey)) {
        try {
          mediaMap.set(maskKey, await loadExportImage(clip.customMaskDataUrl));
        } catch {
          // ignore
        }
      }
    }
  }

  const mixedAudio = await decodeAndMixTimelineAudio(
    clips,
    assets,
    totalDuration,
    hiddenTracks,
    mutedTracks,
    48000
  );

  const stream = canvas.captureStream(fps);
  let audioCtx: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;

  if (mixedAudio) {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx({ sampleRate: 48000 });
      const dest = audioCtx.createMediaStreamDestination();
      audioSource = audioCtx.createBufferSource();
      audioSource.buffer = mixedAudio;
      audioSource.connect(dest);
      for (const track of dest.stream.getAudioTracks()) {
        stream.addTrack(track);
      }
    } catch {
      if (audioCtx) {
        await audioCtx.close().catch(() => {});
        audioCtx = null;
      }
      audioSource = null;
    }
  }

  const preferredMime =
    [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm',
    ].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType: preferredMime,
    videoBitsPerSecond: bitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  try {
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    recorder.start(200);
    if (audioSource) {
      audioSource.start(0);
    }

    const startClock = performance.now();
    let frame = 0;

    while (true) {
      if (signal.aborted) {
        recorder.stop();
        throw new DOMException('Render cancelled', 'AbortError');
      }
      const elapsedSec = (performance.now() - startClock) / 1000;
      if (elapsedSec >= totalDuration) break;

      renderFrameToContext(ctx, width, height, elapsedSec, clips, assets, mediaMap, {
        hideSelectionOutline: true,
        hiddenTracks,
      });
      frame++;
      onProgress({
        phase: 'encoding',
        currentFrame: Math.min(totalFrames, frame),
        totalFrames,
        percent: Math.min(96, Math.round((elapsedSec / totalDuration) * 96)),
        elapsedMs: performance.now() - startTimeMs,
        fpsSpeed: fps,
        realtimeFactor: 1,
      });

      await new Promise((r) => setTimeout(r, Math.round(1000 / fps)));
    }

    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const renderTimeMs = performance.now() - startTimeMs;
    const cleanName = (projectName || 'hbl-videolab-export')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      blob,
      url,
      fileName: `${cleanName || 'hbl-videolab-export'}.webm`,
      mimeType: 'video/webm',
      fileSizeBytes: blob.size,
      renderTimeMs,
      frameCount: totalFrames,
      averageFps: fps,
      realtimeFactor: 1,
      codecLabel: mixedAudio
        ? 'WebM + Opus Audio (MediaRecorder Fallback)'
        : 'WebM (MediaRecorder Fallback)',
    };
  } finally {
    try {
      audioSource?.stop();
    } catch {
      // ignore
    }
    if (audioCtx) {
      await audioCtx.close().catch(() => {});
    }
  }
}
