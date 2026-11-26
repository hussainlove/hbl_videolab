export type MediaType = 'video' | 'image' | 'audio' | 'motion';

export type TrackKind = 'T' | 'V' | 'A';

export type TrackId = string;

export interface TrackControlState {
  locked: boolean;
  hidden: boolean;
}

export type TrackSettingsMap = Record<string, TrackControlState>;

export const DEFAULT_TRACK_SETTINGS: TrackSettingsMap = {
  T1: { locked: false, hidden: false },
  V1: { locked: false, hidden: false },
  A1: { locked: false, hidden: false },
};

export function getTrackKind(trackId: string): TrackKind {
  const prefix = trackId.charAt(0).toUpperCase();
  if (prefix === 'T') return 'T';
  if (prefix === 'A') return 'A';
  return 'V';
}

export function getTrackIndex(trackId: string): number {
  const match = /\d+$/.exec(trackId);
  if (!match) return 1;
  const parsed = parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function makeTrackId(kind: TrackKind, index: number): TrackId {
  return `${kind}${Math.max(1, Math.round(index))}`;
}

export function isTitleTrack(trackId: string): boolean {
  return getTrackKind(trackId) === 'T';
}

export function isVisualTrack(trackId: string): boolean {
  return getTrackKind(trackId) === 'V';
}

export function isAudioTrack(trackId: string): boolean {
  return getTrackKind(trackId) === 'A';
}

export function getTrackControl(
  settings: TrackSettingsMap | undefined,
  trackId: string
): TrackControlState {
  const entry = settings?.[trackId];
  return entry ? { locked: Boolean(entry.locked), hidden: Boolean(entry.hidden) } : { locked: false, hidden: false };
}

export interface OrderedTrackInfo {
  id: TrackId;
  kind: TrackKind;
  index: number;
  code: string;
  name: string;
  label: string;
}

export type TrackDescriptor = OrderedTrackInfo;

function buildTrackDescriptor(kind: TrackKind, index: number): OrderedTrackInfo {
  const id = makeTrackId(kind, index);
  const name = kind === 'T' ? 'Titles' : kind === 'V' ? 'Visual' : 'Audio';
  return {
    id,
    kind,
    index,
    code: id,
    name,
    label: `${id} · ${name}`,
  };
}

export function getOrderedTracks(
  clips: Array<{ track: string }>,
  extraTrackIds: string[] = [],
  trackSettings?: TrackSettingsMap
): OrderedTrackInfo[] {
  const maxByKind: Record<TrackKind, number> = { T: 1, V: 1, A: 1 };
  const register = (trackId: string) => {
    if (!trackId) return;
    const kind = getTrackKind(trackId);
    const idx = getTrackIndex(trackId);
    if (idx > maxByKind[kind]) maxByKind[kind] = idx;
  };

  for (const c of clips) register(c.track);
  for (const id of extraTrackIds) register(id);
  if (trackSettings) {
    for (const id of Object.keys(trackSettings)) register(id);
  }

  const ordered: OrderedTrackInfo[] = [];
  for (let i = maxByKind.T; i >= 1; i--) {
    ordered.push(buildTrackDescriptor('T', i));
  }
  for (let i = maxByKind.V; i >= 1; i--) {
    ordered.push(buildTrackDescriptor('V', i));
  }
  for (let i = 1; i <= maxByKind.A; i++) {
    ordered.push(buildTrackDescriptor('A', i));
  }
  return ordered;
}

export function findOrExpandTrackForSpan(
  clips: Array<{ track: string; startTime: number; duration: number }>,
  kind: TrackKind,
  startTime: number,
  duration: number,
  trackSettings?: TrackSettingsMap,
  preferredTrackId?: string,
  extraTrackIds: string[] = []
): TrackId {
  let maxIndex = 1;
  const checkIndex = (id: string) => {
    if (getTrackKind(id) === kind) {
      maxIndex = Math.max(maxIndex, getTrackIndex(id));
    }
  };
  for (const c of clips) checkIndex(c.track);
  for (const id of extraTrackIds) checkIndex(id);
  if (trackSettings) {
    for (const id of Object.keys(trackSettings)) checkIndex(id);
  }
  if (preferredTrackId) checkIndex(preferredTrackId);

  const endTime = startTime + Math.max(0.05, duration);
  const hasOverlapOnTrack = (candidateId: string): boolean =>
    clips.some((c) => {
      if (c.track !== candidateId) return false;
      const cEnd = c.startTime + c.duration;
      return startTime < cEnd - 0.02 && c.startTime < endTime - 0.02;
    });

  const candidates: number[] = [];
  if (preferredTrackId && getTrackKind(preferredTrackId) === kind) {
    candidates.push(getTrackIndex(preferredTrackId));
  }
  for (let i = 1; i <= maxIndex; i++) {
    if (!candidates.includes(i)) candidates.push(i);
  }

  for (const idx of candidates) {
    const id = makeTrackId(kind, idx);
    if (getTrackControl(trackSettings, id).locked) continue;
    if (!hasOverlapOnTrack(id)) {
      return id;
    }
  }

  return makeTrackId(kind, maxIndex + 1);
}

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export type KenBurnsPreset =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-zoom';

export type FilterPreset = 'neutral' | 'warm-film' | 'cool-slate' | 'mono-contrast' | 'vivid';

export type TextFontFamily = string;

export const BUILTIN_FONT_FAMILIES: string[] = [
  'Plus Jakarta Sans',
  'Outfit',
  'Syne',
  'Montserrat',
  'Poppins',
  'Bebas Neue',
  'Oswald',
  'Antonio',
  'Playfair Display',
  'Cormorant Garamond',
  'Lora',
  'JetBrains Mono',
];

export interface CustomFont {
  id: string;
  family: string;
  fileName: string;
}

export type TextAnimation = 'none' | 'fade' | 'slide-up' | 'scale';

export type TransitionType =
  | 'none'
  | 'dissolve'
  | 'dip-black'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'zoom-in'
  | 'zoom-out'
  | 'blur-dissolve'
  | 'flash-white'
  | 'iris-circle'
  | 'spin-zoom'
  | 'glitch-rgb'
  | 'film-burn';

export interface TransitionPreset {
  id: TransitionType;
  label: string;
  category: 'Basic' | 'Slide' | 'Wipe' | 'Zoom' | 'FX';
  description: string;
  builtIn?: boolean;
  defaultDuration: number;
}

export type VisualEffectPreset =
  | 'none'
  | 'neon-bloom'
  | 'cyber-glow'
  | 'golden-aura'
  | 'dream-halation'
  | 'prism-rgb'
  | 'duo-neon'
  | 'lens-flare'
  | 'light-leak'
  | 'soft-glow-pro'
  | 'aurora-prism'
  | 'gaussian-blur'
  | 'radial-blur'
  | 'tilt-shift'
  | 'motion-blur'
  | 'frosted-glass'
  | 'bokeh-blur'
  | 'spin-blur'
  | 'edge-blur'
  | 'mosaic'
  | 'mosaic-glass'
  | 'crystal-facets'
  | 'halftone-dots'
  | 'pixel-8bit'
  | 'led-matrix'
  | 'teal-orange'
  | 'vintage-sepia'
  | 'noir-cinema'
  | 'night-vision'
  | 'matrix-code'
  | 'thermal-cam'
  | 'vhs-glitch'
  | 'chromatic-shake'
  | 'tv-static'
  | 'quad-split'
  | 'kaleidoscope'
  | 'retro-scan'
  | 'cinema-grain'
  | 'mirror-kaleido'
  | 'sketch-ink'
  | 'pop-poster'
  | 'flash-strobe'
  | 'fisheye-vignette';

export type VisualEffectCategory = 'Glow' | 'Blur' | 'Mosaic' | 'Cinema' | 'Glitch' | 'Stylize';

export interface VisualEffectInfo {
  id: VisualEffectPreset;
  label: string;
  category: VisualEffectCategory;
  description: string;
  accent: string;
  defaultGlowColor: string;
  defaultGlowIntensity: number;
  builtIn?: boolean;
}

export const VISUAL_EFFECT_PRESETS: VisualEffectInfo[] = [
  {
    id: 'none',
    label: 'Clean',
    category: 'Glow',
    description: 'Original untouched frame',
    accent: '#94A3B8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 0,
    builtIn: true,
  },
  // Glow & Light FX
  {
    id: 'neon-bloom',
    label: 'Neon Bloom',
    category: 'Glow',
    description: 'Luminous soft highlight glow & vivid pop',
    accent: '#38BDF8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 55,
    builtIn: true,
  },
  {
    id: 'cyber-glow',
    label: 'Cyber Glow',
    category: 'Glow',
    description: 'Electric cyan & magenta neon edge aura',
    accent: '#EC4899',
    defaultGlowColor: '#A855F7',
    defaultGlowIntensity: 62,
    builtIn: true,
  },
  {
    id: 'golden-aura',
    label: 'Golden Aura',
    category: 'Glow',
    description: 'Warm amber sunlit halo & soft bloom',
    accent: '#F59E0B',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 52,
    builtIn: false,
  },
  {
    id: 'dream-halation',
    label: 'Dream Halation',
    category: 'Glow',
    description: 'Soft rose-peach cinema film halation',
    accent: '#FB7185',
    defaultGlowColor: '#FB7185',
    defaultGlowIntensity: 48,
    builtIn: false,
  },
  {
    id: 'prism-rgb',
    label: 'Prism RGB Split',
    category: 'Glow',
    description: 'Luminous chromatic RGB edge shimmer',
    accent: '#22D3EE',
    defaultGlowColor: '#22D3EE',
    defaultGlowIntensity: 40,
    builtIn: false,
  },
  {
    id: 'duo-neon',
    label: 'Electric Duotone',
    category: 'Glow',
    description: 'Deep indigo & cyan neon stage wash',
    accent: '#6366F1',
    defaultGlowColor: '#6366F1',
    defaultGlowIntensity: 50,
    builtIn: false,
  },
  {
    id: 'lens-flare',
    label: 'Anamorphic Lens Flare',
    category: 'Glow',
    description: 'Cinema horizontal cyan optical streak & ring',
    accent: '#38BDF8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 45,
    builtIn: false,
  },
  {
    id: 'light-leak',
    label: 'Warm Film Light Leak',
    category: 'Glow',
    description: 'Analog amber-crimson edge light burn sweep',
    accent: '#FB923C',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 42,
    builtIn: false,
  },
  {
    id: 'soft-glow-pro',
    label: 'Orton Dream Glow',
    category: 'Glow',
    description: 'Soft-focus dreamy highlight diffusion glaze',
    accent: '#F9A8D4',
    defaultGlowColor: '#EC4899',
    defaultGlowIntensity: 38,
    builtIn: false,
  },
  {
    id: 'aurora-prism',
    label: 'Aurora Rainbow Glow',
    category: 'Glow',
    description: 'Iridescent cyan-violet-rose prism wash',
    accent: '#C084FC',
    defaultGlowColor: '#A855F7',
    defaultGlowIntensity: 54,
    builtIn: false,
  },
  // Famous Blur FX
  {
    id: 'gaussian-blur',
    label: 'Soft Gaussian Blur',
    category: 'Blur',
    description: 'Smooth optical defocus across entire frame',
    accent: '#60A5FA',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 0,
    builtIn: true,
  },
  {
    id: 'radial-blur',
    label: 'Radial Zoom Blur',
    category: 'Blur',
    description: 'Dynamic concentric action focal zoom blur',
    accent: '#38BDF8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 25,
    builtIn: false,
  },
  {
    id: 'tilt-shift',
    label: 'Tilt-Shift Blur',
    category: 'Blur',
    description: 'Razor-sharp center with dreamy top/bottom blur',
    accent: '#34D399',
    defaultGlowColor: '#34D399',
    defaultGlowIntensity: 0,
    builtIn: false,
  },
  {
    id: 'motion-blur',
    label: 'Speed Motion Blur',
    category: 'Blur',
    description: 'Directional horizontal kinetic blur streaks',
    accent: '#818CF8',
    defaultGlowColor: '#818CF8',
    defaultGlowIntensity: 18,
    builtIn: false,
  },
  {
    id: 'frosted-glass',
    label: 'Frosted Glass Blur',
    category: 'Blur',
    description: 'Silky frosted matte blur with soft veil',
    accent: '#CBD5E1',
    defaultGlowColor: '#94A3B8',
    defaultGlowIntensity: 15,
    builtIn: false,
  },
  {
    id: 'bokeh-blur',
    label: 'Cinema Bokeh Orbs',
    category: 'Blur',
    description: 'Soft lens blur with floating glowing bokeh discs',
    accent: '#FDE68A',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 32,
    builtIn: false,
  },
  {
    id: 'spin-blur',
    label: 'Vortex Spin Blur',
    category: 'Blur',
    description: 'Rotational swirling action vortex blur',
    accent: '#38BDF8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 20,
    builtIn: false,
  },
  {
    id: 'edge-blur',
    label: 'Radial Edge Blur',
    category: 'Blur',
    description: 'Focused sharp subject with feathered edge blur',
    accent: '#93C5FD',
    defaultGlowColor: '#3B82F6',
    defaultGlowIntensity: 0,
    builtIn: false,
  },
  // Famous Mosaic & Pixel FX
  {
    id: 'mosaic',
    label: 'Mosaic Pixelate',
    category: 'Mosaic',
    description: 'Classic crisp square mosaic pixel blocks',
    accent: '#FBBF24',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 0,
    builtIn: true,
  },
  {
    id: 'mosaic-glass',
    label: 'Frosted Mosaic Tiles',
    category: 'Mosaic',
    description: 'Translucent architectural glass tile grid',
    accent: '#2DD4BF',
    defaultGlowColor: '#2DD4BF',
    defaultGlowIntensity: 18,
    builtIn: false,
  },
  {
    id: 'crystal-facets',
    label: 'Crystal Mosaic Grid',
    category: 'Mosaic',
    description: 'Geometric beveled mosaic tile pattern',
    accent: '#C084FC',
    defaultGlowColor: '#A855F7',
    defaultGlowIntensity: 22,
    builtIn: false,
  },
  {
    id: 'halftone-dots',
    label: 'Halftone Pop Dots',
    category: 'Mosaic',
    description: 'Retro editorial print halftone dot screen',
    accent: '#F472B6',
    defaultGlowColor: '#EC4899',
    defaultGlowIntensity: 15,
    builtIn: false,
  },
  {
    id: 'pixel-8bit',
    label: '8-Bit Retro Arcade',
    category: 'Mosaic',
    description: 'Chunky 8-bit console pixelation & punchy color',
    accent: '#4ADE80',
    defaultGlowColor: '#10B981',
    defaultGlowIntensity: 20,
    builtIn: false,
  },
  {
    id: 'led-matrix',
    label: 'LED Billboard Matrix',
    category: 'Mosaic',
    description: 'Concert LED wall pixel dot grid glow',
    accent: '#38BDF8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 28,
    builtIn: false,
  },
  // Cinema & Color Grading FX
  {
    id: 'teal-orange',
    label: 'Teal & Orange Cinema',
    category: 'Cinema',
    description: 'Hollywood blockbuster teal shadows & warm skin',
    accent: '#14B8A6',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 18,
    builtIn: false,
  },
  {
    id: 'vintage-sepia',
    label: 'Vintage 70s Kodak',
    category: 'Cinema',
    description: 'Nostalgic warm analog Kodak film fade',
    accent: '#D97706',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 14,
    builtIn: false,
  },
  {
    id: 'noir-cinema',
    label: 'Silver Film Noir',
    category: 'Cinema',
    description: 'Dramatic high-contrast B&W silver cinema',
    accent: '#E2E8F0',
    defaultGlowColor: '#94A3B8',
    defaultGlowIntensity: 0,
    builtIn: false,
  },
  {
    id: 'night-vision',
    label: 'Night Vision NVG',
    category: 'Cinema',
    description: 'Tactical phosphor green NVG optics & vignette',
    accent: '#22C55E',
    defaultGlowColor: '#10B981',
    defaultGlowIntensity: 36,
    builtIn: false,
  },
  {
    id: 'matrix-code',
    label: 'Cyber Matrix Tint',
    category: 'Cinema',
    description: 'Iconic emerald digital cinema grade & scanlines',
    accent: '#10B981',
    defaultGlowColor: '#10B981',
    defaultGlowIntensity: 34,
    builtIn: false,
  },
  {
    id: 'thermal-cam',
    label: 'Thermal Heat Cam',
    category: 'Cinema',
    description: 'Infrared heat-map false color predator look',
    accent: '#F97316',
    defaultGlowColor: '#EC4899',
    defaultGlowIntensity: 26,
    builtIn: false,
  },
  // Glitch & Viral FX
  {
    id: 'vhs-glitch',
    label: 'VHS Tape Drift',
    category: 'Glitch',
    description: 'Classic analog tape tracking & RGB drift',
    accent: '#F43F5E',
    defaultGlowColor: '#F43F5E',
    defaultGlowIntensity: 30,
    builtIn: false,
  },
  {
    id: 'chromatic-shake',
    label: 'Chromatic RGB Shake',
    category: 'Glitch',
    description: 'Energetic RGB split & viral beat shake',
    accent: '#06B6D4',
    defaultGlowColor: '#22D3EE',
    defaultGlowIntensity: 35,
    builtIn: false,
  },
  {
    id: 'tv-static',
    label: 'Analog TV Static',
    category: 'Glitch',
    description: 'Broadcast snow grain & horizontal sync tear',
    accent: '#94A3B8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 18,
    builtIn: false,
  },
  {
    id: 'quad-split',
    label: '4-Screen Music Split',
    category: 'Glitch',
    description: 'Iconic 2x2 music video multi-frame grid',
    accent: '#A855F7',
    defaultGlowColor: '#A855F7',
    defaultGlowIntensity: 25,
    builtIn: false,
  },
  {
    id: 'kaleidoscope',
    label: '4-Way Kaleidoscope',
    category: 'Glitch',
    description: 'Quad symmetrical X+Y mirror reflection',
    accent: '#EC4899',
    defaultGlowColor: '#EC4899',
    defaultGlowIntensity: 28,
    builtIn: false,
  },
  // Famous Stylize FX
  {
    id: 'retro-scan',
    label: 'Retro CRT Scan',
    category: 'Stylize',
    description: 'Analog CRT scanlines & luminous sweep bar',
    accent: '#818CF8',
    defaultGlowColor: '#818CF8',
    defaultGlowIntensity: 45,
    builtIn: false,
  },
  {
    id: 'cinema-grain',
    label: '35mm Film Grain',
    category: 'Stylize',
    description: 'Organic analog cinema grain & warm contrast',
    accent: '#D97706',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 12,
    builtIn: false,
  },
  {
    id: 'mirror-kaleido',
    label: 'Mirror Symmetry',
    category: 'Stylize',
    description: 'Crisp mirrored reflection split down center',
    accent: '#38BDF8',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 24,
    builtIn: false,
  },
  {
    id: 'sketch-ink',
    label: 'Comic Ink Poster',
    category: 'Stylize',
    description: 'Graphic high-contrast ink illustration look',
    accent: '#F8FAFC',
    defaultGlowColor: '#38BDF8',
    defaultGlowIntensity: 0,
    builtIn: false,
  },
  {
    id: 'pop-poster',
    label: 'Pop Art Vivid',
    category: 'Stylize',
    description: 'Punchy ultra-saturated graphic magazine pop',
    accent: '#F43F5E',
    defaultGlowColor: '#EC4899',
    defaultGlowIntensity: 30,
    builtIn: false,
  },
  {
    id: 'flash-strobe',
    label: 'Club Strobe Pulse',
    category: 'Stylize',
    description: 'Rhythmic beat-synced luminous club flash',
    accent: '#E879F9',
    defaultGlowColor: '#A855F7',
    defaultGlowIntensity: 48,
    builtIn: false,
  },
  {
    id: 'fisheye-vignette',
    label: '90s Skate Vignette',
    category: 'Stylize',
    description: 'Deep wide-angle circular lens vignette & punch',
    accent: '#FBBF24',
    defaultGlowColor: '#F59E0B',
    defaultGlowIntensity: 0,
    builtIn: false,
  },
];

export type FramePreset =
  | 'none'
  | 'electro-frame'
  | 'electro-pulse'
  | 'cinema-bars'
  | 'polaroid'
  | 'neon-border'
  | 'rounded-card'
  | 'rec-viewfinder'
  | 'film-strip'
  | 'double-gold'
  | 'vhs-cam'
  | 'split-mat'
  | 'glow-bezel';

export interface FramePresetInfo {
  id: FramePreset;
  label: string;
  description: string;
  accent: string;
  defaultColor: string;
  builtIn?: boolean;
}

export const FRAME_PRESETS: FramePresetInfo[] = [
  {
    id: 'none',
    label: 'No Frame',
    description: 'Full edge-to-edge frame',
    accent: '#94A3B8',
    defaultColor: '#38BDF8',
    builtIn: true,
  },
  {
    id: 'electro-frame',
    label: 'Electro Lightning Frame',
    description: 'High-voltage animated electric plasma arcs border',
    accent: '#22D3EE',
    defaultColor: '#22D3EE',
    builtIn: true,
  },
  {
    id: 'electro-pulse',
    label: 'Electro Neon Pulse',
    description: 'Multi-color electric cyan-violet energy circuit frame',
    accent: '#A855F7',
    defaultColor: '#A855F7',
    builtIn: false,
  },
  {
    id: 'cinema-bars',
    label: 'Cinema 2.39:1 Bars',
    description: 'Classic anamorphic letterbox bars',
    accent: '#E2E8F0',
    defaultColor: '#050608',
    builtIn: true,
  },
  {
    id: 'polaroid',
    label: 'Polaroid Print',
    description: 'Iconic instant photo matte border',
    accent: '#F8FAFC',
    defaultColor: '#F8FAFC',
    builtIn: true,
  },
  {
    id: 'neon-border',
    label: 'Neon Glow Frame',
    description: 'Luminous outer neon border halo',
    accent: '#38BDF8',
    defaultColor: '#38BDF8',
    builtIn: true,
  },
  {
    id: 'rounded-card',
    label: 'Rounded Studio Card',
    description: 'Modern rounded corners with dark bezel',
    accent: '#60A5FA',
    defaultColor: '#05070C',
    builtIn: false,
  },
  {
    id: 'rec-viewfinder',
    label: 'Camera Viewfinder',
    description: 'Pro DSLR corner brackets & focus cross',
    accent: '#F43F5E',
    defaultColor: '#FFFFFF',
    builtIn: false,
  },
  {
    id: 'film-strip',
    label: '35mm Film Sprockets',
    description: 'Authentic analog cinema perforation rails',
    accent: '#F59E0B',
    defaultColor: '#0A0B0E',
    builtIn: false,
  },
  {
    id: 'double-gold',
    label: 'Luxury Double Line',
    description: 'Editorial twin hairline metallic frame',
    accent: '#FBBF24',
    defaultColor: '#FBBF24',
    builtIn: false,
  },
  {
    id: 'vhs-cam',
    label: 'Retro Camcorder',
    description: '90s camcorder corner guide & date bezel',
    accent: '#22D3EE',
    defaultColor: '#22D3EE',
    builtIn: false,
  },
  {
    id: 'split-mat',
    label: 'Gallery Matte',
    description: 'Clean exhibition passe-partout frame',
    accent: '#E2E8F0',
    defaultColor: '#F1F5F9',
    builtIn: false,
  },
  {
    id: 'glow-bezel',
    label: 'Prism Gradient Bezel',
    description: 'Iridescent cyan-violet glowing perimeter',
    accent: '#A855F7',
    defaultColor: '#A855F7',
    builtIn: false,
  },
];

export const GLOW_COLOR_SWATCHES = [
  '#38BDF8',
  '#3B82F6',
  '#A855F7',
  '#EC4899',
  '#F59E0B',
  '#10B981',
];

export type AnimationCategory = 'In' | 'Out' | 'Combo';

export type ClipAnimationPreset =
  | 'none'
  | 'fade-in'
  | 'pop-bounce'
  | 'slide-up-in'
  | 'slide-down-in'
  | 'slide-left-in'
  | 'slide-right-in'
  | 'zoom-punch-in'
  | 'elastic-snap'
  | 'spin-in'
  | 'flip-in'
  | 'glitch-in'
  | 'cinematic-reveal'
  | 'drop-bounce'
  | 'swirl-in'
  | 'skew-snap-in'
  | 'zoom-rotate-in'
  | 'curtain-wipe-in'
  | 'fade-out'
  | 'zoom-out-exit'
  | 'slide-up-out'
  | 'slide-down-out'
  | 'slide-left-out'
  | 'slide-right-out'
  | 'spin-out'
  | 'shrink-drop'
  | 'bounce-out'
  | 'swirl-out'
  | 'curtain-wipe-out'
  | 'flicker-out'
  | 'pulse-beat'
  | 'float-hover'
  | 'wiggle-jiggle'
  | 'pendulum-swing'
  | 'shake-quake'
  | 'cinematic-breathe'
  | 'flash-pulse'
  | 'spin-orbit'
  | 'rubber-band'
  | 'heartbeat-loop'
  | 'blink-strobe'
  | 'glitch-jitter'
  | 'tada-celebrate'
  | 'pan-horizontal'
  | 'pan-vertical'
  | 'pan-diagonal'
  | 'pan-ken-loop'
  | 'pan-zoom';

export interface AnimationPresetInfo {
  id: ClipAnimationPreset;
  label: string;
  category: AnimationCategory;
  description: string;
  accent: string;
  defaultDuration: number;
  builtIn?: boolean;
}

export const ANIMATION_PRESETS: AnimationPresetInfo[] = [
  // In Animations
  {
    id: 'fade-in',
    label: 'Soft Fade In',
    category: 'In',
    description: 'Smooth silky opacity entrance',
    accent: '#38BDF8',
    defaultDuration: 0.5,
    builtIn: true,
  },
  {
    id: 'pop-bounce',
    label: 'Pop Bounce In',
    category: 'In',
    description: 'Energetic overshoot spring scale bounce',
    accent: '#A855F7',
    defaultDuration: 0.55,
    builtIn: true,
  },
  {
    id: 'slide-up-in',
    label: 'Slide Up Reveal',
    category: 'In',
    description: 'Clean upward motion slide with fade',
    accent: '#22D3EE',
    defaultDuration: 0.5,
    builtIn: true,
  },
  {
    id: 'slide-down-in',
    label: 'Drop Down In',
    category: 'In',
    description: 'Smooth downward drop entrance',
    accent: '#60A5FA',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'slide-left-in',
    label: 'Whip Slide Left',
    category: 'In',
    description: 'Snappy whip pan slide from right to center',
    accent: '#818CF8',
    defaultDuration: 0.45,
    builtIn: false,
  },
  {
    id: 'slide-right-in',
    label: 'Whip Slide Right',
    category: 'In',
    description: 'Snappy whip pan slide from left to center',
    accent: '#34D399',
    defaultDuration: 0.45,
    builtIn: false,
  },
  {
    id: 'zoom-punch-in',
    label: 'Zoom Punch Slam',
    category: 'In',
    description: 'High-impact oversized zoom punch drop',
    accent: '#F43F5E',
    defaultDuration: 0.45,
    builtIn: false,
  },
  {
    id: 'elastic-snap',
    label: 'Elastic Rubber Snap',
    category: 'In',
    description: 'Elastic spring settle with playful bounce',
    accent: '#EC4899',
    defaultDuration: 0.75,
    builtIn: false,
  },
  {
    id: 'spin-in',
    label: 'Vortex Spin In',
    category: 'In',
    description: '360° dynamic rotational zoom entrance',
    accent: '#F59E0B',
    defaultDuration: 0.6,
    builtIn: false,
  },
  {
    id: 'flip-in',
    label: '3D Flip Slant In',
    category: 'In',
    description: 'Perspective skew & scale flip reveal',
    accent: '#2DD4BF',
    defaultDuration: 0.55,
    builtIn: false,
  },
  {
    id: 'glitch-in',
    label: 'Cyber Glitch Snap',
    category: 'In',
    description: 'High-frequency digital jitter & flash entry',
    accent: '#06B6D4',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'cinematic-reveal',
    label: 'Cinema Blur Reveal',
    category: 'In',
    description: 'Rack-focus optical blur clear to sharp',
    accent: '#FDE68A',
    defaultDuration: 0.7,
    builtIn: false,
  },
  {
    id: 'drop-bounce',
    label: 'Gravity Drop Bounce',
    category: 'In',
    description: 'Drops from above and bounces crisply into place',
    accent: '#38BDF8',
    defaultDuration: 0.65,
    builtIn: true,
  },
  {
    id: 'swirl-in',
    label: 'Spiral Swirl Zoom',
    category: 'In',
    description: 'Spiraling zoom-in twist entrance',
    accent: '#C084FC',
    defaultDuration: 0.6,
    builtIn: false,
  },
  {
    id: 'skew-snap-in',
    label: 'Kinetic Skew Whip',
    category: 'In',
    description: 'High-speed slanted horizontal whip-in',
    accent: '#FB7185',
    defaultDuration: 0.45,
    builtIn: false,
  },
  {
    id: 'zoom-rotate-in',
    label: 'Whip Zoom Spin',
    category: 'In',
    description: 'Punchy oversized zoom with quarter-turn snap',
    accent: '#FBBF24',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'curtain-wipe-in',
    label: 'Curtain Open Reveal',
    category: 'In',
    description: 'Expanding horizontal stage curtain unfold',
    accent: '#34D399',
    defaultDuration: 0.55,
    builtIn: false,
  },
  // Out Animations
  {
    id: 'fade-out',
    label: 'Soft Fade Out',
    category: 'Out',
    description: 'Smooth cinematic opacity dissolve out',
    accent: '#94A3B8',
    defaultDuration: 0.5,
    builtIn: true,
  },
  {
    id: 'zoom-out-exit',
    label: 'Shrink Zoom Out',
    category: 'Out',
    description: 'Clean zoom shrink fade exit',
    accent: '#38BDF8',
    defaultDuration: 0.45,
    builtIn: true,
  },
  {
    id: 'slide-up-out',
    label: 'Fly Up Exit',
    category: 'Out',
    description: 'Fast upward swipe-away exit',
    accent: '#818CF8',
    defaultDuration: 0.45,
    builtIn: false,
  },
  {
    id: 'slide-down-out',
    label: 'Sink Down Exit',
    category: 'Out',
    description: 'Smooth downward drop exit',
    accent: '#60A5FA',
    defaultDuration: 0.45,
    builtIn: false,
  },
  {
    id: 'slide-left-out',
    label: 'Whip Left Exit',
    category: 'Out',
    description: 'Fast whip exit to the left',
    accent: '#34D399',
    defaultDuration: 0.4,
    builtIn: false,
  },
  {
    id: 'slide-right-out',
    label: 'Whip Right Exit',
    category: 'Out',
    description: 'Fast whip exit to the right',
    accent: '#2DD4BF',
    defaultDuration: 0.4,
    builtIn: false,
  },
  {
    id: 'spin-out',
    label: 'Whirl Spin Out',
    category: 'Out',
    description: 'Spinning shrink vortex exit',
    accent: '#F59E0B',
    defaultDuration: 0.55,
    builtIn: false,
  },
  {
    id: 'shrink-drop',
    label: 'Collapse Blur Out',
    category: 'Out',
    description: 'Soft scale drop with optical blur exit',
    accent: '#FB7185',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'bounce-out',
    label: 'Spring Pop Out',
    category: 'Out',
    description: 'Quick anticipation pop before vanishing',
    accent: '#EC4899',
    defaultDuration: 0.5,
    builtIn: true,
  },
  {
    id: 'swirl-out',
    label: 'Spiral Vortex Exit',
    category: 'Out',
    description: 'Twisting spiral zoom-out fade',
    accent: '#A855F7',
    defaultDuration: 0.55,
    builtIn: false,
  },
  {
    id: 'curtain-wipe-out',
    label: 'Curtain Close Exit',
    category: 'Out',
    description: 'Horizontal fold-close curtain exit',
    accent: '#22D3EE',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'flicker-out',
    label: 'CRT Power-Off Flicker',
    category: 'Out',
    description: 'Retro tube flicker and vertical collapse',
    accent: '#F43F5E',
    defaultDuration: 0.5,
    builtIn: false,
  },
  // Combo / Continuous Loop Animations
  {
    id: 'pulse-beat',
    label: 'Bass Pulse Beat',
    category: 'Combo',
    description: 'Rhythmic beat-synced scale heartbeat loop',
    accent: '#EC4899',
    defaultDuration: 0.6,
    builtIn: true,
  },
  {
    id: 'float-hover',
    label: 'Zero-G Float Loop',
    category: 'Combo',
    description: 'Smooth levitating vertical & tilt float',
    accent: '#38BDF8',
    defaultDuration: 0.6,
    builtIn: true,
  },
  {
    id: 'wiggle-jiggle',
    label: 'Playful Wiggle',
    category: 'Combo',
    description: 'Bouncy micro-rotation & sway jiggle loop',
    accent: '#FBBF24',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'pendulum-swing',
    label: 'Pendulum Swing',
    category: 'Combo',
    description: 'Rhythmic left-right pendulum rock motion',
    accent: '#A855F7',
    defaultDuration: 0.6,
    builtIn: false,
  },
  {
    id: 'shake-quake',
    label: 'Camera Action Quake',
    category: 'Combo',
    description: 'High-energy handheld impact tremor loop',
    accent: '#F43F5E',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'cinematic-breathe',
    label: 'Cinema Slow Breathe',
    category: 'Combo',
    description: 'Subtle organic living camera breathe zoom',
    accent: '#34D399',
    defaultDuration: 0.8,
    builtIn: false,
  },
  {
    id: 'flash-pulse',
    label: 'Neon Blink Pulse',
    category: 'Combo',
    description: 'Subtle rhythmic neon alpha pulse glow',
    accent: '#22D3EE',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'spin-orbit',
    label: 'Continuous Spin Orbit',
    category: 'Combo',
    description: 'Smooth continuous turntable rotation loop',
    accent: '#C084FC',
    defaultDuration: 0.8,
    builtIn: false,
  },
  {
    id: 'rubber-band',
    label: 'Elastic Rubber Band',
    category: 'Combo',
    description: 'Squash-and-stretch rhythmic rubber bounce',
    accent: '#F59E0B',
    defaultDuration: 0.6,
    builtIn: true,
  },
  {
    id: 'heartbeat-loop',
    label: 'Double Heartbeat',
    category: 'Combo',
    description: 'Lub-dub double pulse pop loop',
    accent: '#FB7185',
    defaultDuration: 0.6,
    builtIn: false,
  },
  {
    id: 'blink-strobe',
    label: 'LIVE Strobe Blink',
    category: 'Combo',
    description: 'Broadcast-style crisp attention blink loop',
    accent: '#EF4444',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'glitch-jitter',
    label: 'Cyber Glitch Loop',
    category: 'Combo',
    description: 'Periodic digital micro-tear jitter loop',
    accent: '#06B6D4',
    defaultDuration: 0.5,
    builtIn: false,
  },
  {
    id: 'tada-celebrate',
    label: 'Tada Pop Shake',
    category: 'Combo',
    description: 'Celebratory tilt + scale burst loop',
    accent: '#FACC15',
    defaultDuration: 0.6,
    builtIn: false,
  },
  {
    id: 'pan-horizontal',
    label: 'Pan Left ↔ Right Loop',
    category: 'Combo',
    description: 'Smooth continuous horizontal camera pan loop',
    accent: '#38BDF8',
    defaultDuration: 0.8,
    builtIn: true,
  },
  {
    id: 'pan-vertical',
    label: 'Pan Up ↕ Down Loop',
    category: 'Combo',
    description: 'Smooth continuous vertical tilt pan loop',
    accent: '#2DD4BF',
    defaultDuration: 0.8,
    builtIn: true,
  },
  {
    id: 'pan-diagonal',
    label: 'Pan Diagonal Drift Loop',
    category: 'Combo',
    description: 'Continuous diagonal glide pan across frame',
    accent: '#A855F7',
    defaultDuration: 0.8,
    builtIn: true,
  },
  {
    id: 'pan-ken-loop',
    label: 'Cinema Pan & Zoom Loop',
    category: 'Combo',
    description: 'Slow organic figure-8 pan with subtle zoom',
    accent: '#F59E0B',
    defaultDuration: 0.8,
    builtIn: true,
  },
  {
    id: 'pan-zoom',
    label: 'Pan & Zoom (Keyframes)',
    category: 'Combo',
    description: 'Custom Start & End Scale and Position keyframes for images & videos',
    accent: '#38BDF8',
    defaultDuration: 1.0,
    builtIn: true,
  },
];

export type StickerCategory = 'Social' | 'Reactions' | 'Badges' | 'Arrows';

export type StickerStyleKind =
  | 'pill-badge'
  | 'emoji-badge'
  | 'callout-stamp'
  | 'neon-tag'
  | 'arrow-vector'
  | 'hud-indicator'
  | 'star-rating';

export interface StickerConfig {
  stickerId: string;
  label: string;
  emoji?: string;
  category: StickerCategory;
  kind: StickerStyleKind;
  size: number;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  showBadgeBg?: boolean;
}

export interface StickerPresetInfo {
  id: string;
  label: string;
  emoji?: string;
  category: StickerCategory;
  kind: StickerStyleKind;
  description: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  showBadgeBg?: boolean;
  defaultSize?: number;
  defaultCombo?: ClipAnimationPreset;
}

export const FAMOUS_STICKERS: StickerPresetInfo[] = [
  // Social & Creator Stickers
  {
    id: 'sub-youtube',
    label: 'SUBSCRIBE',
    emoji: '▶',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Classic red creator subscribe button',
    primaryColor: '#EF4444',
    accentColor: '#DC2626',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 120,
    defaultCombo: 'pulse-beat',
  },
  {
    id: 'bell-notify',
    label: 'TURN ON BELL',
    emoji: '🔔',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Notification bell alert callout',
    primaryColor: '#F59E0B',
    accentColor: '#D97706',
    textColor: '#0F172A',
    showBadgeBg: true,
    defaultSize: 118,
    defaultCombo: 'wiggle-jiggle',
  },
  {
    id: 'like-thumb',
    label: 'LIKE',
    emoji: '👍',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Blue thumbs-up reaction pill',
    primaryColor: '#2563EB',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
    defaultCombo: 'pop-bounce',
  },
  {
    id: 'love-heart',
    label: 'LOVE',
    emoji: '❤️',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Glowing crimson heart reaction',
    primaryColor: '#E11D48',
    accentColor: '#FB7185',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
    defaultCombo: 'heartbeat-loop',
  },
  {
    id: 'follow-plus',
    label: 'FOLLOW +',
    emoji: '✨',
    category: 'Social',
    kind: 'neon-tag',
    description: 'Iridescent creator follow pill',
    primaryColor: '#6366F1',
    accentColor: '#EC4899',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 118,
  },
  {
    id: 'share-arrow',
    label: 'SHARE',
    emoji: '↗',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Share this reel callout',
    primaryColor: '#0284C7',
    accentColor: '#22D3EE',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 112,
  },
  {
    id: 'comment-bubble',
    label: 'COMMENT',
    emoji: '💬',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Interactive comment prompt sticker',
    primaryColor: '#1E293B',
    accentColor: '#38BDF8',
    textColor: '#F8FAFC',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'live-dot',
    label: 'LIVE',
    emoji: '●',
    category: 'Social',
    kind: 'hud-indicator',
    description: 'Live stream broadcast badge',
    primaryColor: '#DC2626',
    accentColor: '#FCA5A5',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 112,
    defaultCombo: 'blink-strobe',
  },
  {
    id: 'link-in-bio',
    label: 'LINK IN BIO',
    emoji: '🔗',
    category: 'Social',
    kind: 'neon-tag',
    description: 'Short-form reel link pointer pill',
    primaryColor: '#9333EA',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'watch-next',
    label: 'WATCH NEXT',
    emoji: '⏭',
    category: 'Social',
    kind: 'pill-badge',
    description: 'End-screen next video sticker',
    primaryColor: '#0F172A',
    accentColor: '#F59E0B',
    textColor: '#FEF3C7',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'verified-check',
    label: 'VERIFIED',
    emoji: '✓',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Blue verified badge seal',
    primaryColor: '#0EA5E9',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'sound-on',
    label: 'SOUND ON',
    emoji: '🔊',
    category: 'Social',
    kind: 'neon-tag',
    description: 'Reels / TikTok audio on sticker',
    primaryColor: '#059669',
    accentColor: '#34D399',
    textColor: '#ECFDF5',
    showBadgeBg: true,
    defaultSize: 114,
    defaultCombo: 'pulse-beat',
  },
  {
    id: 'social-instagram',
    label: 'INSTAGRAM',
    emoji: '📸',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Instagram gradient profile & story sticker',
    primaryColor: '#E1306C',
    accentColor: '#F77737',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-reels',
    label: 'IG REELS',
    emoji: '🎬',
    category: 'Social',
    kind: 'neon-tag',
    description: 'Instagram Reels creator badge',
    primaryColor: '#833AB4',
    accentColor: '#FD1D1D',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-tiktok',
    label: 'TIKTOK',
    emoji: '🎵',
    category: 'Social',
    kind: 'neon-tag',
    description: 'TikTok cyan & magenta neon badge',
    primaryColor: '#25F4EE',
    accentColor: '#FE2C55',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 118,
    defaultCombo: 'pulse-beat',
  },
  {
    id: 'social-youtube',
    label: 'YOUTUBE',
    emoji: '▶',
    category: 'Social',
    kind: 'pill-badge',
    description: 'YouTube channel badge pill',
    primaryColor: '#FF0000',
    accentColor: '#B91C1C',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 118,
  },
  {
    id: 'social-shorts',
    label: 'YT SHORTS',
    emoji: '⚡',
    category: 'Social',
    kind: 'pill-badge',
    description: 'YouTube Shorts vertical creator tag',
    primaryColor: '#FF0033',
    accentColor: '#FB7185',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-facebook',
    label: 'FACEBOOK',
    emoji: '👍',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Facebook blue page follow sticker',
    primaryColor: '#1877F2',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-whatsapp',
    label: 'WHATSAPP',
    emoji: '💬',
    category: 'Social',
    kind: 'pill-badge',
    description: 'WhatsApp green chat & channel pill',
    primaryColor: '#25D366',
    accentColor: '#128C7E',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-snapchat',
    label: 'SNAPCHAT',
    emoji: '👻',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Snapchat bright yellow ghost badge',
    primaryColor: '#FFFC00',
    accentColor: '#FACC15',
    textColor: '#0F172A',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-x-twitter',
    label: 'FOLLOW ON 𝕏',
    emoji: '𝕏',
    category: 'Social',
    kind: 'neon-tag',
    description: 'X / Twitter handle & thread pill',
    primaryColor: '#38BDF8',
    accentColor: '#E2E8F0',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'social-telegram',
    label: 'TELEGRAM',
    emoji: '✈️',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Telegram channel join sticker',
    primaryColor: '#26A5E4',
    accentColor: '#0284C7',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-discord',
    label: 'DISCORD',
    emoji: '🎮',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Discord server community invite pill',
    primaryColor: '#5865F2',
    accentColor: '#818CF8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-twitch',
    label: 'TWITCH',
    emoji: '👾',
    category: 'Social',
    kind: 'neon-tag',
    description: 'Twitch live gaming stream badge',
    primaryColor: '#9146FF',
    accentColor: '#C084FC',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-linkedin',
    label: 'LINKEDIN',
    emoji: '💼',
    category: 'Social',
    kind: 'pill-badge',
    description: 'LinkedIn professional connect sticker',
    primaryColor: '#0A66C2',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'social-threads',
    label: 'THREADS',
    emoji: '@',
    category: 'Social',
    kind: 'neon-tag',
    description: 'Meta Threads conversation tag',
    primaryColor: '#E2E8F0',
    accentColor: '#94A3B8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'social-pinterest',
    label: 'PINTEREST',
    emoji: '📌',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Pinterest board pin callout',
    primaryColor: '#E60023',
    accentColor: '#FB7185',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'social-reddit',
    label: 'REDDIT',
    emoji: '👽',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Reddit community upvote badge',
    primaryColor: '#FF4500',
    accentColor: '#F97316',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'social-spotify',
    label: 'SPOTIFY',
    emoji: '🎧',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Spotify podcast & music listen tag',
    primaryColor: '#1DB954',
    accentColor: '#15803D',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 116,
  },
  {
    id: 'social-dm-me',
    label: 'DM ME',
    emoji: '✉️',
    category: 'Social',
    kind: 'neon-tag',
    description: 'Direct message CTA sticker',
    primaryColor: '#6366F1',
    accentColor: '#EC4899',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'social-tap-here',
    label: 'TAP HERE',
    emoji: '👆',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Interactive story tap pointer',
    primaryColor: '#0EA5E9',
    accentColor: '#6366F1',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
    defaultCombo: 'pop-bounce',
  },
  {
    id: 'social-double-tap',
    label: 'DOUBLE TAP',
    emoji: '❤️',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Reels double tap heart CTA',
    primaryColor: '#E11D48',
    accentColor: '#F43F5E',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
    defaultCombo: 'heartbeat-loop',
  },
  {
    id: 'social-save-post',
    label: 'SAVE POST',
    emoji: '🔖',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Bookmark save reel callout',
    primaryColor: '#F59E0B',
    accentColor: '#FBBF24',
    textColor: '#0F172A',
    showBadgeBg: true,
    defaultSize: 114,
  },
  {
    id: 'social-repost',
    label: 'REPOST',
    emoji: '🔁',
    category: 'Social',
    kind: 'pill-badge',
    description: 'Repost & share viral tag',
    primaryColor: '#10B981',
    accentColor: '#34D399',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
  },

  // Viral Reactions & Emojis
  {
    id: 'fire-hot',
    label: 'FIRE',
    emoji: '🔥',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Flaming hot viral reaction',
    primaryColor: '#F97316',
    accentColor: '#FACC15',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 138,
    defaultCombo: 'float-hover',
  },
  {
    id: 'hundred-100',
    label: '100%',
    emoji: '💯',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Classic 100 keep-it-real reaction',
    primaryColor: '#EF4444',
    accentColor: '#F97316',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 136,
    defaultCombo: 'tada-celebrate',
  },
  {
    id: 'mind-blown',
    label: 'MIND BLOWN',
    emoji: '🤯',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Exploding head reaction emoji',
    primaryColor: '#A855F7',
    accentColor: '#EC4899',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 138,
  },
  {
    id: 'laugh-tears',
    label: 'HAHA',
    emoji: '😂',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Tears of joy comedy reaction',
    primaryColor: '#FACC15',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 138,
    defaultCombo: 'wiggle-jiggle',
  },
  {
    id: 'clap-applause',
    label: 'BRAVO',
    emoji: '👏',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Applause celebration hands',
    primaryColor: '#F59E0B',
    accentColor: '#FDE68A',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 136,
  },
  {
    id: 'star-eyes',
    label: 'WOW',
    emoji: '🤩',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Star-struck amazement emoji',
    primaryColor: '#FBBF24',
    accentColor: '#F43F5E',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 138,
  },
  {
    id: 'party-popper',
    label: 'PARTY',
    emoji: '🎉',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Celebration confetti popper',
    primaryColor: '#EC4899',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 138,
    defaultCombo: 'tada-celebrate',
  },
  {
    id: 'shocked-omg',
    label: 'OMG!',
    emoji: '😱',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Shocked viral reaction emoji',
    primaryColor: '#38BDF8',
    accentColor: '#818CF8',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 138,
  },
  {
    id: 'sparkles-magic',
    label: 'MAGIC',
    emoji: '✨',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Aesthetic glowing sparkles',
    primaryColor: '#FDE047',
    accentColor: '#A855F7',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 136,
    defaultCombo: 'flash-pulse',
  },
  {
    id: 'rocket-boost',
    label: 'BOOST',
    emoji: '🚀',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Launch rocket sticker',
    primaryColor: '#38BDF8',
    accentColor: '#F43F5E',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 136,
    defaultCombo: 'float-hover',
  },
  {
    id: 'trophy-win',
    label: 'WINNER',
    emoji: '🏆',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Gold championship trophy',
    primaryColor: '#F59E0B',
    accentColor: '#FEF08A',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 138,
  },
  {
    id: 'crown-king',
    label: 'VIP KING',
    emoji: '👑',
    category: 'Reactions',
    kind: 'emoji-badge',
    description: 'Royal golden crown sticker',
    primaryColor: '#FBBF24',
    accentColor: '#F59E0B',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 136,
  },

  // Callouts & Badges
  {
    id: 'badge-new',
    label: 'NEW!',
    emoji: '★',
    category: 'Badges',
    kind: 'callout-stamp',
    description: 'Bright fresh release stamp',
    primaryColor: '#10B981',
    accentColor: '#34D399',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 122,
  },
  {
    id: 'badge-hot',
    label: 'HOT 🔥',
    category: 'Badges',
    kind: 'callout-stamp',
    description: 'Trending hot callout tag',
    primaryColor: '#EA580C',
    accentColor: '#FACC15',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 122,
  },
  {
    id: 'badge-sale',
    label: '50% OFF',
    emoji: '🏷️',
    category: 'Badges',
    kind: 'callout-stamp',
    description: 'Promo discount burst tag',
    primaryColor: '#E11D48',
    accentColor: '#F43F5E',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 122,
    defaultCombo: 'rubber-band',
  },
  {
    id: 'badge-top1',
    label: 'TOP #1',
    emoji: '🏅',
    category: 'Badges',
    kind: 'callout-stamp',
    description: 'Gold #1 ranked ribbon sticker',
    primaryColor: '#D97706',
    accentColor: '#FDE047',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 122,
  },
  {
    id: 'badge-warning',
    label: 'WARNING',
    emoji: '⚠️',
    category: 'Badges',
    kind: 'callout-stamp',
    description: 'Alert attention hazard badge',
    primaryColor: '#FACC15',
    accentColor: '#0F172A',
    textColor: '#0F172A',
    showBadgeBg: true,
    defaultSize: 120,
  },
  {
    id: 'badge-breaking',
    label: 'BREAKING',
    emoji: '⚡',
    category: 'Badges',
    kind: 'callout-stamp',
    description: 'Bold breaking news banner',
    primaryColor: '#B91C1C',
    accentColor: '#FFFFFF',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 124,
  },
  {
    id: 'badge-vs',
    label: 'VS',
    category: 'Badges',
    kind: 'neon-tag',
    description: 'Comparison battle emblem',
    primaryColor: '#2563EB',
    accentColor: '#EC4899',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 128,
  },
  {
    id: 'badge-protip',
    label: 'PRO TIP',
    emoji: '💡',
    category: 'Badges',
    kind: 'neon-tag',
    description: 'Tutorial creator tip callout',
    primaryColor: '#4F46E5',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 118,
  },
  {
    id: 'badge-vip',
    label: 'VIP',
    emoji: '💎',
    category: 'Badges',
    kind: 'neon-tag',
    description: 'Luxury diamond VIP seal',
    primaryColor: '#7C3AED',
    accentColor: '#FDE047',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 120,
  },
  {
    id: 'badge-247',
    label: '24/7',
    category: 'Badges',
    kind: 'callout-stamp',
    description: 'Always-on neon clock stamp',
    primaryColor: '#0891B2',
    accentColor: '#22D3EE',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 118,
  },

  // Arrows & HUD
  {
    id: 'arrow-curved',
    label: 'Curved Arrow',
    emoji: '↪',
    category: 'Arrows',
    kind: 'arrow-vector',
    description: 'Glowing curved callout pointer arrow',
    primaryColor: '#FACC15',
    accentColor: '#F97316',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 144,
    defaultCombo: 'float-hover',
  },
  {
    id: 'arrow-right',
    label: 'Arrow Right',
    emoji: '➔',
    category: 'Arrows',
    kind: 'arrow-vector',
    description: 'Bold neon directional vector arrow',
    primaryColor: '#38BDF8',
    accentColor: '#A855F7',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 144,
  },
  {
    id: 'arrow-up',
    label: 'Point Up',
    emoji: '⬆',
    category: 'Arrows',
    kind: 'arrow-vector',
    description: 'Bold neon upward highlight arrow',
    primaryColor: '#EC4899',
    accentColor: '#F43F5E',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 144,
  },
  {
    id: 'pointer-tap',
    label: 'TAP HERE',
    emoji: '👆',
    category: 'Arrows',
    kind: 'emoji-badge',
    description: 'Interactive finger tap callout',
    primaryColor: '#38BDF8',
    accentColor: '#FFFFFF',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 120,
    defaultCombo: 'pulse-beat',
  },
  {
    id: 'hud-rec',
    label: 'REC',
    emoji: '●',
    category: 'Arrows',
    kind: 'hud-indicator',
    description: 'DSLR camera recording viewfinder badge',
    primaryColor: '#EF4444',
    accentColor: '#FFFFFF',
    textColor: '#FFFFFF',
    showBadgeBg: true,
    defaultSize: 114,
    defaultCombo: 'blink-strobe',
  },
  {
    id: 'hud-target',
    label: 'FOCUS',
    emoji: '◎',
    category: 'Arrows',
    kind: 'hud-indicator',
    description: 'Glowing circular target reticle',
    primaryColor: '#22D3EE',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 148,
    defaultCombo: 'spin-orbit',
  },
  {
    id: 'five-stars',
    label: '5 STARS',
    emoji: '★★★★★',
    category: 'Arrows',
    kind: 'star-rating',
    description: 'Glowing five-star review strip',
    primaryColor: '#FACC15',
    accentColor: '#F59E0B',
    textColor: '#FEF08A',
    showBadgeBg: true,
    defaultSize: 120,
  },
  {
    id: 'bolt-energy',
    label: 'ENERGY',
    emoji: '⚡',
    category: 'Arrows',
    kind: 'emoji-badge',
    description: 'High-voltage electric lightning bolt',
    primaryColor: '#FACC15',
    accentColor: '#38BDF8',
    textColor: '#FFFFFF',
    showBadgeBg: false,
    defaultSize: 140,
    defaultCombo: 'flash-pulse',
  },
];

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  duration: number;
  width?: number;
  height?: number;
  waveform?: number[];
  motionVariant?: 'slate-sweep' | 'amber-horizon' | 'kinetic-grid';
  isSample?: boolean;
  defaultScale?: number;
  defaultOpacity?: number;
  defaultRotation?: number;
  defaultFadeIn?: number;
  defaultFadeOut?: number;
  defaultKenBurns?: KenBurnsPreset;
  defaultVolume?: number;
  defaultMuted?: boolean;
  defaultFilterPreset?: FilterPreset;
  defaultFxPreset?: VisualEffectPreset;
  defaultGlowColor?: string;
  defaultGlowIntensity?: number;
  defaultFramePreset?: FramePreset;
  defaultAnimationIn?: ClipAnimationPreset;
  defaultAnimationOut?: ClipAnimationPreset;
  defaultAnimationCombo?: ClipAnimationPreset;
}

