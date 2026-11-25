import {
  CaptionActiveMode,
  FramePreset,
  getTrackIndex,
  isTitleTrack,
  isVisualTrack,
  MediaAsset,
  TimelineClip,
} from '../types/editor';
import {
  buildCanvasFontFamilyStack,
  ensureScriptFontLoaded,
  isRtlText,
} from './languageSupport';
import { clamp } from './time';

export type LoadedMediaMap = Map<string, HTMLImageElement | HTMLVideoElement | ImageBitmap>;

const scratchCanvases: Record<string, HTMLCanvasElement> = {};

function getScratchCanvas(key: string, width: number, height: number): HTMLCanvasElement {
  let c = scratchCanvases[key];
  if (!c) {
    c = document.createElement('canvas');
    scratchCanvases[key] = c;
  }
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

interface EvaluatedClipTransform {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  rotation: number;
}

function evaluateClipTransform(clip: TimelineClip, localTime: number): EvaluatedClipTransform {
  const base: EvaluatedClipTransform = {
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    opacity: clip.opacity,
    rotation: clip.rotation ?? 0,
  };

  const kfs = clip.keyframes;
  if (!kfs || kfs.length === 0) return base;

  const sorted = kfs.length === 1 ? kfs : [...kfs].sort((a, b) => a.time - b.time);
  if (localTime <= sorted[0].time) {
    const k = sorted[0];
    return { x: k.x, y: k.y, scale: k.scale, opacity: k.opacity, rotation: k.rotation };
  }
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) {
    return {
      x: last.x,
      y: last.y,
      scale: last.scale,
      opacity: last.opacity,
      rotation: last.rotation,
    };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localTime >= a.time && localTime <= b.time) {
      const span = Math.max(0.0001, b.time - a.time);
      const rawT = clamp((localTime - a.time) / span, 0, 1);
      const t = b.easing === 'linear' ? rawT : easeInOutSine(rawT);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
      };
    }
  }

  return base;
}

function drawProceduralMotion(
  ctx: CanvasRenderingContext2D,
  variant: MediaAsset['motionVariant'],
  width: number,
  height: number,
  progress: number,
  time: number
) {
  if (variant === 'amber-horizon') {
    const shift = Math.sin(progress * Math.PI * 2) * 0.12;
    const grad = ctx.createLinearGradient(0, 0, width * (0.6 + shift), height);
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(0.52, '#1E293B');
    grad.addColorStop(0.82, '#92400E');
    grad.addColorStop(1, '#F59E0B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const glowX = width * (0.5 + Math.sin(time * 0.6) * 0.18);
    const glowY = height * (0.65 + Math.cos(time * 0.45) * 0.1);
    const radial = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, width * 0.55);
    radial.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
    radial.addColorStop(0.5, 'rgba(217, 119, 6, 0.12)');
    radial.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (variant === 'kinetic-grid') {
    ctx.fillStyle = '#090D14';
    ctx.fillRect(0, 0, width, height);

    const cell = Math.max(40, Math.round(width / 16));
    const offsetX = (time * 36) % cell;
    const offsetY = (time * 22) % cell;

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.16)';
    ctx.lineWidth = Math.max(1, width / 960);

    for (let x = -cell + offsetX; x < width + cell; x += cell) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = -cell + offsetY; y < height + cell; y += cell) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const sweep = ctx.createRadialGradient(
      width * (0.5 + Math.cos(time * 0.8) * 0.2),
      height * (0.5 + Math.sin(time * 0.6) * 0.15),
      0,
      width * 0.5,
      height * 0.5,
      width * 0.65
    );
    sweep.addColorStop(0, 'rgba(59, 130, 246, 0.22)');
    sweep.addColorStop(1, 'rgba(9, 13, 20, 0)');
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  // Default: 'slate-sweep'
  const angleOffset = Math.sin(time * 0.5) * width * 0.25;
  const grad = ctx.createLinearGradient(angleOffset, 0, width - angleOffset, height);
  grad.addColorStop(0, '#0B1120');
  grad.addColorStop(0.5, '#172554');
  grad.addColorStop(1, '#0F172A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const orbX = width * (0.35 + Math.sin(time * 0.7) * 0.15);
  const orbY = height * (0.4 + Math.cos(time * 0.5) * 0.12);
  const orb = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, width * 0.5);
  orb.addColorStop(0, 'rgba(96, 165, 250, 0.26)');
  orb.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = orb;
  ctx.fillRect(0, 0, width, height);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 56, g: 189, b: 248 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function buildFilterString(clip: TimelineClip, canvasWidth: number, extraBlurPx = 0): string {
  const parts: string[] = [];
  const fx = clip.fxPreset ?? 'none';
  const fxMult = clamp((clip.fxIntensity ?? 75) / 100, 0, 1);

  let bright = clip.brightness;
  let contr = clip.contrast;
  let sat = clip.saturation;
  let fxBlurPx = 0;

  if (fx === 'neon-bloom') {
    bright += Math.round(12 * fxMult);
    contr += Math.round(10 * fxMult);
    sat += Math.round(20 * fxMult);
  } else if (fx === 'cyber-glow') {
    contr += Math.round(16 * fxMult);
    sat += Math.round(28 * fxMult);
  } else if (fx === 'golden-aura') {
    bright += Math.round(8 * fxMult);
    sat += Math.round(14 * fxMult);
  } else if (fx === 'dream-halation' || fx === 'soft-glow-pro') {
    bright += Math.round(10 * fxMult);
    contr -= Math.round(6 * fxMult);
  } else if (fx === 'duo-neon') {
    contr += Math.round(20 * fxMult);
    sat = Math.round(sat * (1 - 0.35 * fxMult));
  } else if (fx === 'cinema-grain') {
    contr += Math.round(10 * fxMult);
    sat -= Math.round(8 * fxMult);
  } else if (fx === 'gaussian-blur') {
    fxBlurPx = 24 * fxMult;
  } else if (fx === 'frosted-glass') {
    fxBlurPx = 18 * fxMult;
    bright += Math.round(8 * fxMult);
    sat -= Math.round(10 * fxMult);
  } else if (fx === 'bokeh-blur') {
    fxBlurPx = 10 * fxMult;
    bright += Math.round(6 * fxMult);
    sat += Math.round(12 * fxMult);
  } else if (fx === 'pixel-8bit') {
    contr += Math.round(24 * fxMult);
    sat += Math.round(32 * fxMult);
  } else if (fx === 'teal-orange') {
    contr += Math.round(16 * fxMult);
    sat += Math.round(18 * fxMult);
  } else if (fx === 'vintage-sepia') {
    contr -= Math.round(8 * fxMult);
    bright += Math.round(5 * fxMult);
    sat -= Math.round(22 * fxMult);
    parts.push(`sepia(${Math.round(58 * fxMult)}%)`);
  } else if (fx === 'noir-cinema') {
    sat = 0;
    contr += Math.round(45 * fxMult);
    bright += Math.round(4 * fxMult);
  } else if (fx === 'night-vision') {
    bright += Math.round(18 * fxMult);
    contr += Math.round(28 * fxMult);
    sat = Math.round(sat * (1 - 0.6 * fxMult));
  } else if (fx === 'matrix-code') {
    contr += Math.round(22 * fxMult);
    sat = Math.round(sat * (1 - 0.3 * fxMult));
  } else if (fx === 'thermal-cam') {
    contr += Math.round(35 * fxMult);
    sat += Math.round(85 * fxMult);
    parts.push(`hue-rotate(${Math.round(190 * fxMult)}deg)`);
  } else if (fx === 'sketch-ink') {
    sat = 0;
    contr += Math.round(120 * fxMult);
    bright += Math.round(16 * fxMult);
  } else if (fx === 'pop-poster') {
    contr += Math.round(48 * fxMult);
    sat += Math.round(95 * fxMult);
  }

  if (bright !== 100) parts.push(`brightness(${bright}%)`);
  if (contr !== 100) parts.push(`contrast(${contr}%)`);
  if (sat !== 100) parts.push(`saturate(${sat}%)`);

  if (clip.warmth > 0) {
    parts.push(`sepia(${Math.round(clip.warmth * 0.75)}%)`);
  } else if (clip.warmth < 0) {
    parts.push(`hue-rotate(${Math.round(clip.warmth * 0.5)}deg)`);
  }

  const totalBlur = clip.blur + extraBlurPx + fxBlurPx;
  if (totalBlur > 0.1) {
    const scaledBlur = (totalBlur * canvasWidth) / 1280;
    parts.push(`blur(${scaledBlur.toFixed(1)}px)`);
  }

  return parts.length > 0 ? parts.join(' ') : 'none';
}

function computeFadeAlpha(clip: TimelineClip, localTime: number, baseOpacityPct = clip.opacity): number {
  let alpha = clamp(baseOpacityPct / 100, 0, 1);
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
    alpha *= clamp(localTime / clip.fadeIn, 0, 1);
  }
  const remaining = clip.duration - localTime;
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
    alpha *= clamp(remaining / clip.fadeOut, 0, 1);
  }
  return clamp(alpha, 0, 1);
}

interface ActiveTransitionEffect {
  alphaMult: number;
  offsetX: number;
  offsetY: number;
  scaleMult: number;
  rotateRad: number;
  extraBlurPx: number;
  clipMode?:
    | { kind: 'rect'; x: number; y: number; w: number; h: number }
    | { kind: 'circle'; cx: number; cy: number; r: number };
  overlayKind?: 'dip-black' | 'flash-white' | 'film-burn' | 'glitch-rgb';
  overlayStrength: number;
}

function computeClipTransitionEffect(
  clip: TimelineClip,
  localTime: number,
  width: number,
  height: number
): { effect: ActiveTransitionEffect; isEntering: boolean } {
  const effect: ActiveTransitionEffect = {
    alphaMult: 1,
    offsetX: 0,
    offsetY: 0,
    scaleMult: 1,
    rotateRad: 0,
    extraBlurPx: 0,
    overlayStrength: 0,
  };

  let isEntering = false;

  const applyOne = (
    type: TimelineClip['transitionIn'],
    rawProgress: number,
    isOut: boolean
  ) => {
    if (!type || type === 'none' || rawProgress >= 1) return;
    const eased = easeInOutSine(clamp(rawProgress, 0, 1));
    const inv = 1 - eased;

    switch (type) {
      case 'dissolve':
        effect.alphaMult *= eased;
        break;
      case 'dip-black':
        effect.alphaMult *= eased;
        effect.overlayKind = 'dip-black';
        effect.overlayStrength = Math.max(effect.overlayStrength, inv * 0.85);
        break;
      case 'slide-left':
        effect.offsetX += (isOut ? -1 : 1) * inv * width;
        break;
      case 'slide-right':
        effect.offsetX += (isOut ? 1 : -1) * inv * width;
        break;
      case 'slide-up':
        effect.offsetY += (isOut ? -1 : 1) * inv * height;
        break;
      case 'slide-down':
        effect.offsetY += (isOut ? 1 : -1) * inv * height;
        break;
      case 'wipe-left':
        effect.clipMode = isOut
          ? { kind: 'rect', x: 0, y: 0, w: width * eased, h: height }
          : { kind: 'rect', x: width * inv, y: 0, w: width * eased, h: height };
        break;
      case 'wipe-right':
        effect.clipMode = isOut
          ? { kind: 'rect', x: width * inv, y: 0, w: width * eased, h: height }
          : { kind: 'rect', x: 0, y: 0, w: width * eased, h: height };
        break;
      case 'wipe-up':
        effect.clipMode = isOut
          ? { kind: 'rect', x: 0, y: 0, w: width, h: height * eased }
          : { kind: 'rect', x: 0, y: height * inv, w: width, h: height * eased };
        break;
      case 'iris-circle':
        effect.clipMode = {
          kind: 'circle',
          cx: width / 2,
          cy: height / 2,
          r: Math.hypot(width, height) * 0.55 * eased,
        };
        break;
      case 'zoom-in':
        effect.scaleMult *= isOut ? 1 + 0.45 * inv : 0.65 + 0.35 * eased;
        effect.alphaMult *= eased;
        break;
      case 'zoom-out':
        effect.scaleMult *= isOut ? 0.72 + 0.28 * eased : 1 + 0.45 * inv;
        effect.alphaMult *= eased;
        break;
      case 'spin-zoom':
        effect.scaleMult *= 0.72 + 0.28 * eased;
        effect.rotateRad += (isOut ? -1 : 1) * inv * 0.36;
        effect.alphaMult *= eased;
        break;
      case 'blur-dissolve':
        effect.extraBlurPx += inv * 26;
        effect.alphaMult *= eased;
        break;
      case 'flash-white':
        effect.alphaMult *= clamp(eased * 1.35, 0, 1);
        effect.overlayKind = 'flash-white';
        effect.overlayStrength = Math.max(effect.overlayStrength, inv * 0.92);
        break;
      case 'film-burn':
        effect.alphaMult *= clamp(eased * 1.2, 0, 1);
        effect.overlayKind = 'film-burn';
        effect.overlayStrength = Math.max(effect.overlayStrength, inv);
        break;
      case 'glitch-rgb':
        effect.offsetX += Math.sin(rawProgress * 45) * inv * width * 0.04;
        effect.alphaMult *= clamp(eased * 1.3, 0, 1);
        effect.overlayKind = 'glitch-rgb';
        effect.overlayStrength = Math.max(effect.overlayStrength, inv);
        break;
    }
  };

  if (clip.transitionIn && clip.transitionIn !== 'none') {
    const durIn = clamp(clip.transitionInDuration ?? 0.5, 0.05, Math.max(0.05, clip.duration * 0.85));
    if (localTime < durIn) {
      isEntering = true;
      applyOne(clip.transitionIn, localTime / durIn, false);
    }
  }

  if (clip.transitionOut && clip.transitionOut !== 'none') {
    const durOut = clamp(clip.transitionOutDuration ?? 0.5, 0.05, Math.max(0.05, clip.duration * 0.85));
    const rem = clip.duration - localTime;
    if (rem < durOut) {
      applyOne(clip.transitionOut, rem / durOut, true);
    }
  }

  return { effect, isEntering };
}

interface ActiveClipAnimationEffect {
  alphaMult: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotateRad: number;
  skewXRad: number;
  clipCenterFracX?: number; // 0..1 horizontal curtain reveal around center
  extraBlurPx: number;
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    const x = t - 1.5 / d1;
    return n1 * x * x + 0.75;
  } else if (t < 2.5 / d1) {
    const x = t - 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  const x = t - 2.625 / d1;
  return n1 * x * x + 0.984375;
}

