import { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Copy,
  Download,
  Film,
  Frame,
  Image as ImageIcon,
  Layers,
  Music,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Sliders,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { BUILTIN_MOTION_ASSETS } from '../data/sampleProject';
import {
  ANIMATION_PRESETS,
  ASPECT_RATIO_DIMENSIONS,
  AspectRatio,
  BUILTIN_FONT_FAMILIES,
  CAPTION_STYLE_PRESETS,
  CaptionPositionPreset,
  CaptionStylePreset,
  ClipAnimationPreset,
  ContextPropertiesTarget,
  CustomFont,
  CustomMaskItem,
  FILTER_PRESET_VALUES,
  FilterPreset,
  FRAME_PRESETS,
  FramePreset,
  GLOW_COLOR_SWATCHES,
  isAudioTrack,
  isTitleTrack,
  isVisualTrack,
  KenBurnsPreset,
  MASK_PRESETS,
  MaskShape,
  MediaAsset,
  TextAnimation,
  TextConfig,
  TimelineClip,
  ToolContextId,
  TransitionPreset,
  TransitionType,
  VISUAL_EFFECT_PRESETS,
  VisualEffectPreset,
} from '../types/editor';
import { applyCaptionPresetToTextConfig, getYForCaptionPosition } from '../utils/captions';
import {
  makeAnimationStorageKey,
  makeFrameStorageKey,
  makeFxStorageKey,
  makeMaskStorageKey,
} from '../utils/effectsStorage';
import { downloadCustomMaskPng } from '../utils/maskStorage';
import { TRANSITIONS_CATALOG } from '../utils/transitionsStorage';
import { clamp, formatShortTime } from '../utils/time';

interface PropertiesModalProps {
  target: ContextPropertiesTarget | null;
  onClose: () => void;
  assets: MediaAsset[];
  clips: TimelineClip[];
  selectedClips: TimelineClip[];
  customFonts: CustomFont[];
  customMasks: CustomMaskItem[];
  downloadedTransitionIds: TransitionType[];
  downloadedEffectKeys: string[];
  aspectRatio: AspectRatio;
  fps: 24 | 30 | 60;
  projectName: string;
  currentTime: number;
  totalDuration: number;
  snapEnabled: boolean;
  timelineZoom: number;
  isPlaying: boolean;
  isMuted: boolean;
  previewVolume: number;
  previewScale: 'auto' | 'half';
  hasSavedOnce: boolean;
  savedFileName: string | null;
  onUpdateAsset: (assetId: string, patch: Partial<MediaAsset>) => void;
  onSyncAssetToClips: (assetId: string, asset: MediaAsset) => void;
  onAddAssetToTimeline: (asset: MediaAsset) => void;
  onDeleteAsset: (assetId: string) => void;
  onUpdateClip: (id: string, patch: Partial<TimelineClip>, recordHistory?: boolean) => void;
  onDuplicateClip: (id: string) => void;
  onSplitAtPlayhead: (splitAnyIfUnselected?: boolean) => void;
  onDeleteClip: (id: string) => void;
  onApplyEffectWithSettings: (
    fxId: VisualEffectPreset,
    intensity: number,
    glowColor: string,
    glowIntensity: number
  ) => void;
  onApplyFrameWithSettings: (frameId: FramePreset, color: string, thickness: number) => void;
  onApplyMaskWithSettings: (
    maskShape: MaskShape,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    feather: number,
    invert: boolean,
    customMask?: CustomMaskItem
  ) => void;
  onApplyTransitionWithSettings: (
    transitionId: TransitionType,
    edge: 'in' | 'out' | 'both',
    duration: number
  ) => void;
  onApplyAnimationWithSettings: (
    animationId: ClipAnimationPreset,
    duration: number,
    intensity: number
  ) => void;
  onDownloadEffectItem: (key: string, label: string) => Promise<void>;
  onDownloadTransition: (preset: TransitionPreset) => Promise<void>;
  onAddTitleTemplate: (
    name: string,
    config: TextConfig,
    x?: number,
    y?: number,
    duration?: number
  ) => void;
  defaultCaptionConfig: TextConfig;
  onChangeDefaultCaptionConfig: (patch: Partial<TextConfig>) => void;
  onApplyCaptionStyleToAll: (config: TextConfig) => void;
  onChangeAspectRatio: (ratio: AspectRatio) => void;
  onChangeFps: (fps: 24 | 30 | 60) => void;
  onChangeProjectName: (name: string) => void;
  onChangeSnapEnabled: (enabled: boolean) => void;
  onChangeTimelineZoom: (pps: number) => void;
  onChangePreviewVolume: (vol: number) => void;
  onTriggerToolAction: (toolId: ToolContextId) => void;
}

function PropSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  allowInput = false,
  inputMax,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  allowInput?: boolean;
  inputMax?: number;
  onChange: (v: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const effectiveMax = inputMax ?? max * 3;
  const formattedValue = step < 1 ? String(Number(value.toFixed(2))) : String(Math.round(value));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-slate-400">{label}</span>
        {allowInput ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={min}
              max={effectiveMax}
              step={step}
              value={isEditing ? draft : formattedValue}
              onFocus={(e) => {
                setIsEditing(true);
                setDraft(formattedValue);
                e.currentTarget.select();
              }}
              onChange={(e) => {
                const raw = e.target.value;
                setDraft(raw);
                const n = parseFloat(raw);
                if (Number.isFinite(n) && n >= min) {
                  onChange(clamp(n, min, effectiveMax));
                }
              }}
              onBlur={() => {
                const n = parseFloat(draft);
                if (Number.isFinite(n)) {
                  onChange(clamp(n, min, effectiveMax));
                }
                setIsEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                  e.currentTarget.blur();
                }
              }}
              className="w-16 px-1.5 py-0.5 text-right text-xs font-mono text-slate-100 bg-[#07090F] border border-white/[0.12] rounded focus:outline-none focus:border-sky-400"
            />
            {unit && <span className="font-mono text-[11px] text-slate-400">{unit}</span>}
          </div>
        ) : (
          <span className="font-mono text-slate-200">
            {step < 1 ? value.toFixed(2) : Math.round(value)}
            {unit}
          </span>
        )}
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

const TITLE_COLORS = ['#FFFFFF', '#F8FAFC', '#FDE68A', '#93C5FD', '#FCA5A5', '#111827'];