export type CaptionStylePreset =
  | 'classic-sub'
  | 'boxed-dark'
  | 'active-speech-box'
  | 'active-box-scale'
  | 'bold-highlight'
  | 'neon-karaoke'
  | 'progressive-fill'
  | 'underline-focus'
  | 'multi-line-story'
  | 'single-word-punch'
  | 'yellow-cinema'
  | 'minimal-clean'
  | 'reels-emerald-box'
  | 'tiktok-crimson-pop'
  | 'podcast-indigo-pill'
  | 'creator-amber-glow'
  | 'glass-pill-strip'
  | 'news-ticker-bar'
  | 'yellow-box-black'
  | 'white-paper-tag'
  | 'cinema-serif-drama'
  | 'mono-documentary'
  | 'urdu-arabic-clean'
  | 'cyber-violet-wave';

export type CaptionStyleCategory = 'Standard' | 'Active Speech' | 'Boxed' | 'Social' | 'Cinema';

export type CaptionPositionPreset = 'bottom' | 'center' | 'top' | 'custom';

export type CaptionLineMode = 'single-line' | 'two-line' | 'multi-line' | 'word-by-word';

export type CaptionActiveMode =
  | 'none'
  | 'word-color'
  | 'active-box'
  | 'active-box-scale'
  | 'underline-bar'
  | 'progressive-fill';