function computeClipAnimationEffect(
  clip: TimelineClip,
  localTime: number,
  width: number,
  height: number
): ActiveClipAnimationEffect {
  const res: ActiveClipAnimationEffect = {
    alphaMult: 1,
    offsetX: 0,
    offsetY: 0,
    scaleX: 1,
    scaleY: 1,
    rotateRad: 0,
    skewXRad: 0,
    extraBlurPx: 0,
  };

  const intensity = clamp((clip.animationIntensity ?? 75) / 100, 0.1, 1.5);

  // 1. In Animation
  const animIn = clip.animationIn;
  if (animIn && animIn !== 'none') {
    const durIn = clamp(
      clip.animationInDuration ?? 0.5,
      0.08,
      Math.max(0.08, clip.duration * 0.85)
    );
    if (localTime < durIn) {
      const p = clamp(localTime / durIn, 0, 1);
      const eCubic = easeOutCubic(p);
      const eSine = easeInOutSine(p);
      const inv = 1 - eCubic;

      switch (animIn) {
        case 'fade-in':
          res.alphaMult *= eSine;
          break;
        case 'pop-bounce': {
          const b = easeOutBack(p);
          const s = Math.max(0.05, 1 - 0.55 * intensity + 0.55 * intensity * b);
          res.scaleX *= s;
          res.scaleY *= s;
          res.alphaMult *= clamp(p * 3.2, 0, 1);
          break;
        }
        case 'drop-bounce': {
          const b = easeOutBounce(p);
          res.offsetY -= (1 - b) * height * 0.34 * intensity;
          res.alphaMult *= clamp(p * 3.2, 0, 1);
          break;
        }
        case 'slide-up-in':
          res.offsetY += inv * height * 0.22 * intensity;
          res.alphaMult *= clamp(p * 2.2, 0, 1);
          break;
        case 'slide-down-in':
          res.offsetY -= inv * height * 0.22 * intensity;
          res.alphaMult *= clamp(p * 2.2, 0, 1);
          break;
        case 'slide-left-in':
          res.offsetX += inv * width * 0.26 * intensity;
          res.alphaMult *= clamp(p * 2.4, 0, 1);
          break;
        case 'slide-right-in':
          res.offsetX -= inv * width * 0.26 * intensity;
          res.alphaMult *= clamp(p * 2.4, 0, 1);
          break;
        case 'zoom-punch-in': {
          const s = 1 + inv * 0.85 * intensity;
          res.scaleX *= s;
          res.scaleY *= s;
          res.alphaMult *= clamp(p * 2.8, 0, 1);
          res.extraBlurPx += inv * 12 * intensity;
          break;
        }
        case 'zoom-rotate-in': {
          const b = easeOutBack(p);
          const s = Math.max(0.08, 0.22 + 0.78 * b);
          res.scaleX *= s;
          res.scaleY *= s;
          res.rotateRad -= inv * 0.65 * intensity;
          res.alphaMult *= clamp(p * 2.6, 0, 1);
          break;
        }
        case 'elastic-snap': {
          const el = easeOutElastic(p);
          const s = Math.max(0.1, 1 - 0.45 * intensity + 0.45 * intensity * el);
          res.scaleX *= s;
          res.scaleY *= s;
          res.alphaMult *= clamp(p * 3.5, 0, 1);
          break;
        }
        case 'spin-in': {
          const s = Math.max(0.1, 0.35 + 0.65 * eCubic);
          res.scaleX *= s;
          res.scaleY *= s;
          res.rotateRad -= inv * Math.PI * 1.15 * intensity;
          res.alphaMult *= clamp(p * 2.4, 0, 1);
          break;
        }
        case 'swirl-in': {
          const s = Math.max(0.05, 0.1 + 0.9 * eCubic);
          res.scaleX *= s;
          res.scaleY *= s;
          res.rotateRad += inv * Math.PI * 2.1 * intensity;
          res.extraBlurPx += inv * 10 * intensity;
          res.alphaMult *= clamp(p * 2.2, 0, 1);
          break;
        }
        case 'skew-snap-in': {
          const b = easeOutBack(p);
          res.offsetX += inv * width * 0.28 * intensity;
          res.skewXRad += (1 - b) * 0.42 * intensity;
          res.alphaMult *= clamp(p * 2.6, 0, 1);
          break;
        }
        case 'flip-in': {
          res.scaleX *= Math.max(0.04, eCubic);
          res.scaleY *= 0.85 + 0.15 * eCubic;
          res.alphaMult *= clamp(p * 2.6, 0, 1);
          break;
        }
        case 'curtain-wipe-in': {
          res.clipCenterFracX = Math.max(0.02, eCubic);
          res.alphaMult *= clamp(p * 3.0, 0, 1);
          break;
        }
        case 'glitch-in': {
          const jitter = Math.sin(p * 52) * inv * width * 0.045 * intensity;
          res.offsetX += jitter;
          res.offsetY += Math.cos(p * 39) * inv * height * 0.02 * intensity;
          res.alphaMult *= clamp(p * 3, 0, 1) * (Math.sin(p * 42) > -0.45 ? 1 : 0.4);
          break;
        }
        case 'cinematic-reveal': {
          res.alphaMult *= eSine;
          res.extraBlurPx += (1 - eSine) * 24 * intensity;
          const s = 1 + (1 - eSine) * 0.08 * intensity;
          res.scaleX *= s;
          res.scaleY *= s;
          break;
        }
      }
    }
  }

  // 2. Out Animation
  const animOut = clip.animationOut;
  if (animOut && animOut !== 'none') {
    const durOut = clamp(
      clip.animationOutDuration ?? 0.5,
      0.08,
      Math.max(0.08, clip.duration * 0.85)
    );
    const rem = clip.duration - localTime;
    if (rem < durOut) {
      const p = clamp(rem / durOut, 0, 1); // 1 -> 0 at end
      const eCubic = easeOutCubic(p);
      const eSine = easeInOutSine(p);
      const outProg = 1 - eCubic;

      switch (animOut) {
        case 'fade-out':
          res.alphaMult *= eSine;
          break;
        case 'zoom-out-exit': {
          const s = Math.max(0.08, 1 - outProg * 0.65 * intensity);
          res.scaleX *= s;
          res.scaleY *= s;
          res.alphaMult *= clamp(p * 1.4, 0, 1);
          break;
        }
        case 'bounce-out': {
          const outT = 1 - p;
          const b = easeOutBounce(outT);
          res.offsetY += b * height * 0.34 * intensity;
          const s = Math.max(0.2, 1 - outT * 0.35 * intensity);
          res.scaleX *= s;
          res.scaleY *= s;
          res.alphaMult *= clamp(p * 1.8, 0, 1);
          break;
        }
        case 'slide-up-out':
          res.offsetY -= outProg * height * 0.24 * intensity;
          res.alphaMult *= clamp(p * 1.6, 0, 1);
          break;
        case 'slide-down-out':
          res.offsetY += outProg * height * 0.24 * intensity;
          res.alphaMult *= clamp(p * 1.6, 0, 1);
          break;
        case 'slide-left-out':
          res.offsetX -= outProg * width * 0.26 * intensity;
          res.alphaMult *= clamp(p * 1.6, 0, 1);
          break;
        case 'slide-right-out':
          res.offsetX += outProg * width * 0.26 * intensity;
          res.alphaMult *= clamp(p * 1.6, 0, 1);
          break;
        case 'spin-out': {
          const s = Math.max(0.08, 1 - outProg * 0.72 * intensity);
          res.scaleX *= s;
          res.scaleY *= s;
          res.rotateRad += outProg * Math.PI * 1.1 * intensity;
          res.alphaMult *= clamp(p * 1.5, 0, 1);
          break;
        }
        case 'swirl-out': {
          const s = Math.max(0.05, 1 - outProg * 0.88 * intensity);
          res.scaleX *= s;
          res.scaleY *= s;
          res.rotateRad -= outProg * Math.PI * 2.1 * intensity;
          res.extraBlurPx += outProg * 12 * intensity;
          res.alphaMult *= clamp(p * 1.5, 0, 1);
          break;
        }
        case 'curtain-wipe-out': {
          const frac = Math.max(0.02, eCubic);
          res.clipCenterFracX =
            res.clipCenterFracX !== undefined ? Math.min(res.clipCenterFracX, frac) : frac;
          res.alphaMult *= clamp(p * 1.6, 0, 1);
          break;
        }
        case 'flicker-out': {
          const flick = Math.sin(p * 48) > -0.15 ? 1 : 0.18;
          res.alphaMult *= eSine * flick;
          res.offsetX += Math.cos(p * 37) * outProg * width * 0.015 * intensity;
          break;
        }
        case 'shrink-drop': {
          const s = Math.max(0.15, 1 - outProg * 0.42 * intensity);
          res.scaleX *= s;
          res.scaleY *= s;
          res.extraBlurPx += outProg * 18 * intensity;
          res.alphaMult *= eSine;
          break;
        }
      }
    }
  }

  // 3. Combo / Continuous Loop Animation
  const animCombo = clip.animationCombo;
  if (animCombo && animCombo !== 'none') {
    switch (animCombo) {
      case 'pulse-beat': {
        const beat = Math.pow(Math.max(0, Math.sin(localTime * Math.PI * 2.2)), 4);
        const s = 1 + beat * 0.085 * intensity;
        res.scaleX *= s;
        res.scaleY *= s;
        break;
      }
      case 'heartbeat-loop': {
        const cycle = (localTime * 1.25) % 1;
        const p1 = cycle < 0.18 ? Math.sin((cycle / 0.18) * Math.PI) : 0;
        const p2 = cycle >= 0.24 && cycle < 0.42 ? Math.sin(((cycle - 0.24) / 0.18) * Math.PI) * 0.72 : 0;
        const s = 1 + (p1 + p2) * 0.13 * intensity;
        res.scaleX *= s;
        res.scaleY *= s;
        break;
      }
      case 'rubber-band': {
        const w = Math.sin(localTime * 7.2);
        const stretch = 0.095 * intensity * w;
        res.scaleX *= 1 + stretch;
        res.scaleY *= 1 - stretch * 0.85;
        break;
      }
      case 'float-hover': {
        res.offsetY += Math.sin(localTime * 2.4) * height * 0.018 * intensity;
        res.offsetX += Math.cos(localTime * 1.3) * width * 0.008 * intensity;
        res.rotateRad += Math.sin(localTime * 1.8) * 0.025 * intensity;
        break;
      }
      case 'wiggle-jiggle': {
        res.rotateRad += Math.sin(localTime * 10.5) * 0.045 * intensity;
        res.offsetX += Math.cos(localTime * 8.2) * width * 0.006 * intensity;
        break;
      }
      case 'pendulum-swing': {
        res.rotateRad += Math.sin(localTime * 2.8) * 0.095 * intensity;
        break;
      }
      case 'tada-celebrate': {
        const phase = (localTime * 1.35) % 1;
        if (phase < 0.55) {
          const burst = Math.sin((phase / 0.55) * Math.PI);
          res.scaleX *= 1 + burst * 0.1 * intensity;
          res.scaleY *= 1 + burst * 0.1 * intensity;
          res.rotateRad += Math.sin(phase * 28) * 0.075 * intensity;
        }
        break;
      }
      case 'shake-quake': {
        res.offsetX += Math.sin(localTime * 38) * width * 0.012 * intensity;
        res.offsetY += Math.cos(localTime * 31) * height * 0.01 * intensity;
        res.rotateRad += Math.sin(localTime * 27) * 0.018 * intensity;
        break;
      }
      case 'glitch-jitter': {
        const gate = Math.sin(localTime * 9.3) > 0.35 ? 1 : 0;
        if (gate) {
          res.offsetX += Math.sin(localTime * 67) * width * 0.022 * intensity;
          res.offsetY += Math.cos(localTime * 53) * height * 0.01 * intensity;
          res.skewXRad += Math.sin(localTime * 41) * 0.09 * intensity;
        }
        break;
      }
      case 'cinematic-breathe': {
        const s = 1 + (0.5 + 0.5 * Math.sin(localTime * 1.5)) * 0.075 * intensity;
        res.scaleX *= s;
        res.scaleY *= s;
        break;
      }
      case 'flash-pulse': {
        const wave = 0.5 + 0.5 * Math.sin(localTime * Math.PI * 3.0);
        res.alphaMult *= 1 - 0.35 * intensity * wave;
        break;
      }
      case 'blink-strobe': {
        const on = Math.sin(localTime * Math.PI * 3.4) > -0.15;
        res.alphaMult *= on ? 1 : clamp(0.18 + (1 - intensity) * 0.5, 0.08, 0.75);
        break;
      }
      case 'spin-orbit': {
        res.rotateRad += localTime * Math.PI * 0.45 * intensity;
        break;
      }
    }
  }

  return res;
}

function drawFrameOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  framePreset: FramePreset,
  frameColor: string,
  frameThicknessPct: number,
  sampleTime: number
) {
  if (!framePreset || framePreset === 'none') return;
  const scaleT = clamp(frameThicknessPct / 50, 0.25, 2.2);
  const minDim = Math.min(width, height);
  const rgb = hexToRgb(frameColor || '#38BDF8');

  ctx.save();
  ctx.filter = 'none';

  switch (framePreset) {
    case 'cinema-bars': {
      const barH = Math.round(height * 0.115 * clamp(scaleT, 0.5, 1.7));
      ctx.fillStyle = frameColor && frameColor !== '#38BDF8' ? frameColor : '#050608';
      ctx.fillRect(0, 0, width, barH);
      ctx.fillRect(0, height - barH, width, barH);
      break;
    }

    case 'polaroid': {
      const side = Math.round(minDim * 0.045 * scaleT);
      const bottom = Math.round(minDim * 0.145 * scaleT);
      ctx.fillStyle = frameColor && frameColor !== '#38BDF8' ? frameColor : '#F8FAFC';
      ctx.fillRect(0, 0, width, side);
      ctx.fillRect(0, 0, side, height);
      ctx.fillRect(width - side, 0, side, height);
      ctx.fillRect(0, height - bottom, width, bottom);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.lineWidth = Math.max(1, minDim * 0.002);
      ctx.strokeRect(side, side, width - side * 2, height - side - bottom);
      break;
    }

    case 'neon-border': {
      const pad = Math.round(minDim * 0.025);
      const lineW = Math.max(2, Math.round(minDim * 0.008 * scaleT));
      ctx.strokeStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      ctx.lineWidth = lineW;
      ctx.shadowColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      ctx.shadowBlur = Math.max(12, Math.round(minDim * 0.045 * scaleT));
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
      ctx.shadowBlur = Math.max(4, Math.round(minDim * 0.015));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = Math.max(1, lineW * 0.35);
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
      break;
    }

    case 'rounded-card': {
      const margin = Math.round(minDim * 0.04 * scaleT);
      const radius = Math.round(minDim * 0.045);
      ctx.fillStyle = frameColor && frameColor !== '#38BDF8' ? frameColor : '#05070C';
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.roundRect(margin, margin, width - margin * 2, height - margin * 2, radius);
      ctx.fill('evenodd');

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1.5, minDim * 0.003);
      ctx.beginPath();
      ctx.roundRect(margin, margin, width - margin * 2, height - margin * 2, radius);
      ctx.stroke();
      break;
    }

    case 'rec-viewfinder': {
      const pad = Math.round(minDim * 0.055);
      const len = Math.round(minDim * 0.075 * scaleT);
      const lw = Math.max(2, Math.round(minDim * 0.0045));
      const strokeCol = frameColor || '#FFFFFF';
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = lw;

      // 4 L-shaped corner brackets
      ctx.beginPath();
      ctx.moveTo(pad, pad + len);
      ctx.lineTo(pad, pad);
      ctx.lineTo(pad + len, pad);

      ctx.moveTo(width - pad - len, pad);
      ctx.lineTo(width - pad, pad);
      ctx.lineTo(width - pad, pad + len);

      ctx.moveTo(pad, height - pad - len);
      ctx.lineTo(pad, height - pad);
      ctx.lineTo(pad + len, height - pad);

      ctx.moveTo(width - pad - len, height - pad);
      ctx.lineTo(width - pad, height - pad);
      ctx.lineTo(width - pad, height - pad - len);
      ctx.stroke();

      // Subtle center focus crosshair
      const cx = width / 2;
      const cy = height / 2;
      const ch = Math.round(minDim * 0.022);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = Math.max(1, lw * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx - ch, cy);
      ctx.lineTo(cx + ch, cy);
      ctx.moveTo(cx, cy - ch);
      ctx.lineTo(cx, cy + ch);
      ctx.stroke();

      // Blinking REC dot
      const pulse = Math.sin(sampleTime * 4) > -0.3 ? 1 : 0.3;
      const recR = Math.max(4, Math.round(minDim * 0.01));
      ctx.fillStyle = `rgba(244, 63, 94, ${pulse})`;
      ctx.beginPath();
      ctx.arc(pad + recR * 2, pad + recR * 2, recR, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `600 ${Math.max(11, Math.round(minDim * 0.022))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = strokeCol;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('REC', pad + recR * 3.8, pad + recR * 2 + 1);
      break;
    }

    case 'film-strip': {
      const railW = Math.round(width * 0.068 * clamp(scaleT, 0.6, 1.5));
      const railColor = frameColor && frameColor !== '#38BDF8' ? frameColor : '#090B0F';
      ctx.fillStyle = railColor;
      ctx.fillRect(0, 0, railW, height);
      ctx.fillRect(width - railW, 0, railW, height);

      const holeW = Math.round(railW * 0.46);
      const holeH = Math.round(holeW * 0.72);
      const stepY = Math.max(holeH * 2, Math.round(height / 10));
      const offsetY = (sampleTime * 55) % stepY;
      ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';

      for (let y = -stepY + offsetY; y < height + stepY; y += stepY) {
        ctx.beginPath();
        ctx.roundRect((railW - holeW) / 2, y, holeW, holeH, Math.max(2, holeW * 0.2));
        ctx.roundRect(width - railW + (railW - holeW) / 2, y, holeW, holeH, Math.max(2, holeW * 0.2));
        ctx.fill();
      }
      break;
    }

    case 'double-gold': {
      const outer = Math.round(minDim * 0.032);
      const inner = Math.round(minDim * 0.048 * scaleT);
      const col = frameColor || '#FBBF24';
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, minDim * 0.004);
      ctx.strokeRect(outer, outer, width - outer * 2, height - outer * 2);
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = Math.max(1, minDim * 0.002);
      ctx.strokeRect(inner, inner, width - inner * 2, height - inner * 2);
      break;
    }

    case 'vhs-cam': {
      const pad = Math.round(minDim * 0.05);
      const stroke = frameColor || '#22D3EE';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(2, minDim * 0.0035);
      const bracket = Math.round(minDim * 0.055 * scaleT);

      ctx.beginPath();
      ctx.moveTo(pad, pad + bracket);
      ctx.lineTo(pad, pad);
      ctx.lineTo(pad + bracket, pad);
      ctx.moveTo(width - pad - bracket, height - pad);
      ctx.lineTo(width - pad, height - pad);
      ctx.lineTo(width - pad, height - pad - bracket);
      ctx.stroke();

      ctx.font = `700 ${Math.max(12, Math.round(minDim * 0.024))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = stroke;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('PLAY ▶', pad + 10, pad + 8);
      ctx.textAlign = 'right';
      ctx.fillText('SP · HQ', width - pad - 10, pad + 8);
      break;
    }

    case 'split-mat': {
      const border = Math.round(minDim * 0.062 * scaleT);
      ctx.fillStyle = frameColor && frameColor !== '#38BDF8' ? frameColor : '#F1F5F9';
      ctx.fillRect(0, 0, width, border);
      ctx.fillRect(0, height - border, width, border);
      ctx.fillRect(0, 0, border, height);
      ctx.fillRect(width - border, 0, border, height);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = Math.max(1, minDim * 0.0025);
      ctx.strokeRect(border, border, width - border * 2, height - border * 2);
      break;
    }

    case 'glow-bezel': {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#22D3EE');
      grad.addColorStop(0.5, frameColor || '#A855F7');
      grad.addColorStop(1, '#EC4899');
      const pad = Math.round(minDim * 0.02);
      const lw = Math.max(3, Math.round(minDim * 0.012 * scaleT));
      ctx.strokeStyle = grad;
      ctx.lineWidth = lw;
      ctx.shadowColor = frameColor || '#A855F7';
      ctx.shadowBlur = Math.max(16, Math.round(minDim * 0.05));
      ctx.beginPath();
      ctx.roundRect(pad, pad, width - pad * 2, height - pad * 2, Math.round(minDim * 0.025));
      ctx.stroke();
      break;
    }

    case 'electro-frame': {
      const pad = Math.round(minDim * 0.028);
      const amp = Math.max(4, minDim * 0.018 * scaleT);
      const col = frameColor || '#22D3EE';
      const segs = 28;
      const tick = Math.floor(sampleTime * 22);

      const traceElectricEdge = (x1: number, y1: number, x2: number, y2: number, seed: number) => {
        ctx.moveTo(x1, y1);
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          const n = Math.sin(tick * 13.7 + i * 7.1 + seed) * Math.cos(tick * 5.3 + i * 3.9);
          const bx = x1 + (x2 - x1) * t;
          const by = y1 + (y2 - y1) * t;
          const isHoriz = Math.abs(x2 - x1) > Math.abs(y2 - y1);
          ctx.lineTo(bx + (isHoriz ? 0 : n * amp), by + (isHoriz ? n * amp : 0));
        }
        ctx.lineTo(x2, y2);
      };

      // Outer plasma glow
      ctx.beginPath();
      traceElectricEdge(pad, pad, width - pad, pad, 1.1);
      traceElectricEdge(width - pad, pad, width - pad, height - pad, 2.3);
      traceElectricEdge(width - pad, height - pad, pad, height - pad, 3.7);
      traceElectricEdge(pad, height - pad, pad, pad, 5.1);

      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(3, minDim * 0.009 * scaleT);
      ctx.shadowColor = col;
      ctx.shadowBlur = Math.max(18, minDim * 0.055 * scaleT);
      ctx.stroke();

      // Inner white-hot lightning core
      ctx.shadowBlur = Math.max(6, minDim * 0.015);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = Math.max(1.2, minDim * 0.003);
      ctx.stroke();

      // Corner spark nodes
      const corners = [
        [pad, pad],
        [width - pad, pad],
        [width - pad, height - pad],
        [pad, height - pad],
      ];
      ctx.fillStyle = '#FFFFFF';
      for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(3, minDim * 0.008 * scaleT), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'electro-pulse': {
      const pad = Math.round(minDim * 0.025);
      const pulse = 0.65 + 0.35 * Math.sin(sampleTime * 6);
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#22D3EE');
      grad.addColorStop(0.5, frameColor || '#A855F7');
      grad.addColorStop(1, '#EC4899');

      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2.5, minDim * 0.008 * scaleT);
      ctx.shadowColor = frameColor || '#A855F7';
      ctx.shadowBlur = Math.max(14, minDim * 0.045 * pulse);
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

      // Animated traveling energy dots along perimeter
      const segLen = Math.max(18, minDim * 0.055);
      ctx.setLineDash([segLen, segLen * 1.4]);
      ctx.lineDashOffset = -sampleTime * width * 0.28;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = Math.max(1.5, minDim * 0.0035);
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
      ctx.setLineDash([]);
      break;
    }
  }

  ctx.restore();
}

