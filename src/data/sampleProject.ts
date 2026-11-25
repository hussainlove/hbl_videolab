import {
  ClipAnimationPreset,
  FILTER_PRESET_VALUES,
  MediaAsset,
  StickerConfig,
  TextConfig,
  TimelineClip,
  TrackId,
} from '../types/editor';
import { createSampleAmbientTrack } from '../utils/audioSynth';
import { uid } from '../utils/time';

export const SAMPLE_IMAGES = {
  coastal: '/src/assets/images/sample_coastal_road_1795004464728.jpg',
  camera: '/src/assets/images/sample_studio_camera_1795004464867.jpg',
  alpine: '/src/assets/images/sample_alpine_dawn_1795004465764.jpg',
};

export const BUILTIN_MOTION_ASSETS: MediaAsset[] = [
  {
    id: 'motion_slate_sweep',
    name: 'Slate Radial Sweep',
    type: 'motion',
    url: '',
    duration: 5,
    motionVariant: 'slate-sweep',
    isSample: true,
  },
  {
    id: 'motion_amber_horizon',
    name: 'Amber Dusk Gradient',
    type: 'motion',
    url: '',
    duration: 5,
    motionVariant: 'amber-horizon',
    isSample: true,
  },
  {
    id: 'motion_kinetic_grid',
    name: 'Kinetic Grid Canvas',
    type: 'motion',
    url: '',
    duration: 5,
    motionVariant: 'kinetic-grid',
    isSample: true,
  },
];

export function createDefaultClipProps(
  asset: MediaAsset,
  track: TrackId,
  startTime: number,
  duration?: number
): TimelineClip {
  const defaultDur =
    duration ??
    (asset.type === 'image' || asset.type === 'motion'
      ? Math.max(0.4, asset.duration || 4)
      : Math.max(0.4, asset.duration));
  const filterKey = asset.defaultFilterPreset ?? 'neutral';
  const filterVals = FILTER_PRESET_VALUES[filterKey];

  return {
    id: uid('clip'),
    assetId: asset.id,
    track,
    name: asset.name,
    startTime,
    duration: Number(defaultDur.toFixed(2)),
    sourceOffset: 0,
    speed: 1,
    volume: asset.defaultVolume ?? 100,
    muted: asset.defaultMuted ?? false,
    opacity: asset.defaultOpacity ?? 100,
    scale: asset.defaultScale ?? 100,
    x: 0,
    y: 0,
    rotation: asset.defaultRotation ?? 0,
    fadeIn: asset.defaultFadeIn ?? (asset.type === 'image' || asset.type === 'motion' ? 0.35 : 0.15),
    fadeOut: asset.defaultFadeOut ?? (asset.type === 'image' || asset.type === 'motion' ? 0.35 : 0.15),
    kenBurns: asset.defaultKenBurns ?? (asset.type === 'image' ? 'zoom-in' : 'none'),
    filterPreset: filterKey,
    brightness: filterVals.brightness,
    contrast: filterVals.contrast,
    saturation: filterVals.saturation,
    warmth: filterVals.warmth,
    vignette: filterVals.vignette,
    blur: 0,
    fxPreset: asset.defaultFxPreset ?? 'none',
    fxIntensity: asset.defaultFxPreset && asset.defaultFxPreset !== 'none' ? 75 : 0,
    glowColor: asset.defaultGlowColor ?? '#38BDF8',
    glowIntensity: asset.defaultGlowIntensity ?? 0,
    framePreset: asset.defaultFramePreset ?? 'none',
    animationIn: asset.defaultAnimationIn ?? 'none',
    animationInDuration: 0.5,
    animationOut: asset.defaultAnimationOut ?? 'none',
    animationOutDuration: 0.5,
    animationCombo: asset.defaultAnimationCombo ?? 'none',
    animationIntensity: 75,
  };
}

export function createTitleClip(
  name: string,
  startTime: number,
  duration: number,
  textConfig: TextConfig,
  x = 0,
  y = 0,
  track: TrackId = 'T1'
): TimelineClip {
  return {
    id: uid('title'),
    assetId: 'text_overlay',
    track,
    name,
    startTime,
    duration,
    sourceOffset: 0,
    speed: 1,
    volume: 100,
    muted: false,
    opacity: 100,
    scale: 100,
    x,
    y,
    fadeIn: 0.25,
    fadeOut: 0.25,
    kenBurns: 'none',
    filterPreset: 'neutral',
    brightness: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
    blur: 0,
    vignette: 0,
    animationIn: 'none',
    animationInDuration: 0.55,
    animationOut: 'none',
    animationOutDuration: 0.45,
    animationCombo: 'none',
    animationIntensity: 75,
    textConfig,
  };
}