export function PropertiesModal({
  target,
  onClose,
  assets,
  clips,
  selectedClips,
  customFonts,
  customMasks,
  downloadedTransitionIds,
  downloadedEffectKeys,
  aspectRatio,
  fps,
  projectName,
  currentTime,
  totalDuration,
  snapEnabled,
  timelineZoom,
  isPlaying,
  isMuted,
  previewVolume,
  previewScale,
  hasSavedOnce,
  savedFileName,
  onUpdateAsset,
  onSyncAssetToClips,
  onAddAssetToTimeline,
  onDeleteAsset,
  onUpdateClip,
  onDuplicateClip,
  onSplitAtPlayhead,
  onDeleteClip,
  onApplyEffectWithSettings,
  onApplyFrameWithSettings,
  onApplyMaskWithSettings,
  onApplyTransitionWithSettings,
  onApplyAnimationWithSettings,
  onDownloadEffectItem,
  onDownloadTransition,
  onAddTitleTemplate,
  defaultCaptionConfig,
  onChangeDefaultCaptionConfig,
  onApplyCaptionStyleToAll,
  onChangeAspectRatio,
  onChangeFps,
  onChangeProjectName,
  onChangeSnapEnabled,
  onChangeTimelineZoom,
  onChangePreviewVolume,
  onTriggerToolAction,
}: PropertiesModalProps) {
  const [clipTab, setClipTab] = useState<'timing' | 'look' | 'overlay'>('timing');

  // Local editable state for tool presets before applying
  const [fxStrength, setFxStrength] = useState(75);
  const [fxGlowColor, setFxGlowColor] = useState('#38BDF8');
  const [fxGlowIntensity, setFxGlowIntensity] = useState(45);

  const [frameColor, setFrameColor] = useState('#22D3EE');
  const [frameSize, setFrameSize] = useState(50);

  const [maskCenterX, setMaskCenterX] = useState(0);
  const [maskCenterY, setMaskCenterY] = useState(0);
  const [maskWidth, setMaskWidth] = useState(68);
  const [maskHeight, setMaskHeight] = useState(68);
  const [maskFeather, setMaskFeather] = useState(4);
  const [maskInvert, setMaskInvert] = useState(false);

  const [animDuration, setAnimDuration] = useState(0.5);
  const [animIntensity, setAnimIntensity] = useState(75);

  const [transEdge, setTransEdge] = useState<'in' | 'out' | 'both'>('in');
  const [transDuration, setTransDuration] = useState(0.5);

  const [tplName, setTplName] = useState('Title');
  const [tplDuration, setTplDuration] = useState(3.0);
  const [tplConfig, setTplConfig] = useState<TextConfig | null>(null);

  useEffect(() => {
    if (!target) return;
    setClipTab('timing');

    if (target.kind === 'fx') {
      const info = VISUAL_EFFECT_PRESETS.find((x) => x.id === target.fxId);
      setFxStrength(75);
      setFxGlowColor(info?.defaultGlowColor ?? '#38BDF8');
      setFxGlowIntensity(info?.defaultGlowIntensity ?? 35);
    } else if (target.kind === 'frame') {
      const info = FRAME_PRESETS.find((f) => f.id === target.frameId);
      setFrameColor(info?.defaultColor ?? '#22D3EE');
      setFrameSize(50);
    } else if (target.kind === 'mask' || target.kind === 'custom-mask') {
      setMaskCenterX(0);
      setMaskCenterY(0);
      setMaskWidth(target.kind === 'custom-mask' ? 75 : 65);
      setMaskHeight(target.kind === 'custom-mask' ? 75 : 65);
      setMaskFeather(target.kind === 'custom-mask' ? 2 : 4);
      setMaskInvert(false);
    } else if (target.kind === 'animation') {
      const preset = ANIMATION_PRESETS.find((a) => a.id === target.animationId);
      setAnimDuration(preset?.defaultDuration ?? 0.5);
      setAnimIntensity(75);
    } else if (target.kind === 'transition') {
      const preset = TRANSITIONS_CATALOG.find((t) => t.id === target.transitionId);
      setTransEdge('in');
      setTransDuration(preset?.defaultDuration ?? 0.5);
    } else if (target.kind === 'title-template') {
      setTplName(target.name);
      setTplDuration(3.0);
      setTplConfig({ ...target.config });
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;

  const hasSelectedRenderable = selectedClips.some((c) => !isAudioTrack(c.track));
  const hasSelectedVisual = selectedClips.some((c) => isVisualTrack(c.track));
  const installedEffectSet = new Set(downloadedEffectKeys);
  const installedTransSet = new Set(downloadedTransitionIds);
  const allAssetsPool = [...assets, ...BUILTIN_MOTION_ASSETS];

  // Resolve active entities
  const assetEntity =
    target.kind === 'asset' ? allAssetsPool.find((a) => a.id === target.assetId) ?? null : null;
  const clipEntity =
    target.kind === 'clip' ? clips.find((c) => c.id === target.clipId) ?? null : null;

  let headerTitle = 'Properties & Settings';
  let headerSubtitle = 'Configure parameters';
  let headerIcon = <Sliders className="w-4 h-4 text-sky-300" />;

  if (target.kind === 'asset' && assetEntity) {
    headerTitle = assetEntity.name;
    headerSubtitle = `${assetEntity.type.toUpperCase()} File Properties${
      assetEntity.width && assetEntity.height
        ? ` · ${assetEntity.width}×${assetEntity.height}`
        : ''
    }`;
    headerIcon =
      assetEntity.type === 'video' ? (
        <Film className="w-4 h-4 text-sky-400" />
      ) : assetEntity.type === 'audio' ? (
        <Music className="w-4 h-4 text-emerald-400" />
      ) : assetEntity.type === 'motion' ? (
        <Sparkles className="w-4 h-4 text-violet-400" />
      ) : (
        <ImageIcon className="w-4 h-4 text-amber-400" />
      );
  } else if (target.kind === 'clip' && clipEntity) {
    headerTitle = clipEntity.name;
    headerSubtitle = `${clipEntity.track} Clip Properties · ${formatShortTime(
      clipEntity.startTime
    )} → ${formatShortTime(clipEntity.startTime + clipEntity.duration)}`;
    headerIcon =
      isTitleTrack(clipEntity.track) ? (
        clipEntity.stickerConfig ? (
          <Smile className="w-4 h-4 text-fuchsia-300" />
        ) : (
          <Type className="w-4 h-4 text-violet-300" />
        )
      ) : isAudioTrack(clipEntity.track) ? (
        <Music className="w-4 h-4 text-emerald-400" />
      ) : (
        <Film className="w-4 h-4 text-sky-400" />
      );
  } else if (target.kind === 'fx') {
    const info = VISUAL_EFFECT_PRESETS.find((x) => x.id === target.fxId);
    headerTitle = info?.label ?? target.fxId;
    headerSubtitle = `${info?.category ?? 'FX'} Effect Tool Properties`;
    headerIcon = <Sparkles className="w-4 h-4 text-sky-300" />;
  } else if (target.kind === 'frame') {
    const info = FRAME_PRESETS.find((f) => f.id === target.frameId);
    headerTitle = info?.label ?? target.frameId;
    headerSubtitle = 'Frame Overlay Tool Properties';
    headerIcon = <Frame className="w-4 h-4 text-cyan-300" />;
  } else if (target.kind === 'mask') {
    const info = MASK_PRESETS.find((m) => m.id === target.maskShape);
    headerTitle = info?.label ?? target.maskShape;
    headerSubtitle = 'Video Mask Tool Properties';
    headerIcon = <Layers className="w-4 h-4 text-purple-300" />;
  } else if (target.kind === 'custom-mask') {
    const cm = customMasks.find((m) => m.id === target.customMaskId);
    headerTitle = cm?.name ?? 'Custom PNG Mask';
    headerSubtitle = 'Custom Mask Properties';
    headerIcon = <Layers className="w-4 h-4 text-sky-300" />;
  } else if (target.kind === 'animation') {
    const an = ANIMATION_PRESETS.find((a) => a.id === target.animationId);
    headerTitle = an?.label ?? target.animationId;
    headerSubtitle = `${an?.category ?? 'Motion'} Animation Properties`;
    headerIcon = <Zap className="w-4 h-4 text-sky-300" />;
  } else if (target.kind === 'transition') {
    const tr = TRANSITIONS_CATALOG.find((t) => t.id === target.transitionId);
    headerTitle = tr?.label ?? target.transitionId;
    headerSubtitle = `${tr?.category ?? 'Transition'} Tool Properties`;
    headerIcon = <Sparkles className="w-4 h-4 text-amber-300" />;
  } else if (target.kind === 'title-template') {
    headerTitle = target.name;
    headerSubtitle = 'Title Template Properties';
    headerIcon = <Type className="w-4 h-4 text-sky-300" />;
  } else if (target.kind === 'tool') {
    headerTitle = target.title;
    headerSubtitle = target.shortcut ? `Tool Settings · Shortcut: ${target.shortcut}` : 'Tool Settings';
    headerIcon = <Wrench className="w-4 h-4 text-sky-300" />;
  }

  const availableTransitions = TRANSITIONS_CATALOG.filter(
    (t) => t.builtIn || installedTransSet.has(t.id)
  );
  const availableEffects = VISUAL_EFFECT_PRESETS.filter(
    (e) => e.builtIn || installedEffectSet.has(makeFxStorageKey(e.id))
  );
  const availableFrames = FRAME_PRESETS.filter(
    (f) => f.builtIn || installedEffectSet.has(makeFrameStorageKey(f.id))
  );
  const availableMasks = MASK_PRESETS.filter(
    (m) => m.builtIn || installedEffectSet.has(makeMaskStorageKey(m.id))
  );
  const availableAnimations = ANIMATION_PRESETS.filter(
    (a) => a.builtIn || installedEffectSet.has(makeAnimationStorageKey(a.id))
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl max-h-[88vh] studio-panel border border-white/[0.14] rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.9),0_0_40px_rgba(56,189,248,0.16)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 bg-[#0D111A]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-white/[0.14] flex items-center justify-center shrink-0">
              {headerIcon}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold text-white truncate">
                {headerTitle}
              </h2>
              <p className="text-[11px] text-slate-400 truncate font-mono">{headerSubtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-lg border border-transparent shrink-0"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-4">
          {/* 1. MEDIA FILE / ASSET PROPERTIES */}
          {target.kind === 'asset' && assetEntity && (() => {
            const matchingClipCount = clips.filter((c) => c.assetId === assetEntity.id).length;
            const isVisualAsset = assetEntity.type !== 'audio';
            const isMotionSample = assetEntity.type === 'motion';

            return (
              <div className="space-y-4">
                {/* Preview & Info */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#090C13] border border-white/[0.08]">
                  <div className="w-16 h-11 rounded bg-[#07090F] border border-white/[0.1] overflow-hidden flex items-center justify-center shrink-0">
                    {assetEntity.thumbnailUrl ? (
                      <img
                        src={assetEntity.thumbnailUrl}
                        alt={assetEntity.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      headerIcon
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      type="text"
                      value={assetEntity.name}
                      disabled={isMotionSample}
                      onChange={(e) => onUpdateAsset(assetEntity.id, { name: e.target.value })}
                      className="w-full px-2.5 py-1 text-xs font-medium text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-md focus:outline-none focus:border-sky-400 disabled:opacity-60"
                      placeholder="File name"
                    />
                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                      <span className="capitalize">{assetEntity.type}</span>
                      <span>·</span>
                      <span>{matchingClipCount} on timeline</span>
                    </div>
                  </div>
                </div>

                {/* Duration & Core Defaults */}
                <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3.5">
                  <div className="text-xs font-semibold text-sky-200 flex items-center justify-between">
                    <span>Duration & Timing Defaults</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {assetEntity.duration.toFixed(2)}s
                    </span>
                  </div>

                  <PropSlider
                    label={
                      assetEntity.type === 'image'
                        ? 'Image Display Duration'
                        : assetEntity.type === 'motion'
                        ? 'Motion Backdrop Duration'
                        : 'Clip Default Duration'
                    }
                    value={assetEntity.duration}
                    min={0.1}
                    max={60}
                    inputMax={3600}
                    step={0.1}
                    unit="s"
                    allowInput
                    onChange={(val) => onUpdateAsset(assetEntity.id, { duration: val })}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <PropSlider
                      label="Default Fade In"
                      value={
                        assetEntity.defaultFadeIn ??
                        (assetEntity.type === 'image' || assetEntity.type === 'motion' ? 0.35 : 0.15)
                      }
                      min={0}
                      max={3}
                      step={0.05}
                      unit="s"
                      onChange={(val) => onUpdateAsset(assetEntity.id, { defaultFadeIn: val })}
                    />
                    <PropSlider
                      label="Default Fade Out"
                      value={
                        assetEntity.defaultFadeOut ??
                        (assetEntity.type === 'image' || assetEntity.type === 'motion' ? 0.35 : 0.15)
                      }
                      min={0}
                      max={3}
                      step={0.05}
                      unit="s"
                      onChange={(val) => onUpdateAsset(assetEntity.id, { defaultFadeOut: val })}
                    />
                  </div>
                </div>

                {/* Visual Defaults (Image / Video / Motion) */}
                {isVisualAsset && (
                  <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3.5">
                    <div className="text-xs font-semibold text-slate-200">
                      Visual, Motion & Look Settings
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <PropSlider
                        label="Scale"
                        value={assetEntity.defaultScale ?? 100}
                        min={10}
                        max={300}
                        unit="%"
                        allowInput
                        onChange={(val) => onUpdateAsset(assetEntity.id, { defaultScale: val })}
                      />
                      <PropSlider
                        label="Opacity"
                        value={assetEntity.defaultOpacity ?? 100}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={(val) => onUpdateAsset(assetEntity.id, { defaultOpacity: val })}
                      />
                    </div>
                    <PropSlider
                      label="Rotation"
                      value={assetEntity.defaultRotation ?? 0}
                      min={-180}
                      max={180}
                      unit="°"
                      onChange={(val) => onUpdateAsset(assetEntity.id, { defaultRotation: val })}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs text-slate-400">Ken Burns Camera</label>
                        <select
                          value={
                            assetEntity.defaultKenBurns ??
                            (assetEntity.type === 'image' ? 'zoom-in' : 'none')
                          }
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, {
                              defaultKenBurns: e.target.value as KenBurnsPreset,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                        >
                          <option value="none">Static</option>
                          <option value="zoom-in">Slow Zoom In</option>
                          <option value="zoom-out">Slow Zoom Out</option>
                          <option value="pan-left">Pan Left</option>
                          <option value="pan-right">Pan Right</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs text-slate-400">Color Grade</label>
                        <select
                          value={assetEntity.defaultFilterPreset ?? 'neutral'}
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, {
                              defaultFilterPreset: e.target.value as FilterPreset,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                        >
                          {(Object.keys(FILTER_PRESET_VALUES) as FilterPreset[]).map((k) => (
                            <option key={k} value={k}>
                              {FILTER_PRESET_VALUES[k].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs text-slate-400">Default Effect</label>
                        <select
                          value={assetEntity.defaultFxPreset ?? 'none'}
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, {
                              defaultFxPreset: e.target.value as VisualEffectPreset,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                        >
                          {availableEffects.map((fx) => (
                            <option key={fx.id} value={fx.id}>
                              {fx.id === 'none' ? 'Clean (None)' : fx.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs text-slate-400">Default Frame</label>
                        <select
                          value={assetEntity.defaultFramePreset ?? 'none'}
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, {
                              defaultFramePreset: e.target.value as FramePreset,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                        >
                          {availableFrames.map((fr) => (
                            <option key={fr.id} value={fr.id}>
                              {fr.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] text-slate-400">Anim In</label>
                        <select
                          value={assetEntity.defaultAnimationIn ?? 'none'}
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, {
                              defaultAnimationIn: e.target.value as ClipAnimationPreset,
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                        >
                          <option value="none">None</option>
                          {availableAnimations
                            .filter((a) => a.category === 'In')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] text-slate-400">Anim Out</label>
                        <select
                          value={assetEntity.defaultAnimationOut ?? 'none'}
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, {
                              defaultAnimationOut: e.target.value as ClipAnimationPreset,
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                        >
                          <option value="none">None</option>
                          {availableAnimations
                            .filter((a) => a.category === 'Out')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] text-slate-400">Anim Loop</label>
                        <select
                          value={assetEntity.defaultAnimationCombo ?? 'none'}
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, {
                              defaultAnimationCombo: e.target.value as ClipAnimationPreset,
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                        >
                          <option value="none">None</option>
                          {availableAnimations
                            .filter((a) => a.category === 'Combo')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Audio Defaults */}
                {(assetEntity.type === 'audio' || assetEntity.type === 'video') && (
                  <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">Audio Defaults</span>
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(assetEntity.defaultMuted)}
                          onChange={(e) =>
                            onUpdateAsset(assetEntity.id, { defaultMuted: e.target.checked })
                          }
                          className="accent-sky-400 rounded"
                        />
                        <span>Mute by default</span>
                      </label>
                    </div>
                    <PropSlider
                      label="Default Volume"
                      value={assetEntity.defaultVolume ?? 100}
                      min={0}
                      max={200}
                      unit="%"
                      onChange={(val) => onUpdateAsset(assetEntity.id, { defaultVolume: val })}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {!isMotionSample ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteAsset(assetEntity.id);
                        onClose();
                      }}
                      className="glow-btn flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-300 hover:text-white bg-rose-500/10 border border-rose-500/25 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove File</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-2">
                    {matchingClipCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onSyncAssetToClips(assetEntity.id, assetEntity)}
                        className="glow-btn flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-200 hover:text-white bg-[#141822] border border-sky-400/35 rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Apply to Timeline ({matchingClipCount})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onAddAssetToTimeline(assetEntity);
                        onClose();
                      }}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Timeline</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2. TIMELINE CLIP PROPERTIES */}
          {target.kind === 'clip' && clipEntity && (() => {
            const isTitle = isTitleTrack(clipEntity.track) && Boolean(clipEntity.textConfig);
            const isSticker = isTitleTrack(clipEntity.track) && Boolean(clipEntity.stickerConfig);
            const isVisual = isVisualTrack(clipEntity.track);
            const isAudio = isAudioTrack(clipEntity.track);
            const clipAsset = allAssetsPool.find((a) => a.id === clipEntity.assetId);
            const canSplitHere =
              currentTime > clipEntity.startTime + 0.1 &&
              currentTime < clipEntity.startTime + clipEntity.duration - 0.1;

            return (
              <div className="space-y-4">
                {/* Quick Clip Actions & Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setClipTab('timing')}
                      className={`glow-btn px-2.5 py-1 text-xs font-medium rounded-md border border-transparent ${
                        clipTab === 'timing' ? 'bg-[#1A2130] text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Timing & Transform
                    </button>
                    {!isAudio && (
                      <button
                        type="button"
                        onClick={() => setClipTab('look')}
                        className={`glow-btn px-2.5 py-1 text-xs font-medium rounded-md border border-transparent ${
                          clipTab === 'look' ? 'bg-[#1A2130] text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isTitle ? 'Text & Glow' : isSticker ? 'Sticker & Glow' : 'Color & FX'}
                      </button>
                    )}
                    {!isAudio && (
                      <button
                        type="button"
                        onClick={() => setClipTab('overlay')}
                        className={`glow-btn px-2.5 py-1 text-xs font-medium rounded-md border border-transparent ${
                          clipTab === 'overlay' ? 'bg-[#1A2130] text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Frames, Mask & Trans.
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {canSplitHere && (
                      <button
                        type="button"
                        onClick={() => {
                          onSplitAtPlayhead(false);
                          onClose();
                        }}
                        className="glow-btn p-1.5 rounded-md bg-[#141822] border border-white/[0.1] text-sky-300 hover:text-white"
                        title="Split clip at playhead"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onDuplicateClip(clipEntity.id);
                        onClose();
                      }}
                      className="glow-btn p-1.5 rounded-md bg-[#141822] border border-white/[0.1] text-slate-300 hover:text-white"
                      title="Duplicate clip"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateClip(clipEntity.id, {
                          scale: 100,
                          x: 0,
                          y: 0,
                          rotation: 0,
                          opacity: 100,
                          brightness: 100,
                          contrast: 100,
                          saturation: 100,
                          warmth: 0,
                          blur: 0,
                          vignette: 0,
                          filterPreset: 'neutral',
                          glowIntensity: 0,
                          fxPreset: 'none',
                          fxIntensity: 0,
                          framePreset: 'none',
                          maskShape: 'none',
                          animationIn: 'none',
                          animationOut: 'none',
                          animationCombo: 'none',
                          animationIntensity: 75,
                        })
                      }
                      className="glow-btn p-1.5 rounded-md bg-[#141822] border border-white/[0.1] text-slate-300 hover:text-white"
                      title="Reset clip settings"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteClip(clipEntity.id);
                        onClose();
                      }}
                      className="glow-btn p-1.5 rounded-md bg-rose-500/10 border border-rose-500/25 text-rose-300 hover:text-white"
                      title="Delete clip"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {clipTab === 'timing' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs text-slate-400">Clip Label</label>
                      <input
                        type="text"
                        value={clipEntity.name}
                        onChange={(e) => onUpdateClip(clipEntity.id, { name: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08]">
                      <PropSlider
                        label="Start Time"
                        value={clipEntity.startTime}
                        min={0}
                        max={Math.max(30, totalDuration + 10)}
                        step={0.05}
                        unit="s"
                        allowInput
                        onChange={(val) => onUpdateClip(clipEntity.id, { startTime: val })}
                      />
                      <PropSlider
                        label="Duration"
                        value={clipEntity.duration}
                        min={0.1}
                        max={60}
                        inputMax={3600}
                        step={0.1}
                        unit="s"
                        allowInput
                        onChange={(val) => onUpdateClip(clipEntity.id, { duration: val })}
                      />
                      <PropSlider
                        label="Fade In"
                        value={clipEntity.fadeIn}
                        min={0}
                        max={3}
                        step={0.05}
                        unit="s"
                        onChange={(val) => onUpdateClip(clipEntity.id, { fadeIn: val })}
                      />
                      <PropSlider
                        label="Fade Out"
                        value={clipEntity.fadeOut}
                        min={0}
                        max={3}
                        step={0.05}
                        unit="s"
                        onChange={(val) => onUpdateClip(clipEntity.id, { fadeOut: val })}
                      />
                    </div>

                    {!isAudio && (
                      <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <PropSlider
                            label="Position X"
                            value={clipEntity.x}
                            min={-100}
                            max={100}
                            unit="%"
                            allowInput
                            onChange={(val) => onUpdateClip(clipEntity.id, { x: val })}
                          />
                          <PropSlider
                            label="Position Y"
                            value={clipEntity.y}
                            min={-100}
                            max={100}
                            unit="%"
                            allowInput
                            onChange={(val) => onUpdateClip(clipEntity.id, { y: val })}
                          />
                          <PropSlider
                            label="Scale"
                            value={clipEntity.scale}
                            min={10}
                            max={500}
                            unit="%"
                            allowInput
                            onChange={(val) => onUpdateClip(clipEntity.id, { scale: val })}
                          />
                          <PropSlider
                            label="Opacity"
                            value={clipEntity.opacity}
                            min={0}
                            max={100}
                            unit="%"
                            onChange={(val) => onUpdateClip(clipEntity.id, { opacity: val })}
                          />
                        </div>
                        <PropSlider
                          label="Rotation"
                          value={clipEntity.rotation ?? 0}
                          min={-180}
                          max={180}
                          unit="°"
                          allowInput
                          onChange={(val) => onUpdateClip(clipEntity.id, { rotation: val })}
                        />
                        {isVisual && (
                          <div className="space-y-1">
                            <label className="block text-xs text-slate-400">Ken Burns Camera</label>
                            <select
                              value={clipEntity.kenBurns}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  kenBurns: e.target.value as KenBurnsPreset,
                                })
                              }
                              className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                            >
                              <option value="none">Static</option>
                              <option value="zoom-in">Slow Zoom In</option>
                              <option value="zoom-out">Slow Zoom Out</option>
                              <option value="pan-left">Pan Left</option>
                              <option value="pan-right">Pan Right</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {(isAudio || clipAsset?.type === 'video') && (
                      <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-200">Audio Settings</span>
                          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={clipEntity.muted}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, { muted: e.target.checked })
                              }
                              className="accent-sky-400 rounded"
                            />
                            <span>Mute</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <PropSlider
                            label="Volume"
                            value={clipEntity.volume}
                            min={0}
                            max={200}
                            unit="%"
                            onChange={(val) => onUpdateClip(clipEntity.id, { volume: val })}
                          />
                          <PropSlider
                            label="Speed"
                            value={clipEntity.speed}
                            min={0.25}
                            max={4}
                            step={0.05}
                            unit="x"
                            onChange={(val) => onUpdateClip(clipEntity.id, { speed: val })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {clipTab === 'look' && !isAudio && (
                  <div className="space-y-4">
                    {isSticker && clipEntity.stickerConfig && (
                      <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                        <div className="grid grid-cols-[1fr_80px] gap-2.5">
                          <input
                            type="text"
                            value={clipEntity.stickerConfig.label}
                            onChange={(e) => {
                              const nextLabel = e.target.value;
                              onUpdateClip(clipEntity.id, {
                                name: nextLabel || 'Sticker',
                                stickerConfig: {
                                  ...clipEntity.stickerConfig!,
                                  label: nextLabel,
                                },
                              });
                            }}
                            placeholder="Sticker label"
                            className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-fuchsia-400"
                          />
                          <input
                            type="text"
                            value={clipEntity.stickerConfig.emoji ?? ''}
                            onChange={(e) =>
                              onUpdateClip(clipEntity.id, {
                                stickerConfig: {
                                  ...clipEntity.stickerConfig!,
                                  emoji: e.target.value,
                                },
                              })
                            }
                            placeholder="Emoji"
                            className="w-full px-2.5 py-1.5 text-xs text-center text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-fuchsia-400"
                          />
                        </div>
                        <PropSlider
                          label="Sticker Size"
                          value={clipEntity.stickerConfig.size}
                          min={24}
                          max={360}
                          unit="px"
                          allowInput
                          onChange={(val) =>
                            onUpdateClip(clipEntity.id, {
                              stickerConfig: { ...clipEntity.stickerConfig!, size: val },
                            })
                          }
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <label className="space-y-1">
                            <span className="block text-[10px] text-slate-400">Primary</span>
                            <input
                              type="color"
                              value={clipEntity.stickerConfig.primaryColor}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  stickerConfig: {
                                    ...clipEntity.stickerConfig!,
                                    primaryColor: e.target.value,
                                  },
                                })
                              }
                              className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="block text-[10px] text-slate-400">Accent</span>
                            <input
                              type="color"
                              value={clipEntity.stickerConfig.accentColor}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  stickerConfig: {
                                    ...clipEntity.stickerConfig!,
                                    accentColor: e.target.value,
                                  },
                                })
                              }
                              className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="block text-[10px] text-slate-400">Text</span>
                            <input
                              type="color"
                              value={clipEntity.stickerConfig.textColor}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  stickerConfig: {
                                    ...clipEntity.stickerConfig!,
                                    textColor: e.target.value,
                                  },
                                })
                              }
                              className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                            />
                          </label>
                        </div>
                        <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                          <span>Show Badge Card</span>
                          <input
                            type="checkbox"
                            checked={clipEntity.stickerConfig.showBadgeBg}
                            onChange={(e) =>
                              onUpdateClip(clipEntity.id, {
                                stickerConfig: {
                                  ...clipEntity.stickerConfig!,
                                  showBadgeBg: e.target.checked,
                                },
                              })
                            }
                            className="accent-fuchsia-400 rounded"
                          />
                        </label>
                      </div>
                    )}

                    {isTitle && clipEntity.textConfig && (
                      <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                        <textarea
                          rows={2}
                          value={clipEntity.textConfig.text}
                          onChange={(e) =>
                            onUpdateClip(clipEntity.id, {
                              textConfig: { ...clipEntity.textConfig!, text: e.target.value },
                              name: e.target.value.split('\n')[0] || 'Title Overlay',
                            })
                          }
                          className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg resize-none focus:outline-none focus:border-sky-400"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <select
                            value={clipEntity.textConfig.fontFamily}
                            onChange={(e) =>
                              onUpdateClip(clipEntity.id, {
                                textConfig: { ...clipEntity.textConfig!, fontFamily: e.target.value },
                              })
                            }
                            className="px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
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
                          <div className="flex items-center gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06] justify-around">
                            {(['left', 'center', 'right'] as const).map((al) => (
                              <button
                                key={al}
                                type="button"
                                onClick={() =>
                                  onUpdateClip(clipEntity.id, {
                                    textConfig: { ...clipEntity.textConfig!, align: al },
                                  })
                                }
                                className={`glow-btn p-1 rounded border border-transparent ${
                                  clipEntity.textConfig!.align === al
                                    ? 'bg-[#1A2130] text-white'
                                    : 'text-slate-400'
                                }`}
                              >
                                {al === 'left' ? (
                                  <AlignLeft className="w-3.5 h-3.5" />
                                ) : al === 'center' ? (
                                  <AlignCenter className="w-3.5 h-3.5" />
                                ) : (
                                  <AlignRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                        <PropSlider
                          label="Font Size"
                          value={clipEntity.textConfig.fontSize}
                          min={8}
                          max={400}
                          unit="px"
                          allowInput
                          onChange={(val) =>
                            onUpdateClip(clipEntity.id, {
                              textConfig: { ...clipEntity.textConfig!, fontSize: val },
                            })
                          }
                        />
                        <PropSlider
                          label="Scale"
                          value={clipEntity.scale}
                          min={15}
                          max={400}
                          unit="%"
                          allowInput
                          onChange={(val) => onUpdateClip(clipEntity.id, { scale: val })}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5">
                            {TITLE_COLORS.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() =>
                                  onUpdateClip(clipEntity.id, {
                                    textConfig: { ...clipEntity.textConfig!, color: hex },
                                  })
                                }
                                className={`w-5 h-5 rounded-full border ${
                                  clipEntity.textConfig!.color.toUpperCase() === hex
                                    ? 'border-sky-400 scale-110'
                                    : 'border-white/20'
                                }`}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                            <input
                              type="color"
                              value={clipEntity.textConfig.color}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  textConfig: { ...clipEntity.textConfig!, color: e.target.value },
                                })
                              }
                              className="w-5 h-5 bg-transparent border-0 p-0 cursor-pointer"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={clipEntity.textConfig.hasScrim}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  textConfig: { ...clipEntity.textConfig!, hasScrim: e.target.checked },
                                })
                              }
                              className="accent-sky-400 rounded"
                            />
                            <span>Scrim</span>
                          </label>
                        </div>

                        <div className="pt-2.5 border-t border-white/[0.08] space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-sky-200">
                              Caption & Subtitle Settings
                            </span>
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(clipEntity.textConfig.isCaption)}
                                onChange={(e) =>
                                  onUpdateClip(clipEntity.id, {
                                    textConfig: {
                                      ...clipEntity.textConfig!,
                                      isCaption: e.target.checked,
                                    },
                                  })
                                }
                                className="accent-sky-400 rounded"
                              />
                              <span>Caption Mode</span>
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={clipEntity.textConfig.captionStyle ?? 'classic-sub'}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  textConfig: applyCaptionPresetToTextConfig(
                                    clipEntity.textConfig!,
                                    e.target.value as CaptionStylePreset
                                  ),
                                })
                              }
                              className="px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                            >
                              {CAPTION_STYLE_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>

                            <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                              {(['bottom', 'center', 'top'] as CaptionPositionPreset[]).map((pos) => (
                                <button
                                  key={pos}
                                  type="button"
                                  onClick={() => {
                                    const margin = clipEntity.textConfig?.captionSafeMargin ?? 10;
                                    onUpdateClip(clipEntity.id, {
                                      x: 0,
                                      y: getYForCaptionPosition(pos, margin),
                                      textConfig: {
                                        ...clipEntity.textConfig!,
                                        isCaption: true,
                                        captionPosition: pos,
                                      },
                                    });
                                  }}
                                  className={`glow-btn py-1 text-[10px] rounded capitalize ${
                                    (clipEntity.textConfig?.captionPosition ?? 'bottom') === pos
                                      ? 'bg-[#1A2130] text-white'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {pos}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <PropSlider
                              label="Outline Width"
                              value={clipEntity.textConfig.captionOutlineWidth ?? 0}
                              min={0}
                              max={14}
                              unit="px"
                              onChange={(val) =>
                                onUpdateClip(clipEntity.id, {
                                  textConfig: {
                                    ...clipEntity.textConfig!,
                                    captionOutlineWidth: val,
                                  },
                                })
                              }
                            />
                            <PropSlider
                              label="Safe Margin"
                              value={clipEntity.textConfig.captionSafeMargin ?? 10}
                              min={4}
                              max={24}
                              unit="%"
                              onChange={(val) => {
                                const pos = clipEntity.textConfig?.captionPosition ?? 'bottom';
                                onUpdateClip(clipEntity.id, {
                                  y: getYForCaptionPosition(pos, val),
                                  textConfig: {
                                    ...clipEntity.textConfig!,
                                    captionSafeMargin: val,
                                  },
                                });
                              }}
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(clipEntity.textConfig.captionWordHighlight)}
                                onChange={(e) =>
                                  onUpdateClip(clipEntity.id, {
                                    textConfig: {
                                      ...clipEntity.textConfig!,
                                      captionWordHighlight: e.target.checked,
                                    },
                                  })
                                }
                                className="accent-sky-400 rounded"
                              />
                              <span>Word Highlight</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(clipEntity.textConfig.captionUppercase)}
                                onChange={(e) =>
                                  onUpdateClip(clipEntity.id, {
                                    textConfig: {
                                      ...clipEntity.textConfig!,
                                      captionUppercase: e.target.checked,
                                    },
                                  })
                                }
                                className="accent-sky-400 rounded"
                              />
                              <span>ALL CAPS</span>
                            </label>
                            <input
                              type="color"
                              title="Word highlight color"
                              value={clipEntity.textConfig.captionHighlightColor ?? '#FACC15'}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, {
                                  textConfig: {
                                    ...clipEntity.textConfig!,
                                    captionHighlightColor: e.target.value,
                                  },
                                })
                              }
                              className="w-6 h-6 bg-transparent border-0 p-0 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Glow & Visual FX */}
                    <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                      <div className="text-xs font-semibold text-slate-200">Glow & Visual FX</div>
                      <div className="flex items-center gap-2">
                        {GLOW_COLOR_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() =>
                              onUpdateClip(clipEntity.id, {
                                glowColor: hex,
                                glowIntensity: Math.max(45, clipEntity.glowIntensity ?? 0),
                              })
                            }
                            className={`w-6 h-6 rounded-full border ${
                              (clipEntity.glowColor ?? '#38BDF8').toUpperCase() === hex
                                ? 'border-white scale-110'
                                : 'border-white/20'
                            }`}
                            style={{ backgroundColor: hex, boxShadow: `0 0 10px ${hex}88` }}
                          />
                        ))}
                        <input
                          type="color"
                          value={clipEntity.glowColor ?? '#38BDF8'}
                          onChange={(e) =>
                            onUpdateClip(clipEntity.id, {
                              glowColor: e.target.value,
                              glowIntensity: Math.max(45, clipEntity.glowIntensity ?? 0),
                            })
                          }
                          className="w-6 h-6 bg-transparent border-0 p-0 cursor-pointer"
                        />
                      </div>
                      <PropSlider
                        label="Glow Intensity"
                        value={clipEntity.glowIntensity ?? 0}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={(val) => onUpdateClip(clipEntity.id, { glowIntensity: val })}
                      />
                      <select
                        value={clipEntity.fxPreset ?? 'none'}
                        onChange={(e) => {
                          const fxId = e.target.value as VisualEffectPreset;
                          onUpdateClip(clipEntity.id, {
                            fxPreset: fxId,
                            fxIntensity: fxId === 'none' ? 0 : clipEntity.fxIntensity || 75,
                          });
                        }}
                        className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                      >
                        {availableEffects.map((fx) => (
                          <option key={fx.id} value={fx.id}>
                            {fx.id === 'none' ? 'Clean (No FX)' : `${fx.label} (${fx.category})`}
                          </option>
                        ))}
                      </select>
                      {(clipEntity.fxPreset ?? 'none') !== 'none' && (
                        <PropSlider
                          label="FX Strength"
                          value={clipEntity.fxIntensity ?? 75}
                          min={0}
                          max={100}
                          unit="%"
                          onChange={(val) => onUpdateClip(clipEntity.id, { fxIntensity: val })}
                        />
                      )}
                    </div>

                    {/* Color Grade */}
                    {isVisual && (
                      <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                        <div className="grid grid-cols-5 gap-1">
                          {(Object.keys(FILTER_PRESET_VALUES) as FilterPreset[]).map((pk) => (
                            <button
                              key={pk}
                              type="button"
                              onClick={() => {
                                const vals = FILTER_PRESET_VALUES[pk];
                                onUpdateClip(clipEntity.id, {
                                  filterPreset: pk,
                                  brightness: vals.brightness,
                                  contrast: vals.contrast,
                                  saturation: vals.saturation,
                                  warmth: vals.warmth,
                                  vignette: vals.vignette,
                                });
                              }}
                              className={`glow-btn py-1 px-1 text-[10px] rounded border truncate ${
                                clipEntity.filterPreset === pk
                                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                                  : 'bg-[#07090F] border-white/[0.08] text-slate-400'
                              }`}
                            >
                              {FILTER_PRESET_VALUES[pk].label}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <PropSlider
                            label="Brightness"
                            value={clipEntity.brightness}
                            min={50}
                            max={150}
                            unit="%"
                            onChange={(val) => onUpdateClip(clipEntity.id, { brightness: val })}
                          />
                          <PropSlider
                            label="Contrast"
                            value={clipEntity.contrast}
                            min={50}
                            max={150}
                            unit="%"
                            onChange={(val) => onUpdateClip(clipEntity.id, { contrast: val })}
                          />
                          <PropSlider
                            label="Saturation"
                            value={clipEntity.saturation}
                            min={0}
                            max={200}
                            unit="%"
                            onChange={(val) => onUpdateClip(clipEntity.id, { saturation: val })}
                          />
                          <PropSlider
                            label="Blur"
                            value={clipEntity.blur}
                            min={0}
                            max={16}
                            step={0.5}
                            unit="px"
                            onChange={(val) => onUpdateClip(clipEntity.id, { blur: val })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {clipTab === 'overlay' && !isAudio && (
                  <div className="space-y-4">
                    {isVisual && (
                      <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                        <div className="text-xs font-semibold text-slate-200">Frame Overlay</div>
                        <select
                          value={clipEntity.framePreset ?? 'none'}
                          onChange={(e) => {
                            const frameId = e.target.value as FramePreset;
                            const info = FRAME_PRESETS.find((f) => f.id === frameId);
                            onUpdateClip(clipEntity.id, {
                              framePreset: frameId,
                              frameColor: info?.defaultColor ?? '#38BDF8',
                              frameThickness: clipEntity.frameThickness ?? 50,
                            });
                          }}
                          className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                        >
                          {availableFrames.map((fr) => (
                            <option key={fr.id} value={fr.id}>
                              {fr.label}
                            </option>
                          ))}
                        </select>
                        {(clipEntity.framePreset ?? 'none') !== 'none' && (
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={clipEntity.frameColor ?? '#38BDF8'}
                              onChange={(e) =>
                                onUpdateClip(clipEntity.id, { frameColor: e.target.value })
                              }
                              className="w-7 h-7 bg-transparent border-0 p-0 cursor-pointer shrink-0"
                            />
                            <div className="flex-1">
                              <PropSlider
                                label="Frame Size"
                                value={clipEntity.frameThickness ?? 50}
                                min={15}
                                max={100}
                                unit="%"
                                onChange={(val) =>
                                  onUpdateClip(clipEntity.id, { frameThickness: val })
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isVisual && (
                      <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                        <div className="text-xs font-semibold text-slate-200">Video Mask</div>
                        <select
                          value={clipEntity.maskShape ?? 'none'}
                          onChange={(e) =>
                            onUpdateClip(clipEntity.id, {
                              maskShape: e.target.value as MaskShape,
                              maskCenterX: clipEntity.maskCenterX ?? 0,
                              maskCenterY: clipEntity.maskCenterY ?? 0,
                              maskWidth: clipEntity.maskWidth ?? 65,
                              maskHeight: clipEntity.maskHeight ?? 65,
                              maskFeather: clipEntity.maskFeather ?? 4,
                            })
                          }
                          className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                        >
                          {availableMasks.map((mk) => (
                            <option key={mk.id} value={mk.id}>
                              {mk.label}
                            </option>
                          ))}
                        </select>
                        {(clipEntity.maskShape ?? 'none') !== 'none' && (
                          <div className="grid grid-cols-2 gap-3">
                            <PropSlider
                              label="Mask Width"
                              value={clipEntity.maskWidth ?? 65}
                              min={10}
                              max={180}
                              unit="%"
                              onChange={(val) => onUpdateClip(clipEntity.id, { maskWidth: val })}
                            />
                            <PropSlider
                              label="Mask Height"
                              value={clipEntity.maskHeight ?? 65}
                              min={10}
                              max={180}
                              unit="%"
                              onChange={(val) => onUpdateClip(clipEntity.id, { maskHeight: val })}
                            />
                            <PropSlider
                              label="Feather"
                              value={clipEntity.maskFeather ?? 4}
                              min={0}
                              max={60}
                              unit="px"
                              onChange={(val) => onUpdateClip(clipEntity.id, { maskFeather: val })}
                            />
                            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer self-end pb-1">
                              <span>Invert Mask</span>
                              <input
                                type="checkbox"
                                checked={Boolean(clipEntity.maskInvert)}
                                onChange={(e) =>
                                  onUpdateClip(clipEntity.id, { maskInvert: e.target.checked })
                                }
                                className="accent-sky-400 w-4 h-4 rounded"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-400">Transition In</label>
                        <select
                          value={clipEntity.transitionIn ?? 'none'}
                          onChange={(e) =>
                            onUpdateClip(clipEntity.id, {
                              transitionIn: e.target.value as TransitionType,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                        >
                          <option value="none">Cut (None)</option>
                          {availableTransitions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <PropSlider
                          label="In Duration"
                          value={clipEntity.transitionInDuration ?? 0.5}
                          min={0.15}
                          max={2.5}
                          step={0.05}
                          unit="s"
                          onChange={(val) =>
                            onUpdateClip(clipEntity.id, { transitionInDuration: val })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs text-slate-400">Transition Out</label>
                        <select
                          value={clipEntity.transitionOut ?? 'none'}
                          onChange={(e) =>
                            onUpdateClip(clipEntity.id, {
                              transitionOut: e.target.value as TransitionType,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                        >
                          <option value="none">Cut (None)</option>
                          {availableTransitions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <PropSlider
                          label="Out Duration"
                          value={clipEntity.transitionOutDuration ?? 0.5}
                          min={0.15}
                          max={2.5}
                          step={0.05}
                          unit="s"
                          onChange={(val) =>
                            onUpdateClip(clipEntity.id, { transitionOutDuration: val })
                          }
                        />
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                      <div className="text-xs font-semibold text-slate-200">
                        Clip Animations (In, Out & Loop)
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="block text-[11px] text-slate-400">In Anim</label>
                          <select
                            value={clipEntity.animationIn ?? 'none'}
                            onChange={(e) =>
                              onUpdateClip(clipEntity.id, {
                                animationIn: e.target.value as ClipAnimationPreset,
                              })
                            }
                            className="w-full px-2 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                          >
                            <option value="none">None</option>
                            {availableAnimations
                              .filter((a) => a.category === 'In')
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] text-slate-400">Out Anim</label>
                          <select
                            value={clipEntity.animationOut ?? 'none'}
                            onChange={(e) =>
                              onUpdateClip(clipEntity.id, {
                                animationOut: e.target.value as ClipAnimationPreset,
                              })
                            }
                            className="w-full px-2 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                          >
                            <option value="none">None</option>
                            {availableAnimations
                              .filter((a) => a.category === 'Out')
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] text-slate-400">Loop Anim</label>
                          <select
                            value={clipEntity.animationCombo ?? 'none'}
                            onChange={(e) =>
                              onUpdateClip(clipEntity.id, {
                                animationCombo: e.target.value as ClipAnimationPreset,
                              })
                            }
                            className="w-full px-2 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                          >
                            <option value="none">None</option>
                            {availableAnimations
                              .filter((a) => a.category === 'Combo')
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                      <PropSlider
                        label="Animation Intensity"
                        value={clipEntity.animationIntensity ?? 75}
                        min={10}
                        max={150}
                        unit="%"
                        onChange={(val) =>
                          onUpdateClip(clipEntity.id, { animationIntensity: val })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 3. VISUAL EFFECT TOOL PROPERTIES */}
          {target.kind === 'fx' && (() => {
            const info = VISUAL_EFFECT_PRESETS.find((x) => x.id === target.fxId);
            const storageKey = makeFxStorageKey(target.fxId);
            const isReady = Boolean(info?.builtIn || installedEffectSet.has(storageKey));

            return (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  {info?.description ?? 'Visual FX preset'}
                </p>

                <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3.5">
                  <PropSlider
                    label="Effect Strength"
                    value={fxStrength}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={setFxStrength}
                  />
                  <div className="space-y-1.5">
                    <span className="block text-xs text-slate-400">Glow Accent Color</span>
                    <div className="flex items-center gap-2">
                      {GLOW_COLOR_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setFxGlowColor(hex)}
                          className={`w-6 h-6 rounded-full border ${
                            fxGlowColor.toUpperCase() === hex ? 'border-white scale-110' : 'border-white/20'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      <input
                        type="color"
                        value={fxGlowColor}
                        onChange={(e) => setFxGlowColor(e.target.value)}
                        className="w-6 h-6 bg-transparent border-0 p-0 cursor-pointer"
                      />
                    </div>
                  </div>
                  <PropSlider
                    label="Glow Intensity"
                    value={fxGlowIntensity}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={setFxGlowIntensity}
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  {!isReady ? (
                    <button
                      type="button"
                      onClick={() => void onDownloadEffectItem(storageKey, info?.label ?? target.fxId)}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download & Save FX</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!hasSelectedRenderable}
                      onClick={() => {
                        onApplyEffectWithSettings(
                          target.fxId,
                          fxStrength,
                          fxGlowColor,
                          fxGlowIntensity
                        );
                        onClose();
                      }}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {hasSelectedRenderable
                          ? 'Apply to Selected Clip'
                          : 'Select a Clip First'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 4. FRAME TOOL PROPERTIES */}
          {target.kind === 'frame' && (() => {
            const info = FRAME_PRESETS.find((f) => f.id === target.frameId);
            const storageKey = makeFrameStorageKey(target.frameId);
            const isReady = Boolean(info?.builtIn || installedEffectSet.has(storageKey));

            return (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">{info?.description}</p>
                <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Frame Color</span>
                    <input
                      type="color"
                      value={frameColor}
                      onChange={(e) => setFrameColor(e.target.value)}
                      className="w-7 h-7 bg-transparent border-0 p-0 cursor-pointer"
                    />
                  </div>
                  <PropSlider
                    label="Frame Thickness / Size"
                    value={frameSize}
                    min={15}
                    max={100}
                    unit="%"
                    onChange={setFrameSize}
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  {!isReady ? (
                    <button
                      type="button"
                      onClick={() => void onDownloadEffectItem(storageKey, info?.label ?? target.frameId)}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download & Save Frame</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!hasSelectedVisual}
                      onClick={() => {
                        onApplyFrameWithSettings(target.frameId, frameColor, frameSize);
                        onClose();
                      }}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {hasSelectedVisual ? 'Apply Frame to Visual Clip' : 'Select a Visual Clip First'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 5. MASK & CUSTOM MASK PROPERTIES */}
          {(target.kind === 'mask' || target.kind === 'custom-mask') && (() => {
            const customMask =
              target.kind === 'custom-mask'
                ? customMasks.find((m) => m.id === target.customMaskId)
                : undefined;
            const info =
              target.kind === 'mask'
                ? MASK_PRESETS.find((m) => m.id === target.maskShape)
                : undefined;
            const storageKey =
              target.kind === 'mask' ? makeMaskStorageKey(target.maskShape) : '';
            const isReady =
              target.kind === 'custom-mask' ||
              Boolean(info?.builtIn || installedEffectSet.has(storageKey));

            return (
              <div className="space-y-4">
                {customMask ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#090C13] border border-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <img
                        src={customMask.dataUrl}
                        alt={customMask.name}
                        className="w-14 h-10 object-contain rounded bg-[#07090F] border border-white/[0.1]"
                      />
                      <span className="text-xs text-slate-300">Custom PNG Alpha Mask</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadCustomMaskPng(customMask)}
                      className="glow-btn flex items-center gap-1.5 px-3 py-1.5 text-xs text-sky-200 bg-[#141822] border border-white/[0.1] rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PNG</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300">{info?.description}</p>
                )}

                <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <PropSlider
                      label="Center X"
                      value={maskCenterX}
                      min={-50}
                      max={50}
                      unit="%"
                      onChange={setMaskCenterX}
                    />
                    <PropSlider
                      label="Center Y"
                      value={maskCenterY}
                      min={-50}
                      max={50}
                      unit="%"
                      onChange={setMaskCenterY}
                    />
                    <PropSlider
                      label="Width"
                      value={maskWidth}
                      min={10}
                      max={180}
                      unit="%"
                      onChange={setMaskWidth}
                    />
                    <PropSlider
                      label="Height"
                      value={maskHeight}
                      min={10}
                      max={180}
                      unit="%"
                      onChange={setMaskHeight}
                    />
                  </div>
                  <PropSlider
                    label="Feather"
                    value={maskFeather}
                    min={0}
                    max={60}
                    unit="px"
                    onChange={setMaskFeather}
                  />
                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                    <span>Invert Mask</span>
                    <input
                      type="checkbox"
                      checked={maskInvert}
                      onChange={(e) => setMaskInvert(e.target.checked)}
                      className="accent-sky-400 w-4 h-4 rounded"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {!isReady && target.kind === 'mask' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void onDownloadEffectItem(storageKey, info?.label ?? target.maskShape)
                      }
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download & Save Mask</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!hasSelectedVisual}
                      onClick={() => {
                        onApplyMaskWithSettings(
                          target.kind === 'custom-mask' ? 'custom' : target.maskShape,
                          maskCenterX,
                          maskCenterY,
                          maskWidth,
                          maskHeight,
                          maskFeather,
                          maskInvert,
                          customMask
                        );
                        onClose();
                      }}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {hasSelectedVisual ? 'Apply Mask to Visual Clip' : 'Select a Visual Clip First'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 5B. ANIMATION TOOL PROPERTIES */}
          {target.kind === 'animation' && (() => {
            const info = ANIMATION_PRESETS.find((a) => a.id === target.animationId);
            const storageKey = makeAnimationStorageKey(target.animationId);
            const isReady = Boolean(info?.builtIn || installedEffectSet.has(storageKey));

            const downloadPresetJson = () => {
              if (!info) return;
              const blob = new Blob(
                [
                  JSON.stringify(
                    {
                      framecutAnimation: 1,
                      id: info.id,
                      label: info.label,
                      category: info.category,
                      duration: animDuration,
                      intensity: animIntensity,
                      description: info.description,
                    },
                    null,
                    2
                  ),
                ],
                { type: 'application/json' }
              );
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${info.id}.framecut-anim.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.setTimeout(() => URL.revokeObjectURL(url), 2500);
            };

            return (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  {info?.description ?? 'Motion animation preset'}
                </p>

                <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3.5">
                  {info?.category !== 'Combo' && (
                    <PropSlider
                      label="Animation Duration"
                      value={animDuration}
                      min={0.15}
                      max={2.5}
                      step={0.05}
                      unit="s"
                      allowInput
                      onChange={setAnimDuration}
                    />
                  )}
                  <PropSlider
                    label="Animation Intensity"
                    value={animIntensity}
                    min={10}
                    max={150}
                    unit="%"
                    onChange={setAnimIntensity}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={downloadPresetJson}
                    className="glow-btn flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-200 bg-[#141822] border border-white/[0.1] rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Preset (.json)</span>
                  </button>

                  {!isReady ? (
                    <button
                      type="button"
                      onClick={() =>
                        void onDownloadEffectItem(storageKey, info?.label ?? target.animationId)
                      }
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download & Save</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!hasSelectedRenderable}
                      onClick={() => {
                        onApplyAnimationWithSettings(
                          target.animationId,
                          animDuration,
                          animIntensity
                        );
                        onClose();
                      }}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {hasSelectedRenderable
                          ? 'Apply to Selected Clip'
                          : 'Select a Clip First'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 6. TRANSITION TOOL PROPERTIES */}
          {target.kind === 'transition' && (() => {
            const preset = TRANSITIONS_CATALOG.find((t) => t.id === target.transitionId);
            const isReady = Boolean(preset?.builtIn || installedTransSet.has(target.transitionId));

            return (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">{preset?.description}</p>
                <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="block text-xs text-slate-400">Apply Edge</label>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                      {(['in', 'out', 'both'] as const).map((edge) => (
                        <button
                          key={edge}
                          type="button"
                          onClick={() => setTransEdge(edge)}
                          className={`glow-btn py-1.5 text-xs font-medium rounded-md border border-transparent capitalize ${
                            transEdge === edge
                              ? 'bg-[#1A2130] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {edge === 'both' ? 'In + Out' : `Apply ${edge}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <PropSlider
                    label="Transition Duration"
                    value={transDuration}
                    min={0.15}
                    max={2.5}
                    step={0.05}
                    unit="s"
                    allowInput
                    onChange={setTransDuration}
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  {!isReady && preset ? (
                    <button
                      type="button"
                      onClick={() => void onDownloadTransition(preset)}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download & Save Transition</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!hasSelectedRenderable}
                      onClick={() => {
                        onApplyTransitionWithSettings(
                          target.transitionId,
                          transEdge,
                          transDuration
                        );
                        onClose();
                      }}
                      className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {hasSelectedRenderable
                          ? 'Apply Transition to Selected Clip'
                          : 'Select a Clip First'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 7. TITLE TEMPLATE PROPERTIES */}
          {target.kind === 'title-template' && tplConfig && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs text-slate-400">Template Text</label>
                  <textarea
                    rows={2}
                    value={tplConfig.text}
                    onChange={(e) => setTplConfig({ ...tplConfig, text: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg resize-none focus:outline-none focus:border-sky-400"
                  />
                </div>
                <PropSlider
                  label="Title Duration"
                  value={tplDuration}
                  min={0.2}
                  max={60}
                  inputMax={3600}
                  step={0.1}
                  unit="s"
                  allowInput
                  onChange={setTplDuration}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Font</label>
                    <select
                      value={tplConfig.fontFamily}
                      onChange={(e) =>
                        setTplConfig({ ...tplConfig, fontFamily: e.target.value })
                      }
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
                    <label className="block text-xs text-slate-400">Entrance Motion</label>
                    <select
                      value={tplConfig.animation}
                      onChange={(e) =>
                        setTplConfig({
                          ...tplConfig,
                          animation: e.target.value as TextAnimation,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade</option>
                      <option value="slide-up">Slide Up</option>
                      <option value="scale">Scale</option>
                    </select>
                  </div>
                </div>
                <PropSlider
                  label="Font Size"
                  value={tplConfig.fontSize}
                  min={12}
                  max={250}
                  unit="px"
                  allowInput
                  onChange={(v) => setTplConfig({ ...tplConfig, fontSize: v })}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onAddTitleTemplate(tplName, tplConfig, target.x, target.y, tplDuration);
                    onClose();
                  }}
                  className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Title at Playhead</span>
                </button>
              </div>
            </div>
          )}

          {/* 8. STUDIO TOOL PROPERTIES */}
          {target.kind === 'tool' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">{target.description}</p>

              <div className="p-3.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-3.5">
                <div className="text-xs font-semibold text-sky-200">Tool & Workspace Settings</div>

                {(target.toolId === 'aspect-ratio' ||
                  target.toolId === 'export-video' ||
                  target.toolId === 'save-project' ||
                  target.toolId === 'clear-project') && (
                  <>
                    <div className="space-y-1">
                      <label className="block text-xs text-slate-400">Project Name</label>
                      <input
                        type="text"
                        value={projectName}
                        onChange={(e) => onChangeProjectName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs text-slate-400">Canvas Aspect Ratio</label>
                      <div className="grid grid-cols-4 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                        {(['16:9', '9:16', '1:1', '4:5'] as AspectRatio[]).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => onChangeAspectRatio(r)}
                            className={`glow-btn py-1.5 text-xs font-mono rounded-md border border-transparent ${
                              aspectRatio === r ? 'bg-[#1A2130] text-white' : 'text-slate-400'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] font-mono text-slate-500">
                        Output: {ASPECT_RATIO_DIMENSIONS[aspectRatio].width} ×{' '}
                        {ASPECT_RATIO_DIMENSIONS[aspectRatio].height}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs text-slate-400">Sequence Frame Rate</label>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                        {([24, 30, 60] as const).map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => onChangeFps(rate)}
                            className={`glow-btn py-1.5 text-xs font-mono rounded-md border border-transparent ${
                              fps === rate ? 'bg-[#1A2130] text-white' : 'text-slate-400'
                            }`}
                          >
                            {rate} fps
                          </button>
                        ))}
                      </div>
                    </div>
                    {target.toolId === 'save-project' && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        {hasSavedOnce
                          ? `Linked file: ${savedFileName ?? 'Project saved'} (auto-saves on every move)`
                          : 'Not yet linked to a file location'}
                      </div>
                    )}
                  </>
                )}

                {(target.toolId === 'snap' ||
                  target.toolId === 'zoom' ||
                  target.toolId === 'split' ||
                  target.toolId === 'duplicate' ||
                  target.toolId === 'delete' ||
                  target.toolId === 'select-all' ||
                  target.toolId === 'add-text') && (
                  <>
                    <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                      <span>Magnetic Clip Snapping</span>
                      <input
                        type="checkbox"
                        checked={snapEnabled}
                        onChange={(e) => onChangeSnapEnabled(e.target.checked)}
                        className="accent-sky-400 w-4 h-4 rounded"
                      />
                    </label>
                    <PropSlider
                      label="Timeline Zoom Scale"
                      value={timelineZoom}
                      min={24}
                      max={160}
                      unit=" px/s"
                      onChange={onChangeTimelineZoom}
                    />
                  </>
                )}

                {(target.toolId === 'playback' ||
                  target.toolId === 'preview-quality' ||
                  target.toolId === 'preview-audio') && (
                  <div className="space-y-3 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Playhead Position</span>
                      <span className="font-mono">{formatShortTime(currentTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Playback State</span>
                      <span className="font-mono">{isPlaying ? 'Playing' : 'Paused'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Preview Resolution</span>
                      <span className="font-mono text-sky-300">
                        {previewScale === 'half' ? '1/2 Res (Fast)' : 'HD Preview'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Audio Output</span>
                      <span className={`font-mono ${isMuted || previewVolume === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isMuted || previewVolume === 0 ? 'Muted' : 'Active'}
                      </span>
                    </div>
                    <PropSlider
                      label="Preview Master Volume"
                      value={isMuted ? 0 : previewVolume}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={onChangePreviewVolume}
                    />
                  </div>
                )}

                {(target.toolId === 'import-media' ||
                  target.toolId === 'font-library' ||
                  target.toolId === 'custom-mask-studio' ||
                  target.toolId === 'undo' ||
                  target.toolId === 'redo') && (
                  <div className="text-xs text-slate-400">
                    Imported files: <span className="font-mono text-slate-200">{assets.length}</span> ·
                    Timeline clips: <span className="font-mono text-slate-200">{clips.length}</span>
                  </div>
                )}

                {target.toolId === 'caption-settings' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={defaultCaptionConfig.captionStyle ?? 'classic-sub'}
                        onChange={(e) =>
                          onChangeDefaultCaptionConfig(
                            applyCaptionPresetToTextConfig(
                              defaultCaptionConfig,
                              e.target.value as CaptionStylePreset
                            )
                          )
                        }
                        className="px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                      >
                        {CAPTION_STYLE_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                        {(['bottom', 'center', 'top', 'custom'] as CaptionPositionPreset[]).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => onChangeDefaultCaptionConfig({ captionPosition: pos })}
                            className={`glow-btn py-1 text-[10px] rounded capitalize ${
                              (defaultCaptionConfig.captionPosition ?? 'bottom') === pos
                                ? 'bg-[#1A2130] text-white'
                                : 'text-slate-400'
                            }`}
                          >
                            {pos === 'custom' ? 'Free' : pos}
                          </button>
                        ))}
                      </div>
                    </div>
                    <PropSlider
                      label="Default Caption Size"
                      value={defaultCaptionConfig.fontSize}
                      min={20}
                      max={96}
                      unit="px"
                      onChange={(val) => onChangeDefaultCaptionConfig({ fontSize: val })}
                    />
                    <PropSlider
                      label="Outline Thickness (Optional)"
                      value={defaultCaptionConfig.captionOutlineWidth ?? 0}
                      min={0}
                      max={14}
                      unit="px"
                      onChange={(val) =>
                        onChangeDefaultCaptionConfig({ captionOutlineWidth: val })
                      }
                    />
                    <PropSlider
                      label="Safe Margin"
                      value={defaultCaptionConfig.captionSafeMargin ?? 10}
                      min={4}
                      max={24}
                      unit="%"
                      onChange={(val) =>
                        onChangeDefaultCaptionConfig({ captionSafeMargin: val })
                      }
                    />
                    <div className="space-y-1">
                      <span className="block text-[11px] text-slate-400">Text Direction (All Languages)</span>
                      <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                        {(['auto', 'ltr', 'rtl'] as const).map((dir) => (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => onChangeDefaultCaptionConfig({ textDirection: dir })}
                            className={`glow-btn py-1 text-[10px] rounded uppercase font-mono ${
                              (defaultCaptionConfig.textDirection ?? 'auto') === dir
                                ? 'bg-[#1A2130] text-white'
                                : 'text-slate-400'
                            }`}
                          >
                            {dir}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(defaultCaptionConfig.captionWordHighlight)}
                          onChange={(e) =>
                            onChangeDefaultCaptionConfig({
                              captionWordHighlight: e.target.checked,
                            })
                          }
                          className="accent-sky-400 rounded"
                        />
                        <span>Word Highlight</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(defaultCaptionConfig.captionUppercase)}
                          onChange={(e) =>
                            onChangeDefaultCaptionConfig({
                              captionUppercase: e.target.checked,
                            })
                          }
                          className="accent-sky-400 rounded"
                        />
                        <span>ALL CAPS</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => onApplyCaptionStyleToAll(defaultCaptionConfig)}
                        className="glow-btn px-2.5 py-1 rounded text-[11px] font-medium text-sky-200 bg-sky-500/15 border border-sky-400/35"
                      >
                        Apply to All Captions
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onTriggerToolAction(target.toolId);
                    onClose();
                  }}
                  className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Tool Action</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