export interface CaptionStyleInfo {
  id: CaptionStylePreset;
  label: string;
  category: CaptionStyleCategory;
  description: string;
  accent: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 500 | 600 | 700;
  color: string;
  hasScrim: boolean;
  scrimOpacity: number;
  bgColor: string;
  highlightColor: string;
  activeBoxColor: string;
  activeBoxRadius: number;
  outlineColor: string;
  outlineWidth: number;
  uppercase: boolean;
  wordHighlight: boolean;
  lineMode: CaptionLineMode;
  activeMode: CaptionActiveMode;
  builtIn?: boolean;
  downloadSize?: string;
}

export const CAPTION_STYLE_PRESETS: CaptionStyleInfo[] = [
  {
    id: 'classic-sub',
    label: 'Classic Single-Line',
    category: 'Standard',
    description: 'Clean single-line subtitle with zero outline by default',
    accent: '#F8FAFC',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 44,
    fontWeight: 600,
    color: '#FFFFFF',
    hasScrim: false,
    scrimOpacity: 75,
    bgColor: '#090B10',
    highlightColor: '#38BDF8',
    activeBoxColor: '#0284C7',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'single-line',
    activeMode: 'none',
    builtIn: true,
  },
  {
    id: 'active-speech-box',
    label: 'Active Speech Box',
    category: 'Active Speech',
    description: 'Jumping colored pill box highlights each word as spoken',
    accent: '#0EA5E9',
    fontFamily: 'Montserrat',
    fontSize: 48,
    fontWeight: 700,
    color: '#E2E8F0',
    hasScrim: true,
    scrimOpacity: 68,
    bgColor: '#090D16',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#0EA5E9',
    activeBoxRadius: 10,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'two-line',
    activeMode: 'active-box',
    builtIn: true,
  },
  {
    id: 'active-box-scale',
    label: 'Pop + Active Box',
    category: 'Active Speech',
    description: 'Active spoken word pops in size inside a bright highlight box',
    accent: '#8B5CF6',
    fontFamily: 'Outfit',
    fontSize: 50,
    fontWeight: 700,
    color: '#F8FAFC',
    hasScrim: false,
    scrimOpacity: 65,
    bgColor: '#090B10',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#7C3AED',
    activeBoxRadius: 12,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: true,
    wordHighlight: true,
    lineMode: 'multi-line',
    activeMode: 'active-box-scale',
    builtIn: true,
  },
  {
    id: 'bold-highlight',
    label: 'Active Color Changer',
    category: 'Active Speech',
    description: 'Bold creator subtitles with live spoken word color change',
    accent: '#FACC15',
    fontFamily: 'Montserrat',
    fontSize: 52,
    fontWeight: 700,
    color: '#FFFFFF',
    hasScrim: false,
    scrimOpacity: 70,
    bgColor: '#090B10',
    highlightColor: '#FACC15',
    activeBoxColor: '#FACC15',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: true,
    wordHighlight: true,
    lineMode: 'multi-line',
    activeMode: 'word-color',
    builtIn: true,
  },
  {
    id: 'boxed-dark',
    label: 'Dark Strip Box',
    category: 'Boxed',
    description: 'High-contrast broadcast background subtitle strip',
    accent: '#94A3B8',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 40,
    fontWeight: 600,
    color: '#F8FAFC',
    hasScrim: true,
    scrimOpacity: 82,
    bgColor: '#090B10',
    highlightColor: '#38BDF8',
    activeBoxColor: '#0284C7',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'two-line',
    activeMode: 'none',
    builtIn: true,
  },
  {
    id: 'yellow-cinema',
    label: 'Cinema Gold 2-Line',
    category: 'Cinema',
    description: 'Warm cinema yellow subtitle in balanced 2-line format',
    accent: '#FDE047',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 44,
    fontWeight: 600,
    color: '#FDE047',
    hasScrim: false,
    scrimOpacity: 75,
    bgColor: '#090B10',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#CA8A04',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'two-line',
    activeMode: 'none',
    builtIn: true,
  },
  {
    id: 'minimal-clean',
    label: 'Minimal Editorial',
    category: 'Standard',
    description: 'Clean lower-frame editorial caption typography',
    accent: '#CBD5E1',
    fontFamily: 'Outfit',
    fontSize: 38,
    fontWeight: 500,
    color: '#F8FAFC',
    hasScrim: false,
    scrimOpacity: 50,
    bgColor: '#090B10',
    highlightColor: '#38BDF8',
    activeBoxColor: '#0284C7',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'single-line',
    activeMode: 'none',
    builtIn: true,
  },
  {
    id: 'multi-line-story',
    label: 'Multi-Line Story Block',
    category: 'Standard',
    description: 'Wrapped multi-line paragraph subtitles with dark card box',
    accent: '#60A5FA',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 40,
    fontWeight: 600,
    color: '#F8FAFC',
    hasScrim: true,
    scrimOpacity: 78,
    bgColor: '#090B10',
    highlightColor: '#38BDF8',
    activeBoxColor: '#2563EB',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'multi-line',
    activeMode: 'none',
    builtIn: true,
  },
  {
    id: 'neon-karaoke',
    label: 'Neon Karaoke Box',
    category: 'Active Speech',
    description: 'Glowing cyan highlight box around active spoken word',
    accent: '#22D3EE',
    fontFamily: 'Outfit',
    fontSize: 48,
    fontWeight: 700,
    color: '#F8FAFC',
    hasScrim: true,
    scrimOpacity: 64,
    bgColor: '#0B1020',
    highlightColor: '#22D3EE',
    activeBoxColor: '#0891B2',
    activeBoxRadius: 10,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'single-line',
    activeMode: 'active-box',
    builtIn: false,
    downloadSize: '18 KB',
  },
  {
    id: 'progressive-fill',
    label: 'Progressive Word Fill',
    category: 'Active Speech',
    description: 'Spoken words stay illuminated in sequence across the line',
    accent: '#34D399',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 46,
    fontWeight: 700,
    color: '#94A3B8',
    hasScrim: true,
    scrimOpacity: 72,
    bgColor: '#070A12',
    highlightColor: '#34D399',
    activeBoxColor: '#10B981',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'multi-line',
    activeMode: 'progressive-fill',
    builtIn: false,
    downloadSize: '16 KB',
  },
  {
    id: 'underline-focus',
    label: 'Active Speech Underline',
    category: 'Active Speech',
    description: 'Clean bar underlines each word as it is spoken',
    accent: '#F43F5E',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 46,
    fontWeight: 700,
    color: '#FFFFFF',
    hasScrim: false,
    scrimOpacity: 60,
    bgColor: '#090B10',
    highlightColor: '#F43F5E',
    activeBoxColor: '#F43F5E',
    activeBoxRadius: 6,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'single-line',
    activeMode: 'underline-bar',
    builtIn: false,
    downloadSize: '15 KB',
  },
  {
    id: 'cyber-violet-wave',
    label: 'Cyber Violet Wave',
    category: 'Active Speech',
    description: 'Electric violet active speech box with cyan text pop',
    accent: '#A855F7',
    fontFamily: 'Syne',
    fontSize: 48,
    fontWeight: 700,
    color: '#E2E8F0',
    hasScrim: true,
    scrimOpacity: 60,
    bgColor: '#0D081C',
    highlightColor: '#22D3EE',
    activeBoxColor: '#9333EA',
    activeBoxRadius: 12,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'two-line',
    activeMode: 'active-box-scale',
    builtIn: false,
    downloadSize: '21 KB',
  },
  {
    id: 'single-word-punch',
    label: 'Single-Word Impact',
    category: 'Social',
    description: 'One large spoken word flashes at a time for reels & shorts',
    accent: '#EC4899',
    fontFamily: 'Oswald',
    fontSize: 66,
    fontWeight: 700,
    color: '#FFFFFF',
    hasScrim: false,
    scrimOpacity: 60,
    bgColor: '#090B10',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#EC4899',
    activeBoxRadius: 12,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: true,
    wordHighlight: true,
    lineMode: 'word-by-word',
    activeMode: 'active-box-scale',
    builtIn: false,
    downloadSize: '22 KB',
  },
  {
    id: 'reels-emerald-box',
    label: 'Reels Emerald Box',
    category: 'Social',
    description: 'High-retention emerald pill box for short-form dialogue',
    accent: '#10B981',
    fontFamily: 'Montserrat',
    fontSize: 50,
    fontWeight: 700,
    color: '#F8FAFC',
    hasScrim: false,
    scrimOpacity: 65,
    bgColor: '#06120E',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#059669',
    activeBoxRadius: 10,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: true,
    wordHighlight: true,
    lineMode: 'multi-line',
    activeMode: 'active-box',
    builtIn: false,
    downloadSize: '19 KB',
  },
  {
    id: 'tiktok-crimson-pop',
    label: 'Shorts Crimson Pop',
    category: 'Social',
    description: 'Punchy red-rose active speech box with scale pop',
    accent: '#FB7185',
    fontFamily: 'Bebas Neue',
    fontSize: 58,
    fontWeight: 700,
    color: '#FFFFFF',
    hasScrim: false,
    scrimOpacity: 65,
    bgColor: '#090B10',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#E11D48',
    activeBoxRadius: 10,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: true,
    wordHighlight: true,
    lineMode: 'two-line',
    activeMode: 'active-box-scale',
    builtIn: false,
    downloadSize: '20 KB',
  },
  {
    id: 'podcast-indigo-pill',
    label: 'Podcast Indigo Pill',
    category: 'Social',
    description: 'Studio podcast look with indigo active box & dark scrim',
    accent: '#6366F1',
    fontFamily: 'Poppins',
    fontSize: 44,
    fontWeight: 600,
    color: '#E0E7FF',
    hasScrim: true,
    scrimOpacity: 74,
    bgColor: '#0B1024',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#4F46E5',
    activeBoxRadius: 10,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'two-line',
    activeMode: 'active-box',
    builtIn: false,
    downloadSize: '19 KB',
  },
  {
    id: 'creator-amber-glow',
    label: 'Creator Amber Changer',
    category: 'Social',
    description: 'Warm amber spoken-word color switcher on soft dark strip',
    accent: '#F59E0B',
    fontFamily: 'Outfit',
    fontSize: 48,
    fontWeight: 700,
    color: '#F1F5F9',
    hasScrim: true,
    scrimOpacity: 55,
    bgColor: '#0A0908',
    highlightColor: '#FBBF24',
    activeBoxColor: '#D97706',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'multi-line',
    activeMode: 'word-color',
    builtIn: false,
    downloadSize: '17 KB',
  },
  {
    id: 'glass-pill-strip',
    label: 'Translucent Pill Strip',
    category: 'Boxed',
    description: 'Frosted dark translucent backdrop pill for clean interviews',
    accent: '#38BDF8',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 40,
    fontWeight: 600,
    color: '#F8FAFC',
    hasScrim: true,
    scrimOpacity: 52,
    bgColor: '#111827',
    highlightColor: '#38BDF8',
    activeBoxColor: '#0EA5E9',
    activeBoxRadius: 12,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'single-line',
    activeMode: 'none',
    builtIn: false,
    downloadSize: '14 KB',
  },
  {
    id: 'news-ticker-bar',
    label: 'Broadcast Ticker Single',
    category: 'Boxed',
    description: 'Crisp single-line broadcast bar with navy slate backing',
    accent: '#3B82F6',
    fontFamily: 'Antonio',
    fontSize: 44,
    fontWeight: 700,
    color: '#FFFFFF',
    hasScrim: true,
    scrimOpacity: 88,
    bgColor: '#0F172A',
    highlightColor: '#60A5FA',
    activeBoxColor: '#2563EB',
    activeBoxRadius: 6,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: true,
    wordHighlight: false,
    lineMode: 'single-line',
    activeMode: 'none',
    builtIn: false,
    downloadSize: '15 KB',
  },
  {
    id: 'yellow-box-black',
    label: 'High-Contrast Gold Box',
    category: 'Boxed',
    description: 'Bold black text over vibrant yellow caption box strip',
    accent: '#FACC15',
    fontFamily: 'Montserrat',
    fontSize: 42,
    fontWeight: 700,
    color: '#090B10',
    hasScrim: true,
    scrimOpacity: 94,
    bgColor: '#FACC15',
    highlightColor: '#FFFFFF',
    activeBoxColor: '#111827',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: true,
    wordHighlight: false,
    lineMode: 'two-line',
    activeMode: 'none',
    builtIn: false,
    downloadSize: '16 KB',
  },
  {
    id: 'white-paper-tag',
    label: 'Clean White Tag',
    category: 'Boxed',
    description: 'Editorial dark ink typography on crisp white card box',
    accent: '#F8FAFC',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 40,
    fontWeight: 700,
    color: '#0F172A',
    hasScrim: true,
    scrimOpacity: 94,
    bgColor: '#F8FAFC',
    highlightColor: '#0284C7',
    activeBoxColor: '#E0F2FE',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'single-line',
    activeMode: 'none',
    builtIn: false,
    downloadSize: '15 KB',
  },
  {
    id: 'cinema-serif-drama',
    label: 'Cinema Serif Drama',
    category: 'Cinema',
    description: 'Classic film-festival serif subtitles in 2-line format',
    accent: '#E2E8F0',
    fontFamily: 'Playfair Display',
    fontSize: 44,
    fontWeight: 600,
    color: '#F8FAFC',
    hasScrim: false,
    scrimOpacity: 60,
    bgColor: '#090B10',
    highlightColor: '#FDE68A',
    activeBoxColor: '#B45309',
    activeBoxRadius: 8,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'two-line',
    activeMode: 'none',
    builtIn: false,
    downloadSize: '17 KB',
  },
  {
    id: 'mono-documentary',
    label: 'Documentary Mono',
    category: 'Cinema',
    description: 'Sharp monospace tech/doc style with subtle charcoal plate',
    accent: '#2DD4BF',
    fontFamily: 'JetBrains Mono',
    fontSize: 36,
    fontWeight: 600,
    color: '#E2E8F0',
    hasScrim: true,
    scrimOpacity: 76,
    bgColor: '#090D12',
    highlightColor: '#2DD4BF',
    activeBoxColor: '#0F766E',
    activeBoxRadius: 6,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: true,
    lineMode: 'multi-line',
    activeMode: 'progressive-fill',
    builtIn: false,
    downloadSize: '18 KB',
  },
  {
    id: 'urdu-arabic-clean',
    label: 'RTL Urdu/Arabic Clean',
    category: 'Cinema',
    description: 'Legible multi-line RTL broadcast strip with zero outline',
    accent: '#34D399',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 44,
    fontWeight: 600,
    color: '#FFFFFF',
    hasScrim: true,
    scrimOpacity: 74,
    bgColor: '#090C12',
    highlightColor: '#34D399',
    activeBoxColor: '#059669',
    activeBoxRadius: 10,
    outlineColor: '#050608',
    outlineWidth: 0,
    uppercase: false,
    wordHighlight: false,
    lineMode: 'two-line',
    activeMode: 'none',
    builtIn: false,
    downloadSize: '16 KB',
  },
];