export function createStickerClip(
  name: string,
  startTime: number,
  duration: number,
  stickerConfig: StickerConfig,
  x = 0,
  y = 0,
  defaultCombo: ClipAnimationPreset = 'none',
  track: TrackId = 'T1'
): TimelineClip {
  return {
    id: uid('sticker'),
    assetId: 'sticker_overlay',
    track,
    name,
    startTime,
    duration,
    sourceOffset: 0,
    speed: 1,
    volume: 100,
    muted: false,
    opacity: 100,
    scale: 100,
    x,
    y,
    rotation: 0,
    fadeIn: 0.15,
    fadeOut: 0.15,
    kenBurns: 'none',
    filterPreset: 'neutral',
    brightness: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
    blur: 0,
    vignette: 0,
    glowColor: stickerConfig.primaryColor,
    glowIntensity: 25,
    animationIn: 'pop-bounce',
    animationInDuration: 0.45,
    animationOut: 'fade-out',
    animationOutDuration: 0.3,
    animationCombo: defaultCombo,
    animationIntensity: 75,
    stickerConfig,
  };
}

export function buildSampleProject(): { assets: MediaAsset[]; clips: TimelineClip[] } {
  const ambient = createSampleAmbientTrack(12);

  const sampleCoastal: MediaAsset = {
    id: 'sample_coastal',
    name: 'Big Sur Coastline.jpg',
    type: 'image',
    url: SAMPLE_IMAGES.coastal,
    thumbnailUrl: SAMPLE_IMAGES.coastal,
    duration: 4,
    width: 1920,
    height: 1080,
    isSample: true,
  };

  const sampleCamera: MediaAsset = {
    id: 'sample_camera',
    name: '32mm Cinema Prime.jpg',
    type: 'image',
    url: SAMPLE_IMAGES.camera,
    thumbnailUrl: SAMPLE_IMAGES.camera,
    duration: 4,
    width: 1920,
    height: 1080,
    isSample: true,
  };

  const sampleAlpine: MediaAsset = {
    id: 'sample_alpine',
    name: 'Alpine Ridge Dawn.jpg',
    type: 'image',
    url: SAMPLE_IMAGES.alpine,
    thumbnailUrl: SAMPLE_IMAGES.alpine,
    duration: 4,
    width: 1920,
    height: 1080,
    isSample: true,
  };

  const sampleAudio: MediaAsset = {
    id: 'sample_ambient_audio',
    name: 'Horizon Pad (120 BPM).wav',
    type: 'audio',
    url: ambient.url,
    duration: ambient.duration,
    waveform: ambient.waveform,
    isSample: true,
  };

  const assets: MediaAsset[] = [
    sampleCoastal,
    sampleCamera,
    sampleAlpine,
    sampleAudio,
    ...BUILTIN_MOTION_ASSETS,
  ];

  const clip1: TimelineClip = {
    ...createDefaultClipProps(sampleCoastal, 'V1', 0, 4.2),
    kenBurns: 'zoom-in',
    filterPreset: 'warm-film',
    ...FILTER_PRESET_VALUES['warm-film'],
    fadeIn: 0.4,
    fadeOut: 0.4,
  };

  const clip2: TimelineClip = {
    ...createDefaultClipProps(sampleCamera, 'V1', 4.0, 4.2),
    kenBurns: 'pan-left',
    filterPreset: 'cool-slate',
    ...FILTER_PRESET_VALUES['cool-slate'],
    fadeIn: 0.35,
    fadeOut: 0.35,
  };

  const clip3: TimelineClip = {
    ...createDefaultClipProps(sampleAlpine, 'V1', 8.0, 4.0),
    kenBurns: 'zoom-out',
    filterPreset: 'vivid',
    ...FILTER_PRESET_VALUES.vivid,
    fadeIn: 0.35,
    fadeOut: 0.6,
  };

  const audioClip: TimelineClip = {
    ...createDefaultClipProps(sampleAudio, 'A1', 0, 12.0),
    volume: 85,
    fadeIn: 0.5,
    fadeOut: 1.0,
  };

  const title1 = createTitleClip(
    'Opening Headline',
    0.35,
    3.3,
    {
      text: 'Pacific Coast\nGolden Hour Study',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 66,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'center',
      hasScrim: false,
      scrimOpacity: 60,
      animation: 'slide-up',
    },
    0,
    0
  );

  const title2 = createTitleClip(
    'Camera Lower Third',
    4.35,
    3.2,
    {
      text: '32mm T1.8 Prime  ·  Natural Daylight',
      fontFamily: 'JetBrains Mono',
      fontSize: 30,
      fontWeight: 500,
      color: '#F8FAFC',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 72,
      animation: 'fade',
    },
    -36,
    33
  );

  const title3 = createTitleClip(
    'Closing Title',
    8.45,
    3.1,
    {
      text: 'Above the Ridge',
      fontFamily: 'Playfair Display',
      fontSize: 68,
      fontWeight: 600,
      color: '#FFFBEB',
      align: 'center',
      hasScrim: false,
      scrimOpacity: 50,
      animation: 'scale',
    },
    0,
    -4
  );

  return {
    assets,
    clips: [clip1, clip2, clip3, audioClip, title1, title2, title3],
  };
}
