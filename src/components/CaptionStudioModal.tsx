import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  Check,
  Download,
  Languages,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  BUILTIN_FONT_FAMILIES,
  CAPTION_STYLE_PRESETS,
  CaptionActiveMode,
  CaptionLineMode,
  CaptionPositionPreset,
  CaptionStyleCategory,
  CaptionStylePreset,
  CustomFont,
  GLOW_COLOR_SWATCHES,
  TextAnimation,
  TextConfig,
  TimelineClip,
} from '../types/editor';
import {
  applyCaptionPresetToTextConfig,
  CaptionCue,
  getYForCaptionPosition,
  parseSrtOrVtt,
  splitScriptIntoCaptionCues,
} from '../utils/captions';
import { makeCaptionPresetStorageKey } from '../utils/effectsStorage';
import {
  detectTextLanguage,
  ensureScriptFontLoaded,
  SUPPORTED_CAPTION_LANGUAGES,
} from '../utils/languageSupport';
import { clamp, formatShortTime } from '../utils/time';

interface CaptionStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  captionCount: number;
  captionClips?: TimelineClip[];
  currentTime?: number;
  onSeek?: (time: number) => void;
  onUpdateCaptionText?: (clipId: string, text: string) => void;
  onDeleteCaptionCue?: (clipId: string) => void;
  customFonts: CustomFont[];
  downloadedEffectKeys?: string[];
  onDownloadEffectItem?: (key: string, label: string) => Promise<void>;
  onDownloadAllCaptionPresets?: () => Promise<void>;
  defaultCaptionConfig: TextConfig;
  onChangeDefaultCaptionConfig: (patch: Partial<TextConfig>) => void;
  onApplyCaptionStyleToAll: (config: TextConfig) => void;
  onGenerateCaptions: (cues: CaptionCue[], config: TextConfig, atPlayhead?: boolean) => void;
  onAddSingleCaptionCue: (text: string, duration: number, config: TextConfig) => void;
  onAutoDetectAudioCaptions: (targetLanguage: string, maxWordsPerCue: number) => Promise<void>;
  onOfflineWhisperCaptions: (targetLanguage: string, maxWordsPerCue: number) => Promise<void>;
  onOfflineSyncAudioCaptions: (scriptText?: string, maxWordsPerCue?: number) => Promise<void>;
  onTranslateCaptions: (
    targetLanguage: string,
    scriptText?: string,
    cueSeconds?: number,
    maxWordsPerCue?: number
  ) => Promise<boolean>;
  isAutoCaptionLoading: boolean;
  autoCaptionStatus: {
    kind: 'info' | 'success' | 'error';
    message: string;
    detectedLanguage?: string;
    script?: string;
    direction?: 'ltr' | 'rtl';
  } | null;
  onDismissAutoCaptionStatus: () => void;
  autoSyncCaptions?: boolean;
  onChangeAutoSyncCaptions?: (next: boolean) => void;
  onExportCaptionsSrt: () => void;
  onExportCaptionsVtt: () => void;
  onExportCaptionsAss?: () => void;
  onExportCaptionsTxt?: () => void;
  onClearCaptions: () => void;
  onOpenAutoFonts: () => void;
}