export interface TextConfig {
  text: string;
  fontFamily: TextFontFamily;
  fontSize: number;
  fontWeight: 500 | 600 | 700;
  color: string;
  align: 'left' | 'center' | 'right';
  hasScrim: boolean;
  scrimOpacity: number;
  animation: TextAnimation;
  isCaption?: boolean;
  captionStyle?: CaptionStylePreset;
  captionPosition?: CaptionPositionPreset;
  captionX?: number;
  captionY?: number;
  captionLineMode?: CaptionLineMode;
  captionActiveMode?: CaptionActiveMode;
  captionHighlightColor?: string;
  captionActiveBoxColor?: string;
  captionActiveBoxRadius?: number;
  captionBgColor?: string;
  captionOutlineColor?: string;
  captionOutlineWidth?: number;
  captionUppercase?: boolean;
  captionWordHighlight?: boolean;
  captionSafeMargin?: number;
  captionScale?: number;
  textDirection?: 'auto' | 'ltr' | 'rtl';
  detectedLanguage?: string;
}

export type KeyframeEasing = 'linear' | 'ease-in-out';

export interface ClipKeyframe {
  id: string;
  time: number; // local seconds from clip.startTime
  x: number;
  y: number;
  scale: number;
  opacity: number;
  rotation: number;
  easing: KeyframeEasing;
}

