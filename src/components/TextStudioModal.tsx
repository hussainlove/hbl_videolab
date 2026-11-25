import React, { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Layers,
  Plus,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import {
  ANIMATION_PRESETS,
  BUILTIN_FONT_FAMILIES,
  ClipAnimationPreset,
  CustomFont,
  GLOW_COLOR_SWATCHES,
  isTitleTrack,
  TextAnimation,
  TextConfig,
  TimelineClip,
  TrackId,
} from '../types/editor';
import { detectTextLanguage, ensureScriptFontLoaded } from '../utils/languageSupport';
import { clamp, formatShortTime } from '../utils/time';

export interface TextPresetSeed {
  name: string;
  x: number;
  y: number;
  duration?: number;
  config: TextConfig;
}

export const TEXT_STUDIO_PRESETS: TextPresetSeed[] = [
  {
    name: 'Title Overlay',
    x: 0,
    y: 0,
    duration: 3.0,
    config: {
      text: 'New Title Overlay',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 64,
      fontWeight: 700,
      color: '#FFFFFF',
      align: 'center',
      hasScrim: false,
      scrimOpacity: 60,
      animation: 'slide-up',
      captionOutlineWidth: 0,
      captionOutlineColor: '#050608',
      textDirection: 'auto',
    },
  },
  {
    name: 'Center Headline',
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
    },
  },
  {
    name: 'Lower Third',
    x: -36,
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
      scrimOpacity: 74,
      captionBgColor: '#090B10',
      animation: 'fade',
    },
  },
  {
    name: 'Editorial Serif',
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
    name: 'Condensed Impact',
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
      animation: 'scale',
    },
  },
];

interface TextStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSeed: TextPresetSeed | null;
  currentTime: number;
  customFonts: CustomFont[];
  availableTitleTracks: TrackId[];
  selectedTextClip: TimelineClip | null;
  onOpenAutoFonts: () => void;
  onInsertAdvancedText: (params: {
    name: string;
    config: TextConfig;
    startTime: number;
    duration: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
    fadeIn: number;
    fadeOut: number;
    glowColor: string;
    glowIntensity: number;
    animationIn: ClipAnimationPreset;
    animationInDuration: number;
    animationOut: ClipAnimationPreset;
    animationOutDuration: number;
    animationCombo: ClipAnimationPreset;
    preferredTrackId?: TrackId;
  }) => void;
  onUpdateSelectedTextClip: (id: string, patch: Partial<TimelineClip>) => void;
  onRescaleAllText?: (scale: number, fontSize?: number) => void;
}

const TEXT_SWATCHES = ['#FFFFFF', '#F8FAFC', '#FDE68A', '#38BDF8', '#A855F7', '#F43F5E', '#111827'];

function TextSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  inputMin,
  inputMax,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  inputMin?: number;
  inputMax?: number;
  onChange: (next: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const effectiveMin = inputMin ?? min;
  const effectiveMax = inputMax ?? max;
  const formatted = step < 1 ? String(Number(value.toFixed(2))) : String(Math.round(value));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-400">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={effectiveMin}
            max={effectiveMax}
            step={step}
            value={isEditing ? draft : formatted}
            onFocus={(e) => {
              setIsEditing(true);
              setDraft(formatted);
              e.currentTarget.select();
            }}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              const parsed = parseFloat(raw);
              if (Number.isFinite(parsed) && parsed >= effectiveMin) {
                onChange(clamp(parsed, effectiveMin, effectiveMax));
              }
            }}
            onBlur={() => {
              const parsed = parseFloat(draft);
              if (Number.isFinite(parsed)) {
                onChange(clamp(parsed, effectiveMin, effectiveMax));
              }
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setIsEditing(false);
                e.currentTarget.blur();
              }
            }}
            className="w-16 px-1.5 py-0.5 text-right text-xs font-mono tabular-nums text-slate-100 bg-[#07090F] border border-white/[0.12] rounded focus:outline-none focus:border-sky-400"
          />
          {unit && <span className="font-mono text-[11px] text-slate-400">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full studio-slider"
      />
    </div>
  );
}

