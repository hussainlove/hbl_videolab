import { useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeftRight,
  Captions,
  ChevronLeft,
  ChevronRight,
  Copy,
  Diamond,
  Download,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Smile,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  ANIMATION_PRESETS,
  ASPECT_RATIO_DIMENSIONS,
  AspectRatio,
  buildPanZoomClipPatch,
  BUILTIN_FONT_FAMILIES,
  CAPTION_STYLE_PRESETS,
  CaptionActiveMode,
  CaptionLineMode,
  CaptionPositionPreset,
  CaptionStylePreset,
  ClipAnimationPreset,
  ClipKeyframe,
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
  KeyframeEasing,
  MASK_PRESETS,
  MaskShape,
  MediaAsset,
  TextAnimation,
  TextConfig,
  TextFontFamily,
  TimelineClip,
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
import { detectTextLanguage, ensureScriptFontLoaded } from '../utils/languageSupport';
import { downloadCustomMaskPng } from '../utils/maskStorage';
import { TRANSITIONS_CATALOG } from '../utils/transitionsStorage';
import { clamp, formatShortTime, uid } from '../utils/time';

interface InspectorProps {
  projectName: string;
  onChangeProjectName: (name: string) => void;
  aspectRatio: AspectRatio;
  fps: 24 | 30 | 60;
  onChangeFps: (fps: 24 | 30 | 60) => void;
  totalDuration: number;
  clipCount: number;
  currentTime: number;
  onSeek: (time: number) => void;
  selectedClips: TimelineClip[];
  selectedAsset: MediaAsset | null;
  customFonts: CustomFont[];
  customMasks: CustomMaskItem[];
  downloadedTransitionIds: TransitionType[];
  downloadedEffectKeys: string[];
  onImportFonts: (files: FileList) => Promise<CustomFont | null>;
  onOpenAutoFonts: () => void;
  onOpenCustomMaskModal: () => void;
  onApplyCustomMask: (mask: CustomMaskItem) => void;
  onUpdateClip: (id: string, patch: Partial<TimelineClip>, recordHistory?: boolean) => void;
  onBatchUpdateSelected: (patch: Partial<TimelineClip>, recordHistory?: boolean) => void;
  onApplyCaptionStyleToAll?: (config: TextConfig) => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  adjacentPrevClip?: TimelineClip | null;
  adjacentNextClip?: TimelineClip | null;
  onApplySeamTransition?: (
    prevClipId: string,
    nextClipId: string,
    transitionType: TransitionType,
    duration: number
  ) => void;
  onApplyTransitionToAll?: (transitionType: TransitionType, duration: number) => void;
  onSetBatchDuration?: (durationSeconds: number, rippleSequence?: boolean) => void;
  width?: number;
}

const TEXT_COLORS = ['#FFFFFF', '#F8FAFC', '#FDE68A', '#93C5FD', '#FCA5A5', '#111827'];

function InspectorSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-6 py-1 text-[11px] text-slate-100 bg-[#07090F] border border-white/[0.09] rounded-md focus:outline-none focus:border-sky-400 placeholder:text-slate-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="glow-btn absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-white border border-transparent"
          title="Clear search"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  allowDirectInput = false,
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
  allowDirectInput?: boolean;
  inputMin?: number;
  inputMax?: number;
  onChange: (val: number) => void;
}) {
  const sliderVal = clamp(value, min, max);
  const effectiveMin = inputMin ?? min;
  const effectiveMax = inputMax ?? max;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const formattedValue = step < 1 ? String(Number(value.toFixed(2))) : String(Math.round(value));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-slate-400">{label}</span>
        {allowDirectInput ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={effectiveMin}
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
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                  e.currentTarget.blur();
                }
              }}
              className="w-16 px-1.5 py-0.5 text-right text-xs font-mono text-slate-100 bg-[#07090F] border border-white/[0.12] rounded focus:outline-none focus:border-sky-400"
            />
            {unit && <span className="font-mono text-slate-400 text-[11px]">{unit}</span>}
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
        value={sliderVal}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full studio-slider"
      />
    </div>
  );
}