export type MaskShape =
  | 'none'
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'rounded-rect'
  | 'star'
  | 'heart'
  | 'diamond'
  | 'split-horizontal'
  | 'split-vertical'
  | 'linear-gradient'
  | 'custom';

export interface MaskPresetInfo {
  id: MaskShape;
  label: string;
  description: string;
  accent: string;
  builtIn?: boolean;
}

export const MASK_PRESETS: MaskPresetInfo[] = [
  {
    id: 'none',
    label: 'No Mask',
    description: 'Full unmasked frame',
    accent: '#94A3B8',
    builtIn: true,
  },
  {
    id: 'circle',
    label: 'Circle Spotlight',
    description: 'Crisp circular mask cutout',
    accent: '#38BDF8',
    builtIn: true,
  },
  {
    id: 'ellipse',
    label: 'Oval Portrait',
    description: 'Smooth horizontal/vertical oval mask',
    accent: '#60A5FA',
    builtIn: true,
  },
  {
    id: 'rectangle',
    label: 'Rectangle Crop',
    description: 'Sharp geometric rectangular window',
    accent: '#818CF8',
    builtIn: true,
  },
  {
    id: 'rounded-rect',
    label: 'Rounded Card Mask',
    description: 'Soft corner-radius studio frame mask',
    accent: '#22D3EE',
    builtIn: false,
  },
  {
    id: 'star',
    label: '5-Point Star Mask',
    description: 'Bold starburst cutout silhouette',
    accent: '#FBBF24',
    builtIn: false,
  },
  {
    id: 'heart',
    label: 'Heart Shape Mask',
    description: 'Classic romantic heart cutout',
    accent: '#FB7185',
    builtIn: false,
  },
  {
    id: 'diamond',
    label: 'Diamond Rhombus',
    description: 'Editorial geometric diamond mask',
    accent: '#C084FC',
    builtIn: false,
  },
  {
    id: 'split-horizontal',
    label: 'Horizontal Split Filmstrip',
    description: 'Top/bottom widescreen split reveal',
    accent: '#34D399',
    builtIn: false,
  },
  {
    id: 'split-vertical',
    label: 'Vertical Split Mirror',
    description: 'Clean vertical column split mask',
    accent: '#2DD4BF',
    builtIn: false,
  },
  {
    id: 'linear-gradient',
    label: 'Soft Linear Fade',
    description: 'Smooth feathered transparency gradient',
    accent: '#A855F7',
    builtIn: false,
  },
];