function drawMaskShapePath(
  ctx: CanvasRenderingContext2D,
  shape: NonNullable<TimelineClip['maskShape']>,
  cx: number,
  cy: number,
  mw: number,
  mh: number
) {
  ctx.beginPath();
  switch (shape) {
    case 'circle': {
      const r = Math.min(mw, mh) / 2;
      ctx.arc(cx, cy, Math.max(4, r), 0, Math.PI * 2);
      ctx.closePath();
      break;
    }
    case 'ellipse': {
      ctx.ellipse(cx, cy, Math.max(4, mw / 2), Math.max(4, mh / 2), 0, 0, Math.PI * 2);
      ctx.closePath();
      break;
    }
    case 'rectangle': {
      ctx.rect(cx - mw / 2, cy - mh / 2, mw, mh);
      break;
    }
    case 'rounded-rect': {
      const r = Math.min(mw, mh) * 0.18;
      ctx.roundRect(cx - mw / 2, cy - mh / 2, mw, mh, r);
      break;
    }
    case 'diamond': {
      ctx.moveTo(cx, cy - mh / 2);
      ctx.lineTo(cx + mw / 2, cy);
      ctx.lineTo(cx, cy + mh / 2);
      ctx.lineTo(cx - mw / 2, cy);
      ctx.closePath();
      break;
    }
    case 'star': {
      const spikes = 5;
      const outerR = Math.min(mw, mh) / 2;
      const innerR = outerR * 0.44;
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const px = cx + Math.cos(angle) * rad;
        const py = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'heart': {
      const size = Math.min(mw, mh) / 2;
      ctx.moveTo(cx, cy + size * 0.85);
      ctx.bezierCurveTo(
        cx - size * 1.4,
        cy + size * 0.1,
        cx - size * 0.9,
        cy - size * 0.95,
        cx,
        cy - size * 0.3
      );
      ctx.bezierCurveTo(
        cx + size * 0.9,
        cy - size * 0.95,
        cx + size * 1.4,
        cy + size * 0.1,
        cx,
        cy + size * 0.85
      );
      ctx.closePath();
      break;
    }
    case 'split-horizontal': {
      ctx.rect(0, cy - mh / 2, cx * 2 + 2000, mh);
      break;
    }
    case 'split-vertical': {
      ctx.rect(cx - mw / 2, 0, mw, cy * 2 + 2000);
      break;
    }
    default:
      ctx.rect(cx - mw / 2, cy - mh / 2, mw, mh);
  }
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(' ');
    let current = words[0] ?? '';
    for (let i = 1; i < words.length; i++) {
      const test = `${current} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

export interface TextSelectionBox {
  clipId: string;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  centerX: number;
  centerY: number;
}

interface ComputedTextLayout {
  alpha: number;
  fontSizePx: number;
  lineHeight: number;
  lines: string[];
  totalHeight: number;
  maxLineW: number;
  posX: number;
  posY: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
}

function computeTextLayout(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  clip: TimelineClip
): ComputedTextLayout | null {
  const cfg = clip.textConfig;
  if (!cfg || !cfg.text.trim()) return null;
  if (time < clip.startTime || time >= clip.startTime + clip.duration) return null;

  const localTime = clamp(time - clip.startTime, 0, clip.duration);
  const evalT = evaluateClipTransform(clip, localTime);
  let alpha = computeFadeAlpha(clip, localTime, evalT.opacity);
  let animOffsetY = 0;
  let animScale = 1;

  const enterDuration = Math.min(0.45, clip.duration * 0.3);
  const enterProgress = enterDuration > 0 ? clamp(localTime / enterDuration, 0, 1) : 1;
  const easedEnter = easeInOutSine(enterProgress);

  if (cfg.animation === 'slide-up') {
    animOffsetY = (1 - easedEnter) * height * 0.035;
    alpha *= easedEnter;
  } else if (cfg.animation === 'scale') {
    animScale = 0.9 + 0.1 * easedEnter;
    alpha *= easedEnter;
  } else if (cfg.animation === 'fade') {
    alpha *= easedEnter;
  }

  const { effect: trans } = computeClipTransitionEffect(clip, localTime, width, height);
  const animFx = computeClipAnimationEffect(clip, localTime, width, height);
  alpha *= trans.alphaMult * animFx.alphaMult;
  animScale *= trans.scaleMult * ((animFx.scaleX + animFx.scaleY) / 2);

  if (alpha <= 0.001) return null;

  const scaleFactor = Math.min(width, height) / 1080;
  const userScale = clamp(evalT.scale, 10, 1000) / 100;
  let baseFontSizePx = Math.max(4, cfg.fontSize * scaleFactor);

  let sourceText = cfg.captionUppercase ? cfg.text.toUpperCase() : cfg.text;
  const lineMode = cfg.captionLineMode;
  if (lineMode === 'word-by-word') {
    const allWords = sourceText.trim().split(/\s+/).filter(Boolean);
    if (allWords.length > 0) {
      const progressNorm = clamp(localTime / Math.max(0.05, clip.duration), 0, 0.9999);
      const wordIdx = Math.floor(progressNorm * allWords.length);
      sourceText = allWords[wordIdx] ?? allWords[0];
    }
  } else if (lineMode === 'single-line') {
    sourceText = sourceText.replace(/\s*\n+\s*/g, ' ').trim();
  }

  ensureScriptFontLoaded(sourceText);
  const isRtl =
    cfg.textDirection === 'rtl'
      ? true
      : cfg.textDirection === 'ltr'
      ? false
      : isRtlText(sourceText);

  const fontStack = buildCanvasFontFamilyStack(cfg.fontFamily, sourceText);
  ctx.font = `${cfg.fontWeight} ${Math.round(baseFontSizePx)}px ${fontStack}`;
  ctx.direction = isRtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';
  ctx.textAlign = cfg.align;

  let fontSizePx = Math.max(4, Math.round(baseFontSizePx * userScale * animScale));
  let lines: string[];
  const maxTextWidth = lineMode === 'two-line' ? width * 0.74 : width * 0.82;
  if (lineMode === 'single-line') {
    const measuredBaseW = ctx.measureText(sourceText).width;
    const singleMaxW = width * 0.88;
    if (measuredBaseW > singleMaxW && measuredBaseW > 0) {
      baseFontSizePx = Math.max(6, baseFontSizePx * (singleMaxW / measuredBaseW));
    }
    fontSizePx = Math.max(4, Math.round(baseFontSizePx * userScale * animScale));
    ctx.font = `${cfg.fontWeight} ${fontSizePx}px ${fontStack}`;
    lines = [sourceText];
  } else {
    ctx.font = `${cfg.fontWeight} ${fontSizePx}px ${fontStack}`;
    if (lineMode === 'two-line') {
      const wrapped = wrapTextLines(ctx, sourceText, maxTextWidth);
      if (wrapped.length <= 2) {
        lines = wrapped;
      } else {
        const words = wrapped.join(' ').split(/\s+/).filter(Boolean);
        const splitIdx = Math.ceil(words.length / 2);
        lines = [words.slice(0, splitIdx).join(' '), words.slice(splitIdx).join(' ')].filter(Boolean);
      }
    } else {
      lines = wrapTextLines(ctx, sourceText, maxTextWidth);
    }
  }

  const lineHeight = fontSizePx * 1.24;
  const totalHeight = lines.length * lineHeight;

  let maxLineW = 0;
  for (const l of lines) {
    const w = ctx.measureText(l).width;
    if (w > maxLineW) maxLineW = w;
  }

  const posX = width / 2 + (evalT.x / 100) * width + trans.offsetX + animFx.offsetX;
  const posY = height / 2 + (evalT.y / 100) * height + animOffsetY + trans.offsetY + animFx.offsetY;

  const padX = Math.max(8, fontSizePx * 0.45);
  const padY = Math.max(6, fontSizePx * 0.25);
  const boxW = Math.max(48, maxLineW) + padX * 2;
  const boxH = Math.max(24, totalHeight) + padY * 2;
  let boxX = posX - boxW / 2;
  if (cfg.align === 'left') boxX = posX - padX;
  if (cfg.align === 'right') boxX = posX - Math.max(48, maxLineW) - padX;
  const boxY = posY - boxH / 2;

  return {
    alpha,
    fontSizePx,
    lineHeight,
    lines,
    totalHeight,
    maxLineW,
    posX,
    posY,
    boxX,
    boxY,
    boxW,
    boxH,
  };
}

export function measureTextSelectionBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  clip: TimelineClip
): TextSelectionBox | null {
  ctx.save();
  const layout = computeTextLayout(ctx, width, height, time, clip);
  ctx.restore();
  if (!layout) return null;
  return {
    clipId: clip.id,
    boxX: layout.boxX,
    boxY: layout.boxY,
    boxW: layout.boxW,
    boxH: layout.boxH,
    centerX: layout.boxX + layout.boxW / 2,
    centerY: layout.boxY + layout.boxH / 2,
  };
}

interface ComputedStickerLayout {
  alpha: number;
  sizePx: number;
  posX: number;
  posY: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  totalRotRad: number;
  scaleRatioX: number;
  scaleRatioY: number;
  skewXRad: number;
  clipCenterFracX?: number;
  extraBlurPx: number;
}

function computeStickerLayout(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  clip: TimelineClip
): ComputedStickerLayout | null {
  const sc = clip.stickerConfig;
  if (!sc) return null;
  if (time < clip.startTime || time >= clip.startTime + clip.duration) return null;

  const localTime = clamp(time - clip.startTime, 0, clip.duration);
  const evalT = evaluateClipTransform(clip, localTime);
  let alpha = computeFadeAlpha(clip, localTime, evalT.opacity);
  const { effect: trans } = computeClipTransitionEffect(clip, localTime, width, height);
  const animFx = computeClipAnimationEffect(clip, localTime, width, height);

  alpha *= trans.alphaMult * animFx.alphaMult;
  if (alpha <= 0.001) return null;

  const scaleFactor = Math.min(width, height) / 1080;
  const userScale = clamp(evalT.scale, 10, 1000) / 100;
  const avgAnimScale = Math.max(0.05, (animFx.scaleX + animFx.scaleY) / 2);
  const sizePx = Math.max(24, sc.size * scaleFactor * userScale * trans.scaleMult * avgAnimScale);

  let boxW = sizePx * 1.4;
  let boxH = sizePx * 0.9;

  if (sc.kind === 'emoji-badge') {
    if (sc.showBadgeBg) {
      boxW = sizePx * 2.25;
      boxH = sizePx * 1.05;
    } else {
      boxW = sizePx * 1.12;
      boxH = sizePx * 1.12;
    }
  } else if (sc.kind === 'arrow-vector') {
    boxW = sizePx * 1.45;
    boxH = sizePx * 1.1;
  } else if (sc.kind === 'star-rating') {
    boxW = sizePx * 2.55;
    boxH = sizePx * 0.92;
  } else {
    const labelStr = (sc.label || 'STICKER').trim();
    const emojiStr = sc.emoji ? `${sc.emoji} ` : '';
    const fontPx = Math.max(12, Math.round(sizePx * 0.34));
    ctx.font = `800 ${fontPx}px "Plus Jakarta Sans", sans-serif`;
    const measuredW = ctx.measureText(`${emojiStr}${labelStr}`).width;
    boxW = Math.max(sizePx * 1.15, measuredW + sizePx * 0.64);
    boxH = sizePx * 0.78;
    if (sc.kind === 'hud-indicator' && !sc.showBadgeBg) {
      boxW = sizePx * 1.35;
      boxH = sizePx * 1.35;
    }
  }

  const posX = width / 2 + (evalT.x / 100) * width + trans.offsetX + animFx.offsetX;
  const posY = height / 2 + (evalT.y / 100) * height + trans.offsetY + animFx.offsetY;

  return {
    alpha,
    sizePx,
    posX,
    posY,
    boxX: posX - boxW / 2,
    boxY: posY - boxH / 2,
    boxW,
    boxH,
    totalRotRad: (evalT.rotation * Math.PI) / 180 + (trans.rotateRad ?? 0) + animFx.rotateRad,
    scaleRatioX: animFx.scaleX / avgAnimScale,
    scaleRatioY: animFx.scaleY / avgAnimScale,
    skewXRad: animFx.skewXRad,
    clipCenterFracX: animFx.clipCenterFracX,
    extraBlurPx: (trans.extraBlurPx ?? 0) + animFx.extraBlurPx,
  };
}

export function measureStickerSelectionBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  clip: TimelineClip
): TextSelectionBox | null {
  ctx.save();
  const layout = computeStickerLayout(ctx, width, height, time, clip);
  ctx.restore();
  if (!layout) return null;
  return {
    clipId: clip.id,
    boxX: layout.boxX,
    boxY: layout.boxY,
    boxW: layout.boxW,
    boxH: layout.boxH,
    centerX: layout.posX,
    centerY: layout.posY,
  };
}

function drawStickerClip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  clip: TimelineClip,
  options?: { selectedTextClipId?: string | null; hideSelectionOutline?: boolean }
) {
  const sc = clip.stickerConfig;
  if (!sc) return;

  ctx.save();
  const layout = computeStickerLayout(ctx, width, height, time, clip);
  if (!layout) {
    ctx.restore();
    return;
  }

  const {
    alpha,
    sizePx,
    posX,
    posY,
    boxX,
    boxY,
    boxW,
    boxH,
    totalRotRad,
    scaleRatioX,
    scaleRatioY,
    skewXRad,
    clipCenterFracX,
    extraBlurPx,
  } = layout;

  ctx.globalAlpha = alpha;

  if (clipCenterFracX !== undefined) {
    const revealW = boxW * clamp(clipCenterFracX, 0.02, 1);
    ctx.beginPath();
    ctx.rect(posX - revealW / 2, boxY - 24, revealW, boxH + 48);
    ctx.clip();
  }

  ctx.save();
  ctx.translate(posX, posY);
  if (Math.abs(totalRotRad) > 0.002) ctx.rotate(totalRotRad);
  if (Math.abs(skewXRad) > 0.002) ctx.transform(1, 0, Math.tan(skewXRad), 1, 0, 0);
  if (Math.abs(scaleRatioX - 1) > 0.002 || Math.abs(scaleRatioY - 1) > 0.002) {
    ctx.scale(scaleRatioX, scaleRatioY);
  }

  const glowStrength = clamp((clip.glowIntensity ?? 0) / 100, 0, 1);
  const glowColor = clip.glowColor || sc.accentColor || sc.primaryColor;
  const fxBlurPx = extraBlurPx > 0.3 ? (extraBlurPx * width) / 1280 : 0;
  if (fxBlurPx > 0.3) {
    ctx.filter = `blur(${fxBlurPx.toFixed(1)}px)`;
  }

  const halfW = boxW / 2;
  const halfH = boxH / 2;

  if (glowStrength > 0.01) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = Math.max(10, sizePx * 0.42 * glowStrength);
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = Math.max(6, sizePx * 0.14);
    ctx.shadowOffsetY = Math.max(2, sizePx * 0.04);
  }

  if (sc.kind === 'pill-badge' || sc.kind === 'neon-tag') {
    const radius = sc.kind === 'pill-badge' ? halfH : Math.max(10, sizePx * 0.14);
    const grad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
    grad.addColorStop(0, sc.primaryColor);
    grad.addColorStop(1, sc.accentColor);

    if (sc.showBadgeBg) {
      ctx.fillStyle = sc.kind === 'neon-tag' ? 'rgba(9, 13, 24, 0.86)' : grad;
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, boxW, boxH, radius);
      ctx.fill();

      ctx.strokeStyle = sc.kind === 'neon-tag' ? grad : 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = Math.max(2, sizePx * (sc.kind === 'neon-tag' ? 0.045 : 0.025));
      ctx.stroke();
    }

    const fontPx = Math.max(12, Math.round(sizePx * 0.33));
    ctx.font = `800 ${fontPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = sc.textColor || '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textStr = `${sc.emoji ? `${sc.emoji} ` : ''}${sc.label}`;
    ctx.fillText(textStr, 0, 1);
  } else if (sc.kind === 'callout-stamp') {
    const radius = Math.max(8, sizePx * 0.12);
    if (sc.showBadgeBg) {
      ctx.fillStyle = sc.primaryColor;
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, boxW, boxH, radius);
      ctx.fill();

      const inset = Math.max(4, sizePx * 0.055);
      ctx.strokeStyle = sc.accentColor || '#FFFFFF';
      ctx.lineWidth = Math.max(1.8, sizePx * 0.03);
      ctx.setLineDash([Math.max(5, sizePx * 0.08), Math.max(3, sizePx * 0.045)]);
      ctx.beginPath();
      ctx.roundRect(-halfW + inset, -halfH + inset, boxW - inset * 2, boxH - inset * 2, Math.max(4, radius - 3));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const fontPx = Math.max(12, Math.round(sizePx * 0.34));
    ctx.font = `900 ${fontPx}px "Montserrat", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = sc.textColor || '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textStr = `${sc.emoji ? `${sc.emoji} ` : ''}${sc.label}`;
    ctx.fillText(textStr, 0, 1);
  } else if (sc.kind === 'emoji-badge') {
    if (sc.showBadgeBg) {
      const grad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
      grad.addColorStop(0, 'rgba(13, 18, 30, 0.9)');
      grad.addColorStop(1, 'rgba(20, 27, 45, 0.92)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, boxW, boxH, halfH * 0.55);
      ctx.fill();

      ctx.strokeStyle = sc.primaryColor;
      ctx.lineWidth = Math.max(2, sizePx * 0.035);
      ctx.stroke();

      const emojiPx = Math.max(16, Math.round(sizePx * 0.48));
      const labelPx = Math.max(11, Math.round(sizePx * 0.28));
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `${emojiPx}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(sc.emoji || '🔥', -halfW + sizePx * 0.24, 1);
      ctx.font = `800 ${labelPx}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = sc.textColor || '#FFFFFF';
      ctx.fillText(sc.label, -halfW + sizePx * 0.85, 1);
    } else {
      const emojiPx = Math.max(20, Math.round(sizePx * 0.82));
      ctx.font = `${emojiPx}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sc.emoji || '🔥', 0, 0);
    }
  } else if (sc.kind === 'star-rating') {
    if (sc.showBadgeBg) {
      ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, boxW, boxH, halfH);
      ctx.fill();
      ctx.strokeStyle = sc.primaryColor;
      ctx.lineWidth = Math.max(2, sizePx * 0.032);
      ctx.stroke();
    }
    const starsPx = Math.max(14, Math.round(sizePx * 0.38));
    ctx.font = `700 ${starsPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = sc.primaryColor || '#FACC15';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sc.emoji || '★★★★★', 0, -sizePx * 0.11);

    const subPx = Math.max(9, Math.round(sizePx * 0.19));
    ctx.font = `800 ${subPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = sc.textColor || '#FEF08A';
    ctx.fillText(sc.label || '5 STARS', 0, sizePx * 0.22);
  } else if (sc.kind === 'hud-indicator') {
    if (sc.showBadgeBg) {
      ctx.fillStyle = 'rgba(10, 13, 20, 0.85)';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, boxW, boxH, Math.max(8, sizePx * 0.14));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1.5, sizePx * 0.024);
      ctx.stroke();

      const dotR = Math.max(4, sizePx * 0.11);
      ctx.fillStyle = sc.primaryColor || '#EF4444';
      ctx.beginPath();
      ctx.arc(-halfW + sizePx * 0.32, 0, dotR, 0, Math.PI * 2);
      ctx.fill();

      const fontPx = Math.max(12, Math.round(sizePx * 0.34));
      ctx.font = `800 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.fillStyle = sc.textColor || '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(sc.label || 'REC', -halfW + sizePx * 0.54, 1);
    } else {
      const r = sizePx * 0.48;
      ctx.strokeStyle = sc.primaryColor || '#22D3EE';
      ctx.lineWidth = Math.max(2, sizePx * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = sc.accentColor || '#38BDF8';
      ctx.lineWidth = Math.max(1.5, sizePx * 0.025);
      ctx.setLineDash([r * 0.45, r * 0.32]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const tick = r * 1.24;
      ctx.beginPath();
      ctx.moveTo(-tick, 0);
      ctx.lineTo(-r * 0.4, 0);
      ctx.moveTo(r * 0.4, 0);
      ctx.lineTo(tick, 0);
      ctx.moveTo(0, -tick);
      ctx.lineTo(0, -r * 0.4);
      ctx.moveTo(0, r * 0.4);
      ctx.lineTo(0, tick);
      ctx.stroke();
    }
  } else if (sc.kind === 'arrow-vector') {
    const grad = ctx.createLinearGradient(-halfW, 0, halfW, 0);
    grad.addColorStop(0, sc.primaryColor || '#FACC15');
    grad.addColorStop(1, sc.accentColor || '#F97316');
    ctx.strokeStyle = grad;
    ctx.fillStyle = grad;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lw = Math.max(4, sizePx * 0.09);
    ctx.lineWidth = lw;

    if (sc.stickerId === 'arrow-up') {
      ctx.beginPath();
      ctx.moveTo(0, halfH * 0.72);
      ctx.lineTo(0, -halfH * 0.58);
      ctx.moveTo(-halfW * 0.36, -halfH * 0.14);
      ctx.lineTo(0, -halfH * 0.64);
      ctx.lineTo(halfW * 0.36, -halfH * 0.14);
      ctx.stroke();
    } else if (sc.stickerId === 'arrow-curved') {
      ctx.beginPath();
      ctx.moveTo(-halfW * 0.65, halfH * 0.42);
      ctx.quadraticCurveTo(-halfW * 0.15, -halfH * 0.75, halfW * 0.58, -halfH * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(halfW * 0.25, -halfH * 0.35);
      ctx.lineTo(halfW * 0.64, -halfH * 0.08);
      ctx.lineTo(halfW * 0.26, halfH * 0.18);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-halfW * 0.68, 0);
      ctx.lineTo(halfW * 0.56, 0);
      ctx.moveTo(halfW * 0.18, -halfH * 0.38);
      ctx.lineTo(halfW * 0.62, 0);
      ctx.lineTo(halfW * 0.18, halfH * 0.38);
      ctx.stroke();
    }
  }

  ctx.filter = 'none';
  ctx.restore();

  if (options?.selectedTextClipId === clip.id && !options?.hideSelectionOutline) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;

    const strokeW = Math.max(1.5, width / 640);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
    ctx.lineWidth = strokeW;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.setLineDash([]);

    const handleSize = clamp(Math.round(Math.min(width, height) * 0.013), 7, 12);
    const half = handleSize / 2;
    const corners = [
      [boxX, boxY],
      [boxX + boxW, boxY],
      [boxX, boxY + boxH],
      [boxX + boxW, boxY + boxH],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(cx - half, cy - half, handleSize, handleSize);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = strokeW;
      ctx.strokeRect(cx - half, cy - half, handleSize, handleSize);
    }
  }

  ctx.restore();
}

export function renderFrameToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  clips: TimelineClip[],
  assets: MediaAsset[],
  mediaMap: LoadedMediaMap,
  options?: {
    selectedTextClipId?: string | null;
    hideSelectionOutline?: boolean;
    hiddenTracks?: Record<string, boolean>;
  }
) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, width, height);

  const assetById = new Map(assets.map((a) => [a.id, a]));

  const drawRawVisualMedia = (
    targetCtx: CanvasRenderingContext2D,
    clip: TimelineClip,
    asset: MediaAsset,
    progress: number,
    sampleTime: number,
    evalT: EvaluatedClipTransform
  ) => {
    if (asset.type === 'motion') {
      drawProceduralMotion(targetCtx, asset.motionVariant, width, height, progress, sampleTime);
      return;
    }

    const el = mediaMap.get(asset.id);
    const isVideoReady =
      el instanceof HTMLVideoElement && el.readyState >= 2 && el.videoWidth > 0 && el.videoHeight > 0;
    const isImageReady = el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0;
    const isBitmapReady =
      typeof ImageBitmap !== 'undefined' && el instanceof ImageBitmap && el.width > 0 && el.height > 0;

    if (!isVideoReady && !isImageReady && !isBitmapReady) return;

    const srcW =
      el instanceof HTMLVideoElement
        ? el.videoWidth
        : el instanceof HTMLImageElement
        ? el.naturalWidth
        : el.width;
    const srcH =
      el instanceof HTMLVideoElement
        ? el.videoHeight
        : el instanceof HTMLImageElement
        ? el.naturalHeight
        : el.height;

    const baseScale = Math.max(width / srcW, height / srcH);
    const userScale = evalT.scale / 100;

    let kbScale = 1;
    let kbPanX = 0;
    let kbPanY = 0;
    const eased = easeInOutSine(progress);

    if (clip.kenBurns === 'zoom-in') {
      kbScale = 1 + 0.12 * eased;
    } else if (clip.kenBurns === 'zoom-out') {
      kbScale = 1.12 - 0.12 * eased;
    } else if (clip.kenBurns === 'pan-left') {
      kbScale = 1.1;
      kbPanX = (0.04 - 0.08 * eased) * width;
    } else if (clip.kenBurns === 'pan-right') {
      kbScale = 1.1;
      kbPanX = (-0.04 + 0.08 * eased) * width;
    }

    const drawW = srcW * baseScale * userScale * kbScale;
    const drawH = srcH * baseScale * userScale * kbScale;

    const centerX = width / 2 + (evalT.x / 100) * width + kbPanX;
    const centerY = height / 2 + (evalT.y / 100) * height + kbPanY;

    if (Math.abs(evalT.rotation) > 0.05) {
      targetCtx.save();
      targetCtx.translate(centerX, centerY);
      targetCtx.rotate((evalT.rotation * Math.PI) / 180);
      targetCtx.drawImage(el, -drawW / 2, -drawH / 2, drawW, drawH);
      targetCtx.restore();
    } else {
      targetCtx.drawImage(el, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
    }
  };

  const drawSingleVisual = (
    clip: TimelineClip,
    sampleTime: number,
    withTransitions: boolean
  ) => {
    const asset = assetById.get(clip.assetId);
    if (!asset) return;

    const localTime = clamp(sampleTime - clip.startTime, 0, clip.duration);
    const progress = clip.duration > 0 ? clamp(localTime / clip.duration, 0, 1) : 0;
    const evalT = evaluateClipTransform(clip, localTime);
    let alpha = computeFadeAlpha(clip, localTime, evalT.opacity);

    const trans = withTransitions
      ? computeClipTransitionEffect(clip, localTime, width, height).effect
      : null;
    const animFx = computeClipAnimationEffect(clip, localTime, width, height);

    if (trans) {
      alpha *= trans.alphaMult;
    }
    alpha *= animFx.alphaMult;
    if (alpha <= 0.001) return;

    const fx = clip.fxPreset ?? 'none';
    const fxStrength = clamp((clip.fxIntensity ?? 75) / 100, 0, 1);

    const hasActiveMask = Boolean(clip.maskShape && clip.maskShape !== 'none');
    const outerCtx = ctx;
    let renderTargetCtx = ctx;
    let maskHostCanvas: HTMLCanvasElement | null = null;

    if (hasActiveMask) {
      maskHostCanvas = getScratchCanvas('maskTarget', width, height);
      const mCtx = maskHostCanvas.getContext('2d');
      if (mCtx) {
        mCtx.clearRect(0, 0, width, height);
        renderTargetCtx = mCtx;
      }
    }

    const drawCtx = renderTargetCtx;
    drawCtx.save();
    drawCtx.globalAlpha = alpha;

    if (trans?.clipMode) {
      drawCtx.beginPath();
      if (trans.clipMode.kind === 'rect') {
        drawCtx.rect(trans.clipMode.x, trans.clipMode.y, trans.clipMode.w, trans.clipMode.h);
      } else {
        drawCtx.arc(
          trans.clipMode.cx,
          trans.clipMode.cy,
          Math.max(0, trans.clipMode.r),
          0,
          Math.PI * 2
        );
      }
      drawCtx.clip();
    }

    if (animFx.clipCenterFracX !== undefined) {
      const revealW = width * clamp(animFx.clipCenterFracX, 0.01, 1);
      drawCtx.beginPath();
      drawCtx.rect((width - revealW) / 2, 0, revealW, height);
      drawCtx.clip();
    }

    const totalOffX = (trans?.offsetX ?? 0) + animFx.offsetX;
    const totalOffY = (trans?.offsetY ?? 0) + animFx.offsetY;
    const totalScaleX = (trans?.scaleMult ?? 1) * animFx.scaleX;
    const totalScaleY = (trans?.scaleMult ?? 1) * animFx.scaleY;
    const totalRotate = (trans?.rotateRad ?? 0) + animFx.rotateRad;
    const totalSkewX = animFx.skewXRad;

    if (
      totalOffX !== 0 ||
      totalOffY !== 0 ||
      totalScaleX !== 1 ||
      totalScaleY !== 1 ||
      totalRotate !== 0 ||
      totalSkewX !== 0
    ) {
      drawCtx.translate(width / 2 + totalOffX, height / 2 + totalOffY);
      if (totalRotate !== 0) drawCtx.rotate(totalRotate);
      if (totalSkewX !== 0) drawCtx.transform(1, 0, Math.tan(totalSkewX), 1, 0, 0);
      if (totalScaleX !== 1 || totalScaleY !== 1) drawCtx.scale(totalScaleX, totalScaleY);
      drawCtx.translate(-width / 2, -height / 2);
    }

    const filterStr = buildFilterString(
      clip,
      width,
      (trans?.extraBlurPx ?? 0) + animFx.extraBlurPx
    );

    const needsBufferPass =
      fxStrength > 0.01 &&
      (fx === 'mosaic' ||
        fx === 'mosaic-glass' ||
        fx === 'crystal-facets' ||
        fx === 'pixel-8bit' ||
        fx === 'led-matrix' ||
        fx === 'radial-blur' ||
        fx === 'spin-blur' ||
        fx === 'edge-blur' ||
        fx === 'tilt-shift' ||
        fx === 'motion-blur' ||
        fx === 'mirror-kaleido' ||
        fx === 'kaleidoscope' ||
        fx === 'quad-split' ||
        fx === 'chromatic-shake' ||
        fx === 'vhs-glitch' ||
        fx === 'tv-static');

    if (needsBufferPass) {
      const buf = getScratchCanvas('primary', width, height);
      const bCtx = buf.getContext('2d');
      if (bCtx) {
        bCtx.save();
        bCtx.clearRect(0, 0, width, height);
        bCtx.filter = filterStr;
        drawRawVisualMedia(bCtx, clip, asset, progress, sampleTime, evalT);
        bCtx.restore();

        if (
          fx === 'mosaic' ||
          fx === 'mosaic-glass' ||
          fx === 'crystal-facets' ||
          fx === 'pixel-8bit' ||
          fx === 'led-matrix'
        ) {
          const factor = fx === 'pixel-8bit' ? 54 : fx === 'led-matrix' ? 32 : 42;
          const blockPx = Math.max(6, Math.round((width / 1280) * (10 + factor * fxStrength)));
          const smallW = Math.max(8, Math.round(width / blockPx));
          const smallH = Math.max(6, Math.round(height / blockPx));
          const tiny = getScratchCanvas('tiny', smallW, smallH);
          const tCtx = tiny.getContext('2d');
          if (tCtx) {
            tCtx.clearRect(0, 0, smallW, smallH);
            tCtx.imageSmoothingEnabled = true;
            tCtx.drawImage(buf, 0, 0, smallW, smallH);

            drawCtx.save();
            drawCtx.imageSmoothingEnabled = false;
            drawCtx.drawImage(tiny, 0, 0, width, height);
            drawCtx.imageSmoothingEnabled = true;

            if (fx === 'mosaic-glass' || fx === 'crystal-facets' || fx === 'led-matrix') {
              const step = width / smallW;
              drawCtx.strokeStyle =
                fx === 'led-matrix'
                  ? `rgba(4, 6, 12, ${(0.55 * fxStrength).toFixed(3)})`
                  : fx === 'crystal-facets'
                  ? `rgba(255, 255, 255, ${(0.22 * fxStrength).toFixed(3)})`
                  : `rgba(255, 255, 255, ${(0.12 * fxStrength).toFixed(3)})`;
              drawCtx.lineWidth = Math.max(1, (width / 1280) * (fx === 'led-matrix' ? 2 : 1));
              drawCtx.beginPath();
              for (let x = 0; x <= width; x += step) {
                drawCtx.moveTo(x, 0);
                drawCtx.lineTo(x, height);
              }
              for (let y = 0; y <= height; y += step) {
                drawCtx.moveTo(0, y);
                drawCtx.lineTo(width, y);
              }
              drawCtx.stroke();

              if (fx === 'mosaic-glass') {
                drawCtx.fillStyle = `rgba(226, 232, 240, ${(0.07 * fxStrength).toFixed(3)})`;
                drawCtx.fillRect(0, 0, width, height);
              }
            }
            drawCtx.restore();
          } else {
            drawCtx.drawImage(buf, 0, 0, width, height);
          }
        } else if (fx === 'radial-blur') {
          drawCtx.drawImage(buf, 0, 0, width, height);
          drawCtx.save();
          const steps = [1.025, 1.055, 1.09, 1.13];
          for (let i = 0; i < steps.length; i++) {
            const s = 1 + (steps[i] - 1) * fxStrength;
            drawCtx.globalAlpha = alpha * (0.24 - i * 0.04) * fxStrength;
            const dw = width * s;
            const dh = height * s;
            drawCtx.drawImage(buf, (width - dw) / 2, (height - dh) / 2, dw, dh);
          }
          drawCtx.restore();
        } else if (fx === 'spin-blur') {
          drawCtx.drawImage(buf, 0, 0, width, height);
          drawCtx.save();
          const angles = [-0.07, -0.035, 0.035, 0.07];
          drawCtx.globalAlpha = alpha * 0.22 * fxStrength;
          for (const ang of angles) {
            drawCtx.save();
            drawCtx.translate(width / 2, height / 2);
            drawCtx.rotate(ang * fxStrength);
            drawCtx.drawImage(buf, -width / 2, -height / 2, width, height);
            drawCtx.restore();
          }
          drawCtx.restore();
        } else if (fx === 'motion-blur') {
          drawCtx.drawImage(buf, 0, 0, width, height);
          drawCtx.save();
          const maxShift = width * 0.045 * fxStrength;
          const offsets = [-1, -0.5, 0.5, 1];
          drawCtx.globalAlpha = alpha * 0.24 * fxStrength;
          for (const f of offsets) {
            drawCtx.drawImage(buf, f * maxShift, 0, width, height);
          }
          drawCtx.restore();
        } else if (fx === 'tilt-shift' || fx === 'edge-blur') {
          drawCtx.drawImage(buf, 0, 0, width, height);
          const blurBuf = getScratchCanvas('secondary', width, height);
          const blCtx = blurBuf.getContext('2d');
          if (blCtx) {
            blCtx.save();
            blCtx.clearRect(0, 0, width, height);
            blCtx.filter = `blur(${Math.max(4, Math.round((width / 1280) * 20 * fxStrength))}px)`;
            blCtx.drawImage(buf, 0, 0, width, height);
            blCtx.restore();

            if (fx === 'tilt-shift') {
              const bands = [
                { y: 0, h: height * 0.24, a: 0.96 },
                { y: height * 0.2, h: height * 0.14, a: 0.55 },
                { y: height * 0.66, h: height * 0.14, a: 0.55 },
                { y: height * 0.76, h: height * 0.24, a: 0.96 },
              ];
              for (const b of bands) {
                drawCtx.save();
                drawCtx.globalAlpha = alpha * b.a;
                drawCtx.drawImage(blurBuf, 0, b.y, width, b.h, 0, b.y, width, b.h);
                drawCtx.restore();
              }
            } else {
              // Radial edge blur keeping center crisp
              const radMask = getScratchCanvas('edgeBlurMask', width, height);
              const rmCtx = radMask.getContext('2d');
              if (rmCtx) {
                rmCtx.clearRect(0, 0, width, height);
                rmCtx.drawImage(blurBuf, 0, 0, width, height);
                rmCtx.globalCompositeOperation = 'destination-out';
                const rg = rmCtx.createRadialGradient(
                  width / 2,
                  height / 2,
                  Math.min(width, height) * 0.18,
                  width / 2,
                  height / 2,
                  Math.max(width, height) * 0.56
                );
                rg.addColorStop(0, 'rgba(0,0,0,1)');
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                rmCtx.fillStyle = rg;
                rmCtx.fillRect(0, 0, width, height);
                rmCtx.globalCompositeOperation = 'source-over';
                drawCtx.drawImage(radMask, 0, 0, width, height);
              }
            }
          }
        } else if (fx === 'mirror-kaleido') {
          const halfW = width / 2;
          drawCtx.drawImage(buf, 0, 0, halfW, height, 0, 0, halfW, height);
          drawCtx.save();
          drawCtx.translate(width, 0);
          drawCtx.scale(-1, 1);
          drawCtx.drawImage(buf, 0, 0, halfW, height, 0, 0, halfW, height);
          drawCtx.restore();
        } else if (fx === 'kaleidoscope') {
          const hw = width / 2;
          const hh = height / 2;
          drawCtx.drawImage(buf, 0, 0, hw, hh, 0, 0, hw, hh);
          drawCtx.save();
          drawCtx.translate(width, 0);
          drawCtx.scale(-1, 1);
          drawCtx.drawImage(buf, 0, 0, hw, hh, 0, 0, hw, hh);
          drawCtx.restore();
          drawCtx.save();
          drawCtx.translate(0, height);
          drawCtx.scale(1, -1);
          drawCtx.drawImage(buf, 0, 0, hw, hh, 0, 0, hw, hh);
          drawCtx.restore();
          drawCtx.save();
          drawCtx.translate(width, height);
          drawCtx.scale(-1, -1);
          drawCtx.drawImage(buf, 0, 0, hw, hh, 0, 0, hw, hh);
          drawCtx.restore();
        } else if (fx === 'quad-split') {
          const hw = width / 2;
          const hh = height / 2;
          drawCtx.drawImage(buf, 0, 0, hw, hh);
          drawCtx.drawImage(buf, hw, 0, hw, hh);
          drawCtx.drawImage(buf, 0, hh, hw, hh);
          drawCtx.drawImage(buf, hw, hh, hw, hh);
          drawCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          drawCtx.lineWidth = Math.max(1.5, width / 640);
          drawCtx.beginPath();
          drawCtx.moveTo(hw, 0);
          drawCtx.lineTo(hw, height);
          drawCtx.moveTo(0, hh);
          drawCtx.lineTo(width, hh);
          drawCtx.stroke();
        } else if (fx === 'chromatic-shake') {
          const jitterX = Math.sin(sampleTime * 42) * width * 0.012 * fxStrength;
          const jitterY = Math.cos(sampleTime * 35) * height * 0.008 * fxStrength;
          const rgbSplit = width * 0.018 * fxStrength;
          drawCtx.drawImage(buf, jitterX, jitterY, width, height);
          drawCtx.save();
          drawCtx.globalCompositeOperation = 'screen';
          drawCtx.globalAlpha = alpha * 0.42 * fxStrength;
          drawCtx.drawImage(buf, jitterX - rgbSplit, jitterY, width, height);
          drawCtx.drawImage(buf, jitterX + rgbSplit, jitterY, width, height);
          drawCtx.restore();
        } else if (fx === 'vhs-glitch' || fx === 'tv-static') {
          drawCtx.drawImage(buf, 0, 0, width, height);
          drawCtx.save();
          const drift = Math.sin(sampleTime * 19) * width * 0.018 * fxStrength;
          const sliceY = ((Math.sin(sampleTime * 7.3) * 0.5 + 0.5) * 0.75 + 0.08) * height;
          const sliceH = Math.max(8, height * 0.09);
          drawCtx.drawImage(buf, 0, sliceY, width, sliceH, drift, sliceY, width, sliceH);
          drawCtx.globalCompositeOperation = 'screen';
          drawCtx.globalAlpha = alpha * 0.25 * fxStrength;
          drawCtx.fillStyle = 'rgba(34, 211, 238, 0.35)';
          drawCtx.fillRect(0, sliceY, width, sliceH * 0.45);
          drawCtx.fillStyle = 'rgba(244, 63, 94, 0.35)';
          drawCtx.fillRect(0, sliceY + sliceH * 0.45, width, sliceH * 0.55);

          if (fx === 'tv-static') {
            const seedBase = Math.floor(sampleTime * 24) * 37 + 13;
            const cell = Math.max(4, Math.round(width / 180));
            for (let i = 0; i < 650; i++) {
              const h1 = Math.sin(seedBase + i * 19.31) * 43758.5453;
              const h2 = Math.sin(seedBase + i * 73.17) * 24634.6345;
              const sx = (h1 - Math.floor(h1)) * width;
              const sy = (h2 - Math.floor(h2)) * height;
              drawCtx.fillStyle =
                i % 2 === 0
                  ? `rgba(255, 255, 255, ${(0.35 * fxStrength).toFixed(3)})`
                  : `rgba(148, 163, 184, ${(0.25 * fxStrength).toFixed(3)})`;
              drawCtx.fillRect(sx, sy, cell * 2, cell);
            }
          }
          drawCtx.restore();
        }
      }
    } else {
      drawCtx.filter = filterStr;
      drawRawVisualMedia(drawCtx, clip, asset, progress, sampleTime, evalT);
      drawCtx.filter = 'none';
    }

    if (clip.vignette > 0) {
      const strength = clamp(clip.vignette / 100, 0, 1) * 0.78;
      const rad = drawCtx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.25,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.72
      );
      rad.addColorStop(0, 'rgba(0,0,0,0)');
      rad.addColorStop(1, `rgba(0,0,0,${strength.toFixed(3)})`);
      drawCtx.fillStyle = rad;
      drawCtx.fillRect(0, 0, width, height);
    }

    // Glowing Color Aura
    const glowStrength = clamp((clip.glowIntensity ?? 0) / 100, 0, 1);
    const glowRgb = hexToRgb(clip.glowColor || '#38BDF8');

    if (glowStrength > 0.01) {
      drawCtx.save();
      drawCtx.globalCompositeOperation = 'screen';
      const aura = drawCtx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.15,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.78
      );
      aura.addColorStop(0, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, ${(glowStrength * 0.14).toFixed(3)})`);
      aura.addColorStop(0.65, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, ${(glowStrength * 0.28).toFixed(3)})`);
      aura.addColorStop(1, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, ${(glowStrength * 0.48).toFixed(3)})`);
      drawCtx.fillStyle = aura;
      drawCtx.fillRect(0, 0, width, height);

      const edgePx = Math.max(2, Math.round(Math.min(width, height) * 0.008));
      drawCtx.strokeStyle = `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, ${(glowStrength * 0.65).toFixed(3)})`;
      drawCtx.lineWidth = edgePx * 2;
      drawCtx.shadowColor = `rgb(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b})`;
      drawCtx.shadowBlur = Math.max(12, Math.round(Math.min(width, height) * 0.04 * glowStrength));
      drawCtx.strokeRect(0, 0, width, height);
      drawCtx.restore();
    }

    // Stylize, Cinema & Light Visual FX overlay passes
    if (fx !== 'none' && fxStrength > 0.01) {
      drawCtx.save();
      drawCtx.globalCompositeOperation = 'screen';

      if (fx === 'neon-bloom' || fx === 'soft-glow-pro') {
        const bloom = drawCtx.createRadialGradient(
          width * (0.5 + Math.sin(sampleTime * 0.6) * 0.08),
          height * 0.45,
          0,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.72
        );
        bloom.addColorStop(
          0,
          fx === 'soft-glow-pro'
            ? `rgba(253, 242, 248, ${(fxStrength * 0.28).toFixed(3)})`
            : `rgba(186, 230, 253, ${(fxStrength * 0.24).toFixed(3)})`
        );
        bloom.addColorStop(
          0.5,
          fx === 'soft-glow-pro'
            ? `rgba(244, 114, 182, ${(fxStrength * 0.14).toFixed(3)})`
            : `rgba(56, 189, 248, ${(fxStrength * 0.16).toFixed(3)})`
        );
        bloom.addColorStop(1, 'rgba(15, 23, 42, 0)');
        drawCtx.fillStyle = bloom;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'cyber-glow') {
        const cyan = drawCtx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) * 0.75);
        cyan.addColorStop(0, `rgba(34, 211, 238, ${(fxStrength * 0.42).toFixed(3)})`);
        cyan.addColorStop(1, 'rgba(34, 211, 238, 0)');
        drawCtx.fillStyle = cyan;
        drawCtx.fillRect(0, 0, width, height);

        const magenta = drawCtx.createRadialGradient(
          width,
          height,
          0,
          width,
          height,
          Math.max(width, height) * 0.75
        );
        magenta.addColorStop(0, `rgba(236, 72, 153, ${(fxStrength * 0.42).toFixed(3)})`);
        magenta.addColorStop(1, 'rgba(236, 72, 153, 0)');
        drawCtx.fillStyle = magenta;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'golden-aura') {
        const gold = drawCtx.createRadialGradient(
          width * (0.3 + Math.sin(sampleTime * 0.45) * 0.12),
          height * 0.25,
          0,
          width * 0.4,
          height * 0.4,
          Math.max(width, height) * 0.85
        );
        gold.addColorStop(0, `rgba(254, 243, 199, ${(fxStrength * 0.36).toFixed(3)})`);
        gold.addColorStop(0.42, `rgba(245, 158, 11, ${(fxStrength * 0.22).toFixed(3)})`);
        gold.addColorStop(1, 'rgba(245, 158, 11, 0)');
        drawCtx.fillStyle = gold;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'dream-halation') {
        const halo = drawCtx.createRadialGradient(
          width * 0.5,
          height * 0.45,
          Math.min(width, height) * 0.1,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.75
        );
        halo.addColorStop(0, `rgba(251, 113, 133, ${(fxStrength * 0.18).toFixed(3)})`);
        halo.addColorStop(0.55, `rgba(253, 186, 116, ${(fxStrength * 0.16).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(251, 113, 133, 0)');
        drawCtx.fillStyle = halo;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'lens-flare') {
        const fxX = width * (0.28 + Math.sin(sampleTime * 0.55) * 0.18);
        const fxY = height * 0.32;
        const streak = drawCtx.createLinearGradient(0, fxY, width, fxY);
        streak.addColorStop(0, 'rgba(56, 189, 248, 0)');
        streak.addColorStop(0.35, `rgba(56, 189, 248, ${(fxStrength * 0.5).toFixed(3)})`);
        streak.addColorStop(0.5, `rgba(224, 242, 254, ${(fxStrength * 0.75).toFixed(3)})`);
        streak.addColorStop(0.65, `rgba(56, 189, 248, ${(fxStrength * 0.5).toFixed(3)})`);
        streak.addColorStop(1, 'rgba(56, 189, 248, 0)');
        drawCtx.fillStyle = streak;
        drawCtx.fillRect(0, fxY - height * 0.04, width, height * 0.08);

        const core = drawCtx.createRadialGradient(fxX, fxY, 0, fxX, fxY, Math.min(width, height) * 0.32);
        core.addColorStop(0, `rgba(255, 255, 255, ${(fxStrength * 0.65).toFixed(3)})`);
        core.addColorStop(0.35, `rgba(56, 189, 248, ${(fxStrength * 0.35).toFixed(3)})`);
        core.addColorStop(1, 'rgba(56, 189, 248, 0)');
        drawCtx.fillStyle = core;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'light-leak') {
        const leak = drawCtx.createRadialGradient(
          width * 0.08,
          height * (0.2 + Math.sin(sampleTime * 0.7) * 0.12),
          0,
          width * 0.15,
          height * 0.3,
          Math.max(width, height) * 0.65
        );
        leak.addColorStop(0, `rgba(251, 146, 60, ${(fxStrength * 0.58).toFixed(3)})`);
        leak.addColorStop(0.45, `rgba(244, 63, 94, ${(fxStrength * 0.32).toFixed(3)})`);
        leak.addColorStop(1, 'rgba(244, 63, 94, 0)');
        drawCtx.fillStyle = leak;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'aurora-prism') {
        const shift = Math.sin(sampleTime * 0.8) * 0.15;
        const aur = drawCtx.createLinearGradient(0, 0, width, height);
        aur.addColorStop(0, `rgba(34, 211, 238, ${(fxStrength * 0.32).toFixed(3)})`);
        aur.addColorStop(clamp(0.48 + shift, 0.2, 0.8), `rgba(168, 85, 247, ${(fxStrength * 0.34).toFixed(3)})`);
        aur.addColorStop(1, `rgba(236, 72, 153, ${(fxStrength * 0.32).toFixed(3)})`);
        drawCtx.fillStyle = aur;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'bokeh-blur') {
        const orbs = [
          { x: 0.18, y: 0.25, r: 0.09, c: '253, 224, 71' },
          { x: 0.78, y: 0.22, r: 0.11, c: '56, 189, 248' },
          { x: 0.32, y: 0.72, r: 0.12, c: '244, 114, 182' },
          { x: 0.82, y: 0.68, r: 0.08, c: '251, 191, 36' },
          { x: 0.52, y: 0.44, r: 0.07, c: '192, 132, 252' },
        ];
        const minD = Math.min(width, height);
        for (let i = 0; i < orbs.length; i++) {
          const o = orbs[i];
          const ox = (o.x + Math.sin(sampleTime * 0.5 + i) * 0.03) * width;
          const oy = (o.y + Math.cos(sampleTime * 0.4 + i) * 0.03) * height;
          const rad = o.r * minD;
          const og = drawCtx.createRadialGradient(ox, oy, rad * 0.2, ox, oy, rad);
          og.addColorStop(0, `rgba(${o.c}, ${(0.18 * fxStrength).toFixed(3)})`);
          og.addColorStop(0.75, `rgba(${o.c}, ${(0.28 * fxStrength).toFixed(3)})`);
          og.addColorStop(1, `rgba(${o.c}, 0)`);
          drawCtx.fillStyle = og;
          drawCtx.beginPath();
          drawCtx.arc(ox, oy, rad, 0, Math.PI * 2);
          drawCtx.fill();
        }
      } else if (fx === 'teal-orange') {
        drawCtx.globalCompositeOperation = 'soft-light';
        const toGrad = drawCtx.createLinearGradient(0, 0, width, height);
        toGrad.addColorStop(0, `rgba(20, 184, 166, ${(0.55 * fxStrength).toFixed(3)})`);
        toGrad.addColorStop(1, `rgba(249, 115, 22, ${(0.55 * fxStrength).toFixed(3)})`);
        drawCtx.fillStyle = toGrad;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'night-vision' || fx === 'matrix-code') {
        drawCtx.globalCompositeOperation = 'multiply';
        drawCtx.fillStyle =
          fx === 'night-vision'
            ? `rgba(74, 222, 128, ${(0.75 + 0.25 * fxStrength).toFixed(3)})`
            : `rgba(16, 185, 129, ${(0.72 + 0.28 * fxStrength).toFixed(3)})`;
        drawCtx.fillRect(0, 0, width, height);
        drawCtx.globalCompositeOperation = 'source-over';
        const step = Math.max(4, Math.round(height / 85));
        drawCtx.fillStyle = `rgba(0, 20, 8, ${(0.22 * fxStrength).toFixed(3)})`;
        for (let y = 0; y < height; y += step * 2) {
          drawCtx.fillRect(0, y, width, step * 0.7);
        }
      } else if (fx === 'flash-strobe') {
        const beat = Math.max(0, Math.sin(sampleTime * 14));
        const flashAlpha = Math.pow(beat, 3) * 0.55 * fxStrength;
        if (flashAlpha > 0.01) {
          drawCtx.fillStyle = `rgba(255, 255, 255, ${flashAlpha.toFixed(3)})`;
          drawCtx.fillRect(0, 0, width, height);
        }
      } else if (fx === 'fisheye-vignette') {
        drawCtx.globalCompositeOperation = 'source-over';
        const vig = drawCtx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.28,
          width / 2,
          height / 2,
          Math.min(width, height) * 0.54
        );
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(0.75, `rgba(0,0,0,${(0.45 * fxStrength).toFixed(3)})`);
        vig.addColorStop(1, `rgba(0,0,0,${(0.95 * fxStrength).toFixed(3)})`);
        drawCtx.fillStyle = vig;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'prism-rgb') {
        const fringeW = Math.max(6, Math.round(width * 0.04 * fxStrength));
        const leftGrad = drawCtx.createLinearGradient(0, 0, fringeW * 3, 0);
        leftGrad.addColorStop(0, `rgba(34, 211, 238, ${(fxStrength * 0.42).toFixed(3)})`);
        leftGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
        drawCtx.fillStyle = leftGrad;
        drawCtx.fillRect(0, 0, fringeW * 3, height);

        const rightGrad = drawCtx.createLinearGradient(width - fringeW * 3, 0, width, 0);
        rightGrad.addColorStop(0, 'rgba(244, 63, 94, 0)');
        rightGrad.addColorStop(1, `rgba(244, 63, 94, ${(fxStrength * 0.42).toFixed(3)})`);
        drawCtx.fillStyle = rightGrad;
        drawCtx.fillRect(width - fringeW * 3, 0, fringeW * 3, height);
      } else if (fx === 'duo-neon') {
        const duo = drawCtx.createLinearGradient(0, 0, width, height);
        duo.addColorStop(0, `rgba(79, 70, 229, ${(fxStrength * 0.44).toFixed(3)})`);
        duo.addColorStop(1, `rgba(6, 182, 212, ${(fxStrength * 0.36).toFixed(3)})`);
        drawCtx.fillStyle = duo;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'frosted-glass') {
        drawCtx.fillStyle = `rgba(241, 245, 249, ${(fxStrength * 0.09).toFixed(3)})`;
        drawCtx.fillRect(0, 0, width, height);
      } else if (fx === 'retro-scan') {
        const step = Math.max(4, Math.round(height / 90));
        drawCtx.globalCompositeOperation = 'source-over';
        drawCtx.fillStyle = `rgba(5, 8, 18, ${(fxStrength * 0.26).toFixed(3)})`;
        for (let y = 0; y < height; y += step * 2) {
          drawCtx.fillRect(0, y, width, step);
        }
        drawCtx.globalCompositeOperation = 'screen';
        const sweepY = ((sampleTime * 0.32) % 1) * height;
        const sweep = drawCtx.createLinearGradient(0, sweepY - 60, 0, sweepY + 60);
        sweep.addColorStop(0, 'rgba(129, 140, 248, 0)');
        sweep.addColorStop(0.5, `rgba(129, 140, 248, ${(fxStrength * 0.25).toFixed(3)})`);
        sweep.addColorStop(1, 'rgba(129, 140, 248, 0)');
        drawCtx.fillStyle = sweep;
        drawCtx.fillRect(0, Math.max(0, sweepY - 60), width, 120);
      } else if (fx === 'halftone-dots') {
        drawCtx.globalCompositeOperation = 'source-over';
        const spacing = Math.max(10, Math.round(width / 64));
        const dotR = Math.max(1.5, spacing * 0.22 * fxStrength);
        drawCtx.fillStyle = `rgba(9, 11, 18, ${(0.28 * fxStrength).toFixed(3)})`;
        drawCtx.beginPath();
        for (let y = spacing / 2; y < height; y += spacing) {
          const xOff = Math.round(y / spacing) % 2 === 0 ? 0 : spacing / 2;
          for (let x = xOff; x < width; x += spacing) {
            drawCtx.moveTo(x + dotR, y);
            drawCtx.arc(x, y, dotR, 0, Math.PI * 2);
          }
        }
        drawCtx.fill();
      } else if (fx === 'cinema-grain') {
        drawCtx.globalCompositeOperation = 'overlay';
        const cell = Math.max(3, Math.round(width / 260));
        const seedBase = Math.floor(sampleTime * 24) * 17 + 31;
        const count = 420;
        for (let i = 0; i < count; i++) {
          const h1 = Math.sin(seedBase + i * 12.9898) * 43758.5453;
          const h2 = Math.sin(seedBase + i * 78.233) * 24634.6345;
          const gx = (h1 - Math.floor(h1)) * width;
          const gy = (h2 - Math.floor(h2)) * height;
          drawCtx.fillStyle =
            i % 2 === 0
              ? `rgba(255, 255, 255, ${(0.12 * fxStrength).toFixed(3)})`
              : `rgba(0, 0, 0, ${(0.14 * fxStrength).toFixed(3)})`;
          drawCtx.fillRect(gx, gy, cell, cell);
        }
      }

      drawCtx.restore();
    }

    // Famous Frame overlay
    if (clip.framePreset && clip.framePreset !== 'none') {
      drawFrameOverlay(
        drawCtx,
        width,
        height,
        clip.framePreset,
        clip.frameColor || clip.glowColor || '#38BDF8',
        clip.frameThickness ?? 50,
        sampleTime
      );
    }

    // Optional transition overlay passes
    if (trans?.overlayKind && trans.overlayStrength > 0.01) {
      const s = clamp(trans.overlayStrength, 0, 1);
      if (trans.overlayKind === 'flash-white') {
        drawCtx.fillStyle = `rgba(255, 255, 255, ${(s * 0.92).toFixed(3)})`;
        drawCtx.fillRect(0, 0, width, height);
      } else if (trans.overlayKind === 'dip-black') {
        drawCtx.fillStyle = `rgba(5, 6, 8, ${(s * 0.65).toFixed(3)})`;
        drawCtx.fillRect(0, 0, width, height);
      } else if (trans.overlayKind === 'film-burn') {
        const grad = drawCtx.createRadialGradient(
          width * (0.25 + (1 - s) * 0.5),
          height * 0.45,
          0,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.85
        );
        grad.addColorStop(0, `rgba(254, 243, 199, ${(s * 0.85).toFixed(3)})`);
        grad.addColorStop(0.4, `rgba(245, 158, 11, ${(s * 0.55).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(180, 83, 9, 0)');
        drawCtx.fillStyle = grad;
        drawCtx.fillRect(0, 0, width, height);
      } else if (trans.overlayKind === 'glitch-rgb') {
        const bandH = Math.max(8, Math.round(height * 0.08));
        drawCtx.fillStyle = `rgba(34, 211, 238, ${(s * 0.25).toFixed(3)})`;
        drawCtx.fillRect(0, height * 0.22, width, bandH);
        drawCtx.fillStyle = `rgba(244, 63, 94, ${(s * 0.25).toFixed(3)})`;
        drawCtx.fillRect(0, height * 0.62, width, bandH * 1.4);
      }
    }

    drawCtx.restore();

    // Composite clip mask (shape, linear gradient, or custom PNG design) onto outerCtx
    if (hasActiveMask && maskHostCanvas) {
      const mCtx = maskHostCanvas.getContext('2d');
      const alphaMaskCanvas = getScratchCanvas('maskAlpha', width, height);
      const aCtx = alphaMaskCanvas.getContext('2d');
      if (mCtx && aCtx) {
        const cx = width / 2 + ((clip.maskCenterX ?? 0) / 100) * width;
        const cy = height / 2 + ((clip.maskCenterY ?? 0) / 100) * height;
        const mw = Math.max(24, ((clip.maskWidth ?? 68) / 100) * width);
        const mh = Math.max(24, ((clip.maskHeight ?? 68) / 100) * height);
        const featherPx = Math.round(((clip.maskFeather ?? 0) * width) / 1280);

        aCtx.save();
        aCtx.clearRect(0, 0, width, height);
        aCtx.filter = featherPx > 0 ? `blur(${featherPx}px)` : 'none';

        if (clip.maskShape === 'linear-gradient') {
          const lg = aCtx.createLinearGradient(0, cy - mh / 2, 0, cy + mh / 2);
          lg.addColorStop(0, 'rgba(255,255,255,1)');
          lg.addColorStop(1, 'rgba(255,255,255,0)');
          aCtx.fillStyle = lg;
          aCtx.fillRect(0, 0, width, height);
        } else if (clip.maskShape === 'custom' && clip.customMaskId) {
          const customEl = mediaMap.get(`mask:${clip.customMaskId}`);
          const isReadyCustom =
            (customEl instanceof HTMLImageElement && customEl.complete && customEl.naturalWidth > 0) ||
            (typeof ImageBitmap !== 'undefined' && customEl instanceof ImageBitmap && customEl.width > 0);
          if (isReadyCustom) {
            aCtx.drawImage(customEl, cx - mw / 2, cy - mh / 2, mw, mh);
          } else {
            aCtx.fillStyle = '#FFFFFF';
            aCtx.fillRect(0, 0, width, height);
          }
        } else {
          aCtx.fillStyle = '#FFFFFF';
          drawMaskShapePath(aCtx, clip.maskShape!, cx, cy, mw, mh);
          aCtx.fill();
        }
        aCtx.restore();

        mCtx.save();
        mCtx.globalCompositeOperation = clip.maskInvert ? 'destination-out' : 'destination-in';
        mCtx.drawImage(alphaMaskCanvas, 0, 0, width, height);
        mCtx.restore();

        outerCtx.drawImage(maskHostCanvas, 0, 0, width, height);
      }
    }
  };

  // 1. Render active V1..Vn visual clips bottom-up (V1 base, V2..Vn overlays)
  const allVisuals = clips
    .filter((c) => isVisualTrack(c.track) && !options?.hiddenTracks?.[c.track])
    .sort((a, b) => {
      const layerDiff = getTrackIndex(a.track) - getTrackIndex(b.track);
      return layerDiff !== 0 ? layerDiff : a.startTime - b.startTime;
    });

  const activeVisuals = allVisuals.filter(
    (c) => time >= c.startTime && time < c.startTime + c.duration
  );

  for (const clip of activeVisuals) {
    const localTime = clamp(time - clip.startTime, 0, clip.duration);
    const { isEntering } = computeClipTransitionEffect(clip, localTime, width, height);

    if (isEntering) {
      const prevClip = allVisuals.find(
        (p) =>
          p.id !== clip.id &&
          p.track === clip.track &&
          Math.abs(p.startTime + p.duration - clip.startTime) <= 0.08
      );
      if (prevClip) {
        drawSingleVisual(
          prevClip,
          Math.max(prevClip.startTime, prevClip.startTime + prevClip.duration - 0.02),
          false
        );
      }
    }

    drawSingleVisual(clip, time, true);
  }

  // 2. Render active T1..Tn text overlays bottom-up
  const activeTitles = clips
    .filter(
      (c) =>
        isTitleTrack(c.track) &&
        !options?.hiddenTracks?.[c.track] &&
        c.textConfig &&
        time >= c.startTime &&
        time < c.startTime + c.duration
    )
    .sort((a, b) => {
      const layerDiff = getTrackIndex(a.track) - getTrackIndex(b.track);
      return layerDiff !== 0 ? layerDiff : a.startTime - b.startTime;
    });

  for (const clip of activeTitles) {
    const cfg = clip.textConfig;
    if (!cfg || !cfg.text.trim()) continue;

    ctx.save();
    const layout = computeTextLayout(ctx, width, height, time, clip);
    if (!layout) {
      ctx.restore();
      continue;
    }

    const { alpha, fontSizePx, lineHeight, lines, totalHeight, maxLineW, posX, posY, boxX, boxY, boxW, boxH } =
      layout;
    ctx.globalAlpha = alpha;

    const localTime = clamp(time - clip.startTime, 0, clip.duration);
    const titleEval = evaluateClipTransform(clip, localTime);
    const titleAnim = computeClipAnimationEffect(clip, localTime, width, height);
    if (titleAnim.clipCenterFracX !== undefined) {
      const revealW = boxW * clamp(titleAnim.clipCenterFracX, 0.02, 1);
      ctx.beginPath();
      ctx.rect(posX - revealW / 2, boxY - 24, revealW, boxH + 48);
      ctx.clip();
    }
    const totalTitleRotRad = (titleEval.rotation * Math.PI) / 180 + titleAnim.rotateRad;
    const hasTitleTransform =
      Math.abs(totalTitleRotRad) > 0.002 ||
      Math.abs(titleAnim.skewXRad) > 0.002 ||
      Math.abs(titleAnim.scaleX - titleAnim.scaleY) > 0.002;
    if (hasTitleTransform) {
      ctx.save();
      ctx.translate(posX, posY);
      if (Math.abs(totalTitleRotRad) > 0.002) ctx.rotate(totalTitleRotRad);
      if (Math.abs(titleAnim.skewXRad) > 0.002) {
        ctx.transform(1, 0, Math.tan(titleAnim.skewXRad), 1, 0, 0);
      }
      if (Math.abs(titleAnim.scaleX - titleAnim.scaleY) > 0.002) {
        const avgS = Math.max(0.05, (titleAnim.scaleX + titleAnim.scaleY) / 2);
        ctx.scale(titleAnim.scaleX / avgS, titleAnim.scaleY / avgS);
      }
      ctx.translate(-posX, -posY);
    }

    if (cfg.hasScrim) {
      const padX = fontSizePx * 0.65;
      const padY = fontSizePx * 0.4;
      const scrimW = maxLineW + padX * 2;
      const scrimH = totalHeight + padY * 2;

      let scrimX = posX - scrimW / 2;
      if (cfg.align === 'left') scrimX = posX - padX;
      if (cfg.align === 'right') scrimX = posX - maxLineW - padX;
      const scrimY = posY - scrimH / 2;

      const radius = Math.max(6, fontSizePx * 0.2);
      const bgRgb = hexToRgb(cfg.captionBgColor || '#090B10');
      ctx.fillStyle = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${clamp(cfg.scrimOpacity / 100, 0.1, 0.95)})`;
      ctx.beginPath();
      ctx.roundRect(scrimX, scrimY, scrimW, scrimH, radius);
      ctx.fill();
    }

    const startY = posY - ((lines.length - 1) * lineHeight) / 2;
    const titleGlowStrength = clamp((clip.glowIntensity ?? 0) / 100, 0, 1);
    const titleGlowColor = clip.glowColor || '#38BDF8';
    const titleFx = clip.fxPreset ?? 'none';
    const titleFxStrength = clamp((clip.fxIntensity ?? 75) / 100, 0, 1);

    const animBlurPx = titleAnim.extraBlurPx > 0.3 ? (titleAnim.extraBlurPx * width) / 1280 : 0;
    if (titleFx === 'gaussian-blur' || titleFx === 'frosted-glass' || animBlurPx > 0.3) {
      const fxBlur =
        titleFx === 'gaussian-blur' || titleFx === 'frosted-glass'
          ? Math.max(1, Math.round(fontSizePx * 0.12 * titleFxStrength))
          : 0;
      ctx.filter = `blur(${(fxBlur + animBlurPx).toFixed(1)}px)`;
    }

    if (titleFx === 'prism-rgb' || titleFx === 'chromatic-shake') {
      const offset = Math.max(2, fontSizePx * 0.05);
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * 0.65;
      ctx.fillStyle = '#22D3EE';
      lines.forEach((line, idx) => {
        ctx.fillText(line, posX - offset, startY + idx * lineHeight);
      });
      ctx.fillStyle = '#F43F5E';
      lines.forEach((line, idx) => {
        ctx.fillText(line, posX + offset, startY + idx * lineHeight);
      });
      ctx.restore();
    }

    if (
      titleGlowStrength > 0.01 ||
      titleFx === 'neon-bloom' ||
      titleFx === 'cyber-glow' ||
      titleFx === 'golden-aura' ||
      titleFx === 'aurora-prism'
    ) {
      const effectiveGlow = Math.max(
        titleGlowStrength,
        titleFx === 'neon-bloom' ||
          titleFx === 'cyber-glow' ||
          titleFx === 'golden-aura' ||
          titleFx === 'aurora-prism'
          ? 0.65
          : 0
      );
      const activeColor =
        titleFx === 'cyber-glow' && !clip.glowColor
          ? '#EC4899'
          : titleFx === 'golden-aura' && !clip.glowColor
          ? '#F59E0B'
          : titleFx === 'aurora-prism' && !clip.glowColor
          ? '#A855F7'
          : titleGlowColor;

      ctx.save();
      ctx.fillStyle = cfg.color;
      ctx.shadowColor = activeColor;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = Math.max(8, fontSizePx * 0.65 * effectiveGlow);
      lines.forEach((line, idx) => {
        ctx.fillText(line, posX, startY + idx * lineHeight);
      });
      ctx.shadowBlur = Math.max(4, fontSizePx * 0.25 * effectiveGlow);
      lines.forEach((line, idx) => {
        ctx.fillText(line, posX, startY + idx * lineHeight);
      });
      ctx.restore();
    }

    const outlinePx = Math.max(0, ((cfg.captionOutlineWidth ?? 0) * fontSizePx) / 42);
    const outlineColor = cfg.captionOutlineColor || '#050608';
    const highlightColor = cfg.captionHighlightColor || '#FACC15';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.max(4, fontSizePx * 0.18);
    ctx.shadowOffsetY = Math.max(1, fontSizePx * 0.04);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const isRtlClip =
      cfg.textDirection === 'rtl'
        ? true
        : cfg.textDirection === 'ltr'
        ? false
        : isRtlText(cfg.text);
    ctx.direction = isRtlClip ? 'rtl' : 'ltr';

    const activeMode: CaptionActiveMode =
      cfg.captionActiveMode ??
      (cfg.captionWordHighlight
        ? cfg.captionStyle === 'neon-karaoke'
          ? 'active-box'
          : 'word-color'
        : 'none');
    const activeBoxColor = cfg.captionActiveBoxColor || highlightColor;
    const activeBoxRadius = clamp(
      ((cfg.captionActiveBoxRadius ?? 10) * fontSizePx) / 42,
      0,
      fontSizePx * 0.75
    );
    const isNeonBox = cfg.captionStyle === 'neon-karaoke';

    if (activeMode !== 'none') {
      const lineWords = lines.map((l) => l.split(/\s+/).filter(Boolean));
      const totalWords = lineWords.reduce((acc, w) => acc + w.length, 0);
      const progressNorm = clamp(localTime / Math.max(0.05, clip.duration), 0, 0.9999);
      const activeWordIdx =
        cfg.captionLineMode === 'word-by-word'
          ? 0
          : totalWords > 0
          ? Math.floor(progressNorm * totalWords)
          : -1;
      const spaceW = ctx.measureText(' ').width;
      const prevAlign = ctx.textAlign;
      ctx.textAlign = 'left';

      const drawWordWithActiveStyle = (
        word: string,
        drawX: number,
        y: number,
        wWidth: number,
        isActive: boolean,
        isSpoken: boolean
      ) => {
        const isPopScaled = isActive && activeMode === 'active-box-scale';
        const wordCenterX = drawX + wWidth / 2;

        ctx.save();
        if (isPopScaled) {
          ctx.translate(wordCenterX, y);
          ctx.scale(1.12, 1.12);
          ctx.translate(-wordCenterX, -y);
        }

        if (isActive && (activeMode === 'active-box' || activeMode === 'active-box-scale')) {
          const boxRgb = hexToRgb(activeBoxColor);
          const padX = Math.max(5, fontSizePx * 0.17);
          const padY = Math.max(3, fontSizePx * 0.13);
          ctx.save();
          ctx.shadowColor = activeBoxColor;
          ctx.shadowBlur = isNeonBox ? Math.max(8, fontSizePx * 0.34) : Math.max(4, fontSizePx * 0.16);
          ctx.fillStyle = isNeonBox
            ? `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, 0.36)`
            : `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, 0.94)`;
          ctx.beginPath();
          ctx.roundRect(
            drawX - padX,
            y - fontSizePx * 0.56 - padY * 0.35,
            wWidth + padX * 2,
            fontSizePx * 1.12 + padY * 0.7,
            activeBoxRadius
          );
          ctx.fill();
          if (isNeonBox) {
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = Math.max(1.2, fontSizePx * 0.045);
            ctx.stroke();
          }
          ctx.restore();
        } else if (isActive && activeMode === 'underline-bar') {
          ctx.save();
          ctx.shadowColor = highlightColor;
          ctx.shadowBlur = Math.max(3, fontSizePx * 0.12);
          ctx.fillStyle = highlightColor;
          const barH = Math.max(2.5, fontSizePx * 0.1);
          ctx.beginPath();
          ctx.roundRect(drawX, y + fontSizePx * 0.46, wWidth, barH, barH / 2);
          ctx.fill();
          ctx.restore();
        }

        if (outlinePx > 0.2) {
          ctx.strokeStyle = outlineColor;
          ctx.lineWidth = outlinePx;
          ctx.strokeText(word, drawX, y);
        }

        let fillColor = cfg.color;
        if (activeMode === 'progressive-fill') {
          fillColor = isSpoken ? highlightColor : cfg.color;
        } else if (activeMode === 'active-box' || activeMode === 'active-box-scale') {
          fillColor = isActive ? (cfg.captionHighlightColor || '#FFFFFF') : cfg.color;
        } else if (isActive) {
          fillColor = highlightColor;
        }

        ctx.fillStyle = fillColor;
        ctx.fillText(word, drawX, y);
        ctx.restore();
      };

      let wordCursor = 0;
      lines.forEach((line, idx) => {
        const y = startY + idx * lineHeight;
        const words = lineWords[idx] ?? [];
        if (words.length === 0) return;
        const lineW = ctx.measureText(line).width;

        if (isRtlClip) {
          let rightEdge = posX + lineW / 2;
          if (prevAlign === 'left') rightEdge = posX + lineW;
          if (prevAlign === 'right') rightEdge = posX;

          for (let wi = 0; wi < words.length; wi++) {
            const word = words[wi];
            const wWidth = ctx.measureText(word).width;
            const drawX = rightEdge - wWidth;
            const isActive = wordCursor === activeWordIdx;
            const isSpoken = wordCursor <= activeWordIdx;
            drawWordWithActiveStyle(word, drawX, y, wWidth, isActive, isSpoken);
            rightEdge = drawX - spaceW;
            wordCursor++;
          }
        } else {
          let xCursor = posX - lineW / 2;
          if (prevAlign === 'left') xCursor = posX;
          if (prevAlign === 'right') xCursor = posX - lineW;

          for (let wi = 0; wi < words.length; wi++) {
            const word = words[wi];
            const wWidth = ctx.measureText(word).width;
            const isActive = wordCursor === activeWordIdx;
            const isSpoken = wordCursor <= activeWordIdx;
            drawWordWithActiveStyle(word, xCursor, y, wWidth, isActive, isSpoken);
            xCursor += wWidth + spaceW;
            wordCursor++;
          }
        }
      });

      ctx.textAlign = prevAlign;
    } else {
      lines.forEach((line, idx) => {
        const y = startY + idx * lineHeight;
        if (outlinePx > 0.2) {
          ctx.strokeStyle = outlineColor;
          ctx.lineWidth = outlinePx;
          ctx.strokeText(line, posX, y);
        }
        ctx.fillStyle = cfg.color;
        ctx.fillText(line, posX, y);
      });
    }

    ctx.filter = 'none';

    if (hasTitleTransform) {
      ctx.restore();
    }

    if (options?.selectedTextClipId === clip.id && !options?.hideSelectionOutline) {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = 1;

      const strokeW = Math.max(1.5, width / 640);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)';
      ctx.lineWidth = strokeW;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      ctx.setLineDash([]);

      const handleSize = clamp(Math.round(Math.min(width, height) * 0.016), 9, 14);
      const half = handleSize / 2;
      const corners = [
        [boxX, boxY],
        [boxX + boxW, boxY],
        [boxX, boxY + boxH],
        [boxX + boxW, boxY + boxH],
      ];
      for (const [cx, cy] of corners) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cx - half, cy - half, handleSize, handleSize);
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = strokeW;
        ctx.strokeRect(cx - half, cy - half, handleSize, handleSize);
      }
    }

    ctx.restore();
  }

  // 3. Render active T1..Tn sticker overlays bottom-up
  const activeStickers = clips
    .filter(
      (c) =>
        isTitleTrack(c.track) &&
        !options?.hiddenTracks?.[c.track] &&
        c.stickerConfig &&
        time >= c.startTime &&
        time < c.startTime + c.duration
    )
    .sort((a, b) => {
      const layerDiff = getTrackIndex(a.track) - getTrackIndex(b.track);
      return layerDiff !== 0 ? layerDiff : a.startTime - b.startTime;
    });

  for (const stickerClip of activeStickers) {
    drawStickerClip(ctx, width, height, time, stickerClip, options);
  }

  ctx.restore();
}