export function Inspector({
  projectName,
  onChangeProjectName,
  aspectRatio,
  fps,
  onChangeFps,
  totalDuration,
  clipCount,
  currentTime,
  onSeek,
  selectedClips,
  selectedAsset,
  customFonts,
  customMasks,
  downloadedTransitionIds,
  downloadedEffectKeys,
  onImportFonts,
  onOpenAutoFonts,
  onOpenCustomMaskModal,
  onApplyCustomMask,
  onUpdateClip,
  onBatchUpdateSelected,
  onApplyCaptionStyleToAll,
  onDuplicateSelected,
  onDeleteSelected,
  onClearSelection,
  adjacentPrevClip = null,
  adjacentNextClip = null,
  onApplySeamTransition,
  onApplyTransitionToAll,
  onSetBatchDuration,
  width = 292,
}: InspectorProps) {
  const fontInputRef = useRef<HTMLInputElement>(null);

  // Section-specific search filters inside Inspector boxes
  const [seqSearch, setSeqSearch] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [clipSettingSearch, setClipSettingSearch] = useState('');
  const [fontSearch, setFontSearch] = useState('');
  const [captionPresetSearch, setCaptionPresetSearch] = useState('');
  const [fxSearch, setFxSearch] = useState('');
  const [frameSearch, setFrameSearch] = useState('');
  const [maskSearch, setMaskSearch] = useState('');
  const [animSearch, setAnimSearch] = useState('');
  const [transSearch, setTransSearch] = useState('');
  const [colorSearch, setColorSearch] = useState('');
  const [kfEasing, setKfEasing] = useState<KeyframeEasing>('ease-in-out');
  const [batchDurationInput, setBatchDurationInput] = useState('4');
  const [batchRippleSequence, setBatchRippleSequence] = useState(true);

  const availableTransitions = TRANSITIONS_CATALOG.filter(
    (t) => t.builtIn || downloadedTransitionIds.includes(t.id)
  );
  const installedEffectSet = new Set(downloadedEffectKeys);
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

  const singleClip = selectedClips.length === 1 ? selectedClips[0] : null;

  const fontNeedle = fontSearch.trim().toLowerCase();
  const activeFontFamily = singleClip?.textConfig?.fontFamily;
  const filteredBuiltinFonts = fontNeedle
    ? BUILTIN_FONT_FAMILIES.filter(
        (f) => f === activeFontFamily || f.toLowerCase().includes(fontNeedle)
      )
    : BUILTIN_FONT_FAMILIES;
  const filteredCustomFonts = fontNeedle
    ? customFonts.filter(
        (f) => f.family === activeFontFamily || f.family.toLowerCase().includes(fontNeedle)
      )
    : customFonts;

  const fxNeedle = fxSearch.trim().toLowerCase();
  const filteredAvailableEffects = fxNeedle
    ? availableEffects.filter(
        (e) =>
          e.id === 'none' ||
          e.id === singleClip?.fxPreset ||
          e.label.toLowerCase().includes(fxNeedle) ||
          e.category.toLowerCase().includes(fxNeedle)
      )
    : availableEffects;

  const frameNeedle = frameSearch.trim().toLowerCase();
  const filteredAvailableFrames = frameNeedle
    ? availableFrames.filter(
        (f) =>
          f.id === 'none' ||
          f.id === singleClip?.framePreset ||
          f.label.toLowerCase().includes(frameNeedle)
      )
    : availableFrames;

  const maskNeedle = maskSearch.trim().toLowerCase();
  const filteredAvailableMasks = maskNeedle
    ? availableMasks.filter(
        (m) =>
          m.id === 'none' ||
          m.id === singleClip?.maskShape ||
          m.label.toLowerCase().includes(maskNeedle)
      )
    : availableMasks;
  const filteredCustomMasks = maskNeedle
    ? customMasks.filter(
        (m) =>
          m.id === singleClip?.customMaskId || m.name.toLowerCase().includes(maskNeedle)
      )
    : customMasks;

  const animNeedle = animSearch.trim().toLowerCase();
  const filteredAvailableAnimations = animNeedle
    ? availableAnimations.filter(
        (a) =>
          a.id === singleClip?.animationIn ||
          a.id === singleClip?.animationOut ||
          a.id === singleClip?.animationCombo ||
          a.label.toLowerCase().includes(animNeedle) ||
          a.category.toLowerCase().includes(animNeedle)
      )
    : availableAnimations;
  const availableInAnimations = filteredAvailableAnimations.filter((a) => a.category === 'In');
  const availableOutAnimations = filteredAvailableAnimations.filter((a) => a.category === 'Out');
  const availableComboAnimations = filteredAvailableAnimations.filter((a) => a.category === 'Combo');

  const transNeedle = transSearch.trim().toLowerCase();
  const filteredAvailableTransitions = transNeedle
    ? availableTransitions.filter(
        (t) =>
          t.id === singleClip?.transitionIn ||
          t.id === singleClip?.transitionOut ||
          t.label.toLowerCase().includes(transNeedle) ||
          t.category.toLowerCase().includes(transNeedle)
      )
    : availableTransitions;

  const captionPresetNeedle = captionPresetSearch.trim().toLowerCase();
  const filteredCaptionPresets = captionPresetNeedle
    ? CAPTION_STYLE_PRESETS.filter(
        (p) =>
          p.label.toLowerCase().includes(captionPresetNeedle) ||
          p.category.toLowerCase().includes(captionPresetNeedle)
      )
    : CAPTION_STYLE_PRESETS;

  const colorNeedle = colorSearch.trim().toLowerCase();
  const filteredFilterPresetKeys = (Object.keys(FILTER_PRESET_VALUES) as FilterPreset[]).filter(
    (presetKey) => {
      if (!colorNeedle) return true;
      return (
        FILTER_PRESET_VALUES[presetKey].label.toLowerCase().includes(colorNeedle) ||
        presetKey.toLowerCase().includes(colorNeedle)
      );
    }
  );

  // Batch Multi-Selection Inspector
  if (selectedClips.length > 1) {
    const earliest = Math.min(...selectedClips.map((c) => c.startTime));
    const latest = Math.max(...selectedClips.map((c) => c.startTime + c.duration));
    const hasVisual = selectedClips.some((c) => isVisualTrack(c.track));
    const hasRenderable = selectedClips.some((c) => !isAudioTrack(c.track));
    const avgOpacity = Math.round(
      selectedClips.reduce((acc, c) => acc + c.opacity, 0) / selectedClips.length
    );
    const firstRenderable = selectedClips.find((c) => !isAudioTrack(c.track)) ?? selectedClips[0];
    const currentBatchGlowColor = firstRenderable.glowColor ?? '#38BDF8';
    const currentBatchGlowIntensity = firstRenderable.glowIntensity ?? 0;

    return (
      <aside
        style={{ width }}
        className="@container shrink-0 min-w-0 studio-panel border-l border-white/[0.08] flex flex-col h-full overflow-y-auto overflow-x-hidden studio-scroll"
      >
        <div className="px-3 @[260px]:px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">
              {selectedClips.length} Clips Selected
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
              {formatShortTime(earliest)} – {formatShortTime(latest)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClearSelection}
            className="glow-btn text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-transparent shrink-0"
          >
            Clear
          </button>
        </div>

        <div className="px-3 @[260px]:px-4 py-2.5 border-b border-white/[0.08]">
          <InspectorSearchInput
            value={batchSearch}
            onChange={setBatchSearch}
            placeholder="Search batch settings..."
          />
        </div>

        <div className="p-3 @[260px]:p-4 space-y-5">
          {(() => {
            const batchNeedle = batchSearch.trim().toLowerCase();
            const showBatch = (keywords: string) =>
              !batchNeedle || keywords.toLowerCase().includes(batchNeedle);
            return (
              <>
          <div className="grid grid-cols-1 @[220px]:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onDuplicateSelected}
              className="glow-btn flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-200 hover:text-white bg-[#161B26] border border-white/[0.08] rounded-lg"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              className="glow-btn flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-rose-300 hover:text-white bg-rose-500/10 border border-rose-500/25 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All</span>
            </button>
          </div>

          {showBatch('batch adjustments duration scale opacity fade in fade out timing picture photo same') && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
            <div className="text-xs font-medium text-slate-300">Batch Adjustments</div>
            <div className="p-2.5 rounded-lg bg-[#07090F]/80 border border-sky-400/25 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-sky-200">
                  Same Duration (All {selectedClips.length})
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  avg{' '}
                  {(
                    selectedClips.reduce((acc, c) => acc + c.duration, 0) / selectedClips.length
                  ).toFixed(2)}
                  s
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0.1}
                  max={3600}
                  step={0.1}
                  value={batchDurationInput}
                  onChange={(e) => setBatchDurationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseFloat(batchDurationInput);
                      if (Number.isFinite(val) && val >= 0.1) {
                        const clamped = Number(clamp(val, 0.1, 3600).toFixed(2));
                        if (onSetBatchDuration) {
                          onSetBatchDuration(clamped, batchRippleSequence);
                        } else {
                          onBatchUpdateSelected({ duration: clamped });
                        }
                      }
                    }
                  }}
                  placeholder="e.g. 2.0"
                  className="w-20 px-2 py-1 text-xs font-mono text-slate-100 bg-[#111622] border border-white/[0.14] rounded-md focus:outline-none focus:border-sky-400"
                />
                <span className="text-[11px] font-mono text-slate-400">sec</span>
                <button
                  type="button"
                  onClick={() => {
                    const val = parseFloat(batchDurationInput);
                    if (!Number.isFinite(val) || val < 0.1) return;
                    const clamped = Number(clamp(val, 0.1, 3600).toFixed(2));
                    setBatchDurationInput(String(clamped));
                    if (onSetBatchDuration) {
                      onSetBatchDuration(clamped, batchRippleSequence);
                    } else {
                      onBatchUpdateSelected({ duration: clamped });
                    }
                  }}
                  className="glow-btn-prism flex-1 py-1 px-2.5 text-[11px] font-semibold text-white rounded-md whitespace-nowrap"
                >
                  Apply All
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {[0.5, 1, 2, 3, 5].map((presetSec) => (
                  <button
                    key={presetSec}
                    type="button"
                    onClick={() => {
                      setBatchDurationInput(String(presetSec));
                      if (onSetBatchDuration) {
                        onSetBatchDuration(presetSec, batchRippleSequence);
                      } else {
                        onBatchUpdateSelected({ duration: presetSec });
                      }
                    }}
                    className="glow-btn px-2 py-0.5 text-[10px] font-mono rounded bg-white/[0.04] hover:bg-sky-500/20 text-slate-300 hover:text-sky-200 border border-white/[0.08]"
                  >
                    {presetSec}s
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[10.5px] text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchRippleSequence}
                  onChange={(e) => setBatchRippleSequence(e.target.checked)}
                  className="rounded border-white/20 bg-[#111622] text-sky-400 focus:ring-0"
                />
                <span>Keep sequence gapless (auto-pack clips)</span>
              </label>
            </div>
            <SliderRow
              label="Scale"
              value={Math.round(
                selectedClips.reduce((acc, c) => acc + c.scale, 0) / selectedClips.length
              )}
              min={10}
              max={500}
              allowDirectInput
              inputMin={10}
              inputMax={1000}
              unit="%"
              onChange={(val) => onBatchUpdateSelected({ scale: val })}
            />
            <SliderRow
              label="Opacity"
              value={avgOpacity}
              min={0}
              max={100}
              unit="%"
              onChange={(val) => onBatchUpdateSelected({ opacity: val })}
            />
            <div className="grid grid-cols-1 @[240px]:grid-cols-2 gap-3">
              <SliderRow
                label="Fade In"
                value={selectedClips[0].fadeIn}
                min={0}
                max={2}
                step={0.05}
                unit="s"
                onChange={(val) => onBatchUpdateSelected({ fadeIn: val })}
              />
              <SliderRow
                label="Fade Out"
                value={selectedClips[0].fadeOut}
                min={0}
                max={2}
                step={0.05}
                unit="s"
                onChange={(val) => onBatchUpdateSelected({ fadeOut: val })}
              />
            </div>
          </div>
          )}

          {hasRenderable && showBatch('batch glow visual effect fx animation pan loop in out') && (
            <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
              <div className="text-xs font-medium text-slate-300">Batch Glow & Visual FX</div>

              <div className="space-y-1.5">
                <span className="block text-xs text-slate-400">Glow Color</span>
                <div className="flex flex-wrap items-center gap-2">
                  {GLOW_COLOR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        onBatchUpdateSelected({
                          glowColor: hex,
                          glowIntensity: Math.max(45, currentBatchGlowIntensity),
                        })
                      }
                      className={`w-6 h-6 rounded-full border transition-transform ${
                        currentBatchGlowColor.toUpperCase() === hex
                          ? 'border-white scale-110'
                          : 'border-white/20 hover:scale-105'
                      }`}
                      style={{
                        backgroundColor: hex,
                        boxShadow: `0 0 12px ${hex}88`,
                      }}
                      title={hex}
                    />
                  ))}
                  <input
                    type="color"
                    value={currentBatchGlowColor}
                    onChange={(e) =>
                      onBatchUpdateSelected({
                        glowColor: e.target.value,
                        glowIntensity: Math.max(45, currentBatchGlowIntensity),
                      })
                    }
                    className="w-6 h-6 rounded bg-transparent cursor-pointer border-0 p-0"
                    title="Custom glow color"
                  />
                </div>
              </div>

              <SliderRow
                label="Glow Intensity"
                value={currentBatchGlowIntensity}
                min={0}
                max={100}
                unit="%"
                onChange={(val) => onBatchUpdateSelected({ glowIntensity: val })}
              />

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">Visual Effect</label>
                <InspectorSearchInput
                  value={fxSearch}
                  onChange={setFxSearch}
                  placeholder="Search effects..."
                />
                <select
                  value=""
                  onChange={(e) => {
                    const fxId = e.target.value as VisualEffectPreset;
                    if (!fxId) return;
                    const info = VISUAL_EFFECT_PRESETS.find((x) => x.id === fxId);
                    onBatchUpdateSelected({
                      fxPreset: fxId,
                      fxIntensity: fxId === 'none' ? 0 : 75,
                      ...(info && info.defaultGlowIntensity > 0
                        ? {
                            glowColor: info.defaultGlowColor,
                            glowIntensity: info.defaultGlowIntensity,
                          }
                        : {}),
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="">Choose effect for all...</option>
                  {filteredAvailableEffects.map((fx) => (
                    <option key={fx.id} value={fx.id}>
                      {fx.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="block text-xs text-slate-400">Batch Clip Animation</label>
                <InspectorSearchInput
                  value={animSearch}
                  onChange={setAnimSearch}
                  placeholder="Search animations (pan, bounce, loop)..."
                />
                <select
                  value=""
                  onChange={(e) => {
                    const animId = e.target.value as ClipAnimationPreset;
                    if (!animId) return;
                    if (animId === 'none') {
                      onBatchUpdateSelected({
                        animationIn: 'none',
                        animationOut: 'none',
                        animationCombo: 'none',
                      });
                      return;
                    }
                    const info = ANIMATION_PRESETS.find((a) => a.id === animId);
                    if (info?.category === 'Out') {
                      onBatchUpdateSelected({
                        animationOut: animId,
                        animationOutDuration: info.defaultDuration,
                      });
                    } else if (info?.category === 'Combo') {
                      onBatchUpdateSelected({ animationCombo: animId });
                    } else {
                      onBatchUpdateSelected({
                        animationIn: animId,
                        animationInDuration: info?.defaultDuration ?? 0.5,
                      });
                    }
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="">Choose animation for all...</option>
                  <option value="none">Clear All Animations</option>
                  {filteredAvailableAnimations.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.category}] {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {hasVisual && showBatch('batch frame overlay transition in color grade filter preset') && (
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <div className="text-xs font-medium text-slate-300">Batch Frame Overlay</div>
              <InspectorSearchInput
                value={frameSearch}
                onChange={setFrameSearch}
                placeholder="Search frames (electro, neon)..."
              />
              <select
                value=""
                onChange={(e) => {
                  const frameId = e.target.value as FramePreset;
                  if (!frameId) return;
                  const info = FRAME_PRESETS.find((f) => f.id === frameId);
                  onBatchUpdateSelected({
                    framePreset: frameId,
                    frameColor: info?.defaultColor ?? '#38BDF8',
                    frameThickness: 50,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                <option value="">Choose frame for all...</option>
                {filteredAvailableFrames.map((fr) => (
                  <option key={fr.id} value={fr.id}>
                    {fr.label}
                  </option>
                ))}
              </select>

              <div className="text-xs font-medium text-slate-300 pt-1">Batch Transition In</div>
              <InspectorSearchInput
                value={transSearch}
                onChange={setTransSearch}
                placeholder="Search transitions..."
              />
              <select
                value=""
                onChange={(e) => {
                  const val = e.target.value as TransitionType;
                  if (!val) return;
                  const preset = TRANSITIONS_CATALOG.find((t) => t.id === val);
                  onBatchUpdateSelected({
                    transitionIn: val,
                    transitionInDuration: preset?.defaultDuration ?? 0.5,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                <option value="">Choose transition for all...</option>
                <option value="none">None (Cut)</option>
                {filteredAvailableTransitions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>

              <div className="text-xs font-medium text-slate-300 pt-1">Batch Color Grade</div>
              <InspectorSearchInput
                value={colorSearch}
                onChange={setColorSearch}
                placeholder="Search color presets..."
              />
              <div className="grid grid-cols-2 @[250px]:grid-cols-3 gap-1.5">
                {filteredFilterPresetKeys.map((presetKey) => (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => {
                      const vals = FILTER_PRESET_VALUES[presetKey];
                      onBatchUpdateSelected({
                        filterPreset: presetKey,
                        brightness: vals.brightness,
                        contrast: vals.contrast,
                        saturation: vals.saturation,
                        warmth: vals.warmth,
                        vignette: vals.vignette,
                      });
                    }}
                    className="glow-btn px-2 py-1.5 text-[11px] font-medium rounded-md border bg-[#07090F] border-white/[0.08] text-slate-300 hover:text-white truncate"
                  >
                    {FILTER_PRESET_VALUES[presetKey].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showBatch('selected clips list') && (
          <div className="pt-4 border-t border-white/[0.08] space-y-1.5">
            <div className="text-xs font-medium text-slate-300 mb-2">Selected Clips</div>
            <div className="space-y-1 max-h-48 overflow-y-auto studio-scroll pr-1">
              {selectedClips.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-[#07090F] border border-white/[0.05]"
                >
                  <span className="text-slate-300 truncate">{c.name}</span>
                  <span className="font-mono text-slate-500 shrink-0 ml-2">{c.track}</span>
                </div>
              ))}
            </div>
          </div>
          )}
              </>
            );
          })()}
        </div>
      </aside>
    );
  }

  const selectedClip = selectedClips[0] ?? null;

  if (!selectedClip) {
    const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio];
    return (
      <aside
        style={{ width }}
        className="@container shrink-0 min-w-0 studio-panel border-l border-white/[0.08] flex flex-col h-full overflow-y-auto overflow-x-hidden studio-scroll"
      >
        <div className="px-3 @[260px]:px-4 py-3.5 border-b border-white/[0.08] space-y-2.5">
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
            Sequence Settings
          </h2>
          <InspectorSearchInput
            value={seqSearch}
            onChange={setSeqSearch}
            placeholder="Search sequence settings & shortcuts..."
          />
        </div>

        <div className="p-3 @[260px]:p-4 space-y-5">
          {(() => {
            const seqNeedle = seqSearch.trim().toLowerCase();
            const showSeq = (keywords: string) =>
              !seqNeedle || keywords.toLowerCase().includes(seqNeedle);
            const shortcuts = [
              { label: 'Play / Pause', keys: 'Space / K' },
              { label: 'Copy / Cut / Paste', keys: 'Ctrl+C / X / V' },
              { label: 'Duplicate Clip', keys: 'Ctrl+D' },
              { label: 'Delete Selected', keys: 'Delete / Backspace' },
              { label: 'Split Clip at Playhead', keys: 'S / Ctrl+B' },
              { label: 'Undo / Redo', keys: 'Ctrl+Z / Ctrl+Y' },
              { label: 'Select All Timeline', keys: 'Ctrl+A' },
              { label: 'Multi-Select Clips', keys: 'Ctrl/Shift+Click' },
              { label: 'Step Frame / Jump 1s', keys: 'Left/Right · J/L' },
              { label: 'Start / End · Mute', keys: 'Home/End · M' },
              { label: 'Timeline Zoom', keys: '+ / -' },
              { label: 'Save / Export', keys: 'Ctrl+S / Ctrl+E' },
            ].filter(
              (s) =>
                !seqNeedle ||
                s.label.toLowerCase().includes(seqNeedle) ||
                s.keys.toLowerCase().includes(seqNeedle) ||
                'keyboard shortcuts'.includes(seqNeedle)
            );
            return (
              <>
                {showSeq('project title name') && (
                  <div className="space-y-1.5">
                    <label className="block text-xs text-slate-400">Project Title</label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => onChangeProjectName(e.target.value)}
                      placeholder="Untitled Sequence"
                      className="w-full px-3 py-2 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                    />
                  </div>
                )}

                {showSeq('timeline frame rate fps 24 30 60') && (
                  <div className="space-y-1.5">
                    <label className="block text-xs text-slate-400">Timeline Frame Rate</label>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                      {([24, 30, 60] as const).map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => onChangeFps(rate)}
                          className={`glow-btn py-1.5 text-xs font-mono rounded-md border border-transparent ${
                            fps === rate
                              ? 'bg-[#1A2130] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {rate} fps
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {showSeq('canvas output total duration active clips resolution') && (
                  <div className="pt-3 border-t border-white/[0.08] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Canvas Output</span>
                      <span className="font-mono text-slate-200">
                        {dims.width} × {dims.height}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Total Duration</span>
                      <span className="font-mono text-slate-200">{formatShortTime(totalDuration)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Active Clips</span>
                      <span className="font-mono text-slate-200">{clipCount}</span>
                    </div>
                  </div>
                )}

                {shortcuts.length > 0 && (
                  <div className="pt-4 border-t border-white/[0.08] space-y-2">
                    <div className="text-xs font-medium text-slate-300">Keyboard Shortcuts</div>
                    <div className="space-y-1.5 text-[11px] text-slate-400">
                      {shortcuts.map((item) => (
                        <div key={item.label} className="flex justify-between">
                          <span>{item.label}</span>
                          <span className="font-mono text-slate-300">{item.keys}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </aside>
    );
  }

  const isTitle = isTitleTrack(selectedClip.track) && Boolean(selectedClip.textConfig);
  const isSticker = isTitleTrack(selectedClip.track) && Boolean(selectedClip.stickerConfig);
  const isAudio = isAudioTrack(selectedClip.track);
  const isVisual = isVisualTrack(selectedClip.track);
  const isRenderable = isVisual || isTitle || isSticker;

  const applyFilterPreset = (preset: FilterPreset) => {
    const vals = FILTER_PRESET_VALUES[preset];
    onUpdateClip(selectedClip.id, {
      filterPreset: preset,
      brightness: vals.brightness,
      contrast: vals.contrast,
      saturation: vals.saturation,
      warmth: vals.warmth,
      vignette: vals.vignette,
    });
  };

  const activeGlowColor = selectedClip.glowColor ?? '#38BDF8';
  const activeGlowIntensity = selectedClip.glowIntensity ?? 0;
  const activeFxPreset = selectedClip.fxPreset ?? 'none';
  const activeFxIntensity = selectedClip.fxIntensity ?? 75;
  const activeFramePreset = selectedClip.framePreset ?? 'none';
  const activeFrameColor = selectedClip.frameColor ?? '#38BDF8';
  const activeFrameThickness = selectedClip.frameThickness ?? 50;

  return (
    <aside
      style={{ width }}
      className="@container shrink-0 min-w-0 studio-panel border-l border-white/[0.08] flex flex-col h-full overflow-y-auto overflow-x-hidden studio-scroll"
    >
      {/* Header */}
      <div className="px-3 @[260px]:px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-100 truncate">
            {selectedClip.name}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
            {selectedClip.track} · {formatShortTime(selectedClip.duration)}
          </div>
        </div>
        {isRenderable && (
          <button
            type="button"
            onClick={() =>
              onUpdateClip(selectedClip.id, {
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
                keyframes: [],
              })
            }
            className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-md border border-transparent shrink-0"
            title="Reset clip adjustments"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="px-3 @[260px]:px-4 py-2.5 border-b border-white/[0.08]">
        <InspectorSearchInput
          value={clipSettingSearch}
          onChange={setClipSettingSearch}
          placeholder="Search settings (pan, caption, color, glow, speed)..."
        />
      </div>

      <div className="p-3 @[260px]:p-4 space-y-5">
        {(() => {
          const sectionNeedle = clipSettingSearch.trim().toLowerCase();
          const showSection = (keywords: string) =>
            !sectionNeedle || keywords.toLowerCase().includes(sectionNeedle);
          return (
            <>
        {/* Quick Start & Duration Bar (direct manual entry for image, text, sticker & clips) */}
        {showSection('clip timing manual start duration') && (() => {
          const isBoundedMedia =
            selectedAsset?.type === 'video' || selectedAsset?.type === 'audio';
          const maxEditableDur = isBoundedMedia
            ? Math.max(
                0.25,
                Number(
                  (
                    (selectedAsset.duration - selectedClip.sourceOffset) /
                    Math.max(0.1, selectedClip.speed)
                  ).toFixed(2)
                )
              )
            : 3600;
          return (
            <div className="p-2.5 rounded-lg bg-[#090C13] border border-white/[0.08] space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-300">
                <span>Clip Timing (Manual)</span>
                <span className="font-mono text-[10px] text-slate-500">
                  {formatShortTime(selectedClip.startTime)} →{' '}
                  {formatShortTime(selectedClip.startTime + selectedClip.duration)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <SliderRow
                  label="Start"
                  value={selectedClip.startTime}
                  min={0}
                  max={Math.max(60, Math.ceil(totalDuration + 15))}
                  step={0.1}
                  allowDirectInput
                  inputMin={0}
                  inputMax={36000}
                  unit="s"
                  onChange={(val) => onUpdateClip(selectedClip.id, { startTime: val })}
                />
                <SliderRow
                  label="Duration"
                  value={selectedClip.duration}
                  min={0.2}
                  max={isBoundedMedia ? Math.max(0.25, maxEditableDur) : Math.max(60, Math.ceil(selectedClip.duration))}
                  step={0.1}
                  allowDirectInput
                  inputMin={0.1}
                  inputMax={maxEditableDur}
                  unit="s"
                  onChange={(val) => onUpdateClip(selectedClip.id, { duration: val })}
                />
              </div>
            </div>
          );
        })()}

        {/* Text Content & Typography Editor */}
        {isTitle && selectedClip.textConfig && showSection('title copy text typeface font size scale rotation alignment color entrance motion backdrop scrim caption subtitle') && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs text-slate-400">Title Copy</label>
                {(() => {
                  const detected = detectTextLanguage(selectedClip.textConfig!.text);
                  return (
                    <span className="text-[10px] font-mono text-sky-300/90 truncate">
                      {detected.languageName} · {detected.direction.toUpperCase()}
                    </span>
                  );
                })()}
              </div>
              <textarea
                rows={3}
                dir="auto"
                value={selectedClip.textConfig.text}
                onChange={(e) => {
                  const nextText = e.target.value;
                  const detected = detectTextLanguage(nextText);
                  ensureScriptFontLoaded(nextText);
                  onUpdateClip(selectedClip.id, {
                    textConfig: {
                      ...selectedClip.textConfig!,
                      text: nextText,
                      detectedLanguage: detected.languageName,
                    },
                    name: nextText.split('\n')[0] || 'Title Overlay',
                  });
                }}
                className="w-full px-3 py-2 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs text-slate-400">Typeface</label>
                <input
                  ref={fontInputRef}
                  type="file"
                  multiple
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  onChange={async (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const uploaded = await onImportFonts(e.target.files);
                      if (uploaded) {
                        onUpdateClip(selectedClip.id, {
                          textConfig: {
                            ...selectedClip.textConfig!,
                            fontFamily: uploaded.family,
                          },
                        });
                      }
                      e.target.value = '';
                    }
                  }}
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onOpenAutoFonts}
                    className="glow-btn flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-sky-300 hover:text-white border border-transparent"
                    title="Browse and download famous auto fonts"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Auto Fonts</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fontInputRef.current?.click()}
                    className="glow-btn flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-slate-300 hover:text-white border border-transparent"
                    title="Upload custom .ttf, .otf, or .woff2 font"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Upload</span>
                  </button>
                </div>
              </div>
              <InspectorSearchInput
                value={fontSearch}
                onChange={setFontSearch}
                placeholder="Search typeface..."
              />
              <select
                value={selectedClip.textConfig.fontFamily}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, {
                    textConfig: {
                      ...selectedClip.textConfig!,
                      fontFamily: e.target.value as TextFontFamily,
                    },
                  })
                }
                style={{ fontFamily: `"${selectedClip.textConfig.fontFamily}", sans-serif` }}
                className="w-full px-3 py-2 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                {filteredCustomFonts.length > 0 && (
                  <optgroup label="Custom Fonts">
                    {filteredCustomFonts.map((f) => (
                      <option key={f.id} value={f.family}>
                        {f.family}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Built-in Fonts">
                  {filteredBuiltinFonts.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <SliderRow
              label="Font Size"
              value={selectedClip.textConfig.fontSize}
              min={8}
              max={400}
              allowDirectInput
              inputMin={4}
              inputMax={2000}
              unit="px"
              onChange={(val) =>
                onUpdateClip(selectedClip.id, {
                  textConfig: { ...selectedClip.textConfig!, fontSize: val },
                })
              }
            />

            <SliderRow
              label="Scale"
              value={selectedClip.scale}
              min={10}
              max={500}
              allowDirectInput
              inputMin={10}
              inputMax={1000}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { scale: val })}
            />
            <SliderRow
              label="Rotation"
              value={selectedClip.rotation ?? 0}
              min={-180}
              max={180}
              unit="°"
              onChange={(val) => onUpdateClip(selectedClip.id, { rotation: val })}
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">Alignment</span>
              <div className="flex items-center gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        textConfig: { ...selectedClip.textConfig!, align },
                      })
                    }
                    className={`glow-btn p-1.5 rounded border border-transparent ${
                      selectedClip.textConfig!.align === align
                        ? 'bg-[#1A2130] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {align === 'left' ? (
                      <AlignLeft className="w-3.5 h-3.5" />
                    ) : align === 'center' ? (
                      <AlignCenter className="w-3.5 h-3.5" />
                    ) : (
                      <AlignRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs text-slate-400">Color</span>
              <div className="flex flex-wrap items-center gap-2">
                {TEXT_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        textConfig: { ...selectedClip.textConfig!, color: hex },
                      })
                    }
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      selectedClip.textConfig!.color.toUpperCase() === hex
                        ? 'border-sky-400 scale-110'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                ))}
                <input
                  type="color"
                  value={selectedClip.textConfig.color}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      textConfig: { ...selectedClip.textConfig!, color: e.target.value },
                    })
                  }
                  className="w-6 h-6 rounded bg-transparent cursor-pointer border-0 p-0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs text-slate-400">Entrance Motion</label>
              <div className="grid grid-cols-2 @[250px]:grid-cols-4 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                {(['none', 'fade', 'slide-up', 'scale'] as TextAnimation[]).map((anim) => (
                  <button
                    key={anim}
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        textConfig: { ...selectedClip.textConfig!, animation: anim },
                      })
                    }
                    className={`glow-btn py-1 text-[11px] rounded border border-transparent capitalize ${
                      selectedClip.textConfig!.animation === anim
                        ? 'bg-[#1A2130] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {anim === 'slide-up' ? 'Slide' : anim}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-1">
              <span>Backdrop Scrim</span>
              <input
                type="checkbox"
                checked={selectedClip.textConfig.hasScrim}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, {
                    textConfig: { ...selectedClip.textConfig!, hasScrim: e.target.checked },
                  })
                }
                className="accent-sky-400 w-4 h-4 rounded"
              />
            </label>

            {/* Caption & Subtitle Settings */}
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <Captions className="w-3.5 h-3.5 text-sky-400" />
                  <span>Caption Settings</span>
                </span>
                {onApplyCaptionStyleToAll && (
                  <button
                    type="button"
                    onClick={() => onApplyCaptionStyleToAll(selectedClip.textConfig!)}
                    className="glow-btn px-2 py-0.5 rounded text-[10px] font-medium text-sky-300 hover:text-white bg-sky-500/10 border border-sky-400/30 whitespace-nowrap"
                    title="Copy this caption style to all captions on T1"
                  >
                    Apply to All
                  </button>
                )}
              </div>

              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Subtitle / Caption Mode</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedClip.textConfig.isCaption)}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      textConfig: { ...selectedClip.textConfig!, isCaption: e.target.checked },
                    })
                  }
                  className="accent-sky-400 w-4 h-4 rounded"
                />
              </label>

              <div className="space-y-1.5">
                <span className="block text-xs text-slate-400">Caption Style Preset</span>
                <InspectorSearchInput
                  value={captionPresetSearch}
                  onChange={setCaptionPresetSearch}
                  placeholder="Search caption styles..."
                />
                <select
                  value={selectedClip.textConfig.captionStyle ?? 'classic-sub'}
                  onChange={(e) => {
                    const nextCfg = applyCaptionPresetToTextConfig(
                      selectedClip.textConfig!,
                      e.target.value as CaptionStylePreset
                    );
                    onUpdateClip(selectedClip.id, { textConfig: nextCfg });
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                >
                  {CAPTION_STYLE_PRESETS.filter(
                    (p) =>
                      p.id === (selectedClip.textConfig?.captionStyle ?? 'classic-sub') ||
                      filteredCaptionPresets.some((fp) => fp.id === p.id)
                  ).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="block text-xs text-slate-400">Line Layout Format</span>
                <div className="grid grid-cols-4 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                  {(
                    [
                      { id: 'single-line', label: '1 Line' },
                      { id: 'two-line', label: '2-Line' },
                      { id: 'multi-line', label: 'Multi' },
                      { id: 'word-by-word', label: '1 Word' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        onUpdateClip(selectedClip.id, {
                          textConfig: {
                            ...selectedClip.textConfig!,
                            captionLineMode: item.id as CaptionLineMode,
                          },
                        })
                      }
                      className={`glow-btn py-1 text-[10px] rounded border border-transparent ${
                        (selectedClip.textConfig?.captionLineMode ?? 'single-line') === item.id
                          ? 'bg-[#1A2130] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="block text-xs text-slate-400">
                  Active Speech Effect (Box &amp; Color)
                </span>
                <select
                  value={
                    selectedClip.textConfig.captionActiveMode ??
                    (selectedClip.textConfig.captionWordHighlight ? 'word-color' : 'none')
                  }
                  onChange={(e) => {
                    const mode = e.target.value as CaptionActiveMode;
                    onUpdateClip(selectedClip.id, {
                      textConfig: {
                        ...selectedClip.textConfig!,
                        captionActiveMode: mode,
                        captionWordHighlight: mode !== 'none',
                      },
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="none">Standard (No Active Word FX)</option>
                  <option value="word-color">Active Color Changer</option>
                  <option value="active-box">Active Speech Box</option>
                  <option value="active-box-scale">Pop + Active Speech Box</option>
                  <option value="underline-bar">Active Word Underline</option>
                  <option value="progressive-fill">Progressive Word Fill</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="block text-xs text-slate-400">Caption Placement (Move Anywhere)</span>
                <div className="grid grid-cols-4 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                  {(
                    [
                      { id: 'bottom', label: 'Bottom' },
                      { id: 'center', label: 'Center' },
                      { id: 'top', label: 'Top' },
                      { id: 'custom', label: 'Free' },
                    ] as const
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => {
                        const margin = selectedClip.textConfig?.captionSafeMargin ?? 10;
                        const nextY =
                          pos.id === 'custom'
                            ? selectedClip.y
                            : getYForCaptionPosition(pos.id as CaptionPositionPreset, margin, selectedClip.y);
                        const nextX = pos.id === 'custom' ? selectedClip.x : 0;
                        onUpdateClip(selectedClip.id, {
                          x: nextX,
                          y: nextY,
                          textConfig: {
                            ...selectedClip.textConfig!,
                            isCaption: true,
                            captionPosition: pos.id as CaptionPositionPreset,
                            captionX: nextX,
                            captionY: nextY,
                          },
                        });
                      }}
                      className={`glow-btn py-1 text-[10px] rounded border border-transparent ${
                        (selectedClip.textConfig?.captionPosition ?? 'bottom') === pos.id
                          ? 'bg-[#1A2130] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="Pos X"
                  value={selectedClip.x}
                  min={-80}
                  max={80}
                  step={0.5}
                  allowDirectInput
                  inputMin={-100}
                  inputMax={100}
                  unit="%"
                  onChange={(val) =>
                    onUpdateClip(selectedClip.id, {
                      x: val,
                      textConfig: {
                        ...selectedClip.textConfig!,
                        captionPosition: 'custom',
                        captionX: val,
                        captionY: selectedClip.y,
                      },
                    })
                  }
                />
                <SliderRow
                  label="Pos Y"
                  value={selectedClip.y}
                  min={-80}
                  max={80}
                  step={0.5}
                  allowDirectInput
                  inputMin={-100}
                  inputMax={100}
                  unit="%"
                  onChange={(val) =>
                    onUpdateClip(selectedClip.id, {
                      y: val,
                      textConfig: {
                        ...selectedClip.textConfig!,
                        captionPosition: 'custom',
                        captionX: selectedClip.x,
                        captionY: val,
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <span className="block text-xs text-slate-400">Language Direction</span>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
                  {(['auto', 'ltr', 'rtl'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() =>
                        onUpdateClip(selectedClip.id, {
                          textConfig: {
                            ...selectedClip.textConfig!,
                            textDirection: dir,
                          },
                        })
                      }
                      className={`glow-btn py-1 text-[11px] rounded border border-transparent uppercase font-mono ${
                        (selectedClip.textConfig?.textDirection ?? 'auto') === dir
                          ? 'bg-[#1A2130] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>

              <SliderRow
                label="Safe Margin"
                value={selectedClip.textConfig.captionSafeMargin ?? 10}
                min={4}
                max={24}
                unit="%"
                onChange={(val) => {
                  const pos = selectedClip.textConfig?.captionPosition ?? 'bottom';
                  onUpdateClip(selectedClip.id, {
                    ...(pos !== 'custom' ? { y: getYForCaptionPosition(pos, val) } : {}),
                    textConfig: {
                      ...selectedClip.textConfig!,
                      captionSafeMargin: val,
                    },
                  });
                }}
              />

              <SliderRow
                label="Outline Width (Optional)"
                value={selectedClip.textConfig.captionOutlineWidth ?? 0}
                min={0}
                max={14}
                unit="px"
                onChange={(val) =>
                  onUpdateClip(selectedClip.id, {
                    textConfig: { ...selectedClip.textConfig!, captionOutlineWidth: val },
                  })
                }
              />

              <div className="grid grid-cols-4 gap-2">
                <label className="space-y-1">
                  <span className="block text-[10px] text-slate-400 truncate">Outline</span>
                  <input
                    type="color"
                    value={selectedClip.textConfig.captionOutlineColor ?? '#050608'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, {
                        textConfig: {
                          ...selectedClip.textConfig!,
                          captionOutlineColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] text-slate-400 truncate">Word</span>
                  <input
                    type="color"
                    value={selectedClip.textConfig.captionHighlightColor ?? '#FACC15'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, {
                        textConfig: {
                          ...selectedClip.textConfig!,
                          captionHighlightColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] text-slate-400 truncate">Active Box</span>
                  <input
                    type="color"
                    value={selectedClip.textConfig.captionActiveBoxColor ?? '#0EA5E9'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, {
                        textConfig: {
                          ...selectedClip.textConfig!,
                          captionActiveBoxColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] text-slate-400 truncate">Box BG</span>
                  <input
                    type="color"
                    value={selectedClip.textConfig.captionBgColor ?? '#090B10'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, {
                        textConfig: {
                          ...selectedClip.textConfig!,
                          captionBgColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                  />
                </label>
              </div>

              {(selectedClip.textConfig.captionActiveMode === 'active-box' ||
                selectedClip.textConfig.captionActiveMode === 'active-box-scale') && (
                <SliderRow
                  label="Active Box Radius"
                  value={selectedClip.textConfig.captionActiveBoxRadius ?? 10}
                  min={0}
                  max={24}
                  unit="px"
                  onChange={(val) =>
                    onUpdateClip(selectedClip.id, {
                      textConfig: { ...selectedClip.textConfig!, captionActiveBoxRadius: val },
                    })
                  }
                />
              )}

              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Active Speech Highlight</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedClip.textConfig.captionWordHighlight)}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      textConfig: {
                        ...selectedClip.textConfig!,
                        captionWordHighlight: e.target.checked,
                        captionActiveMode: e.target.checked
                          ? selectedClip.textConfig!.captionActiveMode &&
                            selectedClip.textConfig!.captionActiveMode !== 'none'
                            ? selectedClip.textConfig!.captionActiveMode
                            : 'word-color'
                          : 'none',
                      },
                    })
                  }
                  className="accent-sky-400 w-4 h-4 rounded"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>ALL CAPS Text</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedClip.textConfig.captionUppercase)}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      textConfig: {
                        ...selectedClip.textConfig!,
                        captionUppercase: e.target.checked,
                      },
                    })
                  }
                  className="accent-sky-400 w-4 h-4 rounded"
                />
              </label>
            </div>
          </div>
        )}

        {/* Sticker Settings */}
        {isSticker && selectedClip.stickerConfig && showSection('sticker settings label emoji size scale rotation opacity color badge') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fuchsia-200 flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-fuchsia-300" />
                <span>Sticker Settings</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {selectedClip.stickerConfig.category}
              </span>
            </div>

            <div className="grid grid-cols-1 @[230px]:grid-cols-[1fr_76px] gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">Label</label>
                <input
                  type="text"
                  value={selectedClip.stickerConfig.label}
                  onChange={(e) => {
                    const nextLabel = e.target.value;
                    onUpdateClip(selectedClip.id, {
                      name: nextLabel || 'Sticker',
                      stickerConfig: {
                        ...selectedClip.stickerConfig!,
                        label: nextLabel,
                      },
                    });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-fuchsia-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">Emoji</label>
                <input
                  type="text"
                  value={selectedClip.stickerConfig.emoji ?? ''}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      stickerConfig: {
                        ...selectedClip.stickerConfig!,
                        emoji: e.target.value,
                      },
                    })
                  }
                  placeholder="🔥"
                  className="w-full px-2.5 py-1.5 text-xs text-center text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-fuchsia-400"
                />
              </div>
            </div>

            <SliderRow
              label="Sticker Size"
              value={selectedClip.stickerConfig.size}
              min={24}
              max={360}
              allowDirectInput
              unit="px"
              onChange={(val) =>
                onUpdateClip(selectedClip.id, {
                  stickerConfig: {
                    ...selectedClip.stickerConfig!,
                    size: val,
                  },
                })
              }
            />

            <SliderRow
              label="Scale"
              value={selectedClip.scale}
              min={10}
              max={500}
              allowDirectInput
              inputMin={10}
              inputMax={1000}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { scale: val })}
            />
            <SliderRow
              label="Rotation"
              value={selectedClip.rotation ?? 0}
              min={-180}
              max={180}
              unit="°"
              onChange={(val) => onUpdateClip(selectedClip.id, { rotation: val })}
            />
            <SliderRow
              label="Opacity"
              value={selectedClip.opacity}
              min={0}
              max={100}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { opacity: val })}
            />

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] text-slate-400 truncate">Primary</span>
                <input
                  type="color"
                  value={selectedClip.stickerConfig.primaryColor}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      stickerConfig: {
                        ...selectedClip.stickerConfig!,
                        primaryColor: e.target.value,
                      },
                    })
                  }
                  className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-slate-400 truncate">Accent</span>
                <input
                  type="color"
                  value={selectedClip.stickerConfig.accentColor}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      stickerConfig: {
                        ...selectedClip.stickerConfig!,
                        accentColor: e.target.value,
                      },
                    })
                  }
                  className="w-full h-7 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-slate-400 truncate">Text</span>
                <input
                  type="color"
                  value={selectedClip.stickerConfig.textColor}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      stickerConfig: {
                        ...selectedClip.stickerConfig!,
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
                checked={selectedClip.stickerConfig.showBadgeBg}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, {
                    stickerConfig: {
                      ...selectedClip.stickerConfig!,
                      showBadgeBg: e.target.checked,
                    },
                  })
                }
                className="accent-fuchsia-400 w-4 h-4 rounded"
              />
            </label>
          </div>
        )}

        {/* Glowing Color Effects & Visual FX (Visual, Title & Sticker Clips) */}
        {isRenderable && showSection('glow visual effects fx blur mosaic glitch neon') && (
          <div className={`space-y-3.5 ${isTitle || isSticker ? 'pt-4 border-t border-white/[0.08]' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Glow & Visual Effects</span>
              </span>
              {(activeGlowIntensity > 0 || activeFxPreset !== 'none') && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateClip(selectedClip.id, {
                      glowIntensity: 0,
                      fxPreset: 'none',
                      fxIntensity: 0,
                    })
                  }
                  className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                >
                  Clear FX
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs text-slate-400">Glow Color</span>
              <div className="flex flex-wrap items-center gap-2">
                {GLOW_COLOR_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        glowColor: hex,
                        glowIntensity: activeGlowIntensity > 0 ? activeGlowIntensity : 55,
                      })
                    }
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      activeGlowColor.toUpperCase() === hex
                        ? 'border-white scale-110'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: hex,
                      boxShadow: `0 0 12px ${hex}99`,
                    }}
                    title={hex}
                  />
                ))}
                <input
                  type="color"
                  value={activeGlowColor}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      glowColor: e.target.value,
                      glowIntensity: activeGlowIntensity > 0 ? activeGlowIntensity : 55,
                    })
                  }
                  className="w-6 h-6 rounded bg-transparent cursor-pointer border-0 p-0"
                  title="Pick any custom glow color"
                />
              </div>
            </div>

            <SliderRow
              label="Glow Intensity"
              value={activeGlowIntensity}
              min={0}
              max={100}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { glowIntensity: val })}
            />

            <div className="space-y-1.5">
              <label className="block text-xs text-slate-400">
                Famous Effect (Blur, Mosaic & FX)
              </label>
              <InspectorSearchInput
                value={fxSearch}
                onChange={setFxSearch}
                placeholder="Search effects (glow, blur, glitch)..."
              />
              <select
                value={activeFxPreset}
                onChange={(e) => {
                  const fxId = e.target.value as VisualEffectPreset;
                  const info = VISUAL_EFFECT_PRESETS.find((x) => x.id === fxId);
                  onUpdateClip(selectedClip.id, {
                    fxPreset: fxId,
                    fxIntensity: fxId === 'none' ? 0 : activeFxIntensity || 75,
                    ...(info && info.defaultGlowIntensity > 0
                      ? {
                          glowColor: info.defaultGlowColor,
                          glowIntensity: info.defaultGlowIntensity,
                        }
                      : {}),
                  });
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                {filteredAvailableEffects.map((fx) => (
                  <option key={fx.id} value={fx.id}>
                    {fx.id === 'none' ? 'Clean (None)' : `${fx.label} (${fx.category})`}
                  </option>
                ))}
              </select>
            </div>

            {activeFxPreset !== 'none' && (
              <SliderRow
                label="Effect Strength"
                value={activeFxIntensity}
                min={0}
                max={100}
                unit="%"
                onChange={(val) => onUpdateClip(selectedClip.id, { fxIntensity: val })}
              />
            )}
          </div>
        )}

        {/* Frame Overlay (Visual Clips) */}
        {isVisual && showSection('frame overlay border electro neon cinema thickness') && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200">Frame Overlay</span>
              {activeFramePreset !== 'none' && (
                <button
                  type="button"
                  onClick={() => onUpdateClip(selectedClip.id, { framePreset: 'none' })}
                  className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                >
                  Remove
                </button>
              )}
            </div>

            <InspectorSearchInput
              value={frameSearch}
              onChange={setFrameSearch}
              placeholder="Search frames (electro, neon, cinema)..."
            />

            <select
              value={activeFramePreset}
              onChange={(e) => {
                const frameId = e.target.value as FramePreset;
                const info = FRAME_PRESETS.find((f) => f.id === frameId);
                onUpdateClip(selectedClip.id, {
                  framePreset: frameId,
                  frameColor: info?.defaultColor ?? '#38BDF8',
                  frameThickness: selectedClip.frameThickness ?? 50,
                });
              }}
              className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
            >
              {filteredAvailableFrames.map((fr) => (
                <option key={fr.id} value={fr.id}>
                  {fr.label}
                </option>
              ))}
            </select>

            {activeFramePreset !== 'none' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Frame Color</span>
                  <input
                    type="color"
                    value={activeFrameColor}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, { frameColor: e.target.value })
                    }
                    className="w-7 h-6 rounded bg-transparent cursor-pointer border-0 p-0"
                  />
                </div>
                <SliderRow
                  label="Frame Size"
                  value={activeFrameThickness}
                  min={15}
                  max={100}
                  unit="%"
                  onChange={(val) => onUpdateClip(selectedClip.id, { frameThickness: val })}
                />
              </>
            )}
          </div>
        )}

        {/* Mask & Custom Mask (Visual Clips) */}
        {isVisual && showSection('video mask custom shape feather invert circle rectangle') && (() => {
          const activeMaskShape = selectedClip.maskShape ?? 'none';
          const activeCustomMask =
            activeMaskShape === 'custom' && selectedClip.customMaskId
              ? customMasks.find((m) => m.id === selectedClip.customMaskId) ??
                (selectedClip.customMaskDataUrl
                  ? {
                      id: selectedClip.customMaskId,
                      name: 'Active Custom Mask',
                      dataUrl: selectedClip.customMaskDataUrl,
                      createdAt: 0,
                    }
                  : null)
              : null;

          return (
            <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>Video Mask</span>
                </span>
                {activeMaskShape !== 'none' && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        maskShape: 'none',
                        customMaskId: undefined,
                        customMaskDataUrl: undefined,
                      })
                    }
                    className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                  >
                    Remove
                  </button>
                )}
              </div>

              <InspectorSearchInput
                value={maskSearch}
                onChange={setMaskSearch}
                placeholder="Search mask shapes & custom..."
              />

              <select
                value={
                  activeMaskShape === 'custom' && selectedClip.customMaskId
                    ? `custom:${selectedClip.customMaskId}`
                    : activeMaskShape
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('custom:')) {
                    const id = val.slice(7);
                    const found = customMasks.find((m) => m.id === id);
                    if (found) onApplyCustomMask(found);
                  } else {
                    const shape = val as MaskShape;
                    onUpdateClip(selectedClip.id, {
                      maskShape: shape,
                      maskCenterX: selectedClip.maskCenterX ?? 0,
                      maskCenterY: selectedClip.maskCenterY ?? 0,
                      maskWidth: selectedClip.maskWidth ?? 65,
                      maskHeight: selectedClip.maskHeight ?? 65,
                      maskFeather: selectedClip.maskFeather ?? 4,
                    });
                  }
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                {filteredAvailableMasks.map((mk) => (
                  <option key={mk.id} value={mk.id}>
                    {mk.label}
                  </option>
                ))}
                {filteredCustomMasks.length > 0 && (
                  <optgroup label="My Custom Masks">
                    {filteredCustomMasks.map((cm) => (
                      <option key={cm.id} value={`custom:${cm.id}`}>
                        {cm.name} (Custom)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenCustomMaskModal}
                  className="glow-btn flex-1 py-1.5 px-2.5 text-[11px] font-medium rounded-lg bg-[#141822] border border-sky-400/30 text-sky-200 flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Design / Upload Mask</span>
                </button>
                {activeCustomMask && (
                  <button
                    type="button"
                    onClick={() => downloadCustomMaskPng(activeCustomMask)}
                    className="glow-btn py-1.5 px-2.5 text-[11px] font-medium rounded-lg bg-[#141822] border border-white/[0.12] text-slate-200 flex items-center gap-1"
                    title="Download active custom mask as PNG"
                  >
                    <Download className="w-3 h-3 text-sky-300" />
                    <span>PNG</span>
                  </button>
                )}
              </div>

              {activeMaskShape !== 'none' && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 @[240px]:grid-cols-2 gap-3">
                    <SliderRow
                      label="Center X"
                      value={selectedClip.maskCenterX ?? 0}
                      min={-50}
                      max={50}
                      unit="%"
                      onChange={(val) => onUpdateClip(selectedClip.id, { maskCenterX: val })}
                    />
                    <SliderRow
                      label="Center Y"
                      value={selectedClip.maskCenterY ?? 0}
                      min={-50}
                      max={50}
                      unit="%"
                      onChange={(val) => onUpdateClip(selectedClip.id, { maskCenterY: val })}
                    />
                  </div>
                  <div className="grid grid-cols-1 @[240px]:grid-cols-2 gap-3">
                    <SliderRow
                      label="Width"
                      value={selectedClip.maskWidth ?? 65}
                      min={10}
                      max={180}
                      unit="%"
                      onChange={(val) => onUpdateClip(selectedClip.id, { maskWidth: val })}
                    />
                    <SliderRow
                      label="Height"
                      value={selectedClip.maskHeight ?? 65}
                      min={10}
                      max={180}
                      unit="%"
                      onChange={(val) => onUpdateClip(selectedClip.id, { maskHeight: val })}
                    />
                  </div>
                  <SliderRow
                    label="Feather"
                    value={selectedClip.maskFeather ?? 4}
                    min={0}
                    max={60}
                    unit="px"
                    onChange={(val) => onUpdateClip(selectedClip.id, { maskFeather: val })}
                  />
                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                    <span>Invert Mask</span>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedClip.maskInvert)}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, { maskInvert: e.target.checked })
                      }
                      className="accent-sky-400 w-4 h-4 rounded"
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })()}

        {/* Keyframe Animation (Visual, Title & Sticker Clips) */}
        {isRenderable && showSection('keyframe animation interpolation smooth linear position scale rotation opacity') && (() => {
          const sortedKeyframes = [...(selectedClip.keyframes ?? [])].sort(
            (a, b) => a.time - b.time
          );
          const localPlayhead = Number(
            clamp(currentTime - selectedClip.startTime, 0, selectedClip.duration).toFixed(2)
          );
          const matchingKf = sortedKeyframes.find(
            (kf) => Math.abs(kf.time - localPlayhead) < 0.06
          );
          const prevKf = [...sortedKeyframes]
            .reverse()
            .find((kf) => kf.time < localPlayhead - 0.05);
          const nextKf = sortedKeyframes.find((kf) => kf.time > localPlayhead + 0.05);

          const handleUpsertKeyframe = () => {
            const payload: ClipKeyframe = {
              id: matchingKf ? matchingKf.id : uid('kf'),
              time: localPlayhead,
              x: selectedClip.x,
              y: selectedClip.y,
              scale: selectedClip.scale,
              opacity: selectedClip.opacity,
              rotation: selectedClip.rotation ?? 0,
              easing: kfEasing,
            };
            const nextList = matchingKf
              ? sortedKeyframes.map((k) => (k.id === matchingKf.id ? payload : k))
              : [...sortedKeyframes, payload];
            onUpdateClip(selectedClip.id, { keyframes: nextList });
          };

          const handleDeleteKeyframe = (kfId: string) => {
            onUpdateClip(selectedClip.id, {
              keyframes: sortedKeyframes.filter((k) => k.id !== kfId),
            });
          };

          return (
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <Diamond className="w-3.5 h-3.5 text-amber-400" />
                  <span>Keyframe Animation</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  @{formatShortTime(localPlayhead)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!prevKf}
                  onClick={() => prevKf && onSeek(selectedClip.startTime + prevKf.time)}
                  className="glow-btn p-1.5 rounded-md bg-[#07090F] border border-white/[0.08] text-slate-300 hover:text-white disabled:opacity-35"
                  title="Jump to previous keyframe"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleUpsertKeyframe}
                  className="glow-btn flex-1 py-1.5 px-2.5 text-[11px] font-medium rounded-md bg-amber-500/15 border border-amber-400/40 text-amber-200 hover:text-white flex items-center justify-center gap-1.5"
                >
                  <Diamond className="w-3 h-3" />
                  <span>{matchingKf ? 'Update Keyframe' : 'Add Keyframe'}</span>
                </button>
                <button
                  type="button"
                  disabled={!nextKf}
                  onClick={() => nextKf && onSeek(selectedClip.startTime + nextKf.time)}
                  className="glow-btn p-1.5 rounded-md bg-[#07090F] border border-white/[0.08] text-slate-300 hover:text-white disabled:opacity-35"
                  title="Jump to next keyframe"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400">Interpolation</span>
                <div className="flex items-center gap-1 p-0.5 bg-[#07090F] rounded border border-white/[0.08]">
                  {(['ease-in-out', 'linear'] as KeyframeEasing[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setKfEasing(mode)}
                      className={`glow-btn px-2 py-0.5 rounded text-[10px] border border-transparent ${
                        kfEasing === mode
                          ? 'bg-[#1A2130] text-sky-200'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode === 'ease-in-out' ? 'Smooth' : 'Linear'}
                    </button>
                  ))}
                </div>
              </div>

              {sortedKeyframes.length > 0 ? (
                <div className="space-y-1 max-h-36 overflow-y-auto studio-scroll pr-0.5">
                  {sortedKeyframes.map((kf) => {
                    const isAtPlayhead = Math.abs(kf.time - localPlayhead) < 0.06;
                    return (
                      <div
                        key={kf.id}
                        className={`glow-card flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] border ${
                          isAtPlayhead
                            ? 'bg-amber-500/15 border-amber-400/50 text-amber-100'
                            : 'bg-[#07090F] border-white/[0.06] text-slate-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSeek(selectedClip.startTime + kf.time)}
                          className="no-multi-glow flex-1 text-left flex items-center gap-1.5 truncate"
                          title="Seek playhead to keyframe"
                        >
                          <Diamond className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                          <span className="font-mono">{kf.time.toFixed(2)}s</span>
                          <span className="text-slate-500 truncate">
                            S:{Math.round(kf.scale)}% O:{Math.round(kf.opacity)}% R:{Math.round(kf.rotation)}°
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKeyframe(kf.id)}
                          className="glow-btn text-slate-500 hover:text-rose-400 p-1 rounded border border-transparent"
                          title="Delete keyframe"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Move playhead & adjust Position, Scale, Rotation or Opacity, then add keyframes.
                </p>
              )}
            </div>
          );
        })()}

        {/* Timing & Fades (All clips) */}
        {showSection('timing fades duration playback speed fade in fade out') && (
        <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
          <div className="text-xs font-medium text-slate-300">Timing & Fades</div>
          {(() => {
            const isBoundedMedia =
              selectedAsset?.type === 'video' || selectedAsset?.type === 'audio';
            const maxEditableDur = isBoundedMedia
              ? Math.max(
                  0.25,
                  Number(
                    (
                      (selectedAsset.duration - selectedClip.sourceOffset) /
                      Math.max(0.1, selectedClip.speed)
                    ).toFixed(2)
                  )
                )
              : 3600;
            return (
              <SliderRow
                label="Duration"
                value={selectedClip.duration}
                min={0.2}
                max={isBoundedMedia ? Math.max(0.25, maxEditableDur) : Math.max(60, Math.ceil(selectedClip.duration))}
                step={0.1}
                allowDirectInput
                inputMin={0.1}
                inputMax={maxEditableDur}
                unit="s"
                onChange={(val) => onUpdateClip(selectedClip.id, { duration: val })}
              />
            );
          })()}
          {!isTitle && !isSticker && (
            <SliderRow
              label="Playback Speed"
              value={selectedClip.speed}
              min={0.25}
              max={4}
              step={0.05}
              unit="x"
              onChange={(val) => onUpdateClip(selectedClip.id, { speed: val })}
            />
          )}
          <div className="grid grid-cols-1 @[240px]:grid-cols-2 gap-3">
            <SliderRow
              label="Fade In"
              value={selectedClip.fadeIn}
              min={0}
              max={2}
              step={0.05}
              unit="s"
              onChange={(val) => onUpdateClip(selectedClip.id, { fadeIn: val })}
            />
            <SliderRow
              label="Fade Out"
              value={selectedClip.fadeOut}
              min={0}
              max={2}
              step={0.05}
              unit="s"
              onChange={(val) => onUpdateClip(selectedClip.id, { fadeOut: val })}
            />
          </div>
        </div>
        )}

        {/* Clip Animations (In, Out & Combo Loop for Visual, Title & Sticker Clips) */}
        {isRenderable && showSection('animations in out combo loop motion pan drift zoom bounce pulse shake spin') && (() => {
          const activeAnimIn = selectedClip.animationIn ?? 'none';
          const activeAnimOut = selectedClip.animationOut ?? 'none';
          const activeAnimCombo = selectedClip.animationCombo ?? 'none';
          const hasAnyAnim =
            activeAnimIn !== 'none' || activeAnimOut !== 'none' || activeAnimCombo !== 'none';

          return (
            <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>Animations (In, Out & Loop)</span>
                </span>
                {hasAnyAnim && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, {
                        animationIn: 'none',
                        animationOut: 'none',
                        animationCombo: 'none',
                      })
                    }
                    className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                  >
                    Clear
                  </button>
                )}
              </div>

              <InspectorSearchInput
                value={animSearch}
                onChange={setAnimSearch}
                placeholder="Search animations (bounce, slide, pulse)..."
              />

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">In Animation</label>
                <select
                  value={activeAnimIn}
                  onChange={(e) => {
                    const val = e.target.value as ClipAnimationPreset;
                    const preset = ANIMATION_PRESETS.find((a) => a.id === val);
                    onUpdateClip(selectedClip.id, {
                      animationIn: val,
                      animationInDuration:
                        selectedClip.animationInDuration ?? preset?.defaultDuration ?? 0.5,
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="none">None</option>
                  {availableInAnimations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              {activeAnimIn !== 'none' && (
                <SliderRow
                  label="In Anim Duration"
                  value={selectedClip.animationInDuration ?? 0.5}
                  min={0.15}
                  max={2.5}
                  step={0.05}
                  unit="s"
                  onChange={(val) =>
                    onUpdateClip(selectedClip.id, { animationInDuration: val })
                  }
                />
              )}

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">Out Animation</label>
                <select
                  value={activeAnimOut}
                  onChange={(e) => {
                    const val = e.target.value as ClipAnimationPreset;
                    const preset = ANIMATION_PRESETS.find((a) => a.id === val);
                    onUpdateClip(selectedClip.id, {
                      animationOut: val,
                      animationOutDuration:
                        selectedClip.animationOutDuration ?? preset?.defaultDuration ?? 0.5,
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="none">None</option>
                  {availableOutAnimations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              {activeAnimOut !== 'none' && (
                <SliderRow
                  label="Out Anim Duration"
                  value={selectedClip.animationOutDuration ?? 0.5}
                  min={0.15}
                  max={2.5}
                  step={0.05}
                  unit="s"
                  onChange={(val) =>
                    onUpdateClip(selectedClip.id, { animationOutDuration: val })
                  }
                />
              )}

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">Combo / Loop Motion</label>
                <select
                  value={activeAnimCombo}
                  onChange={(e) => {
                    const val = e.target.value as ClipAnimationPreset;
                    if (val === 'pan-zoom' && isVisual) {
                      onUpdateClip(selectedClip.id, {
                        ...buildPanZoomClipPatch(selectedClip),
                        animationCombo: 'pan-zoom',
                      });
                    } else {
                      onUpdateClip(selectedClip.id, {
                        animationCombo: val,
                      });
                    }
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="none">None</option>
                  {availableComboAnimations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              {hasAnyAnim && (
                <SliderRow
                  label="Animation Intensity"
                  value={selectedClip.animationIntensity ?? 75}
                  min={10}
                  max={150}
                  unit="%"
                  onChange={(val) =>
                    onUpdateClip(selectedClip.id, { animationIntensity: val })
                  }
                />
              )}
            </div>
          );
        })()}

        {/* Clip Transitions (Visual, Title & Sticker Clips) */}
        {isRenderable && showSection('transitions cut dissolve wipe zoom slide adjacent seam between clips') && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Transitions</span>
              {(adjacentPrevClip || adjacentNextClip) && (
                <span className="text-[10px] text-sky-300/80 font-mono">Seam Ready</span>
              )}
            </div>
            <InspectorSearchInput
              value={transSearch}
              onChange={setTransSearch}
              placeholder="Search transitions..."
            />

            {onApplySeamTransition && (adjacentPrevClip || adjacentNextClip) && (
              <div className="p-2.5 rounded-lg bg-[#090C13] border border-sky-400/20 space-y-2.5">
                <div className="text-[11px] font-medium text-sky-200 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
                  <span>Between Adjacent Clips</span>
                </div>
                {adjacentPrevClip && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate">Prev: {adjacentPrevClip.name} ↔ This</span>
                      <span className="font-mono text-sky-300 shrink-0 ml-1">
                        {selectedClip.transitionIn && selectedClip.transitionIn !== 'none'
                          ? selectedClip.transitionIn
                          : 'Cut'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['dissolve', 'slide-left', 'zoom-in', 'none'] as TransitionType[]).map((tId) => {
                        const active = (selectedClip.transitionIn ?? 'none') === tId;
                        const label =
                          tId === 'dissolve'
                            ? 'Dissolve'
                            : tId === 'slide-left'
                            ? 'Slide'
                            : tId === 'zoom-in'
                            ? 'Zoom'
                            : 'Cut';
                        return (
                          <button
                            key={tId}
                            type="button"
                            onClick={() =>
                              onApplySeamTransition(
                                adjacentPrevClip.id,
                                selectedClip.id,
                                tId,
                                selectedClip.transitionInDuration ?? 0.5
                              )
                            }
                            className={`glow-btn py-1 px-1.5 text-[10px] font-medium rounded border ${
                              active
                                ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                                : 'bg-[#07090F] border-white/[0.08] text-slate-300 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {adjacentNextClip && (
                  <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate">This ↔ Next: {adjacentNextClip.name}</span>
                      <span className="font-mono text-sky-300 shrink-0 ml-1">
                        {adjacentNextClip.transitionIn && adjacentNextClip.transitionIn !== 'none'
                          ? adjacentNextClip.transitionIn
                          : 'Cut'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['dissolve', 'slide-left', 'zoom-in', 'none'] as TransitionType[]).map((tId) => {
                        const active = (adjacentNextClip.transitionIn ?? 'none') === tId;
                        const label =
                          tId === 'dissolve'
                            ? 'Dissolve'
                            : tId === 'slide-left'
                            ? 'Slide'
                            : tId === 'zoom-in'
                            ? 'Zoom'
                            : 'Cut';
                        return (
                          <button
                            key={tId}
                            type="button"
                            onClick={() =>
                              onApplySeamTransition(
                                selectedClip.id,
                                adjacentNextClip.id,
                                tId,
                                adjacentNextClip.transitionInDuration ?? 0.5
                              )
                            }
                            className={`glow-btn py-1 px-1.5 text-[10px] font-medium rounded border ${
                              active
                                ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                                : 'bg-[#07090F] border-white/[0.08] text-slate-300 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs text-slate-400">Transition In</label>
              <select
                value={selectedClip.transitionIn ?? 'none'}
                onChange={(e) => {
                  const val = e.target.value as TransitionType;
                  const preset = TRANSITIONS_CATALOG.find((t) => t.id === val);
                  onUpdateClip(selectedClip.id, {
                    transitionIn: val,
                    transitionInDuration:
                      selectedClip.transitionInDuration ?? preset?.defaultDuration ?? 0.5,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                <option value="none">Cut (None)</option>
                {filteredAvailableTransitions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {(selectedClip.transitionIn ?? 'none') !== 'none' && (
              <SliderRow
                label="In Duration"
                value={selectedClip.transitionInDuration ?? 0.5}
                min={0.15}
                max={2.5}
                step={0.05}
                unit="s"
                onChange={(val) =>
                  onUpdateClip(selectedClip.id, { transitionInDuration: val })
                }
              />
            )}

            <div className="space-y-1.5">
              <label className="block text-xs text-slate-400">Transition Out</label>
              <select
                value={selectedClip.transitionOut ?? 'none'}
                onChange={(e) => {
                  const val = e.target.value as TransitionType;
                  const preset = TRANSITIONS_CATALOG.find((t) => t.id === val);
                  onUpdateClip(selectedClip.id, {
                    transitionOut: val,
                    transitionOutDuration:
                      selectedClip.transitionOutDuration ?? preset?.defaultDuration ?? 0.5,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                <option value="none">Cut (None)</option>
                {filteredAvailableTransitions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {(selectedClip.transitionOut ?? 'none') !== 'none' && (
              <SliderRow
                label="Out Duration"
                value={selectedClip.transitionOutDuration ?? 0.5}
                min={0.15}
                max={2.5}
                step={0.05}
                unit="s"
                onChange={(val) =>
                  onUpdateClip(selectedClip.id, { transitionOutDuration: val })
                }
              />
            )}

            {onApplyTransitionToAll && (
              <button
                type="button"
                onClick={() => {
                  const chosen =
                    selectedClip.transitionIn && selectedClip.transitionIn !== 'none'
                      ? selectedClip.transitionIn
                      : selectedClip.transitionOut && selectedClip.transitionOut !== 'none'
                      ? selectedClip.transitionOut
                      : 'dissolve';
                  const dur =
                    selectedClip.transitionIn && selectedClip.transitionIn !== 'none'
                      ? selectedClip.transitionInDuration ?? 0.5
                      : selectedClip.transitionOutDuration ?? 0.5;
                  onApplyTransitionToAll(chosen, dur);
                }}
                className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-100 flex items-center justify-center gap-1.5"
                title="Apply this transition between all clips on timeline"
              >
                <ArrowLeftRight className="w-3 h-3 text-sky-300" />
                <span>Apply Transition to All Clips</span>
              </button>
            )}
          </div>
        )}

        {/* Transform & Motion (Visual Clips) */}
        {isVisual && showSection('transform motion ken burns camera pan zoom keyframes start end scale position rotation opacity') && (() => {
          const isPanZoom = selectedClip.kenBurns === 'pan-zoom';
          const pzStartScale = selectedClip.panZoomStartScale ?? 100;
          const pzStartX = selectedClip.panZoomStartX ?? 0;
          const pzStartY = selectedClip.panZoomStartY ?? 0;
          const pzEndScale = selectedClip.panZoomEndScale ?? 120;
          const pzEndX = selectedClip.panZoomEndX ?? 0;
          const pzEndY = selectedClip.panZoomEndY ?? 0;
          const pzEasing: KeyframeEasing = selectedClip.panZoomEasing ?? 'ease-in-out';

          const applyPanZoomPatch = (overrides: {
            panZoomStartScale?: number;
            panZoomStartX?: number;
            panZoomStartY?: number;
            panZoomEndScale?: number;
            panZoomEndX?: number;
            panZoomEndY?: number;
            panZoomEasing?: KeyframeEasing;
          }) => {
            onUpdateClip(
              selectedClip.id,
              buildPanZoomClipPatch(selectedClip, {
                ...(overrides.panZoomStartScale !== undefined
                  ? { startScale: overrides.panZoomStartScale }
                  : {}),
                ...(overrides.panZoomStartX !== undefined
                  ? { startX: overrides.panZoomStartX }
                  : {}),
                ...(overrides.panZoomStartY !== undefined
                  ? { startY: overrides.panZoomStartY }
                  : {}),
                ...(overrides.panZoomEndScale !== undefined
                  ? { endScale: overrides.panZoomEndScale }
                  : {}),
                ...(overrides.panZoomEndX !== undefined
                  ? { endX: overrides.panZoomEndX }
                  : {}),
                ...(overrides.panZoomEndY !== undefined
                  ? { endY: overrides.panZoomEndY }
                  : {}),
                ...(overrides.panZoomEasing !== undefined
                  ? { easing: overrides.panZoomEasing }
                  : {}),
              })
            );
          };

          return (
          <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Transform & Motion</span>
              {!isPanZoom && (
                <button
                  type="button"
                  onClick={() => onUpdateClip(selectedClip.id, buildPanZoomClipPatch(selectedClip))}
                  className="glow-btn px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 border border-sky-400/35 text-sky-200 hover:text-white"
                >
                  + Pan & Zoom
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs text-slate-400">Ken Burns / Pan & Zoom Preset</label>
              <select
                value={selectedClip.kenBurns}
                onChange={(e) => {
                  const nextKb = e.target.value as KenBurnsPreset;
                  if (nextKb === 'pan-zoom') {
                    onUpdateClip(selectedClip.id, buildPanZoomClipPatch(selectedClip));
                  } else {
                    onUpdateClip(selectedClip.id, {
                      kenBurns: nextKb,
                    });
                  }
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
              >
                <option value="none">Static</option>
                <option value="pan-zoom">Pan & Zoom (Keyframes)</option>
                <option value="zoom-in">Slow Zoom In</option>
                <option value="zoom-out">Slow Zoom Out</option>
                <option value="pan-left">Pan Left</option>
                <option value="pan-right">Pan Right</option>
              </select>
            </div>

            {isPanZoom && (
              <div className="p-2.5 rounded-lg bg-[#090C13] border border-amber-400/25 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-amber-200 flex items-center gap-1.5">
                    <Diamond className="w-3 h-3 text-amber-400" />
                    <span>Pan & Zoom Keyframes</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        applyPanZoomPatch({
                          panZoomStartScale: pzEndScale,
                          panZoomStartX: pzEndX,
                          panZoomStartY: pzEndY,
                          panZoomEndScale: pzStartScale,
                          panZoomEndX: pzStartX,
                          panZoomEndY: pzStartY,
                        })
                      }
                      className="glow-btn px-1.5 py-0.5 rounded text-[10px] text-slate-300 hover:text-white bg-[#07090F] border border-white/[0.1]"
                      title="Swap start and end keyframes"
                    >
                      Swap
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateClip(selectedClip.id, {
                          kenBurns: 'none',
                          keyframes: (selectedClip.keyframes ?? []).filter(
                            (k) => k.id !== 'kf_panzoom_start' && k.id !== 'kf_panzoom_end'
                          ),
                        })
                      }
                      className="glow-btn px-1.5 py-0.5 rounded text-[10px] text-rose-300 hover:text-white bg-rose-500/10 border border-rose-400/20"
                      title="Clear Pan & Zoom preset"
                    >
                      Off
                    </button>
                  </div>
                </div>

                {/* Quick Motion Presets */}
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { label: 'Zoom In', s1: 100, x1: 0, y1: 0, s2: 125, x2: 0, y2: 0 },
                    { label: 'Zoom Out', s1: 125, x1: 0, y1: 0, s2: 100, x2: 0, y2: 0 },
                    { label: 'Pan L→R', s1: 118, x1: -10, y1: 0, s2: 118, x2: 10, y2: 0 },
                    { label: 'Pan R→L', s1: 118, x1: 10, y1: 0, s2: 118, x2: -10, y2: 0 },
                    { label: 'Tilt Up', s1: 118, x1: 0, y1: 8, s2: 118, x2: 0, y2: -8 },
                    { label: 'Reset', s1: 100, x1: 0, y1: 0, s2: 100, x2: 0, y2: 0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        applyPanZoomPatch({
                          panZoomStartScale: p.s1,
                          panZoomStartX: p.x1,
                          panZoomStartY: p.y1,
                          panZoomEndScale: p.s2,
                          panZoomEndX: p.x2,
                          panZoomEndY: p.y2,
                        })
                      }
                      className="glow-btn px-1.5 py-1 text-[10px] font-medium rounded bg-[#07090F] border border-white/[0.08] text-slate-300 hover:text-white truncate"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Easing */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Motion Curve</span>
                  <div className="flex items-center gap-1 p-0.5 bg-[#07090F] rounded border border-white/[0.08]">
                    {(['ease-in-out', 'linear'] as KeyframeEasing[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => applyPanZoomPatch({ panZoomEasing: mode })}
                        className={`glow-btn px-2 py-0.5 rounded text-[10px] border border-transparent ${
                          pzEasing === mode
                            ? 'bg-[#1A2130] text-sky-200'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mode === 'ease-in-out' ? 'Smooth' : 'Linear'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Keyframe */}
                <div className="p-2 rounded bg-[#07090F] border border-white/[0.07] space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium text-emerald-300 font-mono">
                      Start (0.00s)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSeek(selectedClip.startTime)}
                        className="glow-btn px-1.5 py-0.5 rounded text-[10px] text-slate-300 hover:text-white bg-[#141822] border border-white/[0.08]"
                      >
                        Jump
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          applyPanZoomPatch({
                            panZoomStartScale: clamp(selectedClip.scale, 10, 400),
                            panZoomStartX: clamp(selectedClip.x, -100, 100),
                            panZoomStartY: clamp(selectedClip.y, -100, 100),
                          })
                        }
                        className="glow-btn px-1.5 py-0.5 rounded text-[10px] text-sky-300 hover:text-white bg-[#141822] border border-sky-400/25"
                        title="Capture current canvas scale & position as Start keyframe"
                      >
                        Use Current
                      </button>
                    </div>
                  </div>
                  <SliderRow
                    label="Start Scale"
                    value={pzStartScale}
                    min={25}
                    max={400}
                    allowDirectInput
                    inputMin={10}
                    inputMax={400}
                    unit="%"
                    onChange={(val) => applyPanZoomPatch({ panZoomStartScale: val })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <SliderRow
                      label="Start X"
                      value={pzStartX}
                      min={-100}
                      max={100}
                      allowDirectInput
                      inputMin={-100}
                      inputMax={100}
                      unit="%"
                      onChange={(val) => applyPanZoomPatch({ panZoomStartX: val })}
                    />
                    <SliderRow
                      label="Start Y"
                      value={pzStartY}
                      min={-100}
                      max={100}
                      allowDirectInput
                      inputMin={-100}
                      inputMax={100}
                      unit="%"
                      onChange={(val) => applyPanZoomPatch({ panZoomStartY: val })}
                    />
                  </div>
                </div>

                {/* End Keyframe */}
                <div className="p-2 rounded bg-[#07090F] border border-white/[0.07] space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium text-amber-300 font-mono">
                      End ({selectedClip.duration.toFixed(2)}s)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSeek(selectedClip.startTime + selectedClip.duration)}
                        className="glow-btn px-1.5 py-0.5 rounded text-[10px] text-slate-300 hover:text-white bg-[#141822] border border-white/[0.08]"
                      >
                        Jump
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          applyPanZoomPatch({
                            panZoomEndScale: clamp(selectedClip.scale, 10, 400),
                            panZoomEndX: clamp(selectedClip.x, -100, 100),
                            panZoomEndY: clamp(selectedClip.y, -100, 100),
                          })
                        }
                        className="glow-btn px-1.5 py-0.5 rounded text-[10px] text-sky-300 hover:text-white bg-[#141822] border border-sky-400/25"
                        title="Capture current canvas scale & position as End keyframe"
                      >
                        Use Current
                      </button>
                    </div>
                  </div>
                  <SliderRow
                    label="End Scale"
                    value={pzEndScale}
                    min={25}
                    max={400}
                    allowDirectInput
                    inputMin={10}
                    inputMax={400}
                    unit="%"
                    onChange={(val) => applyPanZoomPatch({ panZoomEndScale: val })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <SliderRow
                      label="End X"
                      value={pzEndX}
                      min={-100}
                      max={100}
                      allowDirectInput
                      inputMin={-100}
                      inputMax={100}
                      unit="%"
                      onChange={(val) => applyPanZoomPatch({ panZoomEndX: val })}
                    />
                    <SliderRow
                      label="End Y"
                      value={pzEndY}
                      min={-100}
                      max={100}
                      allowDirectInput
                      inputMin={-100}
                      inputMax={100}
                      unit="%"
                      onChange={(val) => applyPanZoomPatch({ panZoomEndY: val })}
                    />
                  </div>
                </div>
              </div>
            )}

            <SliderRow
              label="Scale"
              value={selectedClip.scale}
              min={25}
              max={400}
              allowDirectInput
              inputMin={10}
              inputMax={1000}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { scale: val })}
            />
            <SliderRow
              label="Rotation"
              value={selectedClip.rotation ?? 0}
              min={-180}
              max={180}
              unit="°"
              onChange={(val) => onUpdateClip(selectedClip.id, { rotation: val })}
            />
            <SliderRow
              label="Opacity"
              value={selectedClip.opacity}
              min={0}
              max={100}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { opacity: val })}
            />
          </div>
          );
        })()}

        {/* Color Grade (Visual Clips) */}
        {isVisual && showSection('color grade filter preset brightness contrast saturation temperature warmth vignette blur') && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
            <div className="text-xs font-medium text-slate-300">Color Grade</div>
            <InspectorSearchInput
              value={colorSearch}
              onChange={setColorSearch}
              placeholder="Search color presets..."
            />
            <div className="grid grid-cols-2 @[250px]:grid-cols-3 gap-1.5">
              {filteredFilterPresetKeys.map((presetKey) => {
                const active = selectedClip.filterPreset === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => applyFilterPreset(presetKey)}
                    className={`glow-btn px-2 py-1.5 text-[11px] font-medium rounded-md border truncate ${
                      active
                        ? 'bg-blue-600/20 border-sky-400 text-sky-200'
                        : 'bg-[#07090F] border-white/[0.08] text-slate-400 hover:text-white'
                    }`}
                  >
                    {FILTER_PRESET_VALUES[presetKey].label}
                  </button>
                );
              })}
            </div>

            <SliderRow
              label="Brightness"
              value={selectedClip.brightness}
              min={50}
              max={150}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { brightness: val })}
            />
            <SliderRow
              label="Contrast"
              value={selectedClip.contrast}
              min={50}
              max={150}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { contrast: val })}
            />
            <SliderRow
              label="Saturation"
              value={selectedClip.saturation}
              min={0}
              max={200}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { saturation: val })}
            />
            <SliderRow
              label="Temperature"
              value={selectedClip.warmth}
              min={-50}
              max={50}
              onChange={(val) => onUpdateClip(selectedClip.id, { warmth: val })}
            />
            <SliderRow
              label="Vignette"
              value={selectedClip.vignette}
              min={0}
              max={100}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { vignette: val })}
            />
            <SliderRow
              label="Blur"
              value={selectedClip.blur}
              min={0}
              max={16}
              step={0.5}
              unit="px"
              onChange={(val) => onUpdateClip(selectedClip.id, { blur: val })}
            />
          </div>
        )}

        {/* Audio Volume (Audio clips or Video assets) */}
        {(isAudio || selectedAsset?.type === 'video') && showSection('audio level mute volume sound') && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Audio Level</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedClip.muted}
                  onChange={(e) => onUpdateClip(selectedClip.id, { muted: e.target.checked })}
                  className="accent-sky-400 rounded"
                />
                <span>Mute</span>
              </label>
            </div>
            <SliderRow
              label="Volume"
              value={selectedClip.volume}
              min={0}
              max={200}
              unit="%"
              onChange={(val) => onUpdateClip(selectedClip.id, { volume: val })}
            />
          </div>
        )}
            </>
          );
        })()}
      </div>
    </aside>
  );
}