export interface CustomMaskItem {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: number;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  track: TrackId;
  name: string;
  startTime: number;
  duration: number;
  sourceOffset: number;
  speed: number;
  volume: number;
  muted: boolean;
  opacity: number;
  scale: number;
  x: number;
  y: number;
  rotation?: number;
  fadeIn: number;
  fadeOut: number;
  kenBurns: KenBurnsPreset;
  filterPreset: FilterPreset;
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  blur: number;
  vignette: number;
  textConfig?: TextConfig;
  stickerConfig?: StickerConfig;
  transitionIn?: TransitionType;
  transitionInDuration?: number;
  transitionOut?: TransitionType;
  transitionOutDuration?: number;
  animationIn?: ClipAnimationPreset;
  animationInDuration?: number;
  animationOut?: ClipAnimationPreset;
  animationOutDuration?: number;
  animationCombo?: ClipAnimationPreset;
  animationIntensity?: number;
  glowColor?: string;
  glowIntensity?: number;
  fxPreset?: VisualEffectPreset;
  fxIntensity?: number;
  framePreset?: FramePreset;
  frameColor?: string;
  frameThickness?: number;
  keyframes?: ClipKeyframe[];
  panZoomStartScale?: number;
  panZoomStartX?: number;
  panZoomStartY?: number;
  panZoomEndScale?: number;
  panZoomEndX?: number;
  panZoomEndY?: number;
  panZoomEasing?: KeyframeEasing;
  maskShape?: MaskShape;
  maskCenterX?: number;
  maskCenterY?: number;
  maskWidth?: number;
  maskHeight?: number;
  maskFeather?: number;
  maskInvert?: boolean;
  customMaskId?: string;
  customMaskDataUrl?: string;
}

