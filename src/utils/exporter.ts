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
import { LoadedMediaMap, renderFrameToContext } from './compositor';
import { clamp } from './time';

export interface EncoderCapabilities {
  webCodecsSupported: boolean;
  mp4VideoCodec: string | null;
  mp4AudioCodec: string | null;
  webmVideoCodec: string | null;
  webmAudioCodec: string | null;
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
      webmVideoCodec: null,
      webmAudioCodec: null,
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
  let webmAudioCodec: string | null = null;

  if (typeof AudioEncoder !== 'undefined') {
    try {
      const aacRes = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        numberOfChannels: 2,
        sampleRate: 48000,
        bitrate: 128_000,
      });
      if (aacRes.supported) mp4AudioCodec = 'mp4a.40.2';
    } catch {
      // AAC unsupported
    }

    try {
      const opusRes = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        numberOfChannels: 2,
        sampleRate: 48000,
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
    webmVideoCodec,
    webmAudioCodec,
  };
}

async function decodeAndMixTimelineAudio(
  clips: TimelineClip[],
  assets: MediaAsset[],
  totalDuration: number,
  hiddenTracks?: Record<string, boolean>
): Promise<AudioBuffer | null> {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const audibleClips = clips.filter((c) => {
    if (hiddenTracks?.[c.track]) return false;
    if (c.muted || c.volume <= 0 || c.duration <= 0) return false;
    const asset = assetById.get(c.assetId);
    if (!asset) return false;
    return asset.type === 'audio' || asset.type === 'video';
  });

  if (audibleClips.length === 0 || totalDuration <= 0) return null;

  const sampleRate = 48000;
  const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  const uniqueAudibleAssetIds = Array.from(new Set(audibleClips.map((c) => c.assetId)));
  const decodedCache = new Map<string, AudioBuffer | null>();

  await Promise.all(
    uniqueAudibleAssetIds.map(async (assetId) => {
      const asset = assetById.get(assetId);
      if (!asset) return;
      try {
        const res = await fetch(asset.url);
        const buf = await res.arrayBuffer();
        const decoded = await offlineCtx.decodeAudioData(buf);
        decodedCache.set(assetId, decoded);
      } catch {
        decodedCache.set(assetId, null);
      }
    })
  );

  let scheduledCount = 0;
  for (const clip of audibleClips) {
    const decoded = decodedCache.get(clip.assetId);
    if (!decoded) continue;

    scheduledCount++;
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = clamp(clip.speed, 0.25, 4);

    const gain = offlineCtx.createGain();
    const baseVol = clamp(clip.volume / 100, 0, 2);

    const clipEnd = clip.startTime + clip.duration;
    const fadeIn = Math.min(clip.fadeIn, clip.duration * 0.45);
    const fadeOut = Math.min(clip.fadeOut, clip.duration * 0.45);

    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, clip.startTime);
      gain.gain.linearRampToValueAtTime(baseVol, clip.startTime + fadeIn);
    } else {
      gain.gain.setValueAtTime(baseVol, clip.startTime);
    }

    if (fadeOut > 0) {
      gain.gain.setValueAtTime(baseVol, Math.max(clip.startTime + fadeIn, clipEnd - fadeOut));
      gain.gain.linearRampToValueAtTime(0, clipEnd);
    }

    source.connect(gain);
    gain.connect(offlineCtx.destination);

    const safeOffset = clamp(clip.sourceOffset, 0, Math.max(0, decoded.duration - 0.05));
    const sourceDuration = Math.min(
      clip.duration * clip.speed,
      Math.max(0.05, decoded.duration - safeOffset)
    );
    source.start(clip.startTime, safeOffset, sourceDuration);
  }

  if (scheduledCount === 0) return null;
  return await offlineCtx.startRendering();
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
  signal: AbortSignal;
  onProgress: (progress: RenderProgress) => void;
}): Promise<ExportResult> {
  const { projectName, aspectRatio, clips, assets, settings, hiddenTracks, signal, onProgress } = params;

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
      signal,
      onProgress,
      startTimeMs,
    });
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // 1. Preload images, pre-scale bitmaps & preload videos in parallel
  const mediaMap: LoadedMediaMap = new Map();
  const visibleV1Clips = clips.filter((c) => isVisualTrack(c.track) && !hiddenTracks?.[c.track]);
  const usedAssetIds = new Set(visibleV1Clips.map((c) => c.assetId));

  const maxAssetScale = new Map<string, number>();
  for (const c of visibleV1Clips) {
    const prev = maxAssetScale.get(c.assetId) ?? 1;
    const kb = c.kenBurns !== 'none' ? 1.15 : 1;
    maxAssetScale.set(c.assetId, Math.max(prev, (c.scale / 100) * kb));
  }

  await Promise.all(
    assets
      .filter((a) => usedAssetIds.has(a.id))
      .map(async (asset) => {
        if (asset.type === 'image') {
          const img = await loadExportImage(asset.url);
          const scaled = await preScaleBitmapForExport(
            img,
            width,
            height,
            maxAssetScale.get(asset.id) ?? 1
          );
          mediaMap.set(asset.id, scaled);
        } else if (asset.type === 'video') {
          mediaMap.set(asset.id, await loadExportVideo(asset.url));
        }
      })
  );

  // Load custom PNG masks in parallel
  const maskTasks: Array<Promise<void>> = [];
  for (const clip of clips) {
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
  await Promise.all(maskTasks);

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // 2. Mix audio track offline
  onProgress({
    phase: 'audio',
    currentFrame: 0,
    totalFrames,
    percent: 6,
    elapsedMs: performance.now() - startTimeMs,
    fpsSpeed: 0,
    realtimeFactor: 0,
  });

  const mixedAudio = await decodeAndMixTimelineAudio(clips, assets, totalDuration, hiddenTracks);
  const canEncodeAudio =
    mixedAudio !== null &&
    ((container === 'mp4' && caps.mp4AudioCodec !== null) ||
      (container === 'webm' && caps.webmAudioCodec !== null));

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // 3. Configure Muxer + Hardware-Accelerated VideoEncoder + optional AudioEncoder
  const videoCodec = container === 'mp4' ? caps.mp4VideoCodec! : caps.webmVideoCodec!;
  const audioCodec = container === 'mp4' ? caps.mp4AudioCodec : caps.webmAudioCodec;

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
          audio: canEncodeAudio
            ? {
                codec: 'aac',
                numberOfChannels: 2,
                sampleRate: 48000,
              }
            : undefined,
          fastStart: 'in-memory',
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
          audio: canEncodeAudio
            ? {
                codec: 'A_OPUS',
                numberOfChannels: 2,
                sampleRate: 48000,
              }
            : undefined,
        })
      : null;

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
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: settings.quality === 'master' ? 'quality' : 'realtime',
  });

  let audioEncoder: AudioEncoder | null = null;
  if (canEncodeAudio && audioCodec) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (mp4Muxer) mp4Muxer.addAudioChunk(chunk, meta);
        if (webmMuxer) webmMuxer.addAudioChunk(chunk, meta);
      },
      error: (err) => {
        encoderError = err;
      },
    });

    audioEncoder.configure({
      codec: audioCodec,
      numberOfChannels: 2,
      sampleRate: 48000,
      bitrate: 128_000,
    });
  }

  // Encode mixed audio buffer in 1024-sample frames
  if (audioEncoder && mixedAudio) {
    const left = mixedAudio.getChannelData(0);
    const right = mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : left;
    const chunkSize = 1024;
    const totalSamples = mixedAudio.length;

    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      if (signal.aborted) break;
      const frames = Math.min(chunkSize, totalSamples - offset);
      const planar = new Float32Array(frames * 2);
      planar.set(left.subarray(offset, offset + frames), 0);
      planar.set(right.subarray(offset, offset + frames), frames);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfFrames: frames,
        numberOfChannels: 2,
        timestamp: Math.round((offset / 48000) * 1_000_000),
        data: planar,
      });

      audioEncoder.encode(audioData);
      audioData.close();

      if (audioEncoder.encodeQueueSize > 32) {
        await waitForEncoderDrain(audioEncoder, 24);
      }
    }
  }

  // 4. Render & encode video frames at maximum GPU hardware speed
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not initialize 2D rendering context');

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 240;
  thumbCanvas.height = Math.max(96, Math.round((240 * height) / width));
  const thumbCtx = thumbCanvas.getContext('2d');

  const frameDurationUs = Math.round((1 / fps) * 1_000_000);
  const keyFrameInterval = settings.quality === 'fast' ? fps * 3 : fps * 2;
  const videoClips = clips.filter((c) => isVisualTrack(c.track) && !hiddenTracks?.[c.track]);
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const seekTolerance = Math.min(0.014, 0.42 / fps);

  let prevStaticSignature = '';
  let prevRenderedTime = -1;
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

      // Parallel seek any active video clips at timestamp t
      const seekPromises: Array<Promise<void>> = [];
      for (const clip of videoClips) {
        if (t >= clip.startTime && t < clip.startTime + clip.duration) {
          const asset = assetById.get(clip.assetId);
          if (asset?.type === 'video') {
            const videoEl = mediaMap.get(asset.id);
            if (videoEl instanceof HTMLVideoElement) {
              const mediaTime = clip.sourceOffset + (t - clip.startTime) * clip.speed;
              seekPromises.push(seekVideoDeterministic(videoEl, mediaTime, seekTolerance));
            }
          }
        }
      }
      if (seekPromises.length > 0) {
        await Promise.all(seekPromises);
      }

      // Skip full Canvas2D redraw if scene frame is visually identical to the previous frame
      const staticCheck =
        frameIdx > 0
          ? isStaticFrameAtTime(t, prevRenderedTime, clips, assetById, prevStaticSignature, hiddenTracks)
          : { isStatic: false, signature: '' };

      if (!staticCheck.isStatic) {
        renderFrameToContext(ctx, width, height, t, clips, assets, mediaMap, {
          hideSelectionOutline: true,
          hiddenTracks,
        });
      }
      prevStaticSignature = staticCheck.signature;
      prevRenderedTime = t;

      // Encode frame via WebCodecs
      const timestampUs = Math.round(t * 1_000_000);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });

      videoEncoder.encode(videoFrame, {
        keyFrame: frameIdx % keyFrameInterval === 0,
      });
      videoFrame.close();

      if (videoEncoder.encodeQueueSize > 28) {
        await waitForEncoderDrain(videoEncoder, 18);
      }

      // Wall-clock throttled UI progress updates (zero slowdown from per-frame JPEG encoding)
      const nowMs = performance.now();
      const isLastFrame = frameIdx === totalFrames - 1;
      if (isLastFrame || nowMs - lastUiUpdateMs >= 160) {
        lastUiUpdateMs = nowMs;
        const elapsedMs = nowMs - startTimeMs;
        const fpsSpeed = elapsedMs > 0 ? ((frameIdx + 1) / elapsedMs) * 1000 : 0;
        const realtimeFactor = fpsSpeed / fps;

        let previewDataUrl: string | undefined;
        if (
          thumbCtx &&
          settings.quality !== 'fast' &&
          (isLastFrame || nowMs - lastThumbUpdateMs >= 750)
        ) {
          lastThumbUpdateMs = nowMs;
          thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
          previewDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.55);
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

      // Yield instantaneously via MessageChannel only every ~24ms so browser UI never freezes
      if (nowMs - lastYieldMs >= 24) {
        lastYieldMs = nowMs;
        await yieldToMain();
      }
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
    if (audioEncoder) {
      await audioEncoder.flush();
    }

    if (mp4Muxer) mp4Muxer.finalize();
    if (webmMuxer) webmMuxer.finalize();

    const buffer = container === 'mp4' ? mp4Target!.buffer : webmTarget!.buffer;
    const mimeType = container === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const renderTimeMs = performance.now() - startTimeMs;
    const averageFps = (totalFrames / Math.max(1, renderTimeMs)) * 1000;
    const cleanName = (projectName || 'framecut-export')
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

    return {
      blob,
      url,
      fileName: `${cleanName || 'framecut-export'}.${container}`,
      mimeType,
      fileSizeBytes: blob.size,
      renderTimeMs,
      frameCount: totalFrames,
      averageFps,
      realtimeFactor: averageFps / fps,
      codecLabel:
        container === 'mp4' ? 'H.264 / AAC (Turbo WebCodecs)' : 'VP8/VP9 / Opus (Turbo WebCodecs)',
    };
  } finally {
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore
    }
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
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

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(200);

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
  const cleanName = (projectName || 'framecut-export')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    blob,
    url,
    fileName: `${cleanName || 'framecut-export'}.webm`,
    mimeType: 'video/webm',
    fileSizeBytes: blob.size,
    renderTimeMs,
    frameCount: totalFrames,
    averageFps: fps,
    realtimeFactor: 1,
    codecLabel: 'WebM (MediaRecorder Fallback)',
  };
}