export function TextStudioModal({
  isOpen,
  onClose,
  initialSeed,
  currentTime,
  customFonts,
  availableTitleTracks,
  selectedTextClip,
  onOpenAutoFonts,
  onInsertAdvancedText,
  onUpdateSelectedTextClip,
  onRescaleAllText,
}: TextStudioModalProps) {
  const [clipName, setClipName] = useState('Title Overlay');
  const [config, setConfig] = useState<TextConfig>(TEXT_STUDIO_PRESETS[0].config);
  const [startTime, setStartTime] = useState(0);
  const [duration, setDuration] = useState(3.0);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [scale, setScale] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [glowColor, setGlowColor] = useState('#38BDF8');
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [animationIn, setAnimationIn] = useState<ClipAnimationPreset>('none');
  const [animationInDuration, setAnimationInDuration] = useState(0.5);
  const [animationOut, setAnimationOut] = useState<ClipAnimationPreset>('none');
  const [animationOutDuration, setAnimationOutDuration] = useState(0.5);
  const [animationCombo, setAnimationCombo] = useState<ClipAnimationPreset>('none');
  const [preferredTrack, setPreferredTrack] = useState<string>('auto');

  useEffect(() => {
    if (!isOpen) return;
    const seed = initialSeed ?? TEXT_STUDIO_PRESETS[0];
    setClipName(seed.name);
    setConfig({
      captionOutlineWidth: 0,
      captionOutlineColor: '#050608',
      captionBgColor: '#090B10',
      textDirection: 'auto',
      ...seed.config,
    });
    setStartTime(Number(currentTime.toFixed(2)));
    setDuration(seed.duration ?? 3.0);
    setPosX(seed.x);
    setPosY(seed.y);
    setScale(100);
    setRotation(0);
    setOpacity(100);
    setFadeIn(0);
    setFadeOut(0);
    setGlowColor('#38BDF8');
    setGlowIntensity(0);
    setAnimationIn('none');
    setAnimationInDuration(0.5);
    setAnimationOut('none');
    setAnimationOutDuration(0.5);
    setAnimationCombo('none');
    setPreferredTrack('auto');
  }, [isOpen, initialSeed, currentTime]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const detectedLang = config.text.trim() ? detectTextLanguage(config.text) : null;
  const previewDir =
    config.textDirection === 'rtl'
      ? 'rtl'
      : config.textDirection === 'ltr'
      ? 'ltr'
      : detectedLang?.direction ?? 'ltr';
  const outlinePx = config.captionOutlineWidth ?? 0;
  const inPresets = ANIMATION_PRESETS.filter((a) => a.category === 'In');
  const outPresets = ANIMATION_PRESETS.filter((a) => a.category === 'Out');
  const comboPresets = ANIMATION_PRESETS.filter((a) => a.category === 'Combo');
  const hasSelectedTitle = Boolean(
    selectedTextClip && isTitleTrack(selectedTextClip.track) && selectedTextClip.textConfig
  );

  const loadFromSelectedClip = () => {
    if (!selectedTextClip?.textConfig) return;
    setClipName(selectedTextClip.name);
    setConfig({
      captionOutlineWidth: 0,
      captionOutlineColor: '#050608',
      captionBgColor: '#090B10',
      textDirection: 'auto',
      ...selectedTextClip.textConfig,
    });
    setStartTime(selectedTextClip.startTime);
    setDuration(selectedTextClip.duration);
    setPosX(selectedTextClip.x);
    setPosY(selectedTextClip.y);
    setScale(selectedTextClip.scale);
    setRotation(selectedTextClip.rotation ?? 0);
    setOpacity(selectedTextClip.opacity);
    setFadeIn(selectedTextClip.fadeIn);
    setFadeOut(selectedTextClip.fadeOut);
    setGlowColor(selectedTextClip.glowColor ?? '#38BDF8');
    setGlowIntensity(selectedTextClip.glowIntensity ?? 0);
    setAnimationIn(selectedTextClip.animationIn ?? 'none');
    setAnimationInDuration(selectedTextClip.animationInDuration ?? 0.5);
    setAnimationOut(selectedTextClip.animationOut ?? 'none');
    setAnimationOutDuration(selectedTextClip.animationOutDuration ?? 0.5);
    setAnimationCombo(selectedTextClip.animationCombo ?? 'none');
    setPreferredTrack(selectedTextClip.track);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#0F131C] border border-white/[0.12] rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.08] bg-[#0B0E16] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-sky-500/20 border border-violet-400/35 flex items-center justify-center shrink-0">
              <Type className="w-4.5 h-4.5 text-violet-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                Advanced Text Overlay Studio
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Customize typography, manual duration, position, glow, outline, backdrop &amp; multi-stage animations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasSelectedTitle && (
              <button
                type="button"
                onClick={loadFromSelectedClip}
                className="glow-btn px-2.5 py-1 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.1] text-[11px] font-medium text-sky-200"
                title="Load settings from currently selected timeline text clip"
              >
                Load Selected
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="glow-btn p-1.5 rounded-lg text-slate-400 hover:text-white border border-transparent"
              aria-label="Close Text Studio"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto studio-scroll p-4 sm:p-5 space-y-4">
          {/* Live Stage Preview + Quick Style Templates */}
          <div className="space-y-2.5">
            <div className="relative rounded-xl border border-white/[0.08] bg-[radial-gradient(circle_at_center,#1B2336_0%,#07090F_80%)] h-32 overflow-hidden flex items-center justify-center">
              <span className="absolute top-2 left-3 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                Live Text Preview · X {posX}% · Y {posY}% · {duration}s
              </span>
              <div
                dir={previewDir}
                style={{
                  transform: `translate(${posX * 1.4}px, ${posY * 0.45}px) scale(${
                    scale / 100
                  }) rotate(${rotation}deg)`,
                  opacity: clamp(opacity / 100, 0, 1),
                  fontFamily: `"${config.fontFamily}", sans-serif`,
                  fontWeight: config.fontWeight,
                  fontSize: `${clamp(Math.round(config.fontSize * 0.45), 14, 42)}px`,
                  color: config.color,
                  textAlign: config.align,
                  WebkitTextStroke:
                    outlinePx > 0
                      ? `${Math.max(0.5, outlinePx * 0.28)}px ${
                          config.captionOutlineColor ?? '#050608'
                        }`
                      : undefined,
                  textShadow:
                    glowIntensity > 0
                      ? `0 0 ${Math.round(glowIntensity * 0.3)}px ${glowColor}`
                      : '0 2px 10px rgba(0,0,0,0.7)',
                }}
                className="px-4 py-1.5 rounded-lg transition-transform whitespace-pre-wrap leading-tight max-w-[90%]"
              >
                <span
                  className="inline-block px-3 py-1 rounded-md"
                  style={{
                    backgroundColor: config.hasScrim
                      ? `${config.captionBgColor ?? '#090B10'}${Math.round(
                          clamp(config.scrimOpacity, 10, 95) * 2.55
                        )
                          .toString(16)
                          .padStart(2, '0')}`
                      : 'transparent',
                  }}
                >
                  {(config.captionUppercase ? config.text.toUpperCase() : config.text) ||
                    'Preview Text'}
                </span>
              </div>
            </div>

            {/* Template Picker Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto studio-scroll-thin pb-1">
              <span className="text-[11px] text-slate-400 shrink-0 mr-1">Templates:</span>
              {TEXT_STUDIO_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setClipName(preset.name);
                    setConfig({
                      captionOutlineWidth: 0,
                      captionOutlineColor: '#050608',
                      captionBgColor: '#090B10',
                      textDirection: 'auto',
                      ...preset.config,
                    });
                    setPosX(preset.x);
                    setPosY(preset.y);
                    if (preset.duration) setDuration(preset.duration);
                  }}
                  className={`glow-btn px-2.5 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 ${
                    clipName === preset.name
                      ? 'bg-[#182338] border-sky-400/50 text-sky-200'
                      : 'bg-[#141822] hover:bg-[#1B212F] border-white/[0.08] text-slate-300'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT COLUMN: Content, Manual Duration & Timing, Position & Transform */}
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">Text Content</span>
                  {detectedLang && detectedLang.languageCode !== 'auto' && (
                    <span className="text-[10px] font-mono text-sky-300">
                      {detectedLang.languageName} · {detectedLang.direction.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">Clip Label</label>
                  <input
                    type="text"
                    value={clipName}
                    onChange={(e) => setClipName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">
                    Overlay Text (multi-line supported)
                  </label>
                  <textarea
                    rows={3}
                    dir="auto"
                    value={config.text}
                    onChange={(e) => {
                      const next = e.target.value;
                      ensureScriptFontLoaded(next);
                      setConfig({ ...config, text: next });
                    }}
                    placeholder="Type text in any language..."
                    className="w-full px-3 py-2 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg resize-none focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              {/* Manual Timing & Track Target */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-violet-300" />
                    <span>Timing &amp; Track Placement</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Playhead {formatShortTime(currentTime)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextSlider
                    label="Manual Duration"
                    value={duration}
                    min={0.2}
                    max={60}
                    inputMin={0.1}
                    inputMax={3600}
                    step={0.1}
                    unit="s"
                    onChange={setDuration}
                  />
                  <TextSlider
                    label="Start Time"
                    value={startTime}
                    min={0}
                    max={300}
                    inputMin={0}
                    inputMax={3600}
                    step={0.1}
                    unit="s"
                    onChange={setStartTime}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <TextSlider
                    label="Fade In"
                    value={fadeIn}
                    min={0}
                    max={5}
                    step={0.05}
                    unit="s"
                    onChange={setFadeIn}
                  />
                  <TextSlider
                    label="Fade Out"
                    value={fadeOut}
                    min={0}
                    max={5}
                    step={0.05}
                    unit="s"
                    onChange={setFadeOut}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">Target Title Track</label>
                  <select
                    value={preferredTrack}
                    onChange={(e) => setPreferredTrack(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                  >
                    <option value="auto">Auto (Expand T1 / T2+ if busy)</option>
                    {availableTitleTracks.map((tId) => (
                      <option key={tId} value={tId}>
                        {tId} · Titles Track
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Position & Transform */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Position &amp; Transform
                  </span>
                  <div className="flex items-center gap-1">
                    {[
                      { label: 'Center', x: 0, y: 0 },
                      { label: 'Top', x: 0, y: -36 },
                      { label: 'Bottom', x: 0, y: 36 },
                      { label: 'Lower 3rd', x: -34, y: 34 },
                    ].map((pos) => (
                      <button
                        key={pos.label}
                        type="button"
                        onClick={() => {
                          setPosX(pos.x);
                          setPosY(pos.y);
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-[#141822] hover:bg-[#1B212F] border border-white/[0.08] text-slate-300"
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <TextSlider
                    label="Position X"
                    value={posX}
                    min={-50}
                    max={50}
                    unit="%"
                    onChange={setPosX}
                  />
                  <TextSlider
                    label="Position Y"
                    value={posY}
                    min={-50}
                    max={50}
                    unit="%"
                    onChange={setPosY}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <TextSlider
                    label="Scale"
                    value={scale}
                    min={15}
                    max={400}
                    inputMin={10}
                    inputMax={600}
                    unit="%"
                    onChange={setScale}
                  />
                  <TextSlider
                    label="Rotation"
                    value={rotation}
                    min={-180}
                    max={180}
                    unit="°"
                    onChange={setRotation}
                  />
                  <TextSlider
                    label="Opacity"
                    value={opacity}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={setOpacity}
                  />
                </div>
                {onRescaleAllText && (
                  <button
                    type="button"
                    onClick={() => onRescaleAllText(scale, config.fontSize)}
                    className="glow-btn w-full py-1.5 px-2.5 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-sky-400/25 text-[11px] font-medium text-sky-200"
                    title="Apply this Scale % and Font Size to all text overlays on timeline"
                  >
                    Rescale All Text Overlays ({Math.round(scale)}% · {Math.round(config.fontSize)}px)
                  </button>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Typography, Colors, Outline, Backdrop, Glow & Animations */}
            <div className="space-y-4">
              {/* Typography */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Typography &amp; Language Script
                  </span>
                  <button
                    type="button"
                    onClick={onOpenAutoFonts}
                    className="text-[11px] text-sky-300 hover:text-sky-200 font-medium flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Famous Fonts</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Font Family</label>
                    <select
                      value={config.fontFamily}
                      onChange={(e) => setConfig({ ...config, fontFamily: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    >
                      {customFonts.map((f) => (
                        <option key={f.id} value={f.family}>
                          {f.family}
                        </option>
                      ))}
                      {BUILTIN_FONT_FAMILIES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Font Weight</label>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                      {([500, 600, 700] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setConfig({ ...config, fontWeight: w })}
                          className={`glow-btn py-1 text-[11px] font-mono rounded ${
                            config.fontWeight === w ? 'bg-[#1A2130] text-white' : 'text-slate-400'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Text Align</label>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                      {(['left', 'center', 'right'] as const).map((al) => {
                        const Icon =
                          al === 'left' ? AlignLeft : al === 'right' ? AlignRight : AlignCenter;
                        return (
                          <button
                            key={al}
                            type="button"
                            onClick={() => setConfig({ ...config, align: al })}
                            className={`glow-btn py-1 rounded flex items-center justify-center ${
                              config.align === al ? 'bg-[#1A2130] text-white' : 'text-slate-400'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">
                      Direction (Auto / LTR / RTL)
                    </label>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                      {(['auto', 'ltr', 'rtl'] as const).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => setConfig({ ...config, textDirection: dir })}
                          className={`glow-btn py-1 text-[10px] rounded uppercase font-mono ${
                            (config.textDirection ?? 'auto') === dir
                              ? 'bg-[#1A2130] text-white'
                              : 'text-slate-400'
                          }`}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <TextSlider
                  label="Font Size"
                  value={config.fontSize}
                  min={8}
                  max={300}
                  inputMin={4}
                  inputMax={600}
                  unit="px"
                  onChange={(v) => setConfig({ ...config, fontSize: v })}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(config.captionUppercase)}
                      onChange={(e) =>
                        setConfig({ ...config, captionUppercase: e.target.checked })
                      }
                      className="accent-sky-400 rounded"
                    />
                    <span>ALL CAPS</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.hasScrim}
                      onChange={(e) => setConfig({ ...config, hasScrim: e.target.checked })}
                      className="accent-sky-400 rounded"
                    />
                    <span>Backdrop Scrim Box</span>
                  </label>
                </div>
              </div>

              {/* Colors, Outline, Backdrop & Glow */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="text-xs font-semibold text-slate-200">
                  Color, Outline, Backdrop &amp; Glow
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Text Color</span>
                    <input
                      type="color"
                      value={config.color}
                      onChange={(e) => setConfig({ ...config, color: e.target.value })}
                      className="w-full h-8 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Outline Color</span>
                    <input
                      type="color"
                      value={config.captionOutlineColor ?? '#050608'}
                      onChange={(e) =>
                        setConfig({ ...config, captionOutlineColor: e.target.value })
                      }
                      className="w-full h-8 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Glow Color</span>
                    <input
                      type="color"
                      value={glowColor}
                      onChange={(e) => setGlowColor(e.target.value)}
                      className="w-full h-8 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {TEXT_SWATCHES.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() => setConfig({ ...config, color: sw })}
                      style={{ backgroundColor: sw }}
                      className="w-4 h-4 rounded-full border border-white/25 hover:scale-110 transition-transform"
                      title={`Text Color ${sw}`}
                    />
                  ))}
                  <span className="text-[10px] text-slate-500 mx-1">|</span>
                  {GLOW_COLOR_SWATCHES.map((sw) => (
                    <button
                      key={`g-${sw}`}
                      type="button"
                      onClick={() => {
                        setGlowColor(sw);
                        if (glowIntensity === 0) setGlowIntensity(45);
                      }}
                      style={{ backgroundColor: sw }}
                      className="w-4 h-4 rounded-sm border border-white/25 hover:scale-110 transition-transform"
                      title={`Glow ${sw}`}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <TextSlider
                    label="Outline Thickness"
                    value={outlinePx}
                    min={0}
                    max={14}
                    unit="px"
                    onChange={(v) => setConfig({ ...config, captionOutlineWidth: v })}
                  />
                  <TextSlider
                    label="Neon Glow Intensity"
                    value={glowIntensity}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={setGlowIntensity}
                  />
                </div>

                {config.hasScrim && (
                  <div className="flex items-center gap-3 pt-1 border-t border-white/[0.06]">
                    <input
                      type="color"
                      value={config.captionBgColor ?? '#090B10'}
                      onChange={(e) => setConfig({ ...config, captionBgColor: e.target.value })}
                      className="w-8 h-7 rounded bg-transparent border border-white/[0.1] p-0.5 cursor-pointer shrink-0"
                      title="Backdrop box color"
                    />
                    <div className="flex-1">
                      <TextSlider
                        label="Backdrop Box Opacity"
                        value={config.scrimOpacity}
                        min={10}
                        max={95}
                        unit="%"
                        onChange={(v) => setConfig({ ...config, scrimOpacity: v })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Animations */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-2.5">
                <div className="text-xs font-semibold text-slate-200">
                  Entrance, Exit &amp; Loop Animations
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Title Motion</label>
                    <select
                      value={config.animation}
                      onChange={(e) =>
                        setConfig({ ...config, animation: e.target.value as TextAnimation })
                      }
                      className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade</option>
                      <option value="slide-up">Slide Up</option>
                      <option value="scale">Scale Pop</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Combo Loop FX</label>
                    <select
                      value={animationCombo}
                      onChange={(e) => setAnimationCombo(e.target.value as ClipAnimationPreset)}
                      className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    >
                      <option value="none">None</option>
                      {comboPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">In Animation</label>
                    <select
                      value={animationIn}
                      onChange={(e) => setAnimationIn(e.target.value as ClipAnimationPreset)}
                      className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    >
                      <option value="none">None</option>
                      {inPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Out Animation</label>
                    <select
                      value={animationOut}
                      onChange={(e) => setAnimationOut(e.target.value as ClipAnimationPreset)}
                      className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    >
                      <option value="none">None</option>
                      {outPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(animationIn !== 'none' || animationOut !== 'none') && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <TextSlider
                      label="In Speed"
                      value={animationInDuration}
                      min={0.1}
                      max={3}
                      step={0.05}
                      unit="s"
                      onChange={setAnimationInDuration}
                    />
                    <TextSlider
                      label="Out Speed"
                      value={animationOutDuration}
                      min={0.1}
                      max={3}
                      step={0.05}
                      unit="s"
                      onChange={setAnimationOutDuration}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/[0.08] bg-[#0B0E16] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="glow-btn px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#141822] border border-white/[0.08] rounded-lg"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {hasSelectedTitle && selectedTextClip && (
              <button
                type="button"
                onClick={() => {
                  onUpdateSelectedTextClip(selectedTextClip.id, {
                    name: clipName.trim() || selectedTextClip.name,
                    startTime,
                    duration,
                    x: posX,
                    y: posY,
                    scale,
                    rotation,
                    opacity,
                    fadeIn,
                    fadeOut,
                    glowColor,
                    glowIntensity,
                    animationIn,
                    animationInDuration,
                    animationOut,
                    animationOutDuration,
                    animationCombo,
                    textConfig: { ...config },
                  });
                  onClose();
                }}
                className="glow-btn flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 rounded-lg"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Update Selected Text</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onInsertAdvancedText({
                  name: clipName.trim() || 'Title Overlay',
                  config: { ...config, text: config.text || 'Title Overlay' },
                  startTime,
                  duration,
                  x: posX,
                  y: posY,
                  scale,
                  rotation,
                  opacity,
                  fadeIn,
                  fadeOut,
                  glowColor,
                  glowIntensity,
                  animationIn,
                  animationInDuration,
                  animationOut,
                  animationOutDuration,
                  animationCombo,
                  preferredTrackId: preferredTrack === 'auto' ? undefined : preferredTrack,
                });
                onClose();
              }}
              className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Insert Text on Timeline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