export function buildPanZoomClipPatch(
  clip: Pick<
    TimelineClip,
    | 'duration'
    | 'scale'
    | 'x'
    | 'y'
    | 'opacity'
    | 'rotation'
    | 'keyframes'
    | 'panZoomStartScale'
    | 'panZoomStartX'
    | 'panZoomStartY'
    | 'panZoomEndScale'
    | 'panZoomEndX'
    | 'panZoomEndY'
    | 'panZoomEasing'
  >,
  overrides?: Partial<{
    startScale: number;
    startX: number;
    startY: number;
    endScale: number;
    endX: number;
    endY: number;
    easing: KeyframeEasing;
  }>
): Partial<TimelineClip> {
  const dur = Math.max(0.1, Number(clip.duration.toFixed(2)));
  const startScale = overrides?.startScale ?? clip.panZoomStartScale ?? clip.scale ?? 100;
  const startX = overrides?.startX ?? clip.panZoomStartX ?? clip.x ?? 0;
  const startY = overrides?.startY ?? clip.panZoomStartY ?? clip.y ?? 0;
  const endScale =
    overrides?.endScale ??
    clip.panZoomEndScale ??
    Math.min(400, Math.round((startScale + 22) * 10) / 10);
  const endX = overrides?.endX ?? clip.panZoomEndX ?? clip.x ?? 0;
  const endY = overrides?.endY ?? clip.panZoomEndY ?? clip.y ?? 0;
  const easing: KeyframeEasing = overrides?.easing ?? clip.panZoomEasing ?? 'ease-in-out';

  const existingMiddle = (clip.keyframes ?? []).filter(
    (k) =>
      k.id !== 'kf_panzoom_start' &&
      k.id !== 'kf_panzoom_end' &&
      k.time > 0.04 &&
      k.time < dur - 0.04
  );

  const startKf: ClipKeyframe = {
    id: 'kf_panzoom_start',
    time: 0,
    x: startX,
    y: startY,
    scale: startScale,
    opacity: clip.opacity,
    rotation: clip.rotation ?? 0,
    easing,
  };
  const endKf: ClipKeyframe = {
    id: 'kf_panzoom_end',
    time: dur,
    x: endX,
    y: endY,
    scale: endScale,
    opacity: clip.opacity,
    rotation: clip.rotation ?? 0,
    easing,
  };

  return {
    kenBurns: 'pan-zoom',
    panZoomStartScale: startScale,
    panZoomStartX: startX,
    panZoomStartY: startY,
    panZoomEndScale: endScale,
    panZoomEndX: endX,
    panZoomEndY: endY,
    panZoomEasing: easing,
    keyframes: [startKf, ...existingMiddle, endKf].sort((a, b) => a.time - b.time),
  };
}

export interface ExportSettings {
  format: 'mp4' | 'webm';
  resolution: '720p' | '1080p' | '4k';
  fps: 24 | 30 | 60;
  quality: 'fast' | 'balanced' | 'master';
}

export interface RenderProgress {
  phase: 'preparing' | 'audio' | 'encoding' | 'muxing' | 'done' | 'error' | 'cancelled';
  currentFrame: number;
  totalFrames: number;
  percent: number;
  elapsedMs: number;
  fpsSpeed: number;
  realtimeFactor: number;
  previewDataUrl?: string;
  errorMessage?: string;
}

export interface ExportResult {
  blob: Blob;
  url: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  renderTimeMs: number;
  frameCount: number;
  averageFps: number;
  realtimeFactor: number;
  codecLabel: string;
}

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number; label: string }> = {
  '16:9': { width: 1920, height: 1080, label: '16:9 Landscape' },
  '9:16': { width: 1080, height: 1920, label: '9:16 Vertical' },
  '1:1': { width: 1080, height: 1080, label: '1:1 Square' },
  '4:5': { width: 1080, height: 1350, label: '4:5 Portrait' },
};

export const FILTER_PRESET_VALUES: Record<
  FilterPreset,
  { label: string; brightness: number; contrast: number; saturation: number; warmth: number; vignette: number }