function ModalSlider({
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

export function CaptionStudioModal({
  isOpen,
  onClose,
  captionCount,
  captionClips = [],
  currentTime = 0,
  onSeek,
  onUpdateCaptionText,
  onDeleteCaptionCue,
  customFonts,
  downloadedEffectKeys = [],
  onDownloadEffectItem,
  onDownloadAllCaptionPresets,
  defaultCaptionConfig,
  onChangeDefaultCaptionConfig,
  onApplyCaptionStyleToAll,
  onGenerateCaptions,
  onAddSingleCaptionCue,
  onAutoDetectAudioCaptions,
  onOfflineWhisperCaptions,
  onOfflineSyncAudioCaptions,
  onTranslateCaptions,
  isAutoCaptionLoading,
  autoCaptionStatus,
  onDismissAutoCaptionStatus,
  autoSyncCaptions = true,
  onChangeAutoSyncCaptions,
  onExportCaptionsSrt,
  onExportCaptionsVtt,
  onExportCaptionsAss,
  onExportCaptionsTxt,
  onClearCaptions,
  onOpenAutoFonts,
}: CaptionStudioModalProps) {
  const srtInputRef = useRef<HTMLInputElement>(null);
  const presetImportRef = useRef<HTMLInputElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const [captionTargetLang, setCaptionTargetLang] = useState<string>('auto');
  const [customLanguageName, setCustomLanguageName] = useState<string>('');
  const [captionScript, setCaptionScript] = useState<string>('');
  const [cueSeconds, setCueSeconds] = useState<number>(2.5);
  const [wordsPerCue, setWordsPerCue] = useState<number>(6);
  const [singleCueText, setSingleCueText] = useState<string>('Type caption line here');
  const [singleCueDuration, setSingleCueDuration] = useState<number>(3.0);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const [previewWordTick, setPreviewWordTick] = useState(0);
  const [presetCategory, setPresetCategory] = useState<'All' | CaptionStyleCategory>('All');
  const [downloadingPresetKey, setDownloadingPresetKey] = useState<string | null>(null);
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const [focusedCueId, setFocusedCueId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setPreviewWordTick((t) => t + 1);
    }, 580);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const installedPresetSet = new Set(downloadedEffectKeys);
  const pendingCaptionPresets = CAPTION_STYLE_PRESETS.filter(
    (p) => !p.builtIn && !installedPresetSet.has(makeCaptionPresetStorageKey(p.id))
  );
  const filteredCaptionPresets =
    presetCategory === 'All'
      ? CAPTION_STYLE_PRESETS
      : CAPTION_STYLE_PRESETS.filter((p) => p.category === presetCategory);

  const handleDownloadPresetFile = (presetConfig: TextConfig, fileSlug: string) => {
    const payload = JSON.stringify(
      {
        format: 'framecut-caption-preset-v1',
        exportedAt: new Date().toISOString(),
        config: {
          ...presetConfig,
          isCaption: true,
        },
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileSlug}.caption-preset.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  };

  const effectiveLanguage =
    captionTargetLang === '__custom__' ? customLanguageName.trim() || 'auto' : captionTargetLang;
  const scriptDetected = captionScript.trim() ? detectTextLanguage(captionScript) : null;

  const focusedOrActiveCue =
    captionClips.find((c) => c.id === focusedCueId) ??
    captionClips.find(
      (c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration
    ) ??
    captionClips[0] ??
    null;

  const previewSample =
    (focusedOrActiveCue?.textConfig?.text ?? focusedOrActiveCue?.name ?? '').trim() ||
    captionScript.trim().split('\n')[0]?.trim() ||
    (singleCueText.trim() && singleCueText.trim() !== 'Type caption line here'
      ? singleCueText.trim()
      : '') ||
    'Live active speech subtitle preview';
  const rawPreviewText = defaultCaptionConfig.captionUppercase
    ? previewSample.toUpperCase()
    : previewSample;
  const previewWords = rawPreviewText.split(/\s+/).filter(Boolean);
  const activeWordIndex =
    previewWords.length > 0 ? previewWordTick % previewWords.length : 0;

  const previewLineMode: CaptionLineMode =
    defaultCaptionConfig.captionLineMode ?? 'single-line';
  const previewActiveMode: CaptionActiveMode =
    defaultCaptionConfig.captionActiveMode ??
    (defaultCaptionConfig.captionWordHighlight ? 'word-color' : 'none');

  const previewPos = defaultCaptionConfig.captionPosition ?? 'bottom';
  const resolvedPreviewX = previewPos === 'custom' ? defaultCaptionConfig.captionX ?? 0 : 0;
  const resolvedPreviewY = getYForCaptionPosition(
    previewPos,
    defaultCaptionConfig.captionSafeMargin ?? 10,
    defaultCaptionConfig.captionY ?? 34
  );

  const updateStagePositionFromPointer = (clientX: number, clientY: number) => {
    const el = previewStageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pctX = clamp(
      Number((((clientX - rect.left) / rect.width - 0.5) * 100).toFixed(1)),
      -80,
      80
    );
    const pctY = clamp(
      Number((((clientY - rect.top) / rect.height - 0.5) * 100).toFixed(1)),
      -80,
      80
    );
    onChangeDefaultCaptionConfig({
      captionPosition: 'custom',
      captionX: pctX,
      captionY: pctY,
    });
  };
  const previewOutlineW = defaultCaptionConfig.captionOutlineWidth ?? 0;
  const previewOutlineColor = defaultCaptionConfig.captionOutlineColor ?? '#050608';
  const previewBg = defaultCaptionConfig.captionBgColor ?? '#090B10';
  const previewHighlight = defaultCaptionConfig.captionHighlightColor ?? '#FACC15';
  const previewActiveBoxColor = defaultCaptionConfig.captionActiveBoxColor ?? '#0EA5E9';
  const previewActiveBoxRadius = clamp(defaultCaptionConfig.captionActiveBoxRadius ?? 10, 0, 24);
  const previewDir =
    defaultCaptionConfig.textDirection === 'rtl'
      ? 'rtl'
      : defaultCaptionConfig.textDirection === 'ltr'
      ? 'ltr'
      : detectTextLanguage(previewSample).direction;

  const previewLines: Array<{ words: Array<{ word: string; globalIdx: number }> }> = (() => {
    const indexed = previewWords.map((word, globalIdx) => ({ word, globalIdx }));
    if (previewLineMode === 'word-by-word') {
      const single = indexed[activeWordIndex] ?? indexed[0];
      return single ? [{ words: [single] }] : [];
    }
    if (previewLineMode === 'single-line' || indexed.length <= 2) {
      return [{ words: indexed }];
    }
    if (previewLineMode === 'two-line') {
      const mid = Math.ceil(indexed.length / 2);
      return [{ words: indexed.slice(0, mid) }, { words: indexed.slice(mid) }];
    }
    // multi-line: chunk into ~3 words per line
    const out: Array<{ words: Array<{ word: string; globalIdx: number }> }> = [];
    for (let i = 0; i < indexed.length; i += 3) {
      out.push({ words: indexed.slice(i, i + 3) });
    }
    return out;
  })();

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
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-400/35 flex items-center justify-center shrink-0">
              <Captions className="w-4.5 h-4.5 text-sky-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                Advanced Captions Studio
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                AI &amp; Offline Whisper speech detection, multi-language RTL/LTR, presets, typography &amp; SRT/VTT tools
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[11px] font-mono text-slate-300">
              {captionCount} cues
            </span>
            <button
              type="button"
              onClick={onClose}
              className="glow-btn p-1.5 rounded-lg text-slate-400 hover:text-white border border-transparent"
              aria-label="Close Caption Studio"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Two-Column Workspace */}
        <div className="flex-1 min-h-0 overflow-y-auto studio-scroll p-4 sm:p-5 space-y-4">
          {/* Interactive Live Caption Visual Stage (Drag anywhere to place freely) */}
          <div
            ref={previewStageRef}
            onPointerDown={(e) => {
              setIsDraggingStage(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              updateStagePositionFromPointer(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!isDraggingStage) return;
              updateStagePositionFromPointer(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (!isDraggingStage) return;
              setIsDraggingStage(false);
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                // ignore
              }
            }}
            title="Click or drag anywhere to move caption freely"
            className="relative rounded-xl border border-white/[0.1] bg-[radial-gradient(circle_at_top,#1B2336_0%,#080B12_75%)] h-36 px-5 overflow-hidden cursor-crosshair select-none"
          >
            <div className="absolute top-2 left-3 right-3 flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 pointer-events-none">
              <span>
                Drag Anywhere to Move · X {resolvedPreviewX}% · Y {resolvedPreviewY}% ·{' '}
                {previewLineMode}
              </span>
              <span className="text-sky-300/90">
                {previewActiveMode === 'none' ? 'Standard' : previewActiveMode}
                {autoSyncCaptions ? ' · Live Sync ON' : ''}
              </span>
            </div>
            <div
              dir={previewDir}
              style={{
                position: 'absolute',
                left: `${clamp(50 + resolvedPreviewX, 8, 92)}%`,
                top: `${clamp(50 + resolvedPreviewY, 16, 86)}%`,
                transform: `translate(-50%, -50%) scale(${clamp((defaultCaptionConfig.captionScale ?? 100) / 100, 0.3, 2.5)})`,
                textAlign: defaultCaptionConfig.align,
                fontFamily: `"${defaultCaptionConfig.fontFamily}", sans-serif`,
                fontWeight: defaultCaptionConfig.fontWeight,
                fontSize: `${clamp(Math.round(defaultCaptionConfig.fontSize * 0.42), 11, 34)}px`,
                color: defaultCaptionConfig.color,
                WebkitTextStroke:
                  previewOutlineW > 0
                    ? `${Math.max(0.5, previewOutlineW * 0.25)}px ${previewOutlineColor}`
                    : undefined,
                textShadow: '0 2px 10px rgba(0,0,0,0.75)',
              }}
              className="max-w-[90%] pointer-events-none"
            >
              <div
                className="inline-flex flex-col gap-1 px-3 py-1.5 rounded-md leading-snug max-w-full"
                style={{
                  backgroundColor: defaultCaptionConfig.hasScrim
                    ? `${previewBg}${Math.round(
                        clamp(defaultCaptionConfig.scrimOpacity, 10, 95) * 2.55
                      )
                        .toString(16)
                        .padStart(2, '0')}`
                    : 'transparent',
                }}
              >
                {previewLines.map((line, lIdx) => (
                  <div
                    key={lIdx}
                    className={`flex items-center gap-1.5 ${
                      previewLineMode === 'single-line' ? 'flex-nowrap overflow-hidden' : 'flex-wrap'
                    } ${
                      defaultCaptionConfig.align === 'left'
                        ? 'justify-start'
                        : defaultCaptionConfig.align === 'right'
                        ? 'justify-end'
                        : 'justify-center'
                    }`}
                  >
                    {line.words.map(({ word, globalIdx }) => {
                      const isActive = globalIdx === activeWordIndex;
                      const isPastOrActive = globalIdx <= activeWordIndex;
                      const isBox =
                        isActive &&
                        (previewActiveMode === 'active-box' ||
                          previewActiveMode === 'active-box-scale');
                      const isScale =
                        isActive && previewActiveMode === 'active-box-scale';
                      const wordColor =
                        previewActiveMode === 'progressive-fill'
                          ? isPastOrActive
                            ? previewHighlight
                            : defaultCaptionConfig.color
                          : previewActiveMode === 'word-color' ||
                            previewActiveMode === 'underline-bar'
                          ? isActive
                            ? previewHighlight
                            : defaultCaptionConfig.color
                          : isBox
                          ? previewHighlight === defaultCaptionConfig.color
                            ? '#FFFFFF'
                            : previewHighlight
                          : defaultCaptionConfig.color;

                      return (
                        <span
                          key={`${word}-${globalIdx}`}
                          className="inline-block transition-transform duration-150"
                          style={{
                            color: wordColor,
                            backgroundColor: isBox ? previewActiveBoxColor : 'transparent',
                            borderRadius: isBox ? `${previewActiveBoxRadius}px` : undefined,
                            padding: isBox ? '1px 7px' : undefined,
                            transform: isScale ? 'scale(1.12)' : undefined,
                            borderBottom:
                              isActive && previewActiveMode === 'underline-bar'
                                ? `3px solid ${previewHighlight}`
                                : undefined,
                          }}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Generated Captions Rewrite List directly below the modal preview */}
          {captionClips.length > 0 && (
            <div className="p-3 rounded-xl bg-[#090C13] border border-sky-400/25 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-200 flex items-center gap-1.5">
                  <Captions className="w-3.5 h-3.5 text-sky-400" />
                  <span>Generated Captions ({captionClips.length}) — Click &amp; Rewrite</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Changes sync live to timeline &amp; video preview
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto studio-scroll pr-1 space-y-1.5">
                {captionClips.map((clip, idx) => {
                  const isCurrent =
                    currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
                  const isFocused = focusedCueId === clip.id;
                  const textVal = clip.textConfig?.text ?? clip.name;
                  return (
                    <div
                      key={clip.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                        isFocused || isCurrent
                          ? 'bg-sky-500/12 border-sky-400/45'
                          : 'bg-[#121621] border-white/[0.06] hover:border-white/[0.14]'
                      }`}
                    >
                      <span className="text-[10px] font-mono text-slate-500 w-5 text-right shrink-0">
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusedCueId(clip.id);
                          onSeek?.(clip.startTime + 0.05);
                        }}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                          isCurrent
                            ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                            : 'bg-[#07090F] border-white/[0.08] text-slate-300 hover:text-white'
                        }`}
                        title={`Preview & jump to ${formatShortTime(clip.startTime)}`}
                      >
                        {formatShortTime(clip.startTime)}
                      </button>
                      <input
                        type="text"
                        dir="auto"
                        value={textVal}
                        onFocus={() => setFocusedCueId(clip.id)}
                        onChange={(e) => onUpdateCaptionText?.(clip.id, e.target.value)}
                        placeholder="Rewrite caption..."
                        className="flex-1 min-w-0 px-2 py-1 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] focus:border-sky-400 rounded focus:outline-none"
                      />
                      {onDeleteCaptionCue && (
                        <button
                          type="button"
                          onClick={() => onDeleteCaptionCue(clip.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded shrink-0"
                          title="Delete caption cue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT COLUMN: Speech Detection, Script Generator, Cue Creation & Files */}
            <div className="space-y-4">
              {/* Auto Speech Recognition */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-sky-400/20 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-sky-200 flex items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-sky-400" />
                    <span>All-Language Speech &amp; Auto Detect</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {SUPPORTED_CAPTION_LANGUAGES.length - 1}+ languages
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Output Language</label>
                    <select
                      value={captionTargetLang}
                      onChange={(e) => setCaptionTargetLang(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                    >
                      {SUPPORTED_CAPTION_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code === 'auto' ? 'auto' : lang.name}>
                          {lang.code === 'auto'
                            ? lang.name
                            : `${lang.name} (${lang.nativeName})`}
                        </option>
                      ))}
                      <option value="__custom__">Other Language (Type Name)...</option>
                    </select>
                  </div>
                  <ModalSlider
                    label="Words / Cue"
                    value={wordsPerCue}
                    min={1}
                    max={16}
                    step={1}
                    onChange={setWordsPerCue}
                  />
                </div>

                {captionTargetLang === '__custom__' && (
                  <input
                    type="text"
                    value={customLanguageName}
                    onChange={(e) => setCustomLanguageName(e.target.value)}
                    placeholder="Type any language (e.g. Hausa, Javanese, Kashmiri)..."
                    className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isAutoCaptionLoading}
                    onClick={() => void onAutoDetectAudioCaptions(effectiveLanguage, wordsPerCue)}
                    className="glow-btn-prism py-2 px-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isAutoCaptionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{isAutoCaptionLoading ? 'Detecting...' : 'Auto-Detect Captions'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isAutoCaptionLoading}
                    onClick={() => void onOfflineWhisperCaptions(effectiveLanguage, wordsPerCue)}
                    className="glow-btn py-2 px-3 rounded-lg bg-[#121722] hover:bg-[#1B2232] border border-sky-400/35 text-xs font-medium text-sky-200 flex items-center justify-center gap-1.5 disabled:opacity-45"
                  >
                    <Captions className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Offline Whisper AI</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isAutoCaptionLoading}
                    onClick={() => void onOfflineSyncAudioCaptions(captionScript, wordsPerCue)}
                    className="glow-btn py-1.5 px-3 rounded-lg bg-[#121722] hover:bg-[#1B2232] border border-emerald-400/30 text-[11px] font-medium text-emerald-200 flex items-center justify-center gap-1.5 disabled:opacity-45"
                  >
                    <Captions className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      {captionScript.trim()
                        ? 'Sync Script to Audio (Offline)'
                        : 'Sync Audio Timing (Offline)'}
                    </span>
                  </button>

                  {captionCount > 0 && (
                    <button
                      type="button"
                      disabled={isAutoCaptionLoading}
                      onClick={() => void onTranslateCaptions(effectiveLanguage)}
                      className="glow-btn py-1.5 px-3 rounded-lg bg-[#121722] hover:bg-[#1B2232] border border-white/[0.1] text-[11px] font-medium text-slate-200 flex items-center justify-center gap-1.5 disabled:opacity-45"
                    >
                      <Languages className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>
                        {effectiveLanguage === 'auto'
                          ? 'Re-Detect Existing'
                          : `Translate (${captionCount})`}
                      </span>
                    </button>
                  )}
                </div>

                {autoCaptionStatus && (
                  <div
                    className={`px-3 py-2 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                      autoCaptionStatus.kind === 'error'
                        ? 'bg-rose-500/10 border-rose-400/30 text-rose-200'
                        : autoCaptionStatus.kind === 'success'
                        ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                        : 'bg-sky-500/10 border-sky-400/30 text-sky-200'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-medium break-words">{autoCaptionStatus.message}</div>
                      {autoCaptionStatus.detectedLanguage && (
                        <div className="text-[10px] font-mono opacity-85">
                          {autoCaptionStatus.detectedLanguage}
                          {autoCaptionStatus.script ? ` · ${autoCaptionStatus.script}` : ''}
                          {autoCaptionStatus.direction
                            ? ` · ${autoCaptionStatus.direction.toUpperCase()}`
                            : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onDismissAutoCaptionStatus}
                      className="opacity-75 hover:opacity-100 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {localNotice && (
                  <div className="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-400/25 text-xs text-sky-200 flex items-center justify-between gap-2">
                    <span className="truncate">{localNotice}</span>
                    <button
                      type="button"
                      onClick={() => setLocalNotice(null)}
                      className="text-sky-300 hover:text-white shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Script to Timed Captions */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Script to Timed Captions
                  </span>
                  {scriptDetected && (
                    <span className="text-[10px] font-mono text-sky-300">
                      {scriptDetected.languageName} · {scriptDetected.direction.toUpperCase()}
                    </span>
                  )}
                </div>
                <textarea
                  rows={3}
                  dir="auto"
                  value={captionScript}
                  onChange={(e) => setCaptionScript(e.target.value)}
                  placeholder="Paste dialogue in any language (Urdu, English, Hindi, Arabic, CJK...) — RTL & fonts auto-detected..."
                  className="w-full px-3 py-2 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg resize-none focus:outline-none focus:border-sky-400 placeholder:text-slate-500"
                />
                <ModalSlider
                  label="Manual Seconds / Cue"
                  value={cueSeconds}
                  min={0.5}
                  max={30}
                  inputMax={300}
                  step={0.1}
                  unit="s"
                  onChange={setCueSeconds}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!captionScript.trim()}
                    onClick={() => {
                      const detected = detectTextLanguage(captionScript);
                      ensureScriptFontLoaded(captionScript);
                      const cues = splitScriptIntoCaptionCues(
                        captionScript,
                        0,
                        cueSeconds,
                        wordsPerCue
                      );
                      if (cues.length > 0) {
                        onGenerateCaptions(
                          cues,
                          {
                            ...defaultCaptionConfig,
                            isCaption: true,
                            textDirection: detected.direction,
                            detectedLanguage: detected.languageName,
                          },
                          true
                        );
                        setLocalNotice(
                          `Added ${cues.length} ${detected.languageName} caption cues at playhead`
                        );
                        setCaptionScript('');
                      }
                    }}
                    className="glow-btn py-1.5 px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 text-xs font-semibold text-sky-100 disabled:opacity-40"
                  >
                    Generate at Playhead
                  </button>
                  <button
                    type="button"
                    disabled={!captionScript.trim() || isAutoCaptionLoading}
                    onClick={async () => {
                      const ok = await onTranslateCaptions(
                        effectiveLanguage,
                        captionScript,
                        cueSeconds,
                        wordsPerCue
                      );
                      if (ok) setCaptionScript('');
                    }}
                    className="glow-btn py-1.5 px-3 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.1] text-xs font-medium text-slate-200 disabled:opacity-40"
                  >
                    {effectiveLanguage === 'auto'
                      ? 'Auto-Format Script'
                      : `Translate & Add (${effectiveLanguage})`}
                  </button>
                </div>
              </div>

              {/* Quick Single Cue + Import/Export SRT/VTT */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-2.5">
                <div className="text-xs font-semibold text-slate-200">
                  Manual Caption Cue &amp; Subtitles File
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    dir="auto"
                    value={singleCueText}
                    onChange={(e) => setSingleCueText(e.target.value)}
                    placeholder="Caption cue text..."
                    className="flex-1 px-2.5 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0.2}
                      max={3600}
                      step={0.1}
                      value={singleCueDuration}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isFinite(n)) setSingleCueDuration(clamp(n, 0.2, 3600));
                      }}
                      title="Manual cue duration in seconds"
                      className="w-16 px-2 py-1.5 text-xs font-mono text-right text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    />
                    <span className="text-[11px] font-mono text-slate-400">s</span>
                    <button
                      type="button"
                      onClick={() => {
                        const text = singleCueText.trim() || 'Caption Cue';
                        const detected = detectTextLanguage(text);
                        ensureScriptFontLoaded(text);
                        onAddSingleCaptionCue(text, singleCueDuration, {
                          ...defaultCaptionConfig,
                          isCaption: true,
                          textDirection:
                            defaultCaptionConfig.textDirection &&
                            defaultCaptionConfig.textDirection !== 'auto'
                              ? defaultCaptionConfig.textDirection
                              : detected.direction,
                          detectedLanguage: detected.languageName,
                        });
                        setLocalNotice(`Inserted ${singleCueDuration}s caption cue at playhead`);
                      }}
                      className="glow-btn-prism px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Cue</span>
                    </button>
                  </div>
                </div>

                <input
                  ref={srtInputRef}
                  type="file"
                  accept=".srt,.vtt,.ass,.ssa,.sbv,.lrc,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const raw = await file.text();
                    const parsed = parseSrtOrVtt(raw);
                    const detected = detectTextLanguage(raw);
                    ensureScriptFontLoaded(raw);
                    const langConfig: TextConfig = {
                      ...defaultCaptionConfig,
                      isCaption: true,
                      textDirection: detected.direction,
                      detectedLanguage: detected.languageName,
                    };
                    if (parsed.length > 0) {
                      onGenerateCaptions(parsed, langConfig, false);
                      setLocalNotice(
                        `Imported ${parsed.length} ${detected.languageName} cues from ${file.name}`
                      );
                    } else {
                      const cues = splitScriptIntoCaptionCues(raw, 0, cueSeconds, wordsPerCue);
                      if (cues.length > 0) {
                        onGenerateCaptions(cues, langConfig, true);
                        setLocalNotice(`Generated ${cues.length} cues from ${file.name}`);
                      } else {
                        setLocalNotice('No valid captions found in file.');
                      }
                    }
                    e.target.value = '';
                  }}
                />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  <button
                    type="button"
                    onClick={() => srtInputRef.current?.click()}
                    title="Import .SRT, .VTT, .ASS, .SBV, .LRC, or .TXT"
                    className="glow-btn py-1.5 px-2 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.08] text-[11px] font-medium text-slate-200 flex items-center justify-center gap-1"
                  >
                    <Upload className="w-3 h-3 text-sky-400 shrink-0" />
                    <span>Import</span>
                  </button>
                  <button
                    type="button"
                    disabled={captionCount === 0}
                    onClick={onExportCaptionsSrt}
                    className="glow-btn py-1.5 px-2 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.08] text-[11px] font-medium text-slate-200 flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Download className="w-3 h-3 text-sky-400 shrink-0" />
                    <span>.SRT</span>
                  </button>
                  <button
                    type="button"
                    disabled={captionCount === 0}
                    onClick={onExportCaptionsVtt}
                    className="glow-btn py-1.5 px-2 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.08] text-[11px] font-medium text-slate-200 flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Download className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>.VTT</span>
                  </button>
                  <button
                    type="button"
                    disabled={captionCount === 0 || !onExportCaptionsAss}
                    onClick={() => onExportCaptionsAss?.()}
                    className="glow-btn py-1.5 px-2 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.08] text-[11px] font-medium text-slate-200 flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Download className="w-3 h-3 text-violet-400 shrink-0" />
                    <span>.ASS</span>
                  </button>
                  <button
                    type="button"
                    disabled={captionCount === 0 || !onExportCaptionsTxt}
                    onClick={() => onExportCaptionsTxt?.()}
                    className="glow-btn py-1.5 px-2 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.08] text-[11px] font-medium text-slate-200 flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Download className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>.TXT</span>
                  </button>
                  <button
                    type="button"
                    disabled={captionCount === 0}
                    onClick={onClearCaptions}
                    className="glow-btn py-1.5 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-[11px] font-medium text-rose-200 flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3 shrink-0" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: All Advanced Styling, Presets, Typography, Colors & Layout */}
            <div className="space-y-4">
              {/* Line Format & Active Speech Mode */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-sky-400/20 space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-200">
                    Line Layout Format
                  </div>
                  <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                    {(
                      [
                        { id: 'single-line', label: 'Single Line' },
                        { id: 'two-line', label: '2-Line' },
                        { id: 'multi-line', label: 'Multi-Line' },
                        { id: 'word-by-word', label: '1 Word' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onChangeDefaultCaptionConfig({ captionLineMode: item.id })
                        }
                        className={`glow-btn py-1.5 px-1 text-[11px] rounded font-medium ${
                          previewLineMode === item.id
                            ? 'bg-[#1A2130] text-sky-200 border border-sky-400/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-200">
                    Active Speech Effect (Box &amp; Color Changer)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'none', label: 'Standard' },
                        { id: 'word-color', label: 'Color Changer' },
                        { id: 'active-box', label: 'Active Box' },
                        { id: 'active-box-scale', label: 'Pop + Box' },
                        { id: 'underline-bar', label: 'Underline' },
                        { id: 'progressive-fill', label: 'Progressive Fill' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() =>
                          onChangeDefaultCaptionConfig({
                            captionActiveMode: mode.id,
                            captionWordHighlight: mode.id !== 'none',
                          })
                        }
                        className={`glow-btn py-1.5 px-2 text-[11px] rounded-lg border font-medium ${
                          previewActiveMode === mode.id
                            ? 'bg-[#182338] border-sky-400/60 text-white'
                            : 'bg-[#141822] hover:bg-[#1B212F] border-white/[0.06] text-slate-300'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* All-Over Caption Style Presets + Download */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      All-Over Caption Presets
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {CAPTION_STYLE_PRESETS.length - pendingCaptionPresets.length}/
                      {CAPTION_STYLE_PRESETS.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={presetImportRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const parsed = JSON.parse(await file.text()) as {
                            config?: Partial<TextConfig>;
                          };
                          if (parsed?.config && typeof parsed.config === 'object') {
                            onChangeDefaultCaptionConfig({
                              ...parsed.config,
                              isCaption: true,
                            });
                            setLocalNotice(`Loaded preset from ${file.name}`);
                          }
                        } catch {
                          setLocalNotice('Invalid caption preset JSON file.');
                        }
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => presetImportRef.current?.click()}
                      title="Import a downloaded .caption-preset.json file"
                      className="glow-btn px-2 py-1 rounded bg-[#141822] hover:bg-[#1B212F] border border-white/[0.1] text-[10px] font-medium text-slate-200 flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3 text-sky-400" />
                      <span>Load</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadPresetFile(
                          defaultCaptionConfig,
                          defaultCaptionConfig.captionStyle || 'custom-caption'
                        )
                      }
                      title="Download current style as a .caption-preset.json file"
                      className="glow-btn px-2 py-1 rounded bg-[#141822] hover:bg-[#1B212F] border border-white/[0.1] text-[10px] font-medium text-emerald-200 flex items-center gap-1"
                    >
                      <Download className="w-3 h-3 text-emerald-400" />
                      <span>Save Preset</span>
                    </button>
                  </div>
                </div>

                {pendingCaptionPresets.length > 0 && onDownloadAllCaptionPresets && (
                  <button
                    type="button"
                    onClick={() => void onDownloadAllCaptionPresets()}
                    className="glow-btn w-full py-1.5 px-3 rounded-lg bg-gradient-to-r from-blue-600/20 via-purple-500/15 to-cyan-500/20 border border-sky-400/35 text-[11px] font-medium text-sky-100 flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-300" />
                    <span>Download All Presets ({pendingCaptionPresets.length})</span>
                  </button>
                )}

                {/* Preset Categories */}
                <div className="flex flex-wrap gap-1">
                  {(['All', 'Active Speech', 'Social', 'Boxed', 'Standard', 'Cinema'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setPresetCategory(cat)}
                        className={`glow-btn px-2 py-0.5 text-[10px] font-medium rounded border ${
                          presetCategory === cat
                            ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                            : 'bg-[#07090F] border-white/[0.07] text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-60 overflow-y-auto studio-scroll pr-1">
                  {filteredCaptionPresets.map((preset) => {
                    const storageKey = makeCaptionPresetStorageKey(preset.id);
                    const isReady = Boolean(preset.builtIn || installedPresetSet.has(storageKey));
                    const isActive =
                      (defaultCaptionConfig.captionStyle ?? 'classic-sub') === preset.id;
                    return (
                      <div
                        key={preset.id}
                        title={preset.description}
                        className={`glow-card rounded-lg border p-2 flex flex-col justify-between gap-1.5 transition-colors ${
                          isActive
                            ? 'bg-[#182338] border-sky-400/60'
                            : 'bg-[#141822] hover:bg-[#1B212F] border-white/[0.06]'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!isReady}
                          onClick={() =>
                            onChangeDefaultCaptionConfig(
                              applyCaptionPresetToTextConfig(
                                defaultCaptionConfig,
                                preset.id as CaptionStylePreset
                              )
                            )
                          }
                          className="text-left w-full disabled:opacity-65"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-semibold text-slate-100 truncate">
                              {preset.label}
                            </span>
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                              style={{ backgroundColor: preset.accent }}
                            />
                          </div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            {preset.lineMode} ·{' '}
                            {preset.activeMode === 'none' ? preset.category : preset.activeMode}
                          </div>
                        </button>

                        {isReady ? (
                          <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-white/[0.05]">
                            <button
                              type="button"
                              onClick={() =>
                                onChangeDefaultCaptionConfig(
                                  applyCaptionPresetToTextConfig(
                                    defaultCaptionConfig,
                                    preset.id as CaptionStylePreset
                                  )
                                )
                              }
                              className="text-[10px] font-medium text-sky-300 hover:text-white"
                            >
                              {isActive ? 'Active' : 'Apply'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDownloadPresetFile(
                                  applyCaptionPresetToTextConfig(
                                    defaultCaptionConfig,
                                    preset.id as CaptionStylePreset
                                  ),
                                  preset.id
                                )
                              }
                              title="Download this preset (.json)"
                              className="p-0.5 rounded text-slate-400 hover:text-emerald-300"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={downloadingPresetKey === storageKey}
                            onClick={async () => {
                              if (!onDownloadEffectItem) return;
                              setDownloadingPresetKey(storageKey);
                              try {
                                await onDownloadEffectItem(storageKey, preset.label);
                              } finally {
                                setDownloadingPresetKey(null);
                              }
                            }}
                            className="glow-btn w-full py-1 px-1.5 rounded bg-[#07090F] hover:bg-sky-500/15 border border-white/[0.1] text-[10px] font-medium text-sky-200 flex items-center justify-center gap-1"
                          >
                            <Download className="w-2.5 h-2.5" />
                            <span>
                              {downloadingPresetKey === storageKey
                                ? 'Saving...'
                                : `Download${preset.downloadSize ? ` (${preset.downloadSize})` : ''}`}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Typography & Direction */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Typography &amp; Alignment
                  </span>
                  <button
                    type="button"
                    onClick={onOpenAutoFonts}
                    className="text-[11px] text-sky-300 hover:text-sky-200 font-medium"
                  >
                    Browse Famous Fonts
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Font Family</label>
                    <select
                      value={defaultCaptionConfig.fontFamily}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({ fontFamily: e.target.value })
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
                    <label className="block text-[11px] text-slate-400">Font Weight</label>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                      {([500, 600, 700] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => onChangeDefaultCaptionConfig({ fontWeight: w })}
                          className={`glow-btn py-1 text-[11px] font-mono rounded ${
                            defaultCaptionConfig.fontWeight === w
                              ? 'bg-[#1A2130] text-white'
                              : 'text-slate-400'
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
                    <label className="block text-[11px] text-slate-400">Alignment</label>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
                      {(['left', 'center', 'right'] as const).map((al) => {
                        const Icon =
                          al === 'left' ? AlignLeft : al === 'right' ? AlignRight : AlignCenter;
                        return (
                          <button
                            key={al}
                            type="button"
                            onClick={() => onChangeDefaultCaptionConfig({ align: al })}
                            className={`glow-btn py-1 rounded flex items-center justify-center ${
                              defaultCaptionConfig.align === al
                                ? 'bg-[#1A2130] text-white'
                                : 'text-slate-400'
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
                      Direction (RTL / LTR)
                    </label>
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ModalSlider
                    label="Caption Font Size"
                    value={defaultCaptionConfig.fontSize}
                    min={12}
                    max={180}
                    inputMax={360}
                    unit="px"
                    onChange={(v) => onChangeDefaultCaptionConfig({ fontSize: v })}
                  />
                  <ModalSlider
                    label="Rescale Captions"
                    value={defaultCaptionConfig.captionScale ?? 100}
                    min={25}
                    max={300}
                    inputMin={15}
                    inputMax={500}
                    unit="%"
                    onChange={(v) => onChangeDefaultCaptionConfig({ captionScale: v })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Placement</label>
                    <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#07090F] rounded-lg border border-white/[0.06]">
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
                          onClick={() => onChangeDefaultCaptionConfig({ captionPosition: pos.id })}
                          className={`glow-btn py-1 text-[10px] rounded ${
                            (defaultCaptionConfig.captionPosition ?? 'bottom') === pos.id
                              ? 'bg-[#1A2130] text-white'
                              : 'text-slate-400'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">Cue Motion</label>
                    <select
                      value={defaultCaptionConfig.animation}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({
                          animation: e.target.value as TextAnimation,
                        })
                      }
                      className="w-full px-2.5 py-1 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg"
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade</option>
                      <option value="slide-up">Slide Up</option>
                      <option value="scale">Scale Pop</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ModalSlider
                    label="Position X (Left / Right)"
                    value={resolvedPreviewX}
                    min={-80}
                    max={80}
                    step={0.5}
                    unit="%"
                    onChange={(v) => onChangeDefaultCaptionConfig({ captionX: v })}
                  />
                  <ModalSlider
                    label="Position Y (Up / Down)"
                    value={resolvedPreviewY}
                    min={-80}
                    max={80}
                    step={0.5}
                    unit="%"
                    onChange={(v) => onChangeDefaultCaptionConfig({ captionY: v })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ModalSlider
                    label="Safe Margin"
                    value={defaultCaptionConfig.captionSafeMargin ?? 10}
                    min={4}
                    max={28}
                    unit="%"
                    onChange={(v) => onChangeDefaultCaptionConfig({ captionSafeMargin: v })}
                  />
                  <ModalSlider
                    label="Outline Thickness (Optional)"
                    value={defaultCaptionConfig.captionOutlineWidth ?? 0}
                    min={0}
                    max={14}
                    unit="px"
                    onChange={(v) => onChangeDefaultCaptionConfig({ captionOutlineWidth: v })}
                  />
                </div>
              </div>

              {/* Colors, Word Highlight & Scrim Backdrop */}
              <div className="p-3.5 rounded-xl bg-[#090C13] border border-white/[0.08] space-y-3">
                <div className="text-xs font-semibold text-slate-200">
                  Colors, Highlight &amp; Backdrop
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Text Color</span>
                    <input
                      type="color"
                      value={defaultCaptionConfig.color}
                      onChange={(e) => onChangeDefaultCaptionConfig({ color: e.target.value })}
                      className="w-full h-8 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Word Color</span>
                    <input
                      type="color"
                      value={defaultCaptionConfig.captionHighlightColor ?? '#FACC15'}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({ captionHighlightColor: e.target.value })
                      }
                      className="w-full h-8 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Active Box</span>
                    <input
                      type="color"
                      value={defaultCaptionConfig.captionActiveBoxColor ?? '#0EA5E9'}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({ captionActiveBoxColor: e.target.value })
                      }
                      className="w-full h-8 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Outline Color</span>
                    <input
                      type="color"
                      value={defaultCaptionConfig.captionOutlineColor ?? '#050608'}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({ captionOutlineColor: e.target.value })
                      }
                      className="w-full h-8 rounded bg-[#07090F] border border-white/[0.1] cursor-pointer p-0.5"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-500 mr-1">Word / Active Swatches:</span>
                  {GLOW_COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() =>
                        onChangeDefaultCaptionConfig({
                          captionHighlightColor: sw,
                          captionActiveBoxColor: sw,
                        })
                      }
                      style={{ backgroundColor: sw }}
                      className="w-4 h-4 rounded-full border border-white/25 hover:scale-110 transition-transform"
                      title={`Highlight & Box ${sw}`}
                    />
                  ))}
                </div>

                {(previewActiveMode === 'active-box' ||
                  previewActiveMode === 'active-box-scale') && (
                  <ModalSlider
                    label="Active Speech Box Radius"
                    value={defaultCaptionConfig.captionActiveBoxRadius ?? 10}
                    min={0}
                    max={24}
                    unit="px"
                    onChange={(v) => onChangeDefaultCaptionConfig({ captionActiveBoxRadius: v })}
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-white/[0.06]">
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(defaultCaptionConfig.captionWordHighlight)}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({
                          captionWordHighlight: e.target.checked,
                          captionActiveMode: e.target.checked
                            ? previewActiveMode === 'none'
                              ? 'word-color'
                              : previewActiveMode
                            : 'none',
                        })
                      }
                      className="accent-sky-400 rounded"
                    />
                    <span>Active Speech</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(defaultCaptionConfig.captionUppercase)}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({ captionUppercase: e.target.checked })
                      }
                      className="accent-sky-400 rounded"
                    />
                    <span>ALL CAPS</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={defaultCaptionConfig.hasScrim}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({ hasScrim: e.target.checked })
                      }
                      className="accent-sky-400 rounded"
                    />
                    <span>Backdrop Box</span>
                  </label>
                </div>

                {defaultCaptionConfig.hasScrim && (
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="color"
                      value={defaultCaptionConfig.captionBgColor ?? '#090B10'}
                      onChange={(e) =>
                        onChangeDefaultCaptionConfig({ captionBgColor: e.target.value })
                      }
                      className="w-8 h-7 rounded bg-transparent border border-white/[0.1] p-0.5 cursor-pointer shrink-0"
                      title="Background box color"
                    />
                    <div className="flex-1">
                      <ModalSlider
                        label="Backdrop Box Opacity"
                        value={defaultCaptionConfig.scrimOpacity}
                        min={15}
                        max={95}
                        unit="%"
                        onChange={(v) => onChangeDefaultCaptionConfig({ scrimOpacity: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/[0.08] bg-[#0B0E16] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoSyncCaptions}
                onChange={(e) => onChangeAutoSyncCaptions?.(e.target.checked)}
                className="accent-sky-400 w-3.5 h-3.5 rounded"
              />
              <span>Live Auto-Update All Captions</span>
            </label>
            <div className="text-[11px] text-slate-500">
              Position:{' '}
              <span className="font-mono text-slate-300">
                X {resolvedPreviewX}% · Y {resolvedPreviewY}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onApplyCaptionStyleToAll(defaultCaptionConfig);
                setAppliedFlash(true);
                window.setTimeout(() => setAppliedFlash(false), 1600);
              }}
              disabled={captionCount === 0}
              className="glow-btn flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 rounded-lg disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {appliedFlash
                  ? 'Applied to All Captions'
                  : `Apply Style to All Captions (${captionCount})`}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="glow-btn-prism px-4 py-2 text-xs font-semibold text-white rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
