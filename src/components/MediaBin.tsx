import React, { useRef, useState } from 'react';
import {
  Captions,
  Check,
  Download,
  Film,
  Frame,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Music,
  Plus,
  Search,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { BUILTIN_MOTION_ASSETS } from '../data/sampleProject';
import {
  ANIMATION_PRESETS,
  AnimationCategory,
  AnimationPresetInfo,
  BUILTIN_FONT_FAMILIES,
  ClipAnimationPreset,
  ContextPropertiesTarget,
  CustomFont,
  CustomMaskItem,
  FAMOUS_STICKERS,
  FRAME_PRESETS,
  FramePreset,
  FramePresetInfo,
  MASK_PRESETS,
  MaskPresetInfo,
  MaskShape,
  MediaAsset,
  StickerCategory,
  StickerPresetInfo,
  TextConfig,
  TimelineClip,
  TransitionPreset,
  TransitionType,
  VISUAL_EFFECT_PRESETS,
  VisualEffectCategory,
  VisualEffectInfo,
  VisualEffectPreset,
} from '../types/editor';
import { CaptionCue } from '../utils/captions';
import {
  makeAnimationStorageKey,
  makeFrameStorageKey,
  makeFxStorageKey,
  makeMaskStorageKey,
} from '../utils/effectsStorage';
import { downloadCustomMaskPng } from '../utils/maskStorage';
import { TRANSITIONS_CATALOG } from '../utils/transitionsStorage';
import { clamp, formatShortTime } from '../utils/time';
import type { TextPresetSeed } from './TextStudioModal';

interface MediaBinProps {
  assets: MediaAsset[];
  customFonts: CustomFont[];
  customMasks: CustomMaskItem[];
  downloadedTransitionIds: TransitionType[];
  downloadedEffectKeys: string[];
  hasSelectedClip: boolean;
  hasSelectedVisualClip: boolean;
  onImportFiles: (files: FileList) => Promise<void>;
  onImportFonts: (files: FileList) => Promise<CustomFont | null>;
  onOpenAutoFonts: () => void;
  onOpenCustomMaskModal: () => void;
  onOpenProperties: (target: ContextPropertiesTarget) => void;
  onDownloadTransition: (preset: TransitionPreset) => Promise<void>;
  onDownloadAllTransitions: () => Promise<void>;
  onApplyTransition: (type: TransitionType, edge: 'in' | 'out', defaultDuration: number) => void;
  onDownloadEffectItem: (key: string, label: string) => Promise<void>;
  onDownloadAllEffects: () => Promise<void>;
  onDownloadAllFrames: () => Promise<void>;
  onDownloadAllMasks: () => Promise<void>;
  onDownloadAllAnimations: () => Promise<void>;
  onDownloadAllCaptionPresets?: () => Promise<void>;
  onApplyVisualEffect: (presetId: VisualEffectPreset) => void;
  onApplyFramePreset: (frameId: FramePreset) => void;
  onApplyMaskPreset: (maskShape: MaskShape) => void;
  onApplyCustomMask: (mask: CustomMaskItem) => void;
  onApplyAnimationPreset: (
    animationId: ClipAnimationPreset,
    category?: AnimationCategory
  ) => void;
  onAddAssetToTimeline: (asset: MediaAsset) => void;
  onAddAssetsToTimeline: (assets: MediaAsset[]) => void;
  onAddTitleTemplate: (name: string, config: TextConfig, x?: number, y?: number, duration?: number) => void;
  onAddSticker: (preset: StickerPresetInfo) => void;
  captionCount: number;
  captionClips?: TimelineClip[];
  currentTime?: number;
  onSeek?: (time: number) => void;
  onUpdateCaptionText?: (clipId: string, text: string) => void;
  onDeleteCaptionCue?: (clipId: string) => void;
  defaultCaptionConfig: TextConfig;
  autoSyncCaptions?: boolean;
  onChangeAutoSyncCaptions?: (next: boolean) => void;
  onChangeDefaultCaptionConfig: (patch: Partial<TextConfig>) => void;
  onApplyCaptionStyleToAll: (config: TextConfig) => void;
  onGenerateCaptions: (cues: CaptionCue[], config: TextConfig, atPlayhead?: boolean) => void;
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
  onExportCaptionsSrt: () => void;
  onExportCaptionsVtt: () => void;
  onExportCaptionsAss?: () => void;
  onExportCaptionsTxt?: () => void;
  onClearCaptions: () => void;
  onOpenCaptionStudio?: () => void;
  onOpenTextStudio?: (seed?: TextPresetSeed) => void;
  isImporting: boolean;
  width?: number;
}

const serialCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function compareSerialWise(a: MediaAsset, b: MediaAsset): number {
  return serialCollator.compare(a.name, b.name);
}

type BinTab = 'media' | 'titles' | 'stickers' | 'backdrops' | 'transitions';
type TitlesSubTab = 'titles' | 'captions';
type MediaViewMode = 'list' | 'grid';
type StickerCategoryFilter = 'All' | StickerCategory;
type FxSubTab = 'effects' | 'frames' | 'masks' | 'animations' | 'transitions';
type FxCategoryFilter = 'All' | VisualEffectCategory;
type AnimCategoryFilter = 'All' | AnimationCategory;

function SectionSearchBar({
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
      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-7 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-lg focus:outline-none focus:border-sky-400 placeholder:text-slate-500"
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

const TITLE_TEMPLATES: Array<{
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  config: TextConfig;
}> = [
  {
    id: 'headline',
    name: 'Center Headline',
    subtitle: 'Bold display title',
    x: 0,
    y: 0,
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
    id: 'lower-third',
    name: 'Lower Third',
    subtitle: 'Editorial monospace tag',
    x: -36,
    y: 34,
    config: {
      text: 'Location  ·  04:20 PM',
      fontFamily: 'JetBrains Mono',
      fontSize: 30,
      fontWeight: 500,
      color: '#F8FAFC',
      align: 'left',
      hasScrim: true,
      scrimOpacity: 74,
      animation: 'fade',
    },
  },
  {
    id: 'serif-chapter',
    name: 'Editorial Serif',
    subtitle: 'Chapter card typography',
    x: 0,
    y: -4,
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
    subtitle: 'Athletic bold callout',
    x: 0,
    y: 0,
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

export function MediaBin({
  assets,
  customFonts,
  customMasks,
  downloadedTransitionIds,
  downloadedEffectKeys,
  hasSelectedClip,
  hasSelectedVisualClip,
  onImportFiles,
  onImportFonts,
  onOpenAutoFonts,
  onOpenCustomMaskModal,
  onOpenProperties,
  onDownloadTransition,
  onDownloadAllTransitions,
  onApplyTransition,
  onDownloadEffectItem,
  onDownloadAllEffects,
  onDownloadAllFrames,
  onDownloadAllMasks,
  onDownloadAllAnimations,
  onDownloadAllCaptionPresets,
  onApplyVisualEffect,
  onApplyFramePreset,
  onApplyMaskPreset,
  onApplyCustomMask,
  onApplyAnimationPreset,
  onAddAssetToTimeline,
  onAddAssetsToTimeline,
  onAddTitleTemplate,
  onAddSticker,
  captionCount,
  captionClips = [],
  currentTime = 0,
  onSeek,
  onUpdateCaptionText,
  onDeleteCaptionCue,
  defaultCaptionConfig,
  autoSyncCaptions = true,
  onChangeAutoSyncCaptions,
  onChangeDefaultCaptionConfig,
  onApplyCaptionStyleToAll,
  onGenerateCaptions,
  onAutoDetectAudioCaptions,
  onOfflineWhisperCaptions,
  onOfflineSyncAudioCaptions,
  onTranslateCaptions,
  isAutoCaptionLoading,
  autoCaptionStatus,
  onDismissAutoCaptionStatus,
  onExportCaptionsSrt,
  onExportCaptionsVtt,
  onExportCaptionsAss,
  onExportCaptionsTxt,
  onClearCaptions,
  onOpenCaptionStudio,
  onOpenTextStudio,
  isImporting,
  width = 272,
}: MediaBinProps) {
  const [tab, setTab] = useState<BinTab>('media');
  const [titlesSubTab, setTitlesSubTab] = useState<TitlesSubTab>('titles');
  const [mediaViewMode, setMediaViewMode] = useState<MediaViewMode>(() => {
    try {
      const saved = window.localStorage.getItem('framecut.mediaViewMode');
      return saved === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [fxSubTab, setFxSubTab] = useState<FxSubTab>('effects');
  const [fxCategory, setFxCategory] = useState<FxCategoryFilter>('All');
  const [animCategory, setAnimCategory] = useState<AnimCategoryFilter>('All');
  const [stickerCategory, setStickerCategory] = useState<StickerCategoryFilter>('All');

  // Dedicated search queries per section box
  const [mediaQuery, setMediaQuery] = useState('');
  const [titlesQuery, setTitlesQuery] = useState('');
  const [stickersQuery, setStickersQuery] = useState('');
  const [effectsQuery, setEffectsQuery] = useState('');
  const [framesQuery, setFramesQuery] = useState('');
  const [masksQuery, setMasksQuery] = useState('');
  const [animationsQuery, setAnimationsQuery] = useState('');
  const [transitionsQuery, setTransitionsQuery] = useState('');
  const [motionQuery, setMotionQuery] = useState('');

  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const anchorAssetIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const handleSetMediaViewMode = (mode: MediaViewMode) => {
    setMediaViewMode(mode);
    try {
      window.localStorage.setItem('framecut.mediaViewMode', mode);
    } catch {
      // ignore storage failure
    }
  };

  const installedTransitions = new Set<TransitionType>(downloadedTransitionIds);
  const installedEffectSet = new Set<string>(downloadedEffectKeys);

  const pendingTransitions = TRANSITIONS_CATALOG.filter(
    (t) => !t.builtIn && !installedTransitions.has(t.id)
  );
  const transitionsNeedle = transitionsQuery.trim().toLowerCase();
  const filteredTransitions = transitionsNeedle
    ? TRANSITIONS_CATALOG.filter(
        (t) =>
          t.label.toLowerCase().includes(transitionsNeedle) ||
          t.category.toLowerCase().includes(transitionsNeedle) ||
          t.description.toLowerCase().includes(transitionsNeedle)
      )
    : TRANSITIONS_CATALOG;

  const effectCatalog = VISUAL_EFFECT_PRESETS.filter((e) => e.id !== 'none');
  const pendingEffects = effectCatalog.filter(
    (e) => !e.builtIn && !installedEffectSet.has(makeFxStorageKey(e.id))
  );
  const effectsNeedle = effectsQuery.trim().toLowerCase();
  const filteredEffects = effectCatalog.filter((e) => {
    if (fxCategory !== 'All' && e.category !== fxCategory) return false;
    if (!effectsNeedle) return true;
    return (
      e.label.toLowerCase().includes(effectsNeedle) ||
      e.category.toLowerCase().includes(effectsNeedle) ||
      e.description.toLowerCase().includes(effectsNeedle)
    );
  });

  const frameCatalog = FRAME_PRESETS.filter((f) => f.id !== 'none');
  const pendingFrames = frameCatalog.filter(
    (f) => !f.builtIn && !installedEffectSet.has(makeFrameStorageKey(f.id))
  );
  const framesNeedle = framesQuery.trim().toLowerCase();
  const filteredFrames = framesNeedle
    ? frameCatalog.filter(
        (f) =>
          f.label.toLowerCase().includes(framesNeedle) ||
          f.description.toLowerCase().includes(framesNeedle)
      )
    : frameCatalog;

  const maskCatalog = MASK_PRESETS.filter((m) => m.id !== 'none');
  const pendingMasks = maskCatalog.filter(
    (m) => !m.builtIn && !installedEffectSet.has(makeMaskStorageKey(m.id))
  );
  const masksNeedle = masksQuery.trim().toLowerCase();
  const filteredMasks = masksNeedle
    ? maskCatalog.filter(
        (m) =>
          m.label.toLowerCase().includes(masksNeedle) ||
          m.description.toLowerCase().includes(masksNeedle)
      )
    : maskCatalog;
  const filteredCustomMasks = masksNeedle
    ? customMasks.filter((m) => m.name.toLowerCase().includes(masksNeedle))
    : customMasks;

  const animationCatalog = ANIMATION_PRESETS;
  const pendingAnimations = animationCatalog.filter(
    (a) => !a.builtIn && !installedEffectSet.has(makeAnimationStorageKey(a.id))
  );
  const animationsNeedle = animationsQuery.trim().toLowerCase();
  const filteredAnimations = animationCatalog.filter((a) => {
    if (animCategory !== 'All' && a.category !== animCategory) return false;
    if (!animationsNeedle) return true;
    return (
      a.label.toLowerCase().includes(animationsNeedle) ||
      a.category.toLowerCase().includes(animationsNeedle) ||
      a.description.toLowerCase().includes(animationsNeedle)
    );
  });

  const mediaAssets = assets.filter((a) => a.type !== 'motion').sort(compareSerialWise);
  const mediaNeedle = mediaQuery.trim().toLowerCase();
  const filteredMediaAssets = mediaNeedle
    ? mediaAssets.filter(
        (a) =>
          a.name.toLowerCase().includes(mediaNeedle) ||
          a.type.toLowerCase().includes(mediaNeedle)
      )
    : mediaAssets;

  const titlesNeedle = titlesQuery.trim().toLowerCase();
  const filteredTitleTemplates = titlesNeedle
    ? TITLE_TEMPLATES.filter(
        (t) =>
          t.name.toLowerCase().includes(titlesNeedle) ||
          t.subtitle.toLowerCase().includes(titlesNeedle)
      )
    : TITLE_TEMPLATES;
  const filteredCustomFonts = titlesNeedle
    ? customFonts.filter((f) => f.family.toLowerCase().includes(titlesNeedle))
    : customFonts;

  const motionNeedle = motionQuery.trim().toLowerCase();
  const motionAssets = motionNeedle
    ? BUILTIN_MOTION_ASSETS.filter((m) => m.name.toLowerCase().includes(motionNeedle))
    : BUILTIN_MOTION_ASSETS;

  const stickersNeedle = stickersQuery.trim().toLowerCase();
  const filteredStickers = FAMOUS_STICKERS.filter((st) => {
    if (stickerCategory !== 'All' && st.category !== stickerCategory) return false;
    if (!stickersNeedle) return true;
    return (
      st.label.toLowerCase().includes(stickersNeedle) ||
      st.category.toLowerCase().includes(stickersNeedle) ||
      st.description.toLowerCase().includes(stickersNeedle) ||
      (st.emoji && st.emoji.includes(stickersNeedle))
    );
  });

  const validSelectedIds = selectedAssetIds.filter((id) =>
    mediaAssets.some((a) => a.id === id)
  );
  const selectedAssetSet = new Set(validSelectedIds);
  const selectedAssetsOrdered = mediaAssets.filter((a) => selectedAssetSet.has(a.id));

  const handleAssetClick = (e: React.MouseEvent, asset: MediaAsset) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.metaKey || e.ctrlKey) {
      setSelectedAssetIds((prev) =>
        prev.includes(asset.id) ? prev.filter((id) => id !== asset.id) : [...prev, asset.id]
      );
      anchorAssetIdRef.current = asset.id;
      return;
    }
    if (e.shiftKey && anchorAssetIdRef.current) {
      const idxA = filteredMediaAssets.findIndex((a) => a.id === anchorAssetIdRef.current);
      const idxB = filteredMediaAssets.findIndex((a) => a.id === asset.id);
      if (idxA !== -1 && idxB !== -1) {
        const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        const rangeIds = filteredMediaAssets.slice(lo, hi + 1).map((a) => a.id);
        setSelectedAssetIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
        return;
      }
    }
    setSelectedAssetIds([asset.id]);
    anchorAssetIdRef.current = asset.id;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await onImportFiles(e.dataTransfer.files);
    }
  };

  return (
    <aside
      style={{ width }}
      className="@container shrink-0 min-w-0 studio-panel border-r border-white/[0.08] flex flex-col h-full select-none overflow-hidden"
    >
      {/* Segmented Library Tabs */}
      <div className="p-2 @[250px]:p-3 border-b border-white/[0.08] overflow-x-auto studio-scroll-thin">
        <div className="grid grid-cols-5 gap-0.5 @[240px]:gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setTab('media')}
            className={`glow-btn py-1.5 px-0.5 text-[9.5px] @[260px]:text-[10.5px] font-medium rounded-md border border-transparent whitespace-nowrap truncate ${
              tab === 'media'
                ? 'bg-[#1A2130] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Media
          </button>
          <button
            type="button"
            onClick={() => setTab('titles')}
            className={`glow-btn py-1.5 px-0.5 text-[9.5px] @[260px]:text-[10.5px] font-medium rounded-md border border-transparent whitespace-nowrap truncate ${
              tab === 'titles'
                ? 'bg-[#1A2130] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Titles
          </button>
          <button
            type="button"
            onClick={() => setTab('stickers')}
            className={`glow-btn py-1.5 px-0.5 text-[9.5px] @[260px]:text-[10.5px] font-medium rounded-md border whitespace-nowrap truncate ${
              tab === 'stickers'
                ? 'bg-gradient-to-r from-fuchsia-600/30 via-purple-500/25 to-amber-500/20 text-fuchsia-200 border-fuchsia-400/35'
                : 'text-slate-400 hover:text-white border-transparent'
            }`}
            title="Famous Social, Reaction, Badge & Arrow Stickers"
          >
            Stickers
          </button>
          <button
            type="button"
            onClick={() => setTab('transitions')}
            className={`glow-btn py-1.5 px-0.5 text-[9.5px] @[260px]:text-[10.5px] font-medium rounded-md border whitespace-nowrap truncate ${
              tab === 'transitions'
                ? 'bg-gradient-to-r from-blue-600/30 via-purple-500/25 to-cyan-500/25 text-sky-200 border-sky-400/30'
                : 'text-slate-400 hover:text-white border-transparent'
            }`}
            title="Effects, Electro Frames, Masks, Animations & Transitions"
          >
            FX
          </button>
          <button
            type="button"
            onClick={() => setTab('backdrops')}
            className={`glow-btn py-1.5 px-0.5 text-[9.5px] @[260px]:text-[10.5px] font-medium rounded-md border border-transparent whitespace-nowrap truncate ${
              tab === 'backdrops'
                ? 'bg-[#1A2130] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Motion
          </button>
        </div>
      </div>

      {tab === 'media' && (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
              e.preventDefault();
              e.stopPropagation();
              setSelectedAssetIds(filteredMediaAssets.map((a) => a.id));
            }
          }}
          className="flex-1 flex flex-col min-h-0 outline-none"
        >
          <div className="p-3 border-b border-white/[0.08] space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <SectionSearchBar
                  value={mediaQuery}
                  onChange={setMediaQuery}
                  placeholder="Search media files..."
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenProperties({
                    kind: 'tool',
                    toolId: 'import-media',
                    title: 'Upload Media Tool',
                    description:
                      'Upload video, image, or audio files. Multiple files are automatically sorted serial-wise.',
                  });
                }}
                title={isImporting ? 'Importing media...' : 'Upload video, image, or audio'}
                aria-label="Upload media"
                className="glow-btn w-8 h-8 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.1] text-sky-300 hover:text-white flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                {isImporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
              </button>
              <div
                role="group"
                aria-label="Media view mode"
                className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#07090F] border border-white/[0.08] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => handleSetMediaViewMode('list')}
                  aria-pressed={mediaViewMode === 'list'}
                  title="List view"
                  aria-label="List view"
                  className={`glow-btn w-7 h-7 rounded-md border border-transparent flex items-center justify-center ${
                    mediaViewMode === 'list'
                      ? 'bg-[#1A2130] text-sky-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMediaViewMode('grid')}
                  aria-pressed={mediaViewMode === 'grid'}
                  title="Grid view"
                  aria-label="Grid view"
                  className={`glow-btn w-7 h-7 rounded-md border border-transparent flex items-center justify-center ${
                    mediaViewMode === 'grid'
                      ? 'bg-[#1A2130] text-sky-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,image/*,audio/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.flv,.ts,.mts,.m2ts,.wmv,.3gp,.ogv,.mpeg,.mpg,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.wma,.amr,.aiff,.aif,.caf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.avif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void onImportFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {mediaAssets.length > 0 && selectedAssetsOrdered.length > 0 && (
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedAssetIds(
                        validSelectedIds.length === mediaAssets.length
                          ? []
                          : mediaAssets.map((a) => a.id)
                      )
                    }
                    className="glow-btn px-2 py-1 rounded text-[11px] font-medium text-slate-300 hover:text-white border border-transparent whitespace-nowrap"
                  >
                    {validSelectedIds.length === mediaAssets.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                    {validSelectedIds.length} selected
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onAddAssetsToTimeline(selectedAssetsOrdered)}
                  className="glow-btn-prism px-2.5 py-1 text-[11px] font-semibold rounded text-white whitespace-nowrap shrink-0"
                  title="Add selected files serially to timeline"
                >
                  Add ({selectedAssetsOrdered.length})
                </button>
              </div>
            )}
          </div>

          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setIsDragOver(true);
              }
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                void handleDrop(e);
              }
            }}
            className={`flex-1 overflow-y-auto studio-scroll p-3 transition-colors ${
              isDragOver
                ? 'bg-sky-500/[0.08] ring-1 ring-inset ring-sky-400/50'
                : ''
            }`}
          >
            {filteredMediaAssets.length === 0 ? (
              <div className="py-12 px-3 text-center text-xs text-slate-500 space-y-1.5">
                <div>
                  {mediaAssets.length === 0
                    ? 'Drop media files here or click the upload icon above.'
                    : 'No matching media found.'}
                </div>
              </div>
            ) : mediaViewMode === 'list' ? (
              <div className="space-y-2">
                {filteredMediaAssets.map((asset) => {
                  const isSelected = selectedAssetSet.has(asset.id);
                  return (
                    <div
                      key={asset.id}
                      draggable
                      onClick={(e) => handleAssetClick(e, asset)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenProperties({ kind: 'asset', assetId: asset.id });
                      }}
                      onDragStart={(e) => {
                        const batchIds =
                          isSelected && selectedAssetsOrdered.length > 1
                            ? selectedAssetsOrdered.map((a) => a.id)
                            : [asset.id];
                        e.dataTransfer.setData(
                          'application/x-framecut-assets',
                          JSON.stringify(batchIds)
                        );
                        e.dataTransfer.setData('application/x-framecut-asset', asset.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      title="Right-click for file properties & duration settings"
                      className={`glow-card group flex items-center gap-2.5 p-2 rounded-lg border cursor-grab active:cursor-grabbing ${
                        isSelected
                          ? 'bg-[#182338] border-sky-400/60 ring-1 ring-sky-400/30'
                          : 'bg-[#141822] hover:bg-[#1B212F] border-white/[0.06]'
                      }`}
                    >
                      <div className="w-12 h-8 rounded bg-[#07090F] overflow-hidden shrink-0 flex items-center justify-center border border-white/[0.06]">
                        {asset.thumbnailUrl ? (
                          <img
                            src={asset.thumbnailUrl}
                            alt={asset.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : asset.type === 'video' ? (
                          <Film className="w-4 h-4 text-sky-400" />
                        ) : asset.type === 'audio' ? (
                          <Music className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-amber-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {asset.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums flex items-center gap-1.5">
                          <span className="capitalize">{asset.type}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatShortTime(asset.duration)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAddAssetToTimeline(asset)}
                        className="glow-btn w-7 h-7 rounded-md bg-white/[0.06] text-slate-300 hover:text-white border border-transparent flex items-center justify-center shrink-0"
                        title="Add to timeline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 @[340px]:grid-cols-3 gap-2">
                {filteredMediaAssets.map((asset) => {
                  const isSelected = selectedAssetSet.has(asset.id);
                  return (
                    <div
                      key={asset.id}
                      draggable
                      onClick={(e) => handleAssetClick(e, asset)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenProperties({ kind: 'asset', assetId: asset.id });
                      }}
                      onDragStart={(e) => {
                        const batchIds =
                          isSelected && selectedAssetsOrdered.length > 1
                            ? selectedAssetsOrdered.map((a) => a.id)
                            : [asset.id];
                        e.dataTransfer.setData(
                          'application/x-framecut-assets',
                          JSON.stringify(batchIds)
                        );
                        e.dataTransfer.setData('application/x-framecut-asset', asset.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      title="Right-click for file properties & duration settings"
                      className={`glow-card group rounded-lg border overflow-hidden cursor-grab active:cursor-grabbing flex flex-col ${
                        isSelected
                          ? 'bg-[#182338] border-sky-400/60 ring-1 ring-sky-400/30'
                          : 'bg-[#141822] hover:bg-[#1B212F] border-white/[0.06]'
                      }`}
                    >
                      <div className="relative aspect-video w-full bg-[#07090F] overflow-hidden flex items-center justify-center border-b border-white/[0.06]">
                        {asset.thumbnailUrl ? (
                          <img
                            src={asset.thumbnailUrl}
                            alt={asset.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : asset.type === 'video' ? (
                          <Film className="w-5 h-5 text-sky-400" />
                        ) : asset.type === 'audio' ? (
                          <Music className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-amber-400" />
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
                        <span className="pointer-events-none absolute bottom-1 left-1.5 text-[10px] font-mono tabular-nums text-slate-200">
                          {formatShortTime(asset.duration)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAddAssetToTimeline(asset)}
                          className="glow-btn absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/70 text-slate-200 hover:text-white border border-white/[0.15] flex items-center justify-center opacity-90 @[220px]:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          title="Add to timeline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="p-2 min-w-0">
                        <div
                          className="text-[11px] font-medium text-slate-200 truncate"
                          title={asset.name}
                        >
                          {asset.name}
                        </div>
                        <div className="text-[10px] text-slate-500 capitalize truncate mt-0.5">
                          {asset.type}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'titles' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-2 @[250px]:px-3 pt-2.5 pb-2 border-b border-white/[0.08] space-y-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setTitlesSubTab('titles')}
                className={`glow-btn py-1 px-2 text-[11px] font-medium rounded border border-transparent whitespace-nowrap flex items-center justify-center gap-1.5 ${
                  titlesSubTab === 'titles'
                    ? 'bg-[#1A2130] text-sky-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Type className="w-3 h-3 shrink-0" />
                <span>Titles</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitlesSubTab('captions');
                  onOpenCaptionStudio?.();
                }}
                className={`glow-btn py-1 px-2 text-[11px] font-medium rounded border border-transparent whitespace-nowrap flex items-center justify-center gap-1.5 ${
                  titlesSubTab === 'captions'
                    ? 'bg-[#1A2130] text-sky-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Captions className="w-3 h-3 shrink-0" />
                <span>Captions</span>
              </button>
            </div>

            {titlesSubTab === 'titles' && (
              <SectionSearchBar
                value={titlesQuery}
                onChange={setTitlesQuery}
                placeholder="Search titles & fonts..."
              />
            )}
          </div>

          {titlesSubTab === 'titles' ? (
            <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-2.5">
              <button
                type="button"
                onClick={() => onOpenTextStudio?.()}
                className="glow-btn-prism w-full py-2 px-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5"
              >
                <Type className="w-3.5 h-3.5 shrink-0" />
                <span>Add Text (Advanced Settings)</span>
              </button>
              <p className="text-[11px] text-slate-400">
                Click any title template below to open advanced settings, or click + to insert directly.
              </p>
              {filteredTitleTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onOpenTextStudio
                      ? onOpenTextStudio({
                          name: tpl.name,
                          x: tpl.x,
                          y: tpl.y,
                          duration: 3.0,
                          config: tpl.config,
                        })
                      : onAddTitleTemplate(tpl.name, tpl.config, tpl.x, tpl.y)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onOpenTextStudio) {
                        onOpenTextStudio({
                          name: tpl.name,
                          x: tpl.x,
                          y: tpl.y,
                          duration: 3.0,
                          config: tpl.config,
                        });
                      } else {
                        onAddTitleTemplate(tpl.name, tpl.config, tpl.x, tpl.y);
                      }
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenProperties({
                      kind: 'title-template',
                      id: tpl.id,
                      name: tpl.name,
                      subtitle: tpl.subtitle,
                      x: tpl.x,
                      y: tpl.y,
                      config: tpl.config,
                    });
                  }}
                  title="Click for advanced text settings popup"
                  className="glow-card w-full text-left p-2.5 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.06] flex items-center justify-between gap-2 group cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <Type className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">{tpl.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {tpl.subtitle}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddTitleTemplate(tpl.name, tpl.config, tpl.x, tpl.y);
                    }}
                    title="Quick insert at playhead"
                    className="glow-btn w-7 h-7 rounded-md bg-white/[0.05] hover:bg-sky-500/20 text-slate-400 hover:text-white border border-transparent flex items-center justify-center shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <div className="pt-3 border-t border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Saved & Auto Fonts</span>
                  {customFonts.length > 0 && (
                    <span className="text-[11px] font-mono text-slate-500">{customFonts.length}</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onOpenAutoFonts}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenProperties({
                      kind: 'tool',
                      toolId: 'font-library',
                      title: 'Famous Auto Fonts Library',
                      description:
                        'Browse and permanently save famous display, serif, script, mono, and Urdu/Arabic fonts.',
                    });
                  }}
                  className="glow-btn w-full py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600/20 via-purple-500/15 to-cyan-500/20 border border-sky-400/30 text-xs font-medium text-sky-100 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                  <span>Download Famous Fonts</span>
                </button>

                <input
                  ref={fontInputRef}
                  type="file"
                  multiple
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      void onImportFonts(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fontInputRef.current?.click()}
                  className="glow-btn w-full py-2 px-3 rounded-lg border border-dashed border-white/[0.14] bg-[#07090F]/70 hover:bg-[#141822] text-xs font-medium text-slate-300 hover:text-white flex items-center justify-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  <span>Upload Font (.ttf, .otf, .woff2)</span>
                </button>

                {filteredCustomFonts.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {filteredCustomFonts.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          onAddTitleTemplate(font.family, {
                            text: font.family,
                            fontFamily: font.family,
                            fontSize: 66,
                            fontWeight: 600,
                            color: '#FFFFFF',
                            align: 'center',
                            hasScrim: false,
                            scrimOpacity: 60,
                            animation: 'slide-up',
                          })
                        }
                        className="glow-card w-full text-left px-2.5 py-2 rounded-md bg-[#141822] hover:bg-[#1B212F] border border-white/[0.06] flex items-center justify-between gap-2"
                        title={`Insert title with ${font.family}`}
                      >
                        <span
                          className="text-xs text-slate-100 truncate"
                          style={{ fontFamily: `"${font.family}", sans-serif` }}
                        >
                          {font.family}
                        </span>
                        <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-3">
              <button
                type="button"
                onClick={() => onOpenCaptionStudio?.()}
                className="glow-btn-prism w-full py-2.5 px-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5"
              >
                <Captions className="w-3.5 h-3.5 shrink-0" />
                <span>Open Captions Advanced Popup</span>
              </button>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                All caption settings, auto-detect speech, active word formats, presets, and exports are inside the Captions popup. Generated captions appear directly below the video preview to rewrite anytime.
              </p>

              <div className="p-2.5 rounded-lg bg-[#141822] border border-white/[0.06] flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-300">Active Captions</span>
                <span className="font-mono tabular-nums text-sky-300 font-semibold">
                  {captionCount} cues
                </span>
              </div>

              {captionCount > 0 && (
                <button
                  type="button"
                  onClick={onClearCaptions}
                  className="glow-btn w-full py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-[11px] font-medium text-rose-200 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Clear All Captions ({captionCount})</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'stickers' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-white/[0.08] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-fuchsia-300" />
                <span>Famous Stickers</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {filteredStickers.length} packs
              </span>
            </div>

            <SectionSearchBar
              value={stickersQuery}
              onChange={setStickersQuery}
              placeholder="Search stickers (subscribe, fire, arrow)..."
            />

            <div className="grid grid-cols-5 gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
              {(['All', 'Social', 'Reactions', 'Badges', 'Arrows'] as StickerCategoryFilter[]).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setStickerCategory(cat)}
                    className={`glow-btn py-1 px-0.5 text-[9.5px] font-medium rounded border border-transparent whitespace-nowrap truncate ${
                      stickerCategory === cat
                        ? 'bg-[#1A2130] text-fuchsia-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat === 'Reactions' ? 'Emoji' : cat}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto studio-scroll p-3">
            {filteredStickers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No matching stickers found.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredStickers.map((preset) => (
                  <div
                    key={preset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-framecut-sticker', preset.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAddSticker(preset)}
                    title={`${preset.description} — Click to add or drag to timeline`}
                    className="glow-card fc-card-lift group p-2.5 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.06] hover:border-fuchsia-400/40 cursor-grab active:cursor-grabbing flex flex-col justify-between gap-2 select-none"
                  >
                    <div
                      className="h-12 rounded-md border border-white/[0.08] flex items-center justify-center px-2 overflow-hidden relative"
                      style={{
                        background: `radial-gradient(circle at 50% 35%, ${preset.primaryColor}33, #090C14 85%)`,
                      }}
                    >
                      {preset.kind === 'emoji-badge' ? (
                        <span className="text-2xl leading-none drop-shadow">
                          {preset.emoji || '✨'}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide truncate max-w-full shadow-sm"
                          style={{
                            backgroundColor: preset.showBadgeBg
                              ? preset.primaryColor
                              : 'transparent',
                            color: preset.textColor,
                            border: `1px solid ${preset.accentColor}88`,
                          }}
                        >
                          {preset.emoji && <span>{preset.emoji}</span>}
                          <span className="truncate">{preset.label}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-slate-200 truncate">
                          {preset.label}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {preset.category}
                        </div>
                      </div>
                      <span className="w-5 h-5 rounded bg-white/[0.06] group-hover:bg-fuchsia-500/25 text-slate-300 group-hover:text-white flex items-center justify-center shrink-0">
                        <Plus className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'transitions' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Sub-navigation: FX | Frame | Mask | Anim | Trans */}
          <div className="px-2 @[250px]:px-3 pt-2.5 pb-2 border-b border-white/[0.06] space-y-2">
            <div className="grid grid-cols-5 gap-0.5 @[240px]:gap-1 p-1 bg-[#07090F] rounded-lg border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setFxSubTab('effects')}
                className={`glow-btn py-1 px-0.5 text-[9.5px] @[250px]:text-[10px] font-medium rounded border border-transparent whitespace-nowrap truncate ${
                  fxSubTab === 'effects'
                    ? 'bg-[#1A2130] text-sky-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                FX
              </button>
              <button
                type="button"
                onClick={() => setFxSubTab('frames')}
                className={`glow-btn py-1 px-0.5 text-[9.5px] @[250px]:text-[10px] font-medium rounded border border-transparent whitespace-nowrap truncate ${
                  fxSubTab === 'frames'
                    ? 'bg-[#1A2130] text-sky-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Frame
              </button>
              <button
                type="button"
                onClick={() => setFxSubTab('masks')}
                className={`glow-btn py-1 px-0.5 text-[9.5px] @[250px]:text-[10px] font-medium rounded border border-transparent whitespace-nowrap truncate ${
                  fxSubTab === 'masks'
                    ? 'bg-[#1A2130] text-sky-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mask
              </button>
              <button
                type="button"
                onClick={() => setFxSubTab('animations')}
                className={`glow-btn py-1 px-0.5 text-[9.5px] @[250px]:text-[10px] font-medium rounded border border-transparent whitespace-nowrap truncate ${
                  fxSubTab === 'animations'
                    ? 'bg-[#1A2130] text-sky-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Anim
              </button>
              <button
                type="button"
                onClick={() => setFxSubTab('transitions')}
                className={`glow-btn py-1 px-0.5 text-[9.5px] @[250px]:text-[10px] font-medium rounded border border-transparent whitespace-nowrap truncate ${
                  fxSubTab === 'transitions'
                    ? 'bg-[#1A2130] text-sky-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Trans
              </button>
            </div>

            {/* Section-Specific Search Bar */}
            {fxSubTab === 'effects' && (
              <SectionSearchBar
                value={effectsQuery}
                onChange={setEffectsQuery}
                placeholder="Search effects (glow, blur, glitch)..."
              />
            )}
            {fxSubTab === 'frames' && (
              <SectionSearchBar
                value={framesQuery}
                onChange={setFramesQuery}
                placeholder="Search frames (electro, neon, film)..."
              />
            )}
            {fxSubTab === 'masks' && (
              <SectionSearchBar
                value={masksQuery}
                onChange={setMasksQuery}
                placeholder="Search masks & custom PNG..."
              />
            )}
            {fxSubTab === 'animations' && (
              <SectionSearchBar
                value={animationsQuery}
                onChange={setAnimationsQuery}
                placeholder="Search animations (bounce, slide, pulse)..."
              />
            )}
            {fxSubTab === 'transitions' && (
              <SectionSearchBar
                value={transitionsQuery}
                onChange={setTransitionsQuery}
                placeholder="Search transitions (dissolve, zoom)..."
              />
            )}
          </div>

          <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-2.5">
            {fxSubTab === 'effects' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">
                      Famous Internet FX Library
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {effectCatalog.length - pendingEffects.length}/{effectCatalog.length}
                    </span>
                  </div>

                  {/* Interactive Category Filter Bar */}
                  <div className="flex items-center gap-1 overflow-x-auto studio-scroll-thin pb-1">
                    {(['All', 'Glow', 'Blur', 'Mosaic', 'Cinema', 'Glitch', 'Stylize'] as FxCategoryFilter[]).map(
                      (cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setFxCategory(cat)}
                          className={`glow-btn px-2 py-1 text-[10px] font-medium rounded-md border whitespace-nowrap shrink-0 ${
                            fxCategory === cat
                              ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                              : 'bg-[#07090F] border-white/[0.07] text-slate-400 hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      )
                    )}
                  </div>

                  {pendingEffects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void onDownloadAllEffects()}
                      className="glow-btn w-full py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600/20 via-purple-500/15 to-cyan-500/20 border border-sky-400/35 text-xs font-medium text-sky-100 flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-300" />
                      <span>Download All Famous FX ({pendingEffects.length})</span>
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {hasSelectedClip ? 'Apply or drag onto clip' : 'Select clip or download FX'}
                    </span>
                    {hasSelectedClip && (
                      <button
                        type="button"
                        onClick={() => onApplyVisualEffect('none')}
                        className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                      >
                        Reset FX
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-0.5">
                  {filteredEffects.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No matching effects found.
                    </div>
                  ) : (
                    filteredEffects.map((fx: VisualEffectInfo) => {
                      const storageKey = makeFxStorageKey(fx.id);
                      const isReady = Boolean(fx.builtIn || installedEffectSet.has(storageKey));

                      return (
                        <div
                          key={fx.id}
                          draggable={isReady}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenProperties({ kind: 'fx', fxId: fx.id });
                          }}
                          onDragStart={(e) => {
                            if (!isReady) return;
                            e.dataTransfer.setData('application/x-framecut-fx', fx.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          title="Right-click for FX strength & glow settings"
                          className={`glow-card p-2.5 rounded-lg bg-[#141822] border border-white/[0.06] space-y-2 ${
                            isReady ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center border border-white/[0.1]"
                              style={{
                                background: `radial-gradient(circle at 30% 30%, ${fx.accent}55, #090C14)`,
                                boxShadow: `0 0 12px ${fx.accent}33`,
                              }}
                            >
                              <Sparkles className="w-3.5 h-3.5" style={{ color: fx.accent }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                <span className="truncate">{fx.label}</span>
                                {!fx.builtIn && isReady && (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {fx.category} · {fx.description}
                              </div>
                            </div>
                          </div>

                          {isReady ? (
                            <button
                              type="button"
                              disabled={!hasSelectedClip}
                              onClick={() => onApplyVisualEffect(fx.id)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.08] disabled:opacity-40 disabled:pointer-events-none"
                            >
                              Apply Effect
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onDownloadEffectItem(storageKey, fx.label)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.1] flex items-center justify-center gap-1.5"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download & Save</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {fxSubTab === 'frames' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">
                      Electro & Studio Frames
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {frameCatalog.length - pendingFrames.length}/{frameCatalog.length}
                    </span>
                  </div>

                  {pendingFrames.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void onDownloadAllFrames()}
                      className="glow-btn w-full py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600/20 via-purple-500/15 to-cyan-500/20 border border-sky-400/35 text-xs font-medium text-sky-100 flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-300" />
                      <span>Download All Frames ({pendingFrames.length})</span>
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {hasSelectedVisualClip
                        ? 'Apply or drag onto V1 clip'
                        : 'Select a V1 clip or download'}
                    </span>
                    {hasSelectedVisualClip && (
                      <button
                        type="button"
                        onClick={() => onApplyFramePreset('none')}
                        className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                      >
                        Remove Frame
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-0.5">
                  {filteredFrames.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No matching frames found.
                    </div>
                  ) : (
                    filteredFrames.map((fr: FramePresetInfo) => {
                      const storageKey = makeFrameStorageKey(fr.id);
                      const isReady = Boolean(fr.builtIn || installedEffectSet.has(storageKey));

                      return (
                        <div
                          key={fr.id}
                          draggable={isReady}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenProperties({ kind: 'frame', frameId: fr.id });
                          }}
                          onDragStart={(e) => {
                            if (!isReady) return;
                            e.dataTransfer.setData('application/x-framecut-frame', fr.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          title="Right-click for frame color & size settings"
                          className={`glow-card p-2.5 rounded-lg bg-[#141822] border border-white/[0.06] space-y-2 ${
                            isReady ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center border"
                              style={{
                                borderColor: `${fr.accent}66`,
                                backgroundColor: '#07090F',
                                boxShadow: `0 0 10px ${fr.accent}26`,
                              }}
                            >
                              <Frame className="w-3.5 h-3.5" style={{ color: fr.accent }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                <span className="truncate">{fr.label}</span>
                                {!fr.builtIn && isReady && (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {fr.description}
                              </div>
                            </div>
                          </div>

                          {isReady ? (
                            <button
                              type="button"
                              disabled={!hasSelectedVisualClip}
                              onClick={() => onApplyFramePreset(fr.id)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.08] disabled:opacity-40 disabled:pointer-events-none"
                            >
                              Apply Frame
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onDownloadEffectItem(storageKey, fr.label)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.1] flex items-center justify-center gap-1.5"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download & Save</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {fxSubTab === 'masks' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">
                      Video Masks & Custom PNG
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {maskCatalog.length - pendingMasks.length}/{maskCatalog.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenCustomMaskModal}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenProperties({
                        kind: 'tool',
                        toolId: 'custom-mask-studio',
                        title: 'Custom Mask Studio',
                        description:
                          'Draw custom alpha masks or upload PNG/SVG shapes, download PNGs, and apply to V1 clips.',
                      });
                    }}
                    className="glow-btn-prism w-full py-2 px-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Design / Upload Custom Mask</span>
                  </button>

                  {pendingMasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void onDownloadAllMasks()}
                      className="glow-btn w-full py-1.5 px-3 rounded-lg bg-[#141822] border border-sky-400/30 text-xs font-medium text-sky-200 flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-300" />
                      <span>Download All Masks ({pendingMasks.length})</span>
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {hasSelectedVisualClip ? 'Apply or drag onto V1 clip' : 'Select V1 clip or design mask'}
                    </span>
                    {hasSelectedVisualClip && (
                      <button
                        type="button"
                        onClick={() => onApplyMaskPreset('none')}
                        className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                      >
                        Remove Mask
                      </button>
                    )}
                  </div>
                </div>

                {filteredCustomMasks.length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-white/[0.08]">
                    <div className="text-[11px] font-medium text-sky-300">
                      My Custom Masks ({filteredCustomMasks.length})
                    </div>
                    {filteredCustomMasks.map((cm) => (
                      <div
                        key={cm.id}
                        draggable
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenProperties({ kind: 'custom-mask', customMaskId: cm.id });
                        }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-framecut-custom-mask', cm.id);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        title="Right-click for mask scale, feather & download settings"
                        className="glow-card p-2.5 rounded-lg bg-[#141822] border border-sky-400/25 space-y-2 cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-7 rounded bg-[#07090F] border border-white/[0.12] flex items-center justify-center overflow-hidden shrink-0">
                            <img
                              src={cm.dataUrl}
                              alt={cm.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-slate-200 truncate">
                              {cm.name}
                            </div>
                            <div className="text-[10px] text-slate-500">Custom PNG Mask</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadCustomMaskPng(cm)}
                            className="glow-btn p-1.5 rounded bg-[#07090F] text-sky-300 hover:text-white border border-white/[0.08]"
                            title="Download custom mask PNG"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={!hasSelectedVisualClip}
                          onClick={() => onApplyCustomMask(cm)}
                          className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.08] disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Apply Custom Mask
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-0.5">
                  {filteredMasks.length === 0 && filteredCustomMasks.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No matching masks found.
                    </div>
                  ) : (
                    filteredMasks.map((mk: MaskPresetInfo) => {
                      const storageKey = makeMaskStorageKey(mk.id);
                      const isReady = Boolean(mk.builtIn || installedEffectSet.has(storageKey));

                      return (
                        <div
                          key={mk.id}
                          draggable={isReady}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenProperties({ kind: 'mask', maskShape: mk.id });
                          }}
                          onDragStart={(e) => {
                            if (!isReady) return;
                            e.dataTransfer.setData('application/x-framecut-mask', mk.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          title="Right-click for mask size, feather & invert settings"
                          className={`glow-card p-2.5 rounded-lg bg-[#141822] border border-white/[0.06] space-y-2 ${
                            isReady ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center border"
                              style={{
                                borderColor: `${mk.accent}66`,
                                backgroundColor: '#07090F',
                                boxShadow: `0 0 10px ${mk.accent}26`,
                              }}
                            >
                              <Layers className="w-3.5 h-3.5" style={{ color: mk.accent }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                <span className="truncate">{mk.label}</span>
                                {!mk.builtIn && isReady && (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {mk.description}
                              </div>
                            </div>
                          </div>

                          {isReady ? (
                            <button
                              type="button"
                              disabled={!hasSelectedVisualClip}
                              onClick={() => onApplyMaskPreset(mk.id)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.08] disabled:opacity-40 disabled:pointer-events-none"
                            >
                              Apply Mask
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onDownloadEffectItem(storageKey, mk.label)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.1] flex items-center justify-center gap-1.5"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download & Save</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {fxSubTab === 'animations' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">
                      Motion Animations Pack
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {animationCatalog.length - pendingAnimations.length}/{animationCatalog.length}
                    </span>
                  </div>

                  {/* Category filter */}
                  <div className="grid grid-cols-4 gap-1">
                    {(['All', 'In', 'Out', 'Combo'] as AnimCategoryFilter[]).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setAnimCategory(cat)}
                        className={`glow-btn py-1 text-[10px] font-medium rounded-md border whitespace-nowrap ${
                          animCategory === cat
                            ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                            : 'bg-[#07090F] border-white/[0.07] text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {pendingAnimations.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void onDownloadAllAnimations()}
                      className="glow-btn w-full py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600/20 via-purple-500/15 to-cyan-500/20 border border-sky-400/35 text-xs font-medium text-sky-100 flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-300" />
                      <span>Download All Animations ({pendingAnimations.length})</span>
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {hasSelectedClip ? 'Apply or drag onto V1 / T1 clip' : 'Select clip or download'}
                    </span>
                    {hasSelectedClip && (
                      <button
                        type="button"
                        onClick={() => onApplyAnimationPreset('none')}
                        className="glow-btn px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white border border-transparent"
                      >
                        Clear Anim
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-0.5">
                  {filteredAnimations.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No matching animations found.
                    </div>
                  ) : (
                    filteredAnimations.map((anim: AnimationPresetInfo) => {
                      const storageKey = makeAnimationStorageKey(anim.id);
                      const isReady = Boolean(anim.builtIn || installedEffectSet.has(storageKey));

                      const downloadPresetFile = () => {
                        const blob = new Blob(
                          [
                            JSON.stringify(
                              {
                                framecutAnimation: 1,
                                id: anim.id,
                                label: anim.label,
                                category: anim.category,
                                defaultDuration: anim.defaultDuration,
                                description: anim.description,
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
                        link.download = `${anim.id}.framecut-anim.json`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.setTimeout(() => URL.revokeObjectURL(url), 2500);
                      };

                      return (
                        <div
                          key={anim.id}
                          draggable={isReady}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenProperties({ kind: 'animation', animationId: anim.id });
                          }}
                          onDragStart={(e) => {
                            if (!isReady) return;
                            e.dataTransfer.setData('application/x-framecut-animation', anim.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          title="Right-click for animation speed, duration & download settings"
                          className={`glow-card p-2.5 rounded-lg bg-[#141822] border border-white/[0.06] space-y-2 ${
                            isReady ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center border border-white/[0.1]"
                              style={{
                                background: `radial-gradient(circle at 30% 30%, ${anim.accent}55, #090C14)`,
                                boxShadow: `0 0 12px ${anim.accent}33`,
                              }}
                            >
                              <Zap className="w-3.5 h-3.5" style={{ color: anim.accent }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                <span className="truncate">{anim.label}</span>
                                {!anim.builtIn && isReady && (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {anim.category} · {anim.description}
                              </div>
                            </div>
                            {isReady && (
                              <button
                                type="button"
                                onClick={downloadPresetFile}
                                className="glow-btn p-1.5 rounded bg-[#07090F] text-sky-300 hover:text-white border border-white/[0.08] shrink-0"
                                title="Download animation preset file (.json)"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {isReady ? (
                            <button
                              type="button"
                              disabled={!hasSelectedClip}
                              onClick={() => onApplyAnimationPreset(anim.id, anim.category)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.08] disabled:opacity-40 disabled:pointer-events-none"
                            >
                              Apply {anim.category} Animation
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onDownloadEffectItem(storageKey, anim.label)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.1] flex items-center justify-center gap-1.5"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download & Save</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {fxSubTab === 'transitions' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">
                      Transitions & Packs
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {TRANSITIONS_CATALOG.length - pendingTransitions.length}/
                      {TRANSITIONS_CATALOG.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {hasSelectedClip
                      ? 'Click In or Out to apply, or drag onto any clip.'
                      : 'Select a clip first, or download packs to save permanently.'}
                  </p>
                  {pendingTransitions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void onDownloadAllTransitions()}
                      className="glow-btn w-full py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600/20 via-purple-500/15 to-cyan-500/20 border border-sky-400/35 text-xs font-medium text-sky-100 flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-300" />
                      <span>Download All Pro ({pendingTransitions.length})</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 pt-0.5">
                  {filteredTransitions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No matching transitions found.
                    </div>
                  ) : (
                    filteredTransitions.map((preset) => {
                      const isReady = Boolean(preset.builtIn || installedTransitions.has(preset.id));

                      return (
                        <div
                          key={preset.id}
                          draggable={isReady}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenProperties({ kind: 'transition', transitionId: preset.id });
                          }}
                          onDragStart={(e) => {
                            if (!isReady) return;
                            e.dataTransfer.setData('application/x-framecut-transition', preset.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          title="Right-click for transition duration & edge settings"
                          className={`glow-card p-2.5 rounded-lg bg-[#141822] border border-white/[0.06] space-y-2 ${
                            isReady ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                <span className="truncate">{preset.label}</span>
                                {!preset.builtIn && isReady && (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {preset.category} · {preset.description}
                              </div>
                            </div>
                          </div>

                          {isReady ? (
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                disabled={!hasSelectedClip}
                                onClick={() =>
                                  onApplyTransition(preset.id, 'in', preset.defaultDuration)
                                }
                                className="glow-btn py-1 px-2 text-[11px] font-medium rounded bg-[#07090F] text-slate-300 hover:text-white border border-white/[0.08] disabled:opacity-40 disabled:pointer-events-none"
                              >
                                Apply In
                              </button>
                              <button
                                type="button"
                                disabled={!hasSelectedClip}
                                onClick={() =>
                                  onApplyTransition(preset.id, 'out', preset.defaultDuration)
                                }
                                className="glow-btn py-1 px-2 text-[11px] font-medium rounded bg-[#07090F] text-slate-300 hover:text-white border border-white/[0.08] disabled:opacity-40 disabled:pointer-events-none"
                              >
                                Apply Out
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onDownloadTransition(preset)}
                              className="glow-btn w-full py-1.5 px-2.5 text-[11px] font-medium rounded bg-[#07090F] text-slate-200 hover:text-white border border-white/[0.1] flex items-center justify-center gap-1.5"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download & Save</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'backdrops' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-white/[0.08]">
            <SectionSearchBar
              value={motionQuery}
              onChange={setMotionQuery}
              placeholder="Search motion backdrops..."
            />
          </div>

          <div className="flex-1 overflow-y-auto studio-scroll p-3 space-y-2">
            <p className="text-xs text-slate-400 pb-1">
              Procedural GPU motion backgrounds for fast intro cards and loops.
            </p>
            {motionAssets.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No matching motion backdrops found.
              </div>
            ) : (
              motionAssets.map((asset) => (
                <div
                  key={asset.id}
                  draggable
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenProperties({ kind: 'asset', assetId: asset.id });
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-framecut-asset', asset.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title="Right-click for motion backdrop duration & look settings"
                  className="glow-card group flex items-center gap-2.5 p-2.5 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.06] cursor-grab"
                >
                  <div
                    className="w-11 h-8 rounded shrink-0 border border-white/[0.08] flex items-center justify-center"
                    style={{
                      background:
                        asset.motionVariant === 'amber-horizon'
                          ? 'linear-gradient(135deg, #0F172A, #92400E, #F59E0B)'
                          : asset.motionVariant === 'kinetic-grid'
                          ? 'radial-gradient(circle, rgba(59,130,246,0.45), #090D14)'
                          : 'linear-gradient(135deg, #0B1120, #1D4ED8, #0F172A)',
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-white/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-200 truncate">
                      {asset.name}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Motion · {formatShortTime(asset.duration)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddAssetToTimeline(asset)}
                    className="glow-btn w-7 h-7 rounded-md bg-white/[0.06] text-slate-300 hover:text-white border border-transparent flex items-center justify-center shrink-0"
                    title="Add motion backdrop"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