> = {
  neutral: { label: 'Neutral', brightness: 100, contrast: 100, saturation: 100, warmth: 0, vignette: 0 },
  'warm-film': { label: 'Warm Film', brightness: 102, contrast: 108, saturation: 94, warmth: 18, vignette: 24 },
  'cool-slate': { label: 'Cool Slate', brightness: 98, contrast: 112, saturation: 85, warmth: -20, vignette: 20 },
  'mono-contrast': { label: 'Mono Ink', brightness: 104, contrast: 128, saturation: 0, warmth: 0, vignette: 30 },
  vivid: { label: 'Crisp Vivid', brightness: 103, contrast: 110, saturation: 125, warmth: 6, vignette: 10 },
};

export type ToolContextId =
  | 'split'
  | 'duplicate'
  | 'delete'
  | 'select-all'
  | 'add-text'
  | 'snap'
  | 'zoom'
  | 'aspect-ratio'
  | 'undo'
  | 'redo'
  | 'clear-project'
  | 'save-project'
  | 'export-video'
  | 'playback'
  | 'preview-quality'
  | 'preview-audio'
  | 'import-media'
  | 'font-library'
  | 'custom-mask-studio'
  | 'caption-settings';

export type ContextPropertiesTarget =
  | { kind: 'asset'; assetId: string }
  | { kind: 'clip'; clipId: string }
  | { kind: 'fx'; fxId: VisualEffectPreset }
  | { kind: 'frame'; frameId: FramePreset }
  | { kind: 'mask'; maskShape: MaskShape }
  | { kind: 'custom-mask'; customMaskId: string }
  | { kind: 'animation'; animationId: ClipAnimationPreset }
  | { kind: 'transition'; transitionId: TransitionType }
  | {
      kind: 'title-template';
      id: string;
      name: string;
      subtitle: string;
      x: number;
      y: number;
      config: TextConfig;
    }
  | { kind: 'tool'; toolId: ToolContextId; title: string; description: string; shortcut?: string };

export type TitleTemplateCategory = 'Titles' | 'Lower Thirds';

export interface TitleTemplateItem {
  id: string;
  name: string;
  subtitle: string;
  category: TitleTemplateCategory;
  x: number;
  y: number;
  duration: number;
  config: TextConfig;
  builtIn?: boolean;
  isCustom?: boolean;
}

export const TITLE_AND_LOWER_THIRD_TEMPLATES: TitleTemplateItem[] = [
  // Title Templates
  {
    id: 'headline',
    name: 'Center Headline',
    subtitle: 'Bold clean display centerpiece',
    category: 'Titles',
    builtIn: true,
    x: 0,
    y: 0,
    duration: 3.0,
    config: {
      text: 'Main Sequence Title',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 68,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'center',
      hasScrim: false,
      scrimOpacity: 60,
      animation: 'slide-up',
      captionOutlineWidth: 0,
      captionOutlineColor: '#050608',
    },
  },
  {
    id: 'serif-chapter',
    name: 'Editorial Serif',
    subtitle: 'Cinema chapter card typography',
    category: 'Titles',
    x: 0,
    y: -4,
    duration: 3.5,
    config: {
      text: 'Chapter One\nQuiet Horizon',
      fontFamily: 'Playfair Display',
      fontSize: 64,
      fontWeight: 600,
      color: '#FFFBEB',
      align: 'center',
      hasScrim: false,
      scrimOpacity: 50,
      animation: 'scale',
    },
  },
  {
    id: 'kinetic-impact',
    name: 'Condensed Impact',
    subtitle: 'Athletic bold uppercase opener',
    category: 'Titles',
    x: 0,
    y: 0,
    duration: 2.5,
    config: {
      text: 'BUILT FOR SPEED',
      fontFamily: 'Oswald',
      fontSize: 78,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 55,
      captionBgColor: '#090B10',
      animation: 'scale',
    },
  },
  {
    id: 'neon-cyber-title',
    name: 'Neon Cyber Glow',
    subtitle: 'Electric blue & outline display',
    category: 'Titles',
    x: 0,
    y: 0,
    duration: 3.0,
    config: {
      text: 'FUTURE VISION',
      fontFamily: 'Oswald',
      fontSize: 74,
      fontWeight: 700,
      color: '#38BDF8',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 68,
      captionBgColor: '#060A14',
      captionOutlineColor: '#FFFFFF',
      captionOutlineWidth: 2,
      animation: 'scale',
    },
  },
  {
    id: 'gold-luxury-title',
    name: 'Gold Luxury Title',
    subtitle: 'Warm gold serif cinematic header',
    category: 'Titles',
    x: 0,
    y: -2,
    duration: 3.5,
    config: {
      text: 'GRAND PREMIERE\n2026 EDITION',
      fontFamily: 'Playfair Display',
      fontSize: 62,
      fontWeight: 700,
      color: '#FDE047',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 52,
      captionBgColor: '#0F0B04',
      captionOutlineColor: '#78350F',
      captionOutlineWidth: 2,
      animation: 'fade',
    },
  },
  {
    id: 'youtube-hook-title',
    name: 'Viral Hook Banner',
    subtitle: 'High-contrast creator intro hook',
    category: 'Titles',
    x: 0,
    y: -8,
    duration: 2.5,
    config: {
      text: 'WAIT FOR THE END!',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 64,
      fontWeight: 700,
      color: '#FACC15',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 86,
      captionBgColor: '#DC2626',
      captionOutlineColor: '#050608',
      captionOutlineWidth: 3,
      animation: 'scale',
    },
  },
  {
    id: 'doc-quote-card',
    name: 'Documentary Quote',
    subtitle: 'Editorial stacked quote block',
    category: 'Titles',
    x: 0,
    y: 0,
    duration: 4.0,
    config: {
      text: '“Every frame tells\na deeper story.”',
      fontFamily: 'Playfair Display',
      fontSize: 52,
      fontWeight: 500,
      color: '#F8FAFC',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 64,
      captionBgColor: '#090D16',
      animation: 'fade',
    },
  },
  {
    id: 'urdu-arabic-title',
    name: 'Urdu / Arabic Center Title',
    subtitle: 'RTL Nastaliq / Naskh centerpiece',
    category: 'Titles',
    x: 0,
    y: 0,
    duration: 3.5,
    config: {
      text: 'خوش آمدید · نیا سفر',
      fontFamily: 'Noto Nastaliq Urdu',
      fontSize: 58,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 62,
      captionBgColor: '#07090F',
      textDirection: 'rtl',
      animation: 'fade',
    },
  },

  // Lower Third Formats
  {
    id: 'lower-third',
    name: 'Lower Third · Monospace',
    subtitle: 'Editorial location & timestamp bar',
    category: 'Lower Thirds',
    builtIn: true,
    x: -28,
    y: 34,
    duration: 4.0,
    config: {
      text: 'Location  ·  04:20 PM',
      fontFamily: 'JetBrains Mono',
      fontSize: 30,
      fontWeight: 500,
      color: '#F8FAFC',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 78,
      captionBgColor: '#090B10',
      animation: 'slide-up',
    },
  },
  {
    id: 'lt-speaker-name',
    name: 'Lower Third · Speaker Name',
    subtitle: 'Two-line name & designation card',
    category: 'Lower Thirds',
    x: -26,
    y: 33,
    duration: 4.5,
    config: {
      text: 'ALEX MERCER\nCreative Director · Studio Lab',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 34,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 84,
      captionBgColor: '#0F172A',
      captionOutlineColor: '#38BDF8',
      captionOutlineWidth: 1,
      animation: 'slide-up',
    },
  },
  {
    id: 'lt-breaking-news',
    name: 'Lower Third · Breaking News',
    subtitle: 'Bold broadcast news red banner',
    category: 'Lower Thirds',
    x: -22,
    y: 35,
    duration: 4.5,
    config: {
      text: 'BREAKING NEWS\nLive coverage from downtown studio',
      fontFamily: 'Oswald',
      fontSize: 36,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 92,
      captionBgColor: '#B91C1C',
      captionOutlineColor: '#050608',
      captionOutlineWidth: 1,
      animation: 'slide-up',
    },
  },
  {
    id: 'lt-social-handle',
    name: 'Lower Third · Social Handle',
    subtitle: 'Creator @handle & subscribe bar',
    category: 'Lower Thirds',
    x: -28,
    y: 34,
    duration: 4.0,
    config: {
      text: '@YourChannel\nFollow for daily edits',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 32,
      fontWeight: 700,
      color: '#38BDF8',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 86,
      captionBgColor: '#070B14',
      animation: 'scale',
    },
  },
  {
    id: 'lt-podcast-guest',
    name: 'Lower Third · Podcast Guest',
    subtitle: 'Warm amber interview lower third',
    category: 'Lower Thirds',
    x: -26,
    y: 34,
    duration: 4.5,
    config: {
      text: 'GUEST INTERVIEW\nEpisode 42 · Full Talk',
      fontFamily: 'Playfair Display',
      fontSize: 34,
      fontWeight: 600,
      color: '#FDE68A',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 84,
      captionBgColor: '#1C140A',
      animation: 'fade',
    },
  },
  {
    id: 'lt-chapter-step',
    name: 'Lower Third · Step / Chapter',
    subtitle: 'Tutorial step progress tag',
    category: 'Lower Thirds',
    x: -28,
    y: 34,
    duration: 3.5,
    config: {
      text: 'STEP 01  ·  SETUP GUIDE',
      fontFamily: 'JetBrains Mono',
      fontSize: 30,
      fontWeight: 700,
      color: '#34D399',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 86,
      captionBgColor: '#061A14',
      animation: 'slide-up',
    },
  },
  {
    id: 'lt-minimal-glass',
    name: 'Lower Third · Minimal Glass',
    subtitle: 'Clean subtle lower-center credit',
    category: 'Lower Thirds',
    x: 0,
    y: 36,
    duration: 4.0,
    config: {
      text: 'Directed & Edited by HBL Studio',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 28,
      fontWeight: 600,
      color: '#F1F5F9',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 70,
      captionBgColor: '#090B10',
      animation: 'fade',
    },
  },
  {
    id: 'lt-urdu-news',
    name: 'Lower Third · Urdu News RTL',
    subtitle: 'Right-aligned Urdu broadcast ticker',
    category: 'Lower Thirds',
    x: 24,
    y: 34,
    duration: 4.5,
    config: {
      text: 'تازہ ترین خبر · براہِ راست نشریات',
      fontFamily: 'Noto Nastaliq Urdu',
      fontSize: 34,
      fontWeight: 700,
      color: '#FEF08A',
      align: 'right',
      hasScrim: true,
      scrimOpacity: 90,
      captionBgColor: '#991B1B',
      textDirection: 'rtl',
      animation: 'slide-up',
    },
  },
  {
    id: 'lt-youtube-subscribe',
    name: 'Lower Third · Subscribe CTA',
    subtitle: 'Creator channel bell & subscribe bar',
    category: 'Lower Thirds',
    x: -26,
    y: 34,
    duration: 4.0,
    config: {
      text: 'SUBSCRIBE NOW  ·  NEW VIDEOS WEEKLY',
      fontFamily: 'Oswald',
      fontSize: 32,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 92,
      captionBgColor: '#DC2626',
      captionOutlineColor: '#050608',
      captionOutlineWidth: 1,
      animation: 'slide-up',
    },
  },
  {
    id: 'lt-live-ticker',
    name: 'Lower Third · Live Update Bar',
    subtitle: 'Broadcast accent cyan live status bar',
    category: 'Lower Thirds',
    x: 0,
    y: 36,
    duration: 4.5,
    config: {
      text: 'LIVE STUDIO  |  HIGHLIGHTS & REPLAY',
      fontFamily: 'JetBrains Mono',
      fontSize: 28,
      fontWeight: 700,
      color: '#22D3EE',
      align: 'center',
      hasScrim: true,
      scrimOpacity: 88,
      captionBgColor: '#060A14',
      animation: 'fade',
    },
  },
];


