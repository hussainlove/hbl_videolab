import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptionStudioModal } from './components/CaptionStudioModal';
import { CustomMaskModal } from './components/CustomMaskModal';
import { ExportModal } from './components/ExportModal';
import { FamousFontsModal } from './components/FamousFontsModal';
import { HomePage } from './components/HomePage';
import { Inspector } from './components/Inspector';
import { MediaBin } from './components/MediaBin';
import { PreviewCanvas } from './components/PreviewCanvas';
import { PropertiesModal } from './components/PropertiesModal';
import { SaveLocationModal } from './components/SaveLocationModal';
import { OfflineIndicator } from './components/PWAInstallButton';
import {
  TEXT_STUDIO_PRESETS,
  TextPresetSeed,
  TextStudioModal,
} from './components/TextStudioModal';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import {
  BUILTIN_MOTION_ASSETS,
  buildSampleProject,
  createDefaultClipProps,
  createStickerClip,
  createTitleClip,
} from './data/sampleProject';
import {
  ANIMATION_PRESETS,
  AnimationCategory,
  AspectRatio,
  buildPanZoomClipPatch,
  BUILTIN_FONT_FAMILIES,
  CAPTION_STYLE_PRESETS,
  ClipAnimationPreset,
  ContextPropertiesTarget,
  CustomFont,
  CustomMaskItem,
  DEFAULT_TRACK_SETTINGS,
  FAMOUS_STICKERS,
  FILTER_PRESET_VALUES,
  findOrExpandTrackForSpan,
  FRAME_PRESETS,
  FramePreset,
  getOrderedTracks,
  getTrackControl,
  getTrackKind,
  isAudioTrack,
  isTitleTrack,
  isVisualTrack,
  makeTrackId,
  MASK_PRESETS,
  MaskShape,
  MediaAsset,
  StickerPresetInfo,
  TextConfig,
  TimelineClip,
  TITLE_AND_LOWER_THIRD_TEMPLATES,
  TitleTemplateItem,
  ToolContextId,
  TrackId,
  TrackKind,
  TrackSettingsMap,
  TransitionPreset,
  TransitionType,
  VISUAL_EFFECT_PRESETS,
  VisualEffectPreset,
} from './types/editor';
import { downloadGoogleFontVariants } from './utils/autoFonts';
import {
  decodeBase64AudioToPcm16k,
  detectOfflineSpeechSegments,
  extractTimelineAudioForCaptioning,
} from './utils/audioExtract';
import { transcribeAudioOfflineWhisper } from './utils/offlineSpeech';
import {
  extractWaveformFromUrl,
  FAMOUS_SFX_CATALOG,
  synthesizeSfxTrack,
} from './utils/audioSynth';
import {
  CaptionCue,
  exportClipsToAss,
  exportClipsToSrt,
  exportClipsToTxt,
  exportClipsToVtt,
  getYForCaptionPosition,
  splitScriptIntoCaptionCues,
} from './utils/captions';
import { detectTextLanguage, ensureScriptFontLoaded } from './utils/languageSupport';
import { LoadedMediaMap } from './utils/compositor';
import {
  getAllSavedEffectKeys,
  makeAnimationStorageKey,
  makeCaptionPresetStorageKey,
  makeFrameStorageKey,
  makeFxStorageKey,
  makeMaskStorageKey,
  makeTitleStorageKey,
  saveEffectKeyToDb,
  saveManyEffectKeysToDb,
} from './utils/effectsStorage';
import {
  getAllSavedFonts,
  registerStoredFontRecord,
  saveCustomFontToDb,
} from './utils/fontStorage';
import { getAllSavedCustomMasks, saveCustomMaskToDb } from './utils/maskStorage';
import {
  deleteCustomTitleTemplateFromDb,
  loadCustomTitleTemplates,
  loadCustomTitleTemplatesAsync,
  saveCustomTitleTemplateToDb,
  saveCustomTitleTemplates,
} from './utils/titleTemplateStorage';
import {
  getAllSavedTransitionIds,
  saveTransitionToDb,
  TRANSITIONS_CATALOG,
} from './utils/transitionsStorage';
import {
  bootstrapProjectsFromDb,
  captureActivePreviewThumbnail,
  deleteProjectFromDb,
  duplicateProjectInDb,
  ensureHandleWritePermission,
  exportProjectJsonDownload,
  getLastLinkedFolderPathFromLocalStorage,
  getProjectFolderLinkFromLocalStorage,
  importProjectFileJsonToDb,
  linkProjectFolderInLocalStorage,
  listProjectsFromDb,
  loadFileTargetFromDb,
  normalizeFolderPath,
  openProjectRecordFromDb,
  PersistedProjectState,
  pruneUnreferencedMediaBlobs,
  renameProjectInDb,
  SaveDirectoryHandleLike,
  SaveFileHandleLike,
  saveFileTargetToDb,
  saveMediaBlobToDb,
  saveMediaBlobsToDb,
  saveProjectRecordToDb,
  serializeProjectFileJson,
  setCurrentProjectIdInDb,
  StoredProjectRecord,
  syncLinkedFolderLocalStorage,
  writeProjectToHandle,
} from './utils/projectStorage';
import { clamp, uid } from './utils/time';

interface HistorySnapshot {
  clips: TimelineClip[];
}

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff',
]);
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'flv', 'ts', 'mts', 'm2ts', 'wmv', '3gp', 'ogv', 'mpeg', 'mpg',
]);
const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma', 'amr', 'aiff', 'aif', 'caf',
]);

function classifyMediaFile(file: File): 'image' | 'video' | 'audio' | null {
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/ogg') {
    return ext === 'ogv' ? 'video' : 'audio';
  }
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return null;
}

function normalizeTrackSettings(
  raw?: Partial<TrackSettingsMap>,
  clips?: TimelineClip[],
  extraIds?: string[]
): TrackSettingsMap {
  const keys = new Set<string>(['T1', 'V1', 'A1']);
  if (raw) {
    for (const k of Object.keys(raw)) {
      if (/^[TVA]\d+$/.test(k)) keys.add(k);
    }
  }
  if (clips) {
    for (const c of clips) {
      if (c.track) keys.add(c.track);
    }
  }
  if (extraIds) {
    for (const id of extraIds) {
      if (/^[TVA]\d+$/.test(id)) keys.add(id);
    }
  }
  const out: TrackSettingsMap = {};
  for (const id of keys) {
    out[id] = {
      locked: Boolean(raw?.[id]?.locked),
      hidden: Boolean(raw?.[id]?.hidden),
    };
  }
  return out;
}

export default function App() {
  const [activeView, setActiveView] = useState<'home' | 'editor'>('home');
  const [projects, setProjects] = useState<StoredProjectRecord[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [projectName, setProjectName] = useState('Untitled Sequence');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const assetsRef = useRef<MediaAsset[]>(assets);
  assetsRef.current = assets;
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const clipsRef = useRef<TimelineClip[]>(clips);
  clipsRef.current = clips;
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const selectedClipIdsRef = useRef<string[]>(selectedClipIds);
  selectedClipIdsRef.current = selectedClipIds;
  const [selectedTrackId, setSelectedTrackId] = useState<TrackId | null>(null);
  const selectedTrackIdRef = useRef<TrackId | null>(selectedTrackId);
  selectedTrackIdRef.current = selectedTrackId;
  const copiedClipsRef = useRef<TimelineClip[]>([]);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [customMasks, setCustomMasks] = useState<CustomMaskItem[]>([]);
  const [customTitleTemplates, setCustomTitleTemplates] = useState<TitleTemplateItem[]>(() =>
    loadCustomTitleTemplates()
  );
  const [downloadedTransitionIds, setDownloadedTransitionIds] = useState<TransitionType[]>([]);
  const [downloadedEffectKeys, setDownloadedEffectKeys] = useState<string[]>([]);
  const [isFontLibraryOpen, setIsFontLibraryOpen] = useState(false);
  const [isCustomMaskModalOpen, setIsCustomMaskModalOpen] = useState(false);
  const [isCaptionStudioOpen, setIsCaptionStudioOpen] = useState(false);
  const [isTextStudioOpen, setIsTextStudioOpen] = useState(false);
  const [textStudioSeed, setTextStudioSeed] = useState<TextPresetSeed | null>(null);
  const [propertiesTarget, setPropertiesTarget] = useState<ContextPropertiesTarget | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [timelineZoom, setTimelineZoom] = useState(68);
  const [extraTrackIds, setExtraTrackIds] = useState<string[]>([]);
  const extraTrackIdsRef = useRef<string[]>(extraTrackIds);
  extraTrackIdsRef.current = extraTrackIds;
  const [trackSettings, setTrackSettings] = useState<TrackSettingsMap>(() =>
    normalizeTrackSettings(DEFAULT_TRACK_SETTINGS)
  );
  const trackSettingsRef = useRef<TrackSettingsMap>(trackSettings);
  trackSettingsRef.current = trackSettings;

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [previewVolume, setPreviewVolume] = useState(100);
  const isMutedRef = useRef(false);
  isMutedRef.current = isMuted;
  const previewVolumeRef = useRef(100);
  previewVolumeRef.current = previewVolume;
  const lastNonZeroVolumeRef = useRef(100);
  const [previewScale, setPreviewScale] = useState<'auto' | 'half'>('auto');
  const [autoSyncCaptions, setAutoSyncCaptions] = useState(true);
  const autoSyncCaptionsRef = useRef(autoSyncCaptions);
  autoSyncCaptionsRef.current = autoSyncCaptions;
  const [defaultCaptionConfig, setDefaultCaptionConfig] = useState<TextConfig>(() => ({
    text: 'Caption subtitle text',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 44,
    fontWeight: 600,
    color: '#FFFFFF',
    align: 'center',
    hasScrim: false,
    scrimOpacity: 75,
    animation: 'fade',
    isCaption: true,
    captionStyle: 'classic-sub',
    captionPosition: 'bottom',
    captionX: 0,
    captionY: 34,
    captionLineMode: 'single-line',
    captionActiveMode: 'none',
    captionHighlightColor: '#38BDF8',
    captionActiveBoxColor: '#0EA5E9',
    captionActiveBoxRadius: 10,
    captionBgColor: '#090B10',
    captionOutlineColor: '#050608',
    captionOutlineWidth: 0,
    captionUppercase: false,
    captionWordHighlight: false,
    captionSafeMargin: 10,
    textDirection: 'auto',
    detectedLanguage: 'Auto',
  }));
  const [isAutoCaptionLoading, setIsAutoCaptionLoading] = useState(false);
  const [autoCaptionStatus, setAutoCaptionStatus] = useState<{
    kind: 'info' | 'success' | 'error';
    message: string;
    detectedLanguage?: string;
    script?: string;
    direction?: 'ltr' | 'rtl';
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [defaultImageDuration, setDefaultImageDuration] = useState(4);
  const defaultImageDurationRef = useRef(4);
  defaultImageDurationRef.current = defaultImageDuration;
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSaveLocationOpen, setIsSaveLocationOpen] = useState(false);
  const [saveModalMode, setSaveModalMode] = useState<'new-project' | 'save' | 'save-as'>('save');
  const [hasSavedOnce, setHasSavedOnce] = useState(false);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  const [savedFolderPath, setSavedFolderPath] = useState<string | null>(null);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const [isProjectSavedFlash, setIsProjectSavedFlash] = useState(false);
  const saveFlashTimerRef = useRef<number | null>(null);

  const projectFileHandleRef = useRef<SaveFileHandleLike | null>(null);
  const projectDirHandleRef = useRef<SaveDirectoryHandleLike | null>(null);
  const hasSavedOnceRef = useRef(false);
  hasSavedOnceRef.current = hasSavedOnce;
  const savedFileNameRef = useRef<string | null>(null);
  savedFileNameRef.current = savedFileName;
  const savedFolderPathRef = useRef<string | null>(null);
  savedFolderPathRef.current = savedFolderPath;
  const lastAutoSavedAtRef = useRef<number | null>(null);
  lastAutoSavedAtRef.current = lastAutoSavedAt;
  const embeddedMediaCacheRef = useRef<Map<string, string>>(new Map());

  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const activeProjectIdRef = useRef<string | null>(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const activeProjectCreatedAtRef = useRef<number>(Date.now());
  const activeProjectThumbRef = useRef<string | undefined>(undefined);
  const suppressNextAutoSaveRef = useRef(false);

  const isProjectHydratedRef = useRef(false);
  const latestProjectRef = useRef<PersistedProjectState>({
    projectName,
    aspectRatio,
    fps,
    currentTime,
    assets,
    clips,
    timelineZoom,
    snapEnabled,
    selectedClipIds,
    previewScale,
    trackSettings,
    extraTrackIds,
  });
  latestProjectRef.current = {
    projectName,
    aspectRatio,
    fps,
    currentTime,
    assets,
    clips,
    timelineZoom,
    snapEnabled,
    selectedClipIds,
    previewScale,
    trackSettings,
    extraTrackIds,
  };

  const buildCurrentProjectRecord = useCallback(
    (captureCanvasThumb = false): StoredProjectRecord | null => {
      const id = activeProjectIdRef.current;
      if (!id) return null;
      const state = latestProjectRef.current;
      let thumb = captureCanvasThumb ? captureActivePreviewThumbnail() : undefined;
      if (thumb) {
        activeProjectThumbRef.current = thumb;
      } else {
        thumb =
          activeProjectThumbRef.current ||
          state.assets.find(
            (a) =>
              (a.type === 'image' || a.type === 'video') &&
              typeof (a.thumbnailUrl || a.url) === 'string' &&
              !(a.thumbnailUrl || a.url).startsWith('blob:')
          )?.thumbnailUrl ||
          state.assets.find(
            (a) =>
              a.type === 'image' &&
              typeof a.url === 'string' &&
              !a.url.startsWith('blob:')
          )?.url;
      }

      return {
        id,
        ...state,
        thumbnailDataUrl: thumb,
        createdAt: activeProjectCreatedAtRef.current || Date.now(),
        updatedAt: Date.now(),
        hasSavedOnce: hasSavedOnceRef.current,
        savedFileName: savedFileNameRef.current,
        savedFolderPath: savedFolderPathRef.current,
        lastAutoSavedAt: lastAutoSavedAtRef.current,
      };
    },
    []
  );

  const triggerSavedFlash = useCallback(() => {
    setIsProjectSavedFlash(true);
    if (saveFlashTimerRef.current !== null) {
      window.clearTimeout(saveFlashTimerRef.current);
    }
    saveFlashTimerRef.current = window.setTimeout(() => {
      setIsProjectSavedFlash(false);
      saveFlashTimerRef.current = null;
    }, 1500);
  }, []);

  const syncLinkedFileNow = useCallback(async (promptPermissionIfNeeded: boolean) => {
    let handle = projectFileHandleRef.current;
    const dirHandle = projectDirHandleRef.current;
    if (!handle && dirHandle) {
      try {
        const fallbackName =
          savedFileNameRef.current ||
          `${(latestProjectRef.current.projectName || 'framecut-project')
            .trim()
            .replace(/[^a-zA-Z0-9._-]+/g, '-') || 'framecut-project'}.framecut.json`;
        handle = await dirHandle.getFileHandle(fallbackName, { create: true });
        projectFileHandleRef.current = handle;
      } catch {
        return false;
      }
    }
    if (!handle) return false;
    const allowed = await ensureHandleWritePermission(handle, promptPermissionIfNeeded);
    if (!allowed) return false;
    const json = await serializeProjectFileJson(
      latestProjectRef.current,
      embeddedMediaCacheRef.current
    );
    return writeProjectToHandle(handle, json);
  }, []);

  // Restore saved custom fonts, downloaded transitions/effects, custom masks, and multi-project library on startup.
  // Always lands on the Home Page by default on app open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          savedFonts,
          savedTransIds,
          savedEffectKeys,
          savedMasks,
          savedCustomTitles,
          workspace,
        ] = await Promise.all([
          getAllSavedFonts(),
          getAllSavedTransitionIds(),
          getAllSavedEffectKeys(),
          getAllSavedCustomMasks(),
          loadCustomTitleTemplatesAsync(),
          bootstrapProjectsFromDb(),
        ]);
        if (cancelled) return;

        if (savedTransIds.length > 0) {
          setDownloadedTransitionIds((prev) => Array.from(new Set([...prev, ...savedTransIds])));
        }
        if (savedEffectKeys.length > 0) {
          setDownloadedEffectKeys((prev) => Array.from(new Set([...prev, ...savedEffectKeys])));
        }
        if (savedMasks.length > 0) {
          setCustomMasks(savedMasks);
        }
        if (savedCustomTitles.length > 0) {
          setCustomTitleTemplates(savedCustomTitles);
        }

        if (savedFonts.length > 0) {
          const restored: CustomFont[] = [];
          for (const rec of savedFonts) {
            const ok = await registerStoredFontRecord(rec);
            if (ok) {
              restored.push({
                id: rec.id,
                family: rec.family,
                fileName: rec.fileName,
              });
            }
          }
          await document.fonts.ready;
          if (!cancelled && restored.length > 0) {
            setCustomFonts((prev) => {
              const existingIds = new Set(prev.map((f) => f.id));
              const merged = [...prev];
              for (const item of restored) {
                if (!existingIds.has(item.id)) merged.push(item);
              }
              return merged;
            });
          }
        }

        if (!cancelled) {
          setProjects(workspace.projects);
          setCurrentProjectId(workspace.currentProjectId);
        }
      } finally {
        if (!cancelled) {
          setIsProjectsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fast auto-save on EVERY movement/change while inside the active editor project
  useEffect(() => {
    if (
      activeView !== 'editor' ||
      !activeProjectId ||
      !isProjectHydratedRef.current
    ) {
      return;
    }
    if (suppressNextAutoSaveRef.current) {
      suppressNextAutoSaveRef.current = false;
      return;
    }
    const dbTimer = window.setTimeout(() => {
      const record = buildCurrentProjectRecord(true);
      if (record) {
        void saveProjectRecordToDb(record);
        if (hasSavedOnceRef.current || savedFolderPathRef.current) {
          syncLinkedFolderLocalStorage(record, Boolean(projectDirHandleRef.current));
        }
      }
    }, 80);
    const fileTimer = window.setTimeout(() => {
      if (projectFileHandleRef.current || projectDirHandleRef.current) {
        void syncLinkedFileNow(false);
      }
    }, 160);
    return () => {
      window.clearTimeout(dbTimer);
      window.clearTimeout(fileTimer);
    };
  }, [
    activeView,
    activeProjectId,
    projectName,
    aspectRatio,
    fps,
    currentTime,
    assets,
    clips,
    timelineZoom,
    snapEnabled,
    selectedClipIds,
    previewScale,
    trackSettings,
    extraTrackIds,
    buildCurrentProjectRecord,
    syncLinkedFileNow,
  ]);

  // Dedicated 30-second periodic auto-save updating the same saved project, linked folder & localStorage
  useEffect(() => {
    if (activeView !== 'editor' || !activeProjectId) return;
    const intervalId = window.setInterval(() => {
      if (
        activeViewRef.current !== 'editor' ||
        !activeProjectIdRef.current ||
        !isProjectHydratedRef.current
      ) {
        return;
      }
      const now = Date.now();
      lastAutoSavedAtRef.current = now;
      setLastAutoSavedAt(now);
      const record = buildCurrentProjectRecord(true);
      if (record) {
        record.lastAutoSavedAt = now;
        void saveProjectRecordToDb(record);
        if (hasSavedOnceRef.current || savedFolderPathRef.current) {
          syncLinkedFolderLocalStorage(record, Boolean(projectDirHandleRef.current));
        }
      }
      if (projectFileHandleRef.current || projectDirHandleRef.current) {
        void syncLinkedFileNow(false);
      }
      triggerSavedFlash();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [activeView, activeProjectId, buildCurrentProjectRecord, syncLinkedFileNow, triggerSavedFlash]);

  // Flush latest project state immediately on pointerup & tab hide/unload (never overwrites other projects)
  useEffect(() => {
    const flushNow = () => {
      if (
        activeViewRef.current !== 'editor' ||
        !activeProjectIdRef.current ||
        !isProjectHydratedRef.current
      ) {
        return;
      }
      const record = buildCurrentProjectRecord(true);
      if (record) {
        void saveProjectRecordToDb(record);
        if (hasSavedOnceRef.current || savedFolderPathRef.current) {
          syncLinkedFolderLocalStorage(record, Boolean(projectDirHandleRef.current));
        }
      }
      if (projectFileHandleRef.current || projectDirHandleRef.current) {
        void syncLinkedFileNow(false);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pointerup', flushNow);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerup', flushNow);
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('beforeunload', flushNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [buildCurrentProjectRecord, syncLinkedFileNow]);

  // Resizable studio panel dimensions
  const [panelSizes, setPanelSizes] = useState<{
    mediaWidth: number;
    inspectorWidth: number;
    timelineHeight: number;
  }>(() => {
    const defaults = { mediaWidth: 272, inspectorWidth: 308, timelineHeight: 248 };
    try {
      const saved = localStorage.getItem('framecut_panel_sizes_v1');
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      return {
        mediaWidth: clamp(Number(parsed.mediaWidth) || defaults.mediaWidth, 176, 520),
        inspectorWidth: clamp(Number(parsed.inspectorWidth) || defaults.inspectorWidth, 196, 520),
        timelineHeight: clamp(Number(parsed.timelineHeight) || defaults.timelineHeight, 150, 520),
      };
    } catch {
      return defaults;
    }
  });
  const [activeResizer, setActiveResizer] = useState<'media' | 'inspector' | 'timeline' | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('framecut_panel_sizes_v1', JSON.stringify(panelSizes));
    } catch {
      // ignore storage quota errors
    }
  }, [panelSizes]);

  // Clamp panel sizes on mount & viewport/zoom resize so center display preview never breaks
  useEffect(() => {
    const clampToViewport = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const minPreviewW = Math.min(360, Math.max(240, Math.floor(vw * 0.36)));
      const minPreviewH = Math.min(240, Math.max(170, Math.floor(vh * 0.34)));
      const minMedia = vw < 900 ? 176 : 210;
      const minInspector = vw < 900 ? 196 : 230;
      const minTimeline = vh < 680 ? 150 : 185;

      setPanelSizes((prev) => {
        const totalAvailSide = Math.max(minMedia + minInspector, vw - minPreviewW);
        let mediaWidth = clamp(prev.mediaWidth, minMedia, Math.max(minMedia, totalAvailSide - minInspector));
        let inspectorWidth = clamp(prev.inspectorWidth, minInspector, Math.max(minInspector, totalAvailSide - mediaWidth));
        if (mediaWidth + inspectorWidth > vw - minPreviewW && vw > 480) {
          const ratio = Math.max(0.45, (vw - minPreviewW) / (mediaWidth + inspectorWidth));
          mediaWidth = Math.max(150, Math.floor(mediaWidth * ratio));
          inspectorWidth = Math.max(165, Math.floor(inspectorWidth * ratio));
        }
        const maxTimeline = Math.max(minTimeline, vh - minPreviewH - 64);
        const timelineHeight = clamp(prev.timelineHeight, minTimeline, maxTimeline);
        if (
          mediaWidth === prev.mediaWidth &&
          inspectorWidth === prev.inspectorWidth &&
          timelineHeight === prev.timelineHeight
        ) {
          return prev;
        }
        return { mediaWidth, inspectorWidth, timelineHeight };
      });
    };

    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    const obs = new ResizeObserver(clampToViewport);
    obs.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', clampToViewport);
      obs.disconnect();
    };
  }, []);

  const startResize = useCallback(
    (which: 'media' | 'inspector' | 'timeline', e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const initial = { ...panelSizes };
      setActiveResizer(which);
      document.body.style.cursor = which === 'timeline' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (moveEv: PointerEvent) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const minPreviewW = Math.min(340, Math.max(240, Math.floor(vw * 0.34)));
        const minPreviewH = Math.min(220, Math.max(170, Math.floor(vh * 0.34)));
        if (which === 'media') {
          const dx = moveEv.clientX - startX;
          const maxW = Math.max(176, vw - initial.inspectorWidth - minPreviewW);
          setPanelSizes((p) => ({
            ...p,
            mediaWidth: Math.round(clamp(initial.mediaWidth + dx, 176, Math.min(540, maxW))),
          }));
        } else if (which === 'inspector') {
          const dx = startX - moveEv.clientX;
          const maxW = Math.max(196, vw - initial.mediaWidth - minPreviewW);
          setPanelSizes((p) => ({
            ...p,
            inspectorWidth: Math.round(clamp(initial.inspectorWidth + dx, 196, Math.min(540, maxW))),
          }));
        } else {
          const dy = startY - moveEv.clientY;
          const maxH = Math.max(150, vh - minPreviewH - 64);
          setPanelSizes((p) => ({
            ...p,
            timelineHeight: Math.round(clamp(initial.timelineHeight + dy, 150, Math.min(560, maxH))),
          }));
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        setActiveResizer(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [panelSizes]
  );

  // Undo / Redo stacks
  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);

  // Preloaded media elements for instant preview canvas rendering
  const mediaMapRef = useRef<LoadedMediaMap>(new Map());
  const [mediaLoadTick, setMediaLoadTick] = useState(0);

  // Web Audio playback state for A1 & video audio synchronization
  const audioCtxRef = useRef<AudioContext | null>(null);
  const decodedAudioRef = useRef<Map<string, AudioBuffer>>(new Map());
  const activeAudioNodesRef = useRef<Map<string, { source: AudioBufferSourceNode; gain: GainNode }>>(
    new Map()
  );

  const allAssets = useMemo(() => [...assets, ...BUILTIN_MOTION_ASSETS], [assets]);

  const totalDuration = useMemo(
    () => clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0),
    [clips]
  );

  const selectedClips = useMemo(() => {
    const idSet = new Set(selectedClipIds);
    return clips.filter((c) => idSet.has(c.id));
  }, [clips, selectedClipIds]);

  const primarySelectedClipId = selectedClipIds.length === 1 ? selectedClipIds[0] : null;

  const selectedAsset = useMemo(() => {
    if (selectedClips.length !== 1) return null;
    return allAssets.find((a) => a.id === selectedClips[0].assetId) ?? null;
  }, [allAssets, selectedClips]);

  const { adjacentPrevClip, adjacentNextClip } = useMemo(() => {
    if (selectedClips.length !== 1) {
      return { adjacentPrevClip: null as TimelineClip | null, adjacentNextClip: null as TimelineClip | null };
    }
    const sel = selectedClips[0];
    if (isAudioTrack(sel.track)) {
      return { adjacentPrevClip: null as TimelineClip | null, adjacentNextClip: null as TimelineClip | null };
    }
    const trackClips = clips
      .filter((c) => c.track === sel.track)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = trackClips.findIndex((c) => c.id === sel.id);
    if (idx === -1) {
      return { adjacentPrevClip: null as TimelineClip | null, adjacentNextClip: null as TimelineClip | null };
    }
    const prev = idx > 0 ? trackClips[idx - 1] : null;
    const next = idx < trackClips.length - 1 ? trackClips[idx + 1] : null;
    return {
      adjacentPrevClip:
        prev && Math.abs(prev.startTime + prev.duration - sel.startTime) <= 0.14 ? prev : null,
      adjacentNextClip:
        next && Math.abs(sel.startTime + sel.duration - next.startTime) <= 0.14 ? next : null,
    };
  }, [clips, selectedClips]);

  // Commit clips with undo history
  const commitClips = useCallback(
    (updater: (prev: TimelineClip[]) => TimelineClip[], recordHistory = true) => {
      setClips((prev) => {
        const next = updater(prev);
        if (recordHistory) {
          setPast((p) => [...p.slice(-29), { clips: prev }]);
          setFuture([]);
        }
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setClips((curr) => {
        setFuture((f) => [{ clips: curr }, ...f.slice(0, 29)]);
        return previous.clips;
      });
      return p.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setClips((curr) => {
        setPast((p) => [...p.slice(-29), { clips: curr }]);
        return next.clips;
      });
      return f.slice(1);
    });
  }, []);

  // Preload images, videos, and audio buffers whenever assets change
  useEffect(() => {
    for (const asset of assets) {
      if (asset.type === 'image' && !mediaMapRef.current.has(asset.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setMediaLoadTick((t) => t + 1);
        img.src = asset.url;
        mediaMapRef.current.set(asset.id, img);
      } else if (asset.type === 'video' && !mediaMapRef.current.has(asset.id)) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.preload = 'auto';
        video.muted = true;
        video.onloadeddata = () => setMediaLoadTick((t) => t + 1);
        video.src = asset.url;
        video.load();
        mediaMapRef.current.set(asset.id, video);
      }

      if ((asset.type === 'audio' || asset.type === 'video') && !decodedAudioRef.current.has(asset.id)) {
        fetch(asset.url)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            const Ctx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const tempCtx = new Ctx();
            return tempCtx.decodeAudioData(buf).finally(() => tempCtx.close());
          })
          .then((decoded) => {
            decodedAudioRef.current.set(asset.id, decoded);
          })
          .catch(() => {
            // Audio track optional (e.g. silent video)
          });
      }
    }
  }, [assets]);

  // Preload custom PNG masks into mediaMapRef so preview canvas renders them synchronously
  useEffect(() => {
    const preloadMask = (id: string, dataUrl: string) => {
      const key = `mask:${id}`;
      if (mediaMapRef.current.has(key)) return;
      const img = new Image();
      img.onload = () => setMediaLoadTick((t) => t + 1);
      img.src = dataUrl;
      mediaMapRef.current.set(key, img);
    };

    for (const mask of customMasks) {
      preloadMask(mask.id, mask.dataUrl);
    }
    for (const clip of clips) {
      if (clip.customMaskId && clip.customMaskDataUrl) {
        preloadMask(clip.customMaskId, clip.customMaskDataUrl);
      }
    }
  }, [customMasks, clips]);

  // Stop all active Web Audio nodes cleanly
  const stopAllAudioNodes = useCallback(() => {
    for (const { source } of activeAudioNodesRef.current.values()) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    activeAudioNodesRef.current.clear();
  }, []);

  // Sync video elements to exact timeline time when scrubbing or playing
  const syncMediaToTime = useCallback(
    (time: number, playing: boolean) => {
      const assetById = new Map(allAssets.map((a) => [a.id, a]));
      const activeVideoAssets = new Set<string>();

      for (const clip of clips) {
        if (!isVisualTrack(clip.track)) continue;
        if (getTrackControl(trackSettingsRef.current, clip.track).hidden) continue;
        const asset = assetById.get(clip.assetId);
        if (!asset || asset.type !== 'video') continue;

        const el = mediaMapRef.current.get(asset.id);
        if (!(el instanceof HTMLVideoElement)) continue;

        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          activeVideoAssets.add(asset.id);
          const targetVideoTime = clamp(
            clip.sourceOffset + (time - clip.startTime) * clip.speed,
            0,
            Math.max(0, (el.duration || asset.duration) - 0.02)
          );
          const mutedNow = isMutedRef.current;
          const masterVol = mutedNow ? 0 : clamp(previewVolumeRef.current / 100, 0, 1);
          el.playbackRate = clamp(clip.speed, 0.25, 4);
          el.muted = mutedNow || masterVol <= 0 || clip.muted;
          el.volume = clamp((clip.volume / 100) * masterVol, 0, 1);

          if (playing) {
            if (Math.abs(el.currentTime - targetVideoTime) > 0.18) {
              el.currentTime = targetVideoTime;
            }
            if (el.paused) {
              void el.play().catch(() => {});
            }
          } else {
            if (!el.paused) el.pause();
            if (Math.abs(el.currentTime - targetVideoTime) > 0.02) {
              el.currentTime = targetVideoTime;
            }
          }
        }
      }

      // Pause any video elements not currently active
      for (const [id, el] of mediaMapRef.current.entries()) {
        if (el instanceof HTMLVideoElement && !activeVideoAssets.has(id) && !el.paused) {
          el.pause();
        }
      }
    },
    [allAssets, clips]
  );

  // Sync Web Audio tracks (A1, A2, ...) during playback
  const syncAudioTracks = useCallback(
    (time: number, playing: boolean) => {
      const mutedNow = isMutedRef.current;
      const masterVol = mutedNow ? 0 : clamp(previewVolumeRef.current / 100, 0, 1);
      if (!playing || mutedNow || masterVol <= 0) {
        stopAllAudioNodes();
        return;
      }

      if (!audioCtxRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const activeAudio = clips.filter(
        (c) =>
          isAudioTrack(c.track) &&
          !getTrackControl(trackSettingsRef.current, c.track).hidden &&
          !c.muted &&
          c.volume > 0 &&
          time >= c.startTime &&
          time < c.startTime + c.duration
      );
      const activeIds = new Set(activeAudio.map((c) => c.id));

      // Stop clips that ended
      for (const [clipId, node] of activeAudioNodesRef.current.entries()) {
        if (!activeIds.has(clipId)) {
          try {
            node.source.stop();
            node.source.disconnect();
          } catch {
            // ignore
          }
          activeAudioNodesRef.current.delete(clipId);
        }
      }

      // Start newly active clips
      for (const clip of activeAudio) {
        if (activeAudioNodesRef.current.has(clip.id)) {
          const existing = activeAudioNodesRef.current.get(clip.id)!;
          const localTime = time - clip.startTime;
          let fadeMult = 1;
          if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
            fadeMult *= clamp(localTime / clip.fadeIn, 0, 1);
          }
          const rem = clip.duration - localTime;
          if (clip.fadeOut > 0 && rem < clip.fadeOut) {
            fadeMult *= clamp(rem / clip.fadeOut, 0, 1);
          }
          existing.gain.gain.setTargetAtTime(
            clamp((clip.volume / 100) * fadeMult * masterVol, 0, 2),
            ctx.currentTime,
            0.02
          );
          continue;
        }

        const decoded = decodedAudioRef.current.get(clip.assetId);
        if (!decoded) continue;

        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.playbackRate.value = clamp(clip.speed, 0.25, 4);

        const gain = ctx.createGain();
        gain.gain.value = clamp((clip.volume / 100) * masterVol, 0, 2);

        source.connect(gain);
        gain.connect(ctx.destination);

        const offset = clamp(
          clip.sourceOffset + (time - clip.startTime) * clip.speed,
          0,
          Math.max(0, decoded.duration - 0.05)
        );
        const remainingDur = Math.max(0.05, (clip.duration - (time - clip.startTime)) * clip.speed);
        source.start(0, offset, Math.min(remainingDur, decoded.duration - offset));
        activeAudioNodesRef.current.set(clip.id, { source, gain });
      }
    },
    [clips, stopAllAudioNodes]
  );

  const syncMediaToTimeRef = useRef(syncMediaToTime);
  syncMediaToTimeRef.current = syncMediaToTime;
  const syncAudioTracksRef = useRef(syncAudioTracks);
  syncAudioTracksRef.current = syncAudioTracks;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const handleChangePreviewVolume = useCallback((vol: number) => {
    const nextVol = clamp(Math.round(vol), 0, 100);
    previewVolumeRef.current = nextVol;
    setPreviewVolume(nextVol);
    if (nextVol > 0) {
      lastNonZeroVolumeRef.current = nextVol;
      isMutedRef.current = false;
      setIsMuted(false);
    } else {
      isMutedRef.current = true;
      setIsMuted(true);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const nextMuted = !prev;
      isMutedRef.current = nextMuted;
      if (!nextMuted && previewVolumeRef.current === 0) {
        const restored = lastNonZeroVolumeRef.current || 100;
        previewVolumeRef.current = restored;
        setPreviewVolume(restored);
      }
      return nextMuted;
    });
  }, []);

  // Immediately reflect master preview volume / mute / track hide changes on live audio & video
  useEffect(() => {
    syncMediaToTimeRef.current(currentTimeRef.current, isPlaying);
    if (isPlaying) {
      syncAudioTracksRef.current(currentTimeRef.current, true);
    }
  }, [isMuted, previewVolume, isPlaying, trackSettings]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      stopAllAudioNodes();
      syncMediaToTimeRef.current(currentTimeRef.current, false);
      return;
    }

    let rafId = 0;
    let lastTimestamp = performance.now();
    let playhead = currentTimeRef.current >= totalDuration ? 0 : currentTimeRef.current;
    if (currentTimeRef.current >= totalDuration) {
      setCurrentTime(0);
    }

    const tick = (now: number) => {
      const dt = (now - lastTimestamp) / 1000;
      lastTimestamp = now;
      playhead += dt;

      if (playhead >= totalDuration) {
        setCurrentTime(totalDuration);
        setIsPlaying(false);
        stopAllAudioNodes();
        syncMediaToTimeRef.current(totalDuration, false);
        return;
      }

      setCurrentTime(playhead);
      syncMediaToTimeRef.current(playhead, true);
      syncAudioTracksRef.current(playhead, true);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      stopAllAudioNodes();
    };
  }, [isPlaying, totalDuration, stopAllAudioNodes]);

  // Keep scrubbed frames synced when paused
  useEffect(() => {
    if (!isPlaying) {
      syncMediaToTime(currentTime, false);
    }
  }, [currentTime, isPlaying, mediaLoadTick, syncMediaToTime]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = clamp(time, 0, Math.max(totalDuration, 0));
      setCurrentTime(clamped);
      if (isPlaying) {
        stopAllAudioNodes();
        syncMediaToTime(clamped, true);
      } else {
        syncMediaToTime(clamped, false);
      }
    },
    [totalDuration, isPlaying, stopAllAudioNodes, syncMediaToTime]
  );

  const handleTogglePlay = useCallback(() => {
    if (totalDuration <= 0) return;
    setIsPlaying((p) => !p);
  }, [totalDuration]);

  // Import custom font files (.ttf, .otf, .woff, .woff2) and persist them in IndexedDB
  const handleImportFonts = useCallback(
    async (fileList: FileList): Promise<CustomFont | null> => {
      const added: CustomFont[] = [];
      let lastResolved: CustomFont | null = null;
      const existingNames = new Set([
        ...BUILTIN_FONT_FAMILIES.map((f) => f.toLowerCase()),
        ...customFonts.map((f) => f.family.toLowerCase()),
      ]);
      const existingByFileName = new Map(
        customFonts.map((f) => [f.fileName.toLowerCase(), f])
      );

      for (const file of Array.from(fileList)) {
        const lower = file.name.toLowerCase();
        const isFontFile =
          lower.endsWith('.ttf') ||
          lower.endsWith('.otf') ||
          lower.endsWith('.woff') ||
          lower.endsWith('.woff2') ||
          file.type.startsWith('font/');
        if (!isFontFile) continue;

        const alreadySaved = existingByFileName.get(file.name.toLowerCase());
        if (alreadySaved) {
          lastResolved = alreadySaved;
          continue;
        }

        const baseName =
          file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || 'Custom Font';

        let family = baseName;
        let suffix = 2;
        while (existingNames.has(family.toLowerCase())) {
          family = `${baseName} ${suffix++}`;
        }
        existingNames.add(family.toLowerCase());

        try {
          const buffer = await file.arrayBuffer();
          const face = new FontFace(family, buffer.slice(0));
          await face.load();
          document.fonts.add(face);
          await document.fonts.ready;

          const fontId = uid('font');
          await saveCustomFontToDb({
            id: fontId,
            family,
            fileName: file.name,
            buffer,
            createdAt: Date.now(),
          });

          const newFont: CustomFont = {
            id: fontId,
            family,
            fileName: file.name,
          };
          added.push(newFont);
          existingByFileName.set(file.name.toLowerCase(), newFont);
          lastResolved = newFont;
        } catch {
          // Ignore invalid/corrupt font binary
        }
      }

      if (added.length > 0) {
        setCustomFonts((prev) => [...prev, ...added]);
        setMediaLoadTick((t) => t + 1);
      }
      return lastResolved;
    },
    [customFonts]
  );

  // Download any famous font from Google Fonts and save permanently in IndexedDB
  const handleDownloadAutoFont = useCallback(
    async (requestedFamily: string): Promise<CustomFont | null> => {
      const existing = customFonts.find(
        (f) => f.family.toLowerCase() === requestedFamily.trim().toLowerCase()
      );
      if (existing) return existing;

      const { family, variants } = await downloadGoogleFontVariants(requestedFamily);
      const alreadyByResolved = customFonts.find(
        (f) => f.family.toLowerCase() === family.toLowerCase()
      );
      if (alreadyByResolved) return alreadyByResolved;

      const fontId = uid('autofont');
      const record = {
        id: fontId,
        family,
        fileName: `${family}.woff2`,
        variants,
        source: 'auto' as const,
        createdAt: Date.now(),
      };

      const ok = await registerStoredFontRecord(record);
      if (!ok) {
        throw new Error(`Could not register ${family} font face.`);
      }
      await document.fonts.ready;
      await saveCustomFontToDb(record);

      const newFont: CustomFont = {
        id: fontId,
        family,
        fileName: record.fileName,
      };
      setCustomFonts((prev) =>
        prev.some((f) => f.family.toLowerCase() === family.toLowerCase()) ? prev : [...prev, newFont]
      );
      setMediaLoadTick((t) => t + 1);
      return newFont;
    },
    [customFonts]
  );

  const handleDownloadTransition = useCallback(async (preset: TransitionPreset) => {
    await saveTransitionToDb(preset);
    setDownloadedTransitionIds((prev) =>
      prev.includes(preset.id) ? prev : [...prev, preset.id]
    );
  }, []);

  const handleDownloadAllTransitions = useCallback(async () => {
    const installed = new Set(downloadedTransitionIds);
    const pending = TRANSITIONS_CATALOG.filter((t) => !t.builtIn && !installed.has(t.id));
    if (pending.length === 0) return;
    await Promise.all(pending.map((p) => saveTransitionToDb(p)));
    setDownloadedTransitionIds((prev) =>
      Array.from(new Set([...prev, ...pending.map((p) => p.id)]))
    );
  }, [downloadedTransitionIds]);

  const handleApplyTransition = useCallback(
    (type: TransitionType, edge: 'in' | 'out', defaultDuration: number) => {
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            isAudioTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          return edge === 'in'
            ? {
                ...c,
                transitionIn: type,
                transitionInDuration: c.transitionInDuration ?? defaultDuration,
              }
            : {
                ...c,
                transitionOut: type,
                transitionOutDuration: c.transitionOutDuration ?? defaultDuration,
              };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplySeamTransition = useCallback(
    (
      prevClipId: string,
      nextClipId: string,
      transitionType: TransitionType,
      duration: number
    ) => {
      commitClips((prev) =>
        prev.map((c) => {
          if (getTrackControl(trackSettingsRef.current, c.track).locked) return c;
          if (c.id === nextClipId) {
            return {
              ...c,
              transitionIn: transitionType,
              transitionInDuration: duration,
            };
          }
          if (c.id === prevClipId) {
            return {
              ...c,
              transitionOut: 'none',
            };
          }
          return c;
        })
      );
    },
    [commitClips]
  );

  const handleQuickAddTransition = useCallback(
    (type: TransitionType, defaultDuration: number) => {
      const renderables = clipsRef.current.filter(
        (c) => !isAudioTrack(c.track) && !getTrackControl(trackSettingsRef.current, c.track).locked
      );
      if (renderables.length === 0) return;

      const selectedRenderableIds = new Set(
        selectedClipIds.filter((id) => renderables.some((c) => c.id === id))
      );

      // 1. If user has renderable clip(s) selected, apply directly & cleanly
      if (selectedRenderableIds.size > 0) {
        const clearingPrevIds = new Set<string>();
        for (const c of renderables) {
          if (!selectedRenderableIds.has(c.id)) continue;
          const prevNeighbor = renderables.find(
            (p) =>
              p.id !== c.id &&
              p.track === c.track &&
              Math.abs(p.startTime + p.duration - c.startTime) <= 0.14
          );
          if (prevNeighbor) clearingPrevIds.add(prevNeighbor.id);
        }
        commitClips((prev) =>
          prev.map((c) => {
            if (getTrackControl(trackSettingsRef.current, c.track).locked) return c;
            if (selectedRenderableIds.has(c.id)) {
              return {
                ...c,
                transitionIn: type,
                transitionInDuration: c.transitionInDuration ?? defaultDuration,
              };
            }
            if (clearingPrevIds.has(c.id)) {
              return { ...c, transitionOut: 'none' };
            }
            return c;
          })
        );
        return;
      }

      // 2. Otherwise auto-target the touching seam nearest to playhead (or clip at/nearest playhead)
      const byTrack = new Map<string, TimelineClip[]>();
      for (const c of renderables) {
        const list = byTrack.get(c.track) ?? [];
        list.push(c);
        byTrack.set(c.track, list);
      }

      let bestSeam: { prev: TimelineClip; next: TimelineClip; dist: number } | null = null;
      for (const trackList of byTrack.values()) {
        const sorted = [...trackList].sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < sorted.length - 1; i++) {
          const prev = sorted[i];
          const next = sorted[i + 1];
          if (Math.abs(prev.startTime + prev.duration - next.startTime) <= 0.14) {
            const dist = Math.abs(next.startTime - currentTime);
            if (!bestSeam || dist < bestSeam.dist) {
              bestSeam = { prev, next, dist };
            }
          }
        }
      }

      if (bestSeam) {
        handleApplySeamTransition(
          bestSeam.prev.id,
          bestSeam.next.id,
          type,
          defaultDuration
        );
        setSelectedClipIds([bestSeam.next.id]);
        return;
      }

      // 3. Fallback: clip currently under playhead, else first visual/renderable clip
      const underPlayhead =
        renderables.find(
          (c) => currentTime >= c.startTime && currentTime <= c.startTime + c.duration
        ) ??
        [...renderables].sort(
          (a, b) =>
            (isVisualTrack(a.track) ? 0 : 1) - (isVisualTrack(b.track) ? 0 : 1) ||
            a.startTime - b.startTime
        )[0];

      if (underPlayhead) {
        commitClips((prev) =>
          prev.map((c) =>
            c.id === underPlayhead.id
              ? {
                  ...c,
                  transitionIn: type,
                  transitionInDuration: c.transitionInDuration ?? defaultDuration,
                }
              : c
          )
        );
        setSelectedClipIds([underPlayhead.id]);
      }
    },
    [selectedClipIds, currentTime, commitClips, handleApplySeamTransition]
  );

  const handleApplyTransitionToAll = useCallback(
    (type: TransitionType, duration: number) => {
      const renderables = clipsRef.current.filter(
        (c) => !isAudioTrack(c.track) && !getTrackControl(trackSettingsRef.current, c.track).locked
      );
      if (renderables.length === 0) return;

      const byTrack = new Map<string, TimelineClip[]>();
      for (const c of renderables) {
        const list = byTrack.get(c.track) ?? [];
        list.push(c);
        byTrack.set(c.track, list);
      }

      const applyInIds = new Set<string>();
      const clearOutIds = new Set<string>();
      for (const trackList of byTrack.values()) {
        const sorted = [...trackList].sort((a, b) => a.startTime - b.startTime);
        if (sorted.length === 1) {
          applyInIds.add(sorted[0].id);
        } else {
          for (let i = 1; i < sorted.length; i++) {
            applyInIds.add(sorted[i].id);
            clearOutIds.add(sorted[i - 1].id);
          }
        }
      }

      commitClips((prev) =>
        prev.map((c) => {
          if (getTrackControl(trackSettingsRef.current, c.track).locked) return c;
          if (!applyInIds.has(c.id) && !clearOutIds.has(c.id)) return c;
          return {
            ...c,
            ...(applyInIds.has(c.id)
              ? { transitionIn: type, transitionInDuration: duration }
              : {}),
            ...(clearOutIds.has(c.id) ? { transitionOut: 'none' } : {}),
          };
        })
      );
    },
    [commitClips]
  );

  const handleResizeTransition = useCallback(
    (
      clipId: string,
      edge: 'in' | 'out',
      duration: number,
      recordHistory = true
    ) => {
      commitClips(
        (prev) =>
          prev.map((c) => {
            if (c.id !== clipId || getTrackControl(trackSettingsRef.current, c.track).locked) {
              return c;
            }
            const clamped = clamp(
              Number(duration.toFixed(2)),
              0.15,
              Math.max(0.2, Math.min(3.0, c.duration * 0.85))
            );
            return edge === 'in'
              ? { ...c, transitionInDuration: clamped }
              : { ...c, transitionOutDuration: clamped };
          }),
        recordHistory
      );
    },
    [commitClips]
  );

  const handleChangeClipVolume = useCallback(
    (clipId: string, volume: number, recordHistory = true) => {
      const nextVol = Math.round(clamp(volume, 0, 200));
      commitClips(
        (prev) =>
          prev.map((c) => {
            if (c.id !== clipId || getTrackControl(trackSettingsRef.current, c.track).locked) {
              return c;
            }
            return {
              ...c,
              volume: nextVol,
              muted: nextVol > 0 ? false : c.muted,
            };
          }),
        recordHistory
      );
    },
    [commitClips]
  );

  const handleChangeTrackVolume = useCallback(
    (trackId: TrackId, volume: number, recordHistory = true) => {
      if (getTrackControl(trackSettingsRef.current, trackId).locked) return;
      const nextVol = Math.round(clamp(volume, 0, 200));
      commitClips(
        (prev) =>
          prev.map((c) => {
            if (c.track !== trackId) return c;
            return {
              ...c,
              volume: nextVol,
              muted: nextVol > 0 ? false : c.muted,
            };
          }),
        recordHistory
      );
    },
    [commitClips]
  );

  const handleDownloadEffectItem = useCallback(async (key: string, label: string) => {
    await saveEffectKeyToDb(key, label);
    setDownloadedEffectKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const handleDownloadAllEffects = useCallback(async () => {
    const installed = new Set(downloadedEffectKeys);
    const pending = VISUAL_EFFECT_PRESETS.filter(
      (e) => e.id !== 'none' && !e.builtIn && !installed.has(makeFxStorageKey(e.id))
    ).map((e) => ({ key: makeFxStorageKey(e.id), label: e.label }));
    if (pending.length === 0) return;
    await saveManyEffectKeysToDb(pending);
    setDownloadedEffectKeys((prev) =>
      Array.from(new Set([...prev, ...pending.map((p) => p.key)]))
    );
  }, [downloadedEffectKeys]);

  const handleDownloadAllFrames = useCallback(async () => {
    const installed = new Set(downloadedEffectKeys);
    const pending = FRAME_PRESETS.filter(
      (f) => f.id !== 'none' && !f.builtIn && !installed.has(makeFrameStorageKey(f.id))
    ).map((f) => ({ key: makeFrameStorageKey(f.id), label: f.label }));
    if (pending.length === 0) return;
    await saveManyEffectKeysToDb(pending);
    setDownloadedEffectKeys((prev) =>
      Array.from(new Set([...prev, ...pending.map((p) => p.key)]))
    );
  }, [downloadedEffectKeys]);

  const handleDownloadAllMasks = useCallback(async () => {
    const installed = new Set(downloadedEffectKeys);
    const pending = MASK_PRESETS.filter(
      (m) => m.id !== 'none' && !m.builtIn && !installed.has(makeMaskStorageKey(m.id))
    ).map((m) => ({ key: makeMaskStorageKey(m.id), label: m.label }));
    if (pending.length === 0) return;
    await saveManyEffectKeysToDb(pending);
    setDownloadedEffectKeys((prev) =>
      Array.from(new Set([...prev, ...pending.map((p) => p.key)]))
    );
  }, [downloadedEffectKeys]);

  const handleDownloadAllAnimations = useCallback(async () => {
    const installed = new Set(downloadedEffectKeys);
    const pending = ANIMATION_PRESETS.filter(
      (a) => a.id !== 'none' && !a.builtIn && !installed.has(makeAnimationStorageKey(a.id))
    ).map((a) => ({ key: makeAnimationStorageKey(a.id), label: a.label }));
    if (pending.length === 0) return;
    await saveManyEffectKeysToDb(pending);
    setDownloadedEffectKeys((prev) =>
      Array.from(new Set([...prev, ...pending.map((p) => p.key)]))
    );
  }, [downloadedEffectKeys]);

  const handleDownloadAllCaptionPresets = useCallback(async () => {
    const installed = new Set(downloadedEffectKeys);
    const pending = CAPTION_STYLE_PRESETS.filter(
      (c) => !c.builtIn && !installed.has(makeCaptionPresetStorageKey(c.id))
    ).map((c) => ({ key: makeCaptionPresetStorageKey(c.id), label: c.label }));
    if (pending.length === 0) return;
    await saveManyEffectKeysToDb(pending);
    setDownloadedEffectKeys((prev) =>
      Array.from(new Set([...prev, ...pending.map((p) => p.key)]))
    );
  }, [downloadedEffectKeys]);

  const handleDownloadAllTitleTemplates = useCallback(async () => {
    const installed = new Set(downloadedEffectKeys);
    const pending = TITLE_AND_LOWER_THIRD_TEMPLATES.filter(
      (t) => !t.builtIn && !installed.has(makeTitleStorageKey(t.id))
    ).map((t) => ({ key: makeTitleStorageKey(t.id), label: t.name }));
    if (pending.length === 0) return;
    await saveManyEffectKeysToDb(pending);
    setDownloadedEffectKeys((prev) =>
      Array.from(new Set([...prev, ...pending.map((p) => p.key)]))
    );
  }, [downloadedEffectKeys]);

  const handleApplyVisualEffect = useCallback(
    (presetId: VisualEffectPreset) => {
      if (selectedClipIds.length === 0) return;
      const info = VISUAL_EFFECT_PRESETS.find((x) => x.id === presetId);
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            isAudioTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          if (presetId === 'none') {
            return { ...c, fxPreset: 'none', fxIntensity: 0, glowIntensity: 0 };
          }
          return {
            ...c,
            fxPreset: presetId,
            fxIntensity: c.fxIntensity && c.fxIntensity > 0 ? c.fxIntensity : 75,
            ...(info && info.defaultGlowIntensity > 0
              ? {
                  glowColor: info.defaultGlowColor,
                  glowIntensity: info.defaultGlowIntensity,
                }
              : {}),
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyFramePreset = useCallback(
    (frameId: FramePreset) => {
      if (selectedClipIds.length === 0) return;
      const info = FRAME_PRESETS.find((f) => f.id === frameId);
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            !isVisualTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          return {
            ...c,
            framePreset: frameId,
            frameColor: info?.defaultColor ?? c.frameColor ?? '#38BDF8',
            frameThickness: c.frameThickness ?? 50,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyMaskPreset = useCallback(
    (maskShape: MaskShape) => {
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            !isVisualTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          if (maskShape === 'none') {
            return {
              ...c,
              maskShape: 'none',
              customMaskId: undefined,
              customMaskDataUrl: undefined,
            };
          }
          return {
            ...c,
            maskShape,
            customMaskId: undefined,
            customMaskDataUrl: undefined,
            maskCenterX: c.maskCenterX ?? 0,
            maskCenterY: c.maskCenterY ?? 0,
            maskWidth: c.maskWidth ?? 65,
            maskHeight: c.maskHeight ?? 65,
            maskFeather: c.maskFeather ?? 4,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyCustomMask = useCallback(
    (mask: CustomMaskItem) => {
      const key = `mask:${mask.id}`;
      if (!mediaMapRef.current.has(key)) {
        const img = new Image();
        img.onload = () => setMediaLoadTick((t) => t + 1);
        img.src = mask.dataUrl;
        mediaMapRef.current.set(key, img);
      }
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            !isVisualTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          return {
            ...c,
            maskShape: 'custom',
            customMaskId: mask.id,
            customMaskDataUrl: mask.dataUrl,
            maskCenterX: c.maskCenterX ?? 0,
            maskCenterY: c.maskCenterY ?? 0,
            maskWidth: c.maskWidth ?? 75,
            maskHeight: c.maskHeight ?? 75,
            maskFeather: c.maskFeather ?? 2,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleSaveCustomMask = useCallback(
    async (mask: CustomMaskItem, applyToSelected: boolean) => {
      await saveCustomMaskToDb(mask);
      setCustomMasks((prev) => [mask, ...prev.filter((m) => m.id !== mask.id)]);
      const key = `mask:${mask.id}`;
      const img = new Image();
      img.onload = () => setMediaLoadTick((t) => t + 1);
      img.src = mask.dataUrl;
      mediaMapRef.current.set(key, img);

      if (applyToSelected && selectedClipIds.length > 0) {
        const idSet = new Set(selectedClipIds);
        commitClips((prev) =>
          prev.map((c) => {
            if (
              !idSet.has(c.id) ||
              !isVisualTrack(c.track) ||
              getTrackControl(trackSettingsRef.current, c.track).locked
            ) {
              return c;
            }
            return {
              ...c,
              maskShape: 'custom',
              customMaskId: mask.id,
              customMaskDataUrl: mask.dataUrl,
              maskCenterX: c.maskCenterX ?? 0,
              maskCenterY: c.maskCenterY ?? 0,
              maskWidth: c.maskWidth ?? 75,
              maskHeight: c.maskHeight ?? 75,
              maskFeather: c.maskFeather ?? 2,
            };
          })
        );
      }
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyAnimationPreset = useCallback(
    (animationId: ClipAnimationPreset, category?: AnimationCategory) => {
      if (selectedClipIds.length === 0) return;
      const preset = ANIMATION_PRESETS.find((a) => a.id === animationId);
      const resolvedCategory = category ?? preset?.category ?? 'In';
      const dur = preset?.defaultDuration ?? 0.5;
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            isAudioTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          if (animationId === 'none') {
            return {
              ...c,
              animationIn: 'none',
              animationOut: 'none',
              animationCombo: 'none',
            };
          }
          if (resolvedCategory === 'Out') {
            return {
              ...c,
              animationOut: animationId,
              animationOutDuration: dur,
              animationIntensity: c.animationIntensity ?? 75,
            };
          }
          if (resolvedCategory === 'Combo') {
            if (animationId === 'pan-zoom' && isVisualTrack(c.track)) {
              return {
                ...c,
                ...buildPanZoomClipPatch(c),
                animationCombo: 'pan-zoom',
                animationIntensity: c.animationIntensity ?? 75,
              };
            }
            return {
              ...c,
              animationCombo: animationId,
              animationIntensity: c.animationIntensity ?? 75,
            };
          }
          return {
            ...c,
            animationIn: animationId,
            animationInDuration: dur,
            animationIntensity: c.animationIntensity ?? 75,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  // Import local video, image, or audio files across all formats (sorted serial-wise) and persist blobs in IndexedDB
  const handleImportFiles = async (fileList: FileList) => {
    setIsImporting(true);
    try {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const sortedFiles = Array.from(fileList).sort((a, b) => {
        const cmp = collator.compare(a.name, b.name);
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      });

      const imageFiles: File[] = [];
      const otherFiles: File[] = [];
      for (const file of sortedFiles) {
        const kind = classifyMediaFile(file);
        if (!kind) continue;
        if (kind === 'image') imageFiles.push(file);
        else otherFiles.push(file);
      }

      const pendingBlobs: Array<{ assetId: string; blob: Blob; name: string }> = [];
      const assetByFile = new Map<File, MediaAsset>();
      const imgDur = defaultImageDurationRef.current;

      // Probe images in parallel chunks of 16 so 1000+ images import smoothly
      const IMG_BATCH = 16;
      for (let i = 0; i < imageFiles.length; i += IMG_BATCH) {
        const slice = imageFiles.slice(i, i + IMG_BATCH);
        await Promise.all(
          slice.map(async (file) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, 1800);
              img.onload = () => {
                window.clearTimeout(timer);
                resolve();
              };
              img.onerror = () => {
                window.clearTimeout(timer);
                resolve();
              };
              img.src = url;
            });
            const assetId = uid('img');
            pendingBlobs.push({ assetId, blob: file, name: file.name });
            assetByFile.set(file, {
              id: assetId,
              name: file.name,
              type: 'image',
              url,
              thumbnailUrl: url,
              duration: imgDur,
              width: img.naturalWidth || 1920,
              height: img.naturalHeight || 1080,
            });
          })
        );
      }

      for (const file of otherFiles) {
        const mediaKind = classifyMediaFile(file);
        if (!mediaKind) continue;
        const url = URL.createObjectURL(file);
        if (mediaKind === 'video') {
          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.preload = 'metadata';
          const meta = await new Promise<{ duration: number; width: number; height: number; thumb?: string }>(
            (resolve) => {
              let settled = false;
              const finish = (res: { duration: number; width: number; height: number; thumb?: string }) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                resolve(res);
              };
              const timer = window.setTimeout(() => {
                finish({
                  duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5,
                  width: video.videoWidth || 1920,
                  height: video.videoHeight || 1080,
                });
              }, 2500);
              video.onloadedmetadata = () => {
                if (video.readyState >= 1 && !video.videoWidth && !video.duration) {
                  finish({ duration: 5, width: 1920, height: 1080 });
                }
              };
              video.onloadeddata = () => {
                video.currentTime = Math.min(0.4, (video.duration || 1) * 0.15);
              };
              video.onseeked = () => {
                let thumb: string | undefined;
                try {
                  const c = document.createElement('canvas');
                  c.width = 160;
                  c.height = 90;
                  const ctx = c.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(video, 0, 0, 160, 90);
                    thumb = c.toDataURL('image/jpeg', 0.65);
                  }
                } catch {
                  // ignore
                }
                finish({
                  duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5,
                  width: video.videoWidth || 1920,
                  height: video.videoHeight || 1080,
                  thumb,
                });
              };
              video.onerror = () => finish({ duration: 5, width: 1920, height: 1080 });
              video.src = url;
              video.load();
            }
          );
          const assetId = uid('vid');
          pendingBlobs.push({ assetId, blob: file, name: file.name });
          assetByFile.set(file, {
            id: assetId,
            name: file.name,
            type: 'video',
            url,
            thumbnailUrl: meta.thumb,
            duration: Number(meta.duration.toFixed(2)),
            width: meta.width,
            height: meta.height,
          });
        } else {
          const { peaks, duration } = await extractWaveformFromUrl(url);
          const assetId = uid('aud');
          pendingBlobs.push({ assetId, blob: file, name: file.name });
          assetByFile.set(file, {
            id: assetId,
            name: file.name,
            type: 'audio',
            url,
            duration: Number(duration.toFixed(2)),
            waveform: peaks,
          });
        }
      }

      if (pendingBlobs.length > 0) {
        await saveMediaBlobsToDb(pendingBlobs);
      }

      const newAssets: MediaAsset[] = [];
      for (const file of sortedFiles) {
        const createdAsset = assetByFile.get(file);
        if (createdAsset) newAssets.push(createdAsset);
      }

      if (newAssets.length > 0) {
        setAssets((prev) => [...newAssets, ...prev]);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const ensureTrackRegistered = useCallback((trackId: TrackId) => {
    if (trackId !== 'T1' && trackId !== 'V1' && trackId !== 'A1') {
      setExtraTrackIds((prev) => (prev.includes(trackId) ? prev : [...prev, trackId]));
    }
    setTrackSettings((prev) =>
      prev[trackId] ? prev : { ...prev, [trackId]: { locked: false, hidden: false } }
    );
  }, []);

  const handleAddTrack = useCallback(
    (kind: TrackKind) => {
      let maxIdx = 1;
      const allIds = [
        ...clips.map((c) => c.track),
        ...extraTrackIdsRef.current,
        ...Object.keys(trackSettingsRef.current),
      ];
      for (const id of allIds) {
        if (getTrackKind(id) === kind) {
          const match = id.match(/(\d+)$/);
          const idx = match ? Number(match[1]) : 1;
          if (idx > maxIdx) maxIdx = idx;
        }
      }
      ensureTrackRegistered(makeTrackId(kind, maxIdx + 1));
    },
    [clips, ensureTrackRegistered]
  );

  const handleSelectTrack = useCallback((trackId: TrackId | null) => {
    setSelectedTrackId(trackId);
    selectedTrackIdRef.current = trackId;
    if (trackId) {
      const trackClipIds = clipsRef.current
        .filter((c) => c.track === trackId)
        .map((c) => c.id);
      setSelectedClipIds(trackClipIds);
    } else {
      setSelectedClipIds([]);
    }
  }, []);

  const handleDuplicateTrack = useCallback(
    (sourceTrackId: TrackId) => {
      const kind = getTrackKind(sourceTrackId);
      let maxIdx = 1;
      const allIds = [
        ...clipsRef.current.map((c) => c.track),
        ...extraTrackIdsRef.current,
        ...Object.keys(trackSettingsRef.current),
      ];
      for (const id of allIds) {
        if (getTrackKind(id) === kind) {
          const match = id.match(/(\d+)$/);
          const idx = match ? Number(match[1]) : 1;
          if (idx > maxIdx) maxIdx = idx;
        }
      }
      const newTrackId = makeTrackId(kind, maxIdx + 1);
      ensureTrackRegistered(newTrackId);

      const sourceClips = clipsRef.current.filter((c) => c.track === sourceTrackId);
      const clones: TimelineClip[] = sourceClips.map((target) => ({
        ...target,
        id: uid('clip'),
        track: newTrackId,
        textConfig: target.textConfig ? { ...target.textConfig } : undefined,
        stickerConfig: target.stickerConfig ? { ...target.stickerConfig } : undefined,
        keyframes: target.keyframes ? target.keyframes.map((k) => ({ ...k })) : undefined,
      }));

      if (clones.length > 0) {
        commitClips((prev) => [...prev, ...clones]);
      }
      setSelectedTrackId(newTrackId);
      selectedTrackIdRef.current = newTrackId;
      setSelectedClipIds(clones.map((c) => c.id));
    },
    [ensureTrackRegistered, commitClips]
  );

  const handleRemoveEmptyTrack = useCallback(
    (trackId: TrackId) => {
      if (trackId === 'T1' || trackId === 'V1' || trackId === 'A1') return;
      if (clips.some((c) => c.track === trackId)) return;
      setExtraTrackIds((prev) => prev.filter((id) => id !== trackId));
      setTrackSettings((prev) => {
        const copy = { ...prev };
        delete copy[trackId];
        return copy;
      });
    },
    [clips]
  );

  const getHiddenTracksMap = useCallback((): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const [id, st] of Object.entries(trackSettingsRef.current)) {
      if (st?.hidden) map[id] = true;
    }
    return map;
  }, []);

  const handleToggleTrackLock = useCallback((trackId: TrackId) => {
    setTrackSettings((prev) => {
      const current = getTrackControl(prev, trackId);
      return {
        ...prev,
        [trackId]: { ...current, locked: !current.locked },
      };
    });
  }, []);

  const handleToggleTrackHide = useCallback((trackId: TrackId) => {
    setTrackSettings((prev) => {
      const current = getTrackControl(prev, trackId);
      return {
        ...prev,
        [trackId]: { ...current, hidden: !current.hidden },
      };
    });
  }, []);

  const handleAddAssetToTimeline = useCallback(
    (asset: MediaAsset, explicitTime?: number, preferredTrackId?: TrackId) => {
      const kind: TrackKind = asset.type === 'audio' ? 'A' : 'V';
      let targetTrack: TrackId;
      let startAt: number;

      if (explicitTime !== undefined) {
        startAt = Number(explicitTime.toFixed(2));
        targetTrack = findOrExpandTrackForSpan(
          clips,
          kind,
          startAt,
          asset.duration,
          trackSettingsRef.current,
          preferredTrackId,
          extraTrackIdsRef.current
        );
      } else {
        const candidateBase =
          preferredTrackId &&
          getTrackKind(preferredTrackId) === kind &&
          !getTrackControl(trackSettingsRef.current, preferredTrackId).locked
            ? preferredTrackId
            : makeTrackId(kind, 1);

        if (!getTrackControl(trackSettingsRef.current, candidateBase).locked) {
          targetTrack = candidateBase;
          const trackClips = clips.filter((c) => c.track === targetTrack);
          startAt = Number(
            trackClips.reduce((end, c) => Math.max(end, c.startTime + c.duration), 0).toFixed(2)
          );
        } else {
          startAt = 0;
          targetTrack = findOrExpandTrackForSpan(
            clips,
            kind,
            startAt,
            asset.duration,
            trackSettingsRef.current,
            preferredTrackId,
            extraTrackIdsRef.current
          );
        }
      }

      ensureTrackRegistered(targetTrack);
      const newClip = createDefaultClipProps(asset, targetTrack, startAt);
      commitClips((prev) => [...prev, newClip]);
      setSelectedClipIds([newClip.id]);
    },
    [clips, commitClips, ensureTrackRegistered]
  );

  const handleChangeDefaultImageDuration = useCallback((nextSec: number) => {
    const clean = Number(clamp(nextSec, 0.1, 3600).toFixed(2));
    setDefaultImageDuration(clean);
    defaultImageDurationRef.current = clean;
    setAssets((prev) =>
      prev.map((a) => (a.type === 'image' ? { ...a, duration: clean } : a))
    );
  }, []);

  const handleAddAssetsSerialToTimeline = useCallback(
    (assetList: MediaAsset[], explicitStartTime?: number, preferredTrackId?: TrackId) => {
      if (assetList.length === 0) return;
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const sorted = [...assetList].sort((a, b) => {
        const cmp = collator.compare(a.name, b.name);
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      });

      const currentClips = clipsRef.current;
      const chosenTrackByKind: Partial<Record<TrackKind, TrackId>> = {};
      const kindCursors: Record<TrackKind, number> = {
        T: explicitStartTime ?? 0,
        V:
          explicitStartTime !== undefined
            ? explicitStartTime
            : currentClips
                .filter((c) => c.track === 'V1')
                .reduce((end, c) => Math.max(end, c.startTime + c.duration), 0),
        A:
          explicitStartTime !== undefined
            ? explicitStartTime
            : currentClips
                .filter((c) => c.track === 'A1')
                .reduce((end, c) => Math.max(end, c.startTime + c.duration), 0),
      };

      const registeredTracks = new Set<TrackId>();
      const totalKindDuration: Record<TrackKind, number> = { T: 0, V: 0, A: 0 };
      for (const asset of sorted) {
        const k: TrackKind = asset.type === 'audio' ? 'A' : 'V';
        totalKindDuration[k] +=
          asset.type === 'image' ? defaultImageDurationRef.current : asset.duration;
      }
      const created: TimelineClip[] = [];

      for (const asset of sorted) {
        const kind: TrackKind = asset.type === 'audio' ? 'A' : 'V';
        const effectiveDuration =
          asset.type === 'image' ? defaultImageDurationRef.current : asset.duration;
        const startAt = Number(kindCursors[kind].toFixed(2));

        let targetTrack = chosenTrackByKind[kind];
        if (!targetTrack) {
          const spanNeeded = Math.max(effectiveDuration, totalKindDuration[kind]);
          if (explicitStartTime !== undefined) {
            targetTrack = findOrExpandTrackForSpan(
              currentClips,
              kind,
              startAt,
              spanNeeded,
              trackSettingsRef.current,
              preferredTrackId,
              extraTrackIdsRef.current
            );
          } else {
            const baseId = makeTrackId(kind, 1);
            targetTrack = !getTrackControl(trackSettingsRef.current, baseId).locked
              ? baseId
              : findOrExpandTrackForSpan(
                  currentClips,
                  kind,
                  startAt,
                  spanNeeded,
                  trackSettingsRef.current,
                  preferredTrackId,
                  extraTrackIdsRef.current
                );
          }
          chosenTrackByKind[kind] = targetTrack;
          if (!registeredTracks.has(targetTrack)) {
            registeredTracks.add(targetTrack);
            ensureTrackRegistered(targetTrack);
          }
          // If chosen track wasn't V1/A1 when explicitStartTime is undefined, align cursor to end of that track
          if (explicitStartTime === undefined && targetTrack !== makeTrackId(kind, 1)) {
            kindCursors[kind] = currentClips
              .filter((c) => c.track === targetTrack)
              .reduce((end, c) => Math.max(end, c.startTime + c.duration), 0);
          }
        }

        const clipStart = Number(kindCursors[kind].toFixed(2));
        const clip = createDefaultClipProps(asset, targetTrack, clipStart, effectiveDuration);
        created.push(clip);
        kindCursors[kind] = clipStart + clip.duration;
      }

      if (created.length > 0) {
        commitClips((prev) => [...prev, ...created]);
        setSelectedClipIds(created.map((c) => c.id));
      }
    },
    [commitClips, ensureTrackRegistered]
  );

  const handleAddTitleTemplate = useCallback(
    (name: string, config: TextConfig, x = 0, y = 0, duration = 3.0, preferredTrackId?: TrackId) => {
      const startAt = Number(currentTime.toFixed(2));
      const targetTrack = findOrExpandTrackForSpan(
        clips,
        'T',
        startAt,
        duration,
        trackSettingsRef.current,
        preferredTrackId,
        extraTrackIdsRef.current
      );
      ensureTrackRegistered(targetTrack);
      const clipBase = createTitleClip(
        name,
        startAt,
        duration,
        { ...config },
        x,
        y,
        targetTrack
      );
      const clip: TimelineClip =
        config.isCaption && config.captionScale !== undefined
          ? { ...clipBase, scale: clamp(config.captionScale, 15, 500) }
          : clipBase;
      commitClips((prev) => [...prev, clip]);
      setSelectedClipIds([clip.id]);
    },
    [clips, currentTime, commitClips, ensureTrackRegistered]
  );

  const handleInsertAdvancedText = useCallback(
    (params: {
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
    }) => {
      const startAt = Number(Math.max(0, params.startTime).toFixed(2));
      const dur = Number(Math.max(0.1, params.duration).toFixed(2));
      const targetTrack = findOrExpandTrackForSpan(
        clips,
        'T',
        startAt,
        dur,
        trackSettingsRef.current,
        params.preferredTrackId,
        extraTrackIdsRef.current
      );
      ensureTrackRegistered(targetTrack);
      const base = createTitleClip(
        params.name,
        startAt,
        dur,
        { ...params.config },
        params.x,
        params.y,
        targetTrack
      );
      const enhanced: TimelineClip = {
        ...base,
        scale: params.scale,
        rotation: params.rotation,
        opacity: params.opacity,
        fadeIn: params.fadeIn,
        fadeOut: params.fadeOut,
        glowColor: params.glowColor,
        glowIntensity: params.glowIntensity,
        animationIn: params.animationIn,
        animationInDuration: params.animationInDuration,
        animationOut: params.animationOut,
        animationOutDuration: params.animationOutDuration,
        animationCombo: params.animationCombo,
      };
      commitClips((prev) => [...prev, enhanced]);
      setSelectedClipIds([enhanced.id]);
    },
    [clips, commitClips, ensureTrackRegistered]
  );

  const handleAddSticker = useCallback(
    (preset: StickerPresetInfo, explicitTime?: number, preferredTrackId?: TrackId) => {
      const startAt = explicitTime !== undefined ? explicitTime : Number(currentTime.toFixed(2));
      const targetTrack = findOrExpandTrackForSpan(
        clips,
        'T',
        startAt,
        3.0,
        trackSettingsRef.current,
        preferredTrackId,
        extraTrackIdsRef.current
      );
      ensureTrackRegistered(targetTrack);
      const clip = createStickerClip(
        preset.label,
        startAt,
        3.0,
        {
          stickerId: preset.id,
          label: preset.label,
          emoji: preset.emoji,
          kind: preset.kind,
          category: preset.category,
          primaryColor: preset.primaryColor,
          accentColor: preset.accentColor,
          textColor: preset.textColor,
          showBadgeBg: preset.showBadgeBg ?? true,
          size: preset.defaultSize ?? 120,
        },
        0,
        0,
        preset.defaultCombo,
        targetTrack
      );
      commitClips((prev) => [...prev, clip]);
      setSelectedClipIds([clip.id]);
    },
    [clips, currentTime, commitClips, ensureTrackRegistered]
  );

  const handleDropStickerAtTime = useCallback(
    (stickerId: string, dropTime: number, targetTrackId?: TrackId) => {
      const preset = FAMOUS_STICKERS.find((s) => s.id === stickerId);
      if (!preset) return;
      handleAddSticker(preset, dropTime, targetTrackId);
    },
    [handleAddSticker]
  );

  const handleSaveCustomTitleTemplate = useCallback((tpl: TitleTemplateItem) => {
    const normalized: TitleTemplateItem = { ...tpl, builtIn: true, isCustom: true };
    void saveCustomTitleTemplateToDb(normalized);
    setCustomTitleTemplates((prev) => {
      const next = [normalized, ...prev.filter((item) => item.id !== normalized.id)];
      saveCustomTitleTemplates(next);
      return next;
    });
  }, []);

  const handleDeleteCustomTitleTemplate = useCallback((id: string) => {
    void deleteCustomTitleTemplateFromDb(id);
    setCustomTitleTemplates((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveCustomTitleTemplates(next);
      return next;
    });
  }, []);

  const handleAddSfxToTimeline = useCallback(
    async (presetId: string, explicitTime?: number, preferredTrackId?: TrackId) => {
      const preset = FAMOUS_SFX_CATALOG.find((s) => s.id === presetId);
      if (!preset) return;

      const sfxAssetId = `sfx_${preset.id}`;
      let existingAsset = assetsRef.current.find((a) => a.id === sfxAssetId);
      let sfxDuration = existingAsset?.duration ?? preset.duration;

      if (!existingAsset) {
        const synth = synthesizeSfxTrack(preset.id);
        sfxDuration = synth.duration;
        const fileName = `${preset.label}.wav`;
        try {
          await saveMediaBlobToDb(sfxAssetId, synth.blob, fileName);
        } catch {
          // continue cleanly in memory even if IndexedDB quota is busy
        }
        const createdAsset: MediaAsset = {
          id: sfxAssetId,
          name: `${preset.label} (SFX)`,
          type: 'audio',
          url: synth.url,
          duration: synth.duration,
          waveform: synth.waveform,
        };
        existingAsset = createdAsset;
        setAssets((prev) =>
          prev.some((a) => a.id === sfxAssetId) ? prev : [...prev, createdAsset]
        );
      }

      const startAt = explicitTime !== undefined ? explicitTime : Number(currentTime.toFixed(2));
      const targetTrack = findOrExpandTrackForSpan(
        clipsRef.current,
        'A',
        startAt,
        sfxDuration,
        trackSettingsRef.current,
        preferredTrackId,
        extraTrackIdsRef.current
      );
      ensureTrackRegistered(targetTrack);

      const sfxClip: TimelineClip = {
        ...createDefaultClipProps(existingAsset, targetTrack, startAt, sfxDuration),
        name: preset.label,
        fadeIn: 0.01,
        fadeOut: 0.04,
        volume: 100,
      };
      commitClips((prev) => [...prev, sfxClip]);
      setSelectedClipIds([sfxClip.id]);
    },
    [currentTime, commitClips, ensureTrackRegistered]
  );

  const handleDropSfxAtTime = useCallback(
    (presetId: string, dropTime: number, targetTrackId?: TrackId) => {
      void handleAddSfxToTimeline(presetId, dropTime, targetTrackId);
    },
    [handleAddSfxToTimeline]
  );

  const handleUpdateStickerSize = useCallback(
    (id: string, size: number) => {
      commitClips(
        (prev) =>
          prev.map((c) => {
            if (
              c.id !== id ||
              !c.stickerConfig ||
              getTrackControl(trackSettingsRef.current, c.track).locked
            ) {
              return c;
            }
            return { ...c, stickerConfig: { ...c.stickerConfig, size } };
          }),
        false
      );
    },
    [commitClips]
  );

  const captionCount = useMemo(
    () => clips.filter((c) => isTitleTrack(c.track) && c.textConfig?.isCaption).length,
    [clips]
  );

  const handleChangeDefaultCaptionConfig = useCallback(
    (patch: Partial<TextConfig>) => {
      const hasCustomXY = patch.captionX !== undefined || patch.captionY !== undefined;
      const merged: TextConfig = {
        ...defaultCaptionConfig,
        ...patch,
        isCaption: true,
        ...(hasCustomXY ? { captionPosition: 'custom' as const } : {}),
      };
      if (
        !hasCustomXY &&
        (patch.captionPosition !== undefined || patch.captionSafeMargin !== undefined) &&
        merged.captionPosition !== 'custom'
      ) {
        merged.captionX = 0;
        merged.captionY = getYForCaptionPosition(
          merged.captionPosition ?? 'bottom',
          merged.captionSafeMargin ?? 10
        );
      }
      setDefaultCaptionConfig(merged);

      const { text: _ignoredText, ...stylePatch } = patch;
      if (hasCustomXY) {
        stylePatch.captionPosition = 'custom';
      }
      const selectedIdSet = new Set(selectedClipIds);
      const targetCaptionIds = new Set(
        clips
          .filter(
            (c) =>
              isTitleTrack(c.track) &&
              !getTrackControl(trackSettingsRef.current, c.track).locked &&
              Boolean(c.textConfig?.isCaption) &&
              (autoSyncCaptions || selectedIdSet.has(c.id))
          )
          .map((c) => c.id)
      );

      if (targetCaptionIds.size > 0) {
        const shouldReposition =
          hasCustomXY ||
          ((patch.captionPosition !== undefined || patch.captionSafeMargin !== undefined) &&
            merged.captionPosition !== 'custom');

        commitClips(
          (prevClips) =>
            prevClips.map((c) => {
              if (!targetCaptionIds.has(c.id) || !c.textConfig) return c;
              const isClipCustom = c.textConfig.captionPosition === 'custom';
              let posUpdate: { x?: number; y?: number } = {};
              if (hasCustomXY) {
                posUpdate = {
                  x: patch.captionX ?? merged.captionX ?? c.x,
                  y: patch.captionY ?? merged.captionY ?? c.y,
                };
              } else if (
                shouldReposition &&
                (patch.captionPosition !== undefined || !isClipCustom)
              ) {
                posUpdate = {
                  x: 0,
                  y: getYForCaptionPosition(
                    merged.captionPosition ?? 'bottom',
                    merged.captionSafeMargin ?? 10,
                    merged.captionY ?? c.y
                  ),
                };
              }
              return {
                ...c,
                ...posUpdate,
                ...(patch.captionScale !== undefined
                  ? { scale: clamp(patch.captionScale, 15, 500) }
                  : {}),
                textConfig: {
                  ...c.textConfig,
                  ...stylePatch,
                  ...(isClipCustom && !hasCustomXY && patch.captionPosition === undefined
                    ? { captionPosition: 'custom', captionX: c.x, captionY: c.y }
                    : {}),
                  text: c.textConfig.text,
                  isCaption: true,
                },
              };
            }),
          false
        );
      }
    },
    [defaultCaptionConfig, selectedClipIds, clips, autoSyncCaptions, commitClips]
  );

  const handleApplyCaptionStyleToAll = useCallback(
    (sourceConfig: TextConfig) => {
      const hasAnyCaption = clips.some((c) => isTitleTrack(c.track) && c.textConfig?.isCaption);
      const pos = sourceConfig.captionPosition ?? 'bottom';
      const margin = sourceConfig.captionSafeMargin ?? 10;

      commitClips((prev) =>
        prev.map((c) => {
          if (
            !isTitleTrack(c.track) ||
            !c.textConfig ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          if (hasAnyCaption && !c.textConfig.isCaption) return c;
          const keepClipCustom =
            c.textConfig.captionPosition === 'custom' && pos !== 'custom';
          const targetX =
            pos === 'custom'
              ? sourceConfig.captionX ?? c.x
              : keepClipCustom
              ? c.x
              : 0;
          const targetY =
            pos === 'custom'
              ? sourceConfig.captionY ?? c.y
              : keepClipCustom
              ? c.y
              : getYForCaptionPosition(pos, margin, c.y);

          return {
            ...c,
            x: targetX,
            y: targetY,
            scale:
              sourceConfig.captionScale !== undefined
                ? clamp(sourceConfig.captionScale, 15, 500)
                : c.scale,
            textConfig: {
              ...sourceConfig,
              captionPosition: keepClipCustom ? 'custom' : pos,
              captionX: targetX,
              captionY: targetY,
              text: c.textConfig.text,
              isCaption: true,
            },
          };
        })
      );
    },
    [clips, commitClips]
  );

  const handleGenerateCaptions = useCallback(
    (cues: CaptionCue[], config: TextConfig, atPlayhead = true) => {
      if (cues.length === 0) return;
      const offset = atPlayhead ? Number(currentTime.toFixed(2)) : 0;
      const spanStart = offset + Math.min(...cues.map((c) => c.startTime));
      const spanEnd = offset + Math.max(...cues.map((c) => Math.max(c.endTime, c.startTime + 0.4)));
      const targetTrack = findOrExpandTrackForSpan(
        clips,
        'T',
        spanStart,
        Math.max(0.5, spanEnd - spanStart),
        trackSettingsRef.current,
        'T1',
        extraTrackIdsRef.current
      );
      ensureTrackRegistered(targetTrack);

      const posX = config.captionPosition === 'custom' ? config.captionX ?? 0 : 0;
      const posY = getYForCaptionPosition(
        config.captionPosition ?? 'bottom',
        config.captionSafeMargin ?? 10,
        config.captionY ?? 34
      );

      const initialScale = clamp(config.captionScale ?? 100, 15, 500);
      const created = cues.map((cue, idx) => ({
        ...createTitleClip(
          cue.text.split('\n')[0] || `Caption ${idx + 1}`,
          Number((offset + cue.startTime).toFixed(2)),
          Number(Math.max(0.4, cue.endTime - cue.startTime).toFixed(2)),
          { ...config, text: cue.text, isCaption: true },
          posX,
          posY,
          targetTrack
        ),
        scale: initialScale,
      }));

      commitClips((prev) => [...prev, ...created]);
      setSelectedClipIds(created.map((c) => c.id));
    },
    [clips, currentTime, commitClips, ensureTrackRegistered]
  );

  const handleAddSingleCaptionCue = useCallback(
    (text: string, duration: number, config: TextConfig) => {
      const posX = config.captionPosition === 'custom' ? config.captionX ?? 0 : 0;
      const posY = getYForCaptionPosition(
        config.captionPosition ?? 'bottom',
        config.captionSafeMargin ?? 10,
        config.captionY ?? 34
      );
      handleAddTitleTemplate(
        text.split('\n')[0] || 'Caption Cue',
        { ...config, text, isCaption: true },
        posX,
        posY,
        Math.max(0.2, duration)
      );
    },
    [handleAddTitleTemplate]
  );

  const handleExportCaptionsSrt = useCallback(() => {
    const srt = exportClipsToSrt(clips);
    if (!srt.trim()) return;
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName =
      projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'framecut-captions';
    link.download = `${safeName}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }, [clips, projectName]);

  const handleExportCaptionsVtt = useCallback(() => {
    const vtt = exportClipsToVtt(clips);
    if (!vtt.trim()) return;
    const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName =
      projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'framecut-captions';
    link.download = `${safeName}.vtt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }, [clips, projectName]);

  const handleExportCaptionsAss = useCallback(() => {
    const ass = exportClipsToAss(clips);
    if (!ass.trim()) return;
    const blob = new Blob([ass], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName =
      projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'framecut-captions';
    link.download = `${safeName}.ass`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }, [clips, projectName]);

  const handleExportCaptionsTxt = useCallback(() => {
    const txt = exportClipsToTxt(clips);
    if (!txt.trim()) return;
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName =
      projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'framecut-captions';
    link.download = `${safeName}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }, [clips, projectName]);

  const handleClearCaptions = useCallback(() => {
    const captionIds = new Set(
      clips
        .filter(
          (c) =>
            isTitleTrack(c.track) &&
            c.textConfig?.isCaption &&
            !getTrackControl(trackSettingsRef.current, c.track).locked
        )
        .map((c) => c.id)
    );
    if (captionIds.size === 0) return;
    commitClips((prev) => prev.filter((c) => !captionIds.has(c.id)));
    setSelectedClipIds((prev) => prev.filter((id) => !captionIds.has(id)));
    setAutoCaptionStatus(null);
  }, [clips, commitClips]);

  const captionClips = useMemo(
    () =>
      clips
        .filter((c) => isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption))
        .sort((a, b) => a.startTime - b.startTime),
    [clips]
  );

  const runWhisperCaptionFallback = useCallback(
    async (
      extracted: Awaited<ReturnType<typeof extractTimelineAudioForCaptioning>>,
      targetLanguage: string,
      maxWordsPerCue: number,
      engineLabel = 'Offline Whisper AI'
    ) => {
      const pcm =
        extracted.pcm16k && extracted.pcm16k.length > 0
          ? extracted.pcm16k
          : await decodeBase64AudioToPcm16k(extracted.audioBase64);
      if (!pcm || pcm.length === 0) {
        throw new Error('Could not decode audio waveform for offline speech transcription.');
      }
      const whisperResult = await transcribeAudioOfflineWhisper(
        pcm,
        extracted.duration,
        targetLanguage,
        maxWordsPerCue,
        (progressMsg) => {
          setAutoCaptionStatus({ kind: 'info', message: progressMsg });
        }
      );

      if (whisperResult.cues.length === 0) {
        setAutoCaptionStatus({
          kind: 'info',
          message: 'No clear spoken words were detected in the audio.',
        });
        return;
      }

      ensureScriptFontLoaded(whisperResult.cues.map((c) => c.text).join(' '));
      const nextConfig: TextConfig = {
        ...defaultCaptionConfig,
        isCaption: true,
        textDirection: whisperResult.direction,
        detectedLanguage: whisperResult.detectedLanguage,
      };
      setDefaultCaptionConfig(nextConfig);

      const shiftedCues: CaptionCue[] = whisperResult.cues.map((cue) => ({
        startTime: Number((extracted.startOffset + cue.startTime).toFixed(2)),
        endTime: Number((extracted.startOffset + cue.endTime).toFixed(2)),
        text: cue.text,
      }));
      handleGenerateCaptions(shiftedCues, nextConfig, false);
      setMediaLoadTick((t) => t + 1);
      setAutoCaptionStatus({
        kind: 'success',
        message: `Added ${shiftedCues.length} captions (${engineLabel})`,
        detectedLanguage: whisperResult.detectedLanguage,
        script: whisperResult.script,
        direction: whisperResult.direction,
      });
    },
    [defaultCaptionConfig, handleGenerateCaptions]
  );

  const handleAutoDetectAudioCaptions = useCallback(
    async (targetLanguage: string, maxWordsPerCue: number) => {
      if (isAutoCaptionLoading) return;
      setIsAutoCaptionLoading(true);
      setAutoCaptionStatus({
        kind: 'info',
        message: 'Extracting timeline audio & auto-detecting spoken language...',
      });
      try {
        const hiddenTracks = getHiddenTracksMap();
        const extracted = await extractTimelineAudioForCaptioning(
          clips,
          allAssets,
          decodedAudioRef.current,
          900,
          hiddenTracks
        );

        // If offline, skip cloud call and run on-device Whisper speech AI directly
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setAutoCaptionStatus({
            kind: 'info',
            message: 'Offline mode: Running on-device Whisper speech AI...',
          });
          await runWhisperCaptionFallback(extracted, targetLanguage, maxWordsPerCue);
          return;
        }

        let cloudFallbackReason: string | null = null;
        try {
          const res = await fetch('/api/captions/auto-detect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: extracted.audioBase64,
              mimeType: extracted.mimeType,
              duration: extracted.duration,
              targetLanguage,
              maxWordsPerCue,
            }),
          });
          const rawBody = await res.text();
          let data: {
            error?: string;
            detectedLanguage?: string;
            languageCode?: string;
            script?: string;
            direction?: 'ltr' | 'rtl';
            cues?: CaptionCue[];
          } = {};
          try {
            data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
          } catch {
            cloudFallbackReason = `HTTP ${res.status}`;
          }

          if (!cloudFallbackReason && res.ok) {
            const cues = Array.isArray(data.cues) ? data.cues : [];
            if (cues.length === 0) {
              setAutoCaptionStatus({
                kind: 'info',
                message: 'No clear spoken speech was detected in the active audio.',
              });
              return;
            }

            const direction = data.direction === 'rtl' ? 'rtl' : 'ltr';
            const detectedLanguage = data.detectedLanguage || 'Detected Speech';
            const script = data.script || 'Unicode';
            ensureScriptFontLoaded(cues.map((c) => c.text).join(' '));

            const nextConfig: TextConfig = {
              ...defaultCaptionConfig,
              isCaption: true,
              textDirection: direction,
              detectedLanguage,
            };
            setDefaultCaptionConfig(nextConfig);

            const shiftedCues: CaptionCue[] = cues.map((cue) => ({
              startTime: Number((extracted.startOffset + cue.startTime).toFixed(2)),
              endTime: Number((extracted.startOffset + cue.endTime).toFixed(2)),
              text: cue.text,
            }));
            handleGenerateCaptions(shiftedCues, nextConfig, false);
            setMediaLoadTick((t) => t + 1);
            setAutoCaptionStatus({
              kind: 'success',
              message: `Added ${shiftedCues.length} auto captions`,
              detectedLanguage,
              script,
              direction,
            });
            return;
          }

          if (!cloudFallbackReason) {
            if (res.status >= 500 || res.status === 429) {
              cloudFallbackReason = data.error || `HTTP ${res.status}`;
            } else {
              throw new Error(data.error || 'Auto language caption detection failed.');
            }
          }
        } catch (netErr) {
          if (!cloudFallbackReason) {
            cloudFallbackReason =
              netErr instanceof Error ? netErr.message : 'Cloud speech request failed';
          }
        }

        // Seamless automatic fallback to on-device Whisper AI on 503/5xx/network hiccups
        setAutoCaptionStatus({
          kind: 'info',
          message: `Cloud AI busy (${cloudFallbackReason ?? '503'}) — switching to on-device Whisper AI...`,
        });
        await runWhisperCaptionFallback(
          extracted,
          targetLanguage,
          maxWordsPerCue,
          'On-Device Whisper AI'
        );
      } catch (err) {
        setAutoCaptionStatus({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Unable to detect audio captions.',
        });
      } finally {
        setIsAutoCaptionLoading(false);
      }
    },
    [
      isAutoCaptionLoading,
      clips,
      allAssets,
      defaultCaptionConfig,
      handleGenerateCaptions,
      runWhisperCaptionFallback,
      getHiddenTracksMap,
    ]
  );

  const handleOfflineWhisperCaptions = useCallback(
    async (targetLanguage: string, maxWordsPerCue: number) => {
      if (isAutoCaptionLoading) return;
      setIsAutoCaptionLoading(true);
      setAutoCaptionStatus({
        kind: 'info',
        message: 'Preparing audio for on-device Whisper speech AI...',
      });
      try {
        const extracted = await extractTimelineAudioForCaptioning(
          clips,
          allAssets,
          decodedAudioRef.current,
          900,
          getHiddenTracksMap()
        );
        await runWhisperCaptionFallback(
          extracted,
          targetLanguage,
          maxWordsPerCue,
          'Offline Whisper AI'
        );
      } catch (err) {
        setAutoCaptionStatus({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Offline Whisper speech transcription failed.',
        });
      } finally {
        setIsAutoCaptionLoading(false);
      }
    },
    [isAutoCaptionLoading, clips, allAssets, runWhisperCaptionFallback, getHiddenTracksMap]
  );

  const handleOfflineSyncAudioCaptions = useCallback(
    async (scriptText?: string, maxWordsPerCue = 6) => {
      if (isAutoCaptionLoading) return;
      setIsAutoCaptionLoading(true);
      setAutoCaptionStatus({
        kind: 'info',
        message: 'Detecting speech pauses locally in browser (100% offline)...',
      });
      try {
        const { segments } = await detectOfflineSpeechSegments(
          clips,
          allAssets,
          decodedAudioRef.current,
          getHiddenTracksMap()
        );
        if (segments.length === 0) {
          setAutoCaptionStatus({
            kind: 'info',
            message: 'No clear audio segments found to sync.',
          });
          return;
        }

        const trimmed = scriptText?.trim() ?? '';
        const detected = trimmed
          ? detectTextLanguage(trimmed)
          : {
              languageName: 'Offline Audio Sync',
              languageCode: 'auto',
              script: 'Unicode',
              direction: 'ltr' as const,
              isRtl: false,
              recommendedFont: 'Plus Jakarta Sans',
            };
        if (trimmed) {
          ensureScriptFontLoaded(trimmed);
        }

        const scriptLines = trimmed
          ? splitScriptIntoCaptionCues(trimmed, 0, 2.2, maxWordsPerCue).map((c) => c.text)
          : [];

        const syncedCues: CaptionCue[] = [];
        if (scriptLines.length > 0) {
          const totalCount = scriptLines.length;
          if (segments.length >= totalCount) {
            for (let i = 0; i < totalCount; i++) {
              const seg = segments[i];
              syncedCues.push({
                startTime: seg.startTime,
                endTime: seg.endTime,
                text: scriptLines[i],
              });
            }
          } else {
            let lineIdx = 0;
            for (let sIdx = 0; sIdx < segments.length; sIdx++) {
              const seg = segments[sIdx];
              const remainingSegs = segments.length - sIdx;
              const remainingLines = totalCount - lineIdx;
              const takeCount = Math.max(1, Math.ceil(remainingLines / remainingSegs));
              const chunkLines = scriptLines.slice(lineIdx, lineIdx + takeCount);
              lineIdx += chunkLines.length;
              const segDur = Math.max(0.4, seg.endTime - seg.startTime);
              const subStep = segDur / chunkLines.length;
              chunkLines.forEach((line, k) => {
                syncedCues.push({
                  startTime: Number((seg.startTime + k * subStep).toFixed(2)),
                  endTime: Number((seg.startTime + (k + 1) * subStep).toFixed(2)),
                  text: line,
                });
              });
            }
          }
        } else {
          segments.forEach((seg, idx) => {
            syncedCues.push({
              startTime: seg.startTime,
              endTime: seg.endTime,
              text: `Caption ${idx + 1}`,
            });
          });
        }

        const nextConfig: TextConfig = {
          ...defaultCaptionConfig,
          isCaption: true,
          textDirection: detected.direction,
          detectedLanguage: detected.languageName,
        };
        setDefaultCaptionConfig(nextConfig);
        handleGenerateCaptions(syncedCues, nextConfig, false);
        setMediaLoadTick((t) => t + 1);
        setAutoCaptionStatus({
          kind: 'success',
          message: scriptLines.length > 0
            ? `Synced ${syncedCues.length} script captions to audio offline`
            : `Synced ${syncedCues.length} timed caption slots to audio offline (tap to edit text)`,
          detectedLanguage: detected.languageName,
          script: detected.script,
          direction: detected.direction,
        });
      } catch (err) {
        setAutoCaptionStatus({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Could not sync audio timing offline.',
        });
      } finally {
        setIsAutoCaptionLoading(false);
      }
    },
    [isAutoCaptionLoading, clips, allAssets, defaultCaptionConfig, handleGenerateCaptions]
  );

  const handleTranslateCaptions = useCallback(
    async (
      targetLanguage: string,
      scriptText?: string,
      cueSeconds = 2.2,
      maxWordsPerCue = 7
    ): Promise<boolean> => {
      if (isAutoCaptionLoading) return false;

      const trimmedScript = scriptText?.trim() ?? '';
      const existingCaptionClips = clips
        .filter(
          (c) =>
            isTitleTrack(c.track) &&
            !getTrackControl(trackSettingsRef.current, c.track).locked &&
            c.textConfig?.isCaption &&
            c.textConfig.text.trim()
        )
        .sort((a, b) => a.startTime - b.startTime);
      const fallbackTextClips =
        existingCaptionClips.length > 0
          ? existingCaptionClips
          : clips
              .filter(
                (c) =>
                  isTitleTrack(c.track) &&
                  !getTrackControl(trackSettingsRef.current, c.track).locked &&
                  Boolean(c.textConfig?.text.trim())
              )
              .sort((a, b) => a.startTime - b.startTime);

      if (!trimmedScript && fallbackTextClips.length === 0) {
        setAutoCaptionStatus({
          kind: 'error',
          message: 'Add captions or paste script text first to detect/translate.',
        });
        return false;
      }

      const applyLocalScriptFallback = (): boolean => {
        if (!trimmedScript || targetLanguage !== 'auto') return false;
        const detected = detectTextLanguage(trimmedScript);
        ensureScriptFontLoaded(trimmedScript);
        const cues = splitScriptIntoCaptionCues(trimmedScript, 0, cueSeconds, maxWordsPerCue);
        if (cues.length === 0) return false;
        const nextConfig: TextConfig = {
          ...defaultCaptionConfig,
          isCaption: true,
          textDirection: detected.direction,
          detectedLanguage: detected.languageName,
        };
        setDefaultCaptionConfig(nextConfig);
        handleGenerateCaptions(cues, nextConfig, true);
        setMediaLoadTick((t) => t + 1);
        setAutoCaptionStatus({
          kind: 'success',
          message: `Generated ${cues.length} timed cues (Local Script Parser)`,
          detectedLanguage: detected.languageName,
          script: detected.script,
          direction: detected.direction,
        });
        return true;
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (applyLocalScriptFallback()) return true;
        setAutoCaptionStatus({
          kind: 'error',
          message:
            'Offline mode: AI translation needs internet. Use "Generate Captions at Playhead" or "Sync Audio Timing (Offline)" instead.',
        });
        return false;
      }

      setIsAutoCaptionLoading(true);
      setAutoCaptionStatus({
        kind: 'info',
        message: 'Auto-detecting language & formatting captions...',
      });
      try {
        const res = await fetch('/api/captions/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            trimmedScript
              ? {
                  text: trimmedScript,
                  targetLanguage,
                  secondsPerCue: cueSeconds,
                  maxWordsPerCue,
                }
              : {
                  cues: fallbackTextClips.map((c) => ({
                    startTime: c.startTime,
                    endTime: Number((c.startTime + c.duration).toFixed(2)),
                    text: c.textConfig!.text,
                  })),
                  targetLanguage,
                }
          ),
        });
        const rawBody = await res.text();
        let data: {
          error?: string;
          detectedLanguage?: string;
          outputLanguage?: string;
          script?: string;
          direction?: 'ltr' | 'rtl';
          cues?: CaptionCue[];
        } = {};
        try {
          data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
        } catch {
          if (applyLocalScriptFallback()) return true;
          throw new Error(
            res.ok
              ? 'Invalid response from caption server.'
              : `Translation service unavailable (HTTP ${res.status}). Please retry shortly.`
          );
        }
        if (!res.ok) {
          if (res.status >= 500 && applyLocalScriptFallback()) return true;
          throw new Error(data.error || 'Caption translation failed.');
        }

        const cues = Array.isArray(data.cues) ? data.cues : [];
        if (cues.length === 0) {
          throw new Error('No caption text returned.');
        }

        const direction = data.direction === 'rtl' ? 'rtl' : 'ltr';
        const outLang = data.outputLanguage || data.detectedLanguage || 'Detected';
        const script = data.script || 'Unicode';
        ensureScriptFontLoaded(cues.map((c) => c.text).join(' '));

        const nextConfig: TextConfig = {
          ...defaultCaptionConfig,
          isCaption: true,
          textDirection: direction,
          detectedLanguage: outLang,
        };
        setDefaultCaptionConfig(nextConfig);

        if (trimmedScript) {
          handleGenerateCaptions(cues, nextConfig, true);
        } else {
          const clipByIdx = new Map(fallbackTextClips.map((c, idx) => [c.id, idx]));
          commitClips((prev) =>
            prev.map((c) => {
              const idx = clipByIdx.get(c.id);
              if (idx === undefined || !c.textConfig) return c;
              const translatedCue = cues[idx];
              if (!translatedCue) return c;
              return {
                ...c,
                name: translatedCue.text.split('\n')[0] || c.name,
                textConfig: {
                  ...c.textConfig,
                  text: translatedCue.text,
                  isCaption: true,
                  textDirection: direction,
                  detectedLanguage: outLang,
                },
              };
            })
          );
        }

        setMediaLoadTick((t) => t + 1);
        setAutoCaptionStatus({
          kind: 'success',
          message: trimmedScript
            ? `Generated ${cues.length} cues`
            : `Updated ${fallbackTextClips.length} cues`,
          detectedLanguage: `${data.detectedLanguage || outLang}${
            data.outputLanguage && data.outputLanguage !== data.detectedLanguage
              ? ` → ${data.outputLanguage}`
              : ''
          }`,
          script,
          direction,
        });
        return true;
      } catch (err) {
        if (applyLocalScriptFallback()) return true;
        setAutoCaptionStatus({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Unable to translate captions.',
        });
        return false;
      } finally {
        setIsAutoCaptionLoading(false);
      }
    },
    [
      isAutoCaptionLoading,
      clips,
      defaultCaptionConfig,
      handleGenerateCaptions,
      commitClips,
    ]
  );

  const handleUpdateClip = useCallback(
    (id: string, patch: Partial<TimelineClip>, recordHistory = true) => {
      const currentTarget = clipsRef.current.find((c) => c.id === id);
      const isCaptionClip =
        Boolean(currentTarget) &&
        isTitleTrack(currentTarget!.track) &&
        Boolean(currentTarget!.textConfig?.isCaption) &&
        patch.textConfig?.isCaption !== false &&
        !getTrackControl(trackSettingsRef.current, currentTarget!.track).locked;

      const sharedClipPatch: Partial<TimelineClip> = {};
      const sharedTextDiff: Partial<TextConfig> = {};

      if (isCaptionClip && currentTarget && autoSyncCaptionsRef.current) {
        const instanceOnlyKeys = new Set<string>([
          'id',
          'assetId',
          'mediaUrl',
          'name',
          'track',
          'startTime',
          'duration',
          'sourceOffset',
          'trimStart',
          'trimEnd',
          'keyframes',
          'textConfig',
        ]);
        for (const [k, v] of Object.entries(patch)) {
          if (!instanceOnlyKeys.has(k) && v !== undefined) {
            (sharedClipPatch as Record<string, unknown>)[k] = v;
          }
        }

        if (patch.textConfig && currentTarget.textConfig) {
          for (const [k, v] of Object.entries(patch.textConfig)) {
            if (k === 'text' || k === 'detectedLanguage' || v === undefined) continue;
            if (k === 'textDirection') {
              if (v !== currentTarget.textConfig.textDirection) {
                sharedTextDiff.textDirection = v as TextConfig['textDirection'];
              }
              continue;
            }
            const prevVal = (currentTarget.textConfig as unknown as Record<string, unknown>)[k];
            const isPositionKey =
              k === 'captionPosition' || k === 'captionX' || k === 'captionY';
            if (v !== prevVal || (isPositionKey && (patch.x !== undefined || patch.y !== undefined))) {
              (sharedTextDiff as Record<string, unknown>)[k] = v;
            }
          }
        }

        if (patch.x !== undefined || patch.y !== undefined) {
          const nextX = patch.x ?? currentTarget.x;
          const nextY = patch.y ?? currentTarget.y;
          if (patch.textConfig?.captionPosition === undefined) {
            sharedTextDiff.captionPosition = 'custom';
          }
          sharedTextDiff.captionX = nextX;
          sharedTextDiff.captionY = nextY;
        }

        if (patch.scale !== undefined && patch.textConfig?.captionScale === undefined) {
          sharedTextDiff.captionScale = clamp(patch.scale, 15, 500);
        }
      }

      const hasSharedClipUpdates = Object.keys(sharedClipPatch).length > 0;
      const hasSharedTextUpdates = Object.keys(sharedTextDiff).length > 0;
      const shouldSyncAllCaptions =
        isCaptionClip && autoSyncCaptionsRef.current && (hasSharedClipUpdates || hasSharedTextUpdates);

      const targetNormalizedPatch: Partial<TimelineClip> =
        isCaptionClip && currentTarget?.textConfig && hasSharedTextUpdates
          ? {
              ...patch,
              textConfig: {
                ...(patch.textConfig ?? currentTarget.textConfig),
                ...sharedTextDiff,
                text: patch.textConfig?.text ?? currentTarget.textConfig.text,
                detectedLanguage:
                  patch.textConfig?.detectedLanguage ?? currentTarget.textConfig.detectedLanguage,
                isCaption: true,
              },
            }
          : patch;

      commitClips(
        (prev) =>
          prev.map((c) => {
            if (getTrackControl(trackSettingsRef.current, c.track).locked) return c;
            if (c.id === id) {
              const merged = { ...c, ...targetNormalizedPatch };
              if (
                patch.duration !== undefined &&
                patch.keyframes === undefined &&
                merged.kenBurns === 'pan-zoom'
              ) {
                return { ...merged, ...buildPanZoomClipPatch(merged) };
              }
              return merged;
            }
            if (
              shouldSyncAllCaptions &&
              isTitleTrack(c.track) &&
              Boolean(c.textConfig?.isCaption)
            ) {
              return {
                ...c,
                ...sharedClipPatch,
                ...(c.textConfig && hasSharedTextUpdates
                  ? {
                      textConfig: {
                        ...c.textConfig,
                        ...sharedTextDiff,
                        text: c.textConfig.text,
                        detectedLanguage: c.textConfig.detectedLanguage,
                        isCaption: true,
                      },
                    }
                  : {}),
              };
            }
            return c;
          }),
        recordHistory
      );

      if (shouldSyncAllCaptions && hasSharedTextUpdates) {
        setDefaultCaptionConfig((prev) => ({
          ...prev,
          ...sharedTextDiff,
          isCaption: true,
        }));
      }
    },
    [commitClips]
  );

  const handleUpdateCaptionCueText = useCallback(
    (clipId: string, nextText: string) => {
      const target = clips.find((c) => c.id === clipId);
      if (!target || !target.textConfig) return;
      if (getTrackControl(trackSettingsRef.current, target.track).locked) return;
      const detected = detectTextLanguage(nextText);
      if (nextText.trim()) {
        ensureScriptFontLoaded(nextText);
      }
      const nextName = nextText.split('\n')[0]?.trim() || target.name;
      const keepExplicitDir =
        target.textConfig.textDirection === 'ltr' ||
        target.textConfig.textDirection === 'rtl';
      handleUpdateClip(
        clipId,
        {
          name: nextName,
          textConfig: {
            ...target.textConfig,
            text: nextText,
            isCaption: true,
            textDirection: keepExplicitDir
              ? target.textConfig.textDirection
              : detected.direction,
            detectedLanguage: nextText.trim()
              ? detected.languageName
              : target.textConfig.detectedLanguage,
          },
        },
        false
      );
    },
    [clips, handleUpdateClip]
  );

  const handleDeleteCaptionCue = useCallback(
    (clipId: string) => {
      const target = clips.find((c) => c.id === clipId);
      if (!target || getTrackControl(trackSettingsRef.current, target.track).locked) return;
      commitClips((prev) => prev.filter((c) => c.id !== clipId));
      setSelectedClipIds((prev) => prev.filter((id) => id !== clipId));
    },
    [clips, commitClips]
  );

  const handleBatchUpdateSelected = useCallback(
    (patch: Partial<TimelineClip>, recordHistory = true) => {
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      const includesCaption =
        autoSyncCaptionsRef.current &&
        clipsRef.current.some(
          (c) => idSet.has(c.id) && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption)
        );
      commitClips(
        (prev) =>
          prev.map((c) => {
            if (
              (idSet.has(c.id) ||
                (includesCaption && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption))) &&
              !getTrackControl(trackSettingsRef.current, c.track).locked
            ) {
              const merged = { ...c, ...patch };
              if (
                patch.duration !== undefined &&
                patch.keyframes === undefined &&
                merged.kenBurns === 'pan-zoom'
              ) {
                return { ...merged, ...buildPanZoomClipPatch(merged) };
              }
              return merged;
            }
            return c;
          }),
        recordHistory
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleSetBatchDuration = useCallback(
    (durationSeconds: number, rippleSequence = true) => {
      if (selectedClipIds.length === 0) return;
      const targetDur = Number(clamp(durationSeconds, 0.1, 3600).toFixed(2));
      const idSet = new Set(selectedClipIds);
      const assetMap = new Map(allAssets.map((a) => [a.id, a]));

      commitClips((prev) => {
        // 1. Update duration for all selected unlocked clips
        const updatedMap = new Map<string, TimelineClip>();
        const affectedTracks = new Set<TrackId>();

        for (const c of prev) {
          if (idSet.has(c.id) && !getTrackControl(trackSettingsRef.current, c.track).locked) {
            affectedTracks.add(c.track);
            const asset = assetMap.get(c.assetId);
            const isTimedMedia = asset && (asset.type === 'video' || asset.type === 'audio');
            const maxMediaDur = isTimedMedia
              ? Math.max(0.1, (asset.duration - c.sourceOffset) / Math.max(0.25, c.speed || 1))
              : targetDur;
            const nextDuration = Number(
              clamp(Math.min(targetDur, maxMediaDur), 0.1, 3600).toFixed(2)
            );
            const merged: TimelineClip = { ...c, duration: nextDuration };
            const finalClip =
              merged.kenBurns === 'pan-zoom'
                ? { ...merged, ...buildPanZoomClipPatch(merged) }
                : merged;
            updatedMap.set(c.id, finalClip);
          } else {
            updatedMap.set(c.id, c);
          }
        }

        if (!rippleSequence) {
          return prev.map((c) => updatedMap.get(c.id) ?? c);
        }

        // 2. Ripple-pack clips per affected track so sequential pictures stay strictly gapless
        const startOverrideMap = new Map<string, number>();
        for (const trackId of affectedTracks) {
          const origTrackClips = prev
            .filter((c) => c.track === trackId)
            .sort((a, b) => a.startTime - b.startTime);

          let prevOrigEnd = 0;
          let prevNewEnd = 0;
          for (let i = 0; i < origTrackClips.length; i++) {
            const orig = origTrackClips[i];
            const nextClip = updatedMap.get(orig.id) ?? orig;
            let newStart: number;
            if (i === 0) {
              newStart = orig.startTime;
            } else {
              const origGap = Math.max(0, orig.startTime - prevOrigEnd);
              const bothSelected = idSet.has(orig.id) && idSet.has(origTrackClips[i - 1].id);
              newStart = Number(
                (bothSelected ? prevNewEnd : prevNewEnd + origGap).toFixed(2)
              );
            }
            startOverrideMap.set(orig.id, newStart);
            prevOrigEnd = orig.startTime + orig.duration;
            prevNewEnd = newStart + nextClip.duration;
          }
        }

        return prev.map((c) => {
          const base = updatedMap.get(c.id) ?? c;
          const nextStart = startOverrideMap.get(c.id);
          return nextStart !== undefined ? { ...base, startTime: nextStart } : base;
        });
      }, true);
    },
    [selectedClipIds, allAssets, commitClips]
  );

  const handleMoveClips = useCallback(
    (
      updates: Array<{ id: string; startTime: number; track?: TrackId }>,
      recordHistory = true
    ) => {
      const map = new Map(updates.map((u) => [u.id, u]));
      for (const u of updates) {
        if (u.track) ensureTrackRegistered(u.track);
      }
      commitClips(
        (prev) =>
          prev.map((c) => {
            const upd = map.get(c.id);
            if (!upd || getTrackControl(trackSettingsRef.current, c.track).locked) return c;
            const nextTrack = upd.track ?? c.track;
            if (
              nextTrack !== c.track &&
              (getTrackKind(nextTrack) !== getTrackKind(c.track) ||
                getTrackControl(trackSettingsRef.current, nextTrack).locked)
            ) {
              return { ...c, startTime: upd.startTime };
            }
            return { ...c, startTime: upd.startTime, track: nextTrack };
          }),
        recordHistory
      );
    },
    [commitClips, ensureTrackRegistered]
  );

  const handleSelectAllTimeline = useCallback(() => {
    setSelectedClipIds(clips.map((c) => c.id));
  }, [clips]);

  const handleSplitAtPlayhead = useCallback(
    (splitAnyIfUnselected = false) => {
      const idSet = new Set(selectedClipIds);
      const selectedHasSplittable =
        idSet.size > 0 &&
        clips.some(
          (c) =>
            idSet.has(c.id) &&
            !getTrackControl(trackSettingsRef.current, c.track).locked &&
            currentTime > c.startTime + 0.1 &&
            currentTime < c.startTime + c.duration - 0.1
        );

      const splitAllAtPlayhead = splitAnyIfUnselected && !selectedHasSplittable;
      if (!selectedHasSplittable && !splitAllAtPlayhead) return;

      const newlySelected: string[] = [];
      let didSplit = false;

      const nextClips: TimelineClip[] = [];
      for (const target of clips) {
        const isEligible =
          (splitAllAtPlayhead || idSet.has(target.id)) &&
          !getTrackControl(trackSettingsRef.current, target.track).locked;
        if (
          !isEligible ||
          currentTime <= target.startTime + 0.1 ||
          currentTime >= target.startTime + target.duration - 0.1
        ) {
          nextClips.push(target);
          if (idSet.has(target.id)) newlySelected.push(target.id);
          continue;
        }

        didSplit = true;
        const firstDur = Number((currentTime - target.startTime).toFixed(3));
        const secondDur = Number((target.duration - firstDur).toFixed(3));
        const asset = allAssets.find((a) => a.id === target.assetId);
        const advancesOffset = asset?.type === 'video' || asset?.type === 'audio';

        const leftClip: TimelineClip = {
          ...target,
          duration: firstDur,
          fadeOut: Math.min(target.fadeOut, firstDur * 0.4),
          textConfig: target.textConfig ? { ...target.textConfig } : undefined,
          stickerConfig: target.stickerConfig ? { ...target.stickerConfig } : undefined,
          keyframes: target.keyframes ? target.keyframes.map((k) => ({ ...k })) : undefined,
        };

        const rightClip: TimelineClip = {
          ...target,
          id: uid('clip'),
          startTime: currentTime,
          duration: secondDur,
          sourceOffset: advancesOffset
            ? Number((target.sourceOffset + firstDur * target.speed).toFixed(3))
            : target.sourceOffset,
          fadeIn: Math.min(target.fadeIn, secondDur * 0.4),
          textConfig: target.textConfig ? { ...target.textConfig } : undefined,
          stickerConfig: target.stickerConfig ? { ...target.stickerConfig } : undefined,
          keyframes: target.keyframes ? target.keyframes.map((k) => ({ ...k })) : undefined,
        };

        nextClips.push(leftClip, rightClip);
        newlySelected.push(rightClip.id);
      }

      if (didSplit) {
        commitClips(() => nextClips);
        setSelectedClipIds(newlySelected);
      }
    },
    [selectedClipIds, clips, currentTime, allAssets, commitClips]
  );

  const handleDuplicateSelected = useCallback(() => {
    if (selectedTrackIdRef.current) {
      handleDuplicateTrack(selectedTrackIdRef.current);
      return;
    }
    if (selectedClipIds.length === 0) return;
    const idSet = new Set(selectedClipIds);
    const targets = clips.filter(
      (c) => idSet.has(c.id) && !getTrackControl(trackSettingsRef.current, c.track).locked
    );
    if (targets.length === 0) return;

    const earliestStart = Math.min(...targets.map((t) => t.startTime));
    const latestEnd = Math.max(...targets.map((t) => t.startTime + t.duration));
    const shift = latestEnd - earliestStart;

    const clones: TimelineClip[] = targets.map((target) => ({
      ...target,
      id: uid('clip'),
      startTime: Number((target.startTime + shift).toFixed(2)),
      textConfig: target.textConfig ? { ...target.textConfig } : undefined,
      stickerConfig: target.stickerConfig ? { ...target.stickerConfig } : undefined,
      keyframes: target.keyframes ? target.keyframes.map((k) => ({ ...k })) : undefined,
    }));

    commitClips((prev) => [...prev, ...clones]);
    setSelectedClipIds(clones.map((c) => c.id));
  }, [selectedClipIds, clips, commitClips, handleDuplicateTrack]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    const idSet = new Set(selectedClipIds);
    const lockedSelected = new Set(
      clips
        .filter((c) => idSet.has(c.id) && getTrackControl(trackSettingsRef.current, c.track).locked)
        .map((c) => c.id)
    );
    commitClips((prev) =>
      prev.filter((c) => !idSet.has(c.id) || getTrackControl(trackSettingsRef.current, c.track).locked)
    );
    setSelectedClipIds((prev) => prev.filter((id) => lockedSelected.has(id)));
  }, [selectedClipIds, clips, commitClips]);

  const handleCopySelected = useCallback(() => {
    const idSet = new Set(selectedClipIdsRef.current);
    const targets =
      idSet.size > 0
        ? clipsRef.current.filter((c) => idSet.has(c.id))
        : clipsRef.current.filter(
            (c) =>
              !getTrackControl(trackSettingsRef.current, c.track).hidden &&
              currentTimeRef.current >= c.startTime &&
              currentTimeRef.current < c.startTime + c.duration
          );
    if (targets.length === 0) return false;
    copiedClipsRef.current = targets.map((t) => ({
      ...t,
      textConfig: t.textConfig ? { ...t.textConfig } : undefined,
      stickerConfig: t.stickerConfig ? { ...t.stickerConfig } : undefined,
      keyframes: t.keyframes ? t.keyframes.map((k) => ({ ...k })) : undefined,
    }));
    return true;
  }, []);

  const handleCutSelected = useCallback(() => {
    if (selectedClipIdsRef.current.length === 0) return false;
    const copied = handleCopySelected();
    if (copied) {
      handleDeleteSelected();
    }
    return copied;
  }, [handleCopySelected, handleDeleteSelected]);

  const handlePasteClips = useCallback(() => {
    const source = copiedClipsRef.current;
    if (source.length === 0) return false;

    const earliestStart = Math.min(...source.map((c) => c.startTime));
    const pasteBase = Number(Math.max(0, currentTimeRef.current).toFixed(2));
    const workingClips = [...clipsRef.current];
    const created: TimelineClip[] = [];

    for (const src of source) {
      const relOffset = Math.max(0, src.startTime - earliestStart);
      const startTime = Number((pasteBase + relOffset).toFixed(2));
      const kind = getTrackKind(src.track);
      const preferredTrack = !getTrackControl(trackSettingsRef.current, src.track).locked
        ? src.track
        : undefined;
      const targetTrack = findOrExpandTrackForSpan(
        workingClips,
        kind,
        startTime,
        src.duration,
        trackSettingsRef.current,
        preferredTrack,
        extraTrackIdsRef.current
      );
      ensureTrackRegistered(targetTrack);

      const cloned: TimelineClip = {
        ...src,
        id: uid('clip'),
        track: targetTrack,
        startTime,
        textConfig: src.textConfig ? { ...src.textConfig } : undefined,
        stickerConfig: src.stickerConfig ? { ...src.stickerConfig } : undefined,
        keyframes: src.keyframes ? src.keyframes.map((k) => ({ ...k })) : undefined,
      };
      workingClips.push(cloned);
      created.push(cloned);
    }

    if (created.length > 0) {
      commitClips((prev) => [...prev, ...created]);
      setSelectedClipIds(created.map((c) => c.id));
      return true;
    }
    return false;
  }, [commitClips, ensureTrackRegistered]);

  const handleUpdateAsset = useCallback((assetId: string, patch: Partial<MediaAsset>) => {
    setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, ...patch } : a)));
  }, []);

  const handleSyncAssetToClips = useCallback(
    (assetId: string, asset: MediaAsset) => {
      commitClips((prev) =>
        prev.map((c) => {
          if (c.assetId !== assetId || getTrackControl(trackSettingsRef.current, c.track).locked) {
            return c;
          }
          const filterPreset = asset.defaultFilterPreset ?? c.filterPreset;
          const vals = FILTER_PRESET_VALUES[filterPreset];
          return {
            ...c,
            name: asset.name,
            duration: asset.duration,
            scale: asset.defaultScale ?? c.scale,
            opacity: asset.defaultOpacity ?? c.opacity,
            rotation: asset.defaultRotation ?? c.rotation,
            fadeIn: asset.defaultFadeIn ?? c.fadeIn,
            fadeOut: asset.defaultFadeOut ?? c.fadeOut,
            kenBurns: asset.defaultKenBurns ?? c.kenBurns,
            volume: asset.defaultVolume ?? c.volume,
            muted: asset.defaultMuted ?? c.muted,
            filterPreset,
            brightness: vals.brightness,
            contrast: vals.contrast,
            saturation: vals.saturation,
            warmth: vals.warmth,
            vignette: vals.vignette,
            fxPreset: asset.defaultFxPreset ?? c.fxPreset,
            glowColor: asset.defaultGlowColor ?? c.glowColor,
            glowIntensity: asset.defaultGlowIntensity ?? c.glowIntensity,
            framePreset: asset.defaultFramePreset ?? c.framePreset,
            animationIn: asset.defaultAnimationIn ?? c.animationIn,
            animationOut: asset.defaultAnimationOut ?? c.animationOut,
            animationCombo: asset.defaultAnimationCombo ?? c.animationCombo,
          };
        })
      );
    },
    [commitClips]
  );

  const handleDeleteAsset = useCallback(
    (assetId: string) => {
      const removedIds = new Set(clips.filter((c) => c.assetId === assetId).map((c) => c.id));
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      commitClips((prev) => prev.filter((c) => c.assetId !== assetId));
      setSelectedClipIds((prev) => prev.filter((id) => !removedIds.has(id)));
    },
    [clips, commitClips]
  );

  const handleDuplicateSingleClip = useCallback(
    (clipId: string) => {
      const target = clips.find((c) => c.id === clipId);
      if (!target || getTrackControl(trackSettingsRef.current, target.track).locked) return;
      const clone: TimelineClip = {
        ...target,
        id: uid('clip'),
        startTime: Number((target.startTime + target.duration).toFixed(2)),
        textConfig: target.textConfig ? { ...target.textConfig } : undefined,
        stickerConfig: target.stickerConfig ? { ...target.stickerConfig } : undefined,
        keyframes: target.keyframes ? target.keyframes.map((k) => ({ ...k })) : undefined,
      };
      commitClips((prev) => [...prev, clone]);
      setSelectedClipIds([clone.id]);
    },
    [clips, commitClips]
  );

  const handleDeleteSingleClip = useCallback(
    (clipId: string) => {
      const target = clips.find((c) => c.id === clipId);
      if (target && getTrackControl(trackSettingsRef.current, target.track).locked) return;
      commitClips((prev) => prev.filter((c) => c.id !== clipId));
      setSelectedClipIds((prev) => prev.filter((id) => id !== clipId));
    },
    [clips, commitClips]
  );

  const handleApplyEffectWithSettings = useCallback(
    (
      fxId: VisualEffectPreset,
      intensity: number,
      glowColor: string,
      glowIntensity: number
    ) => {
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      const includesCaption =
        autoSyncCaptionsRef.current &&
        clipsRef.current.some(
          (c) => idSet.has(c.id) && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption)
        );
      commitClips((prev) =>
        prev.map((c) => {
          const isTarget =
            idSet.has(c.id) ||
            (includesCaption && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption));
          if (
            !isTarget ||
            isAudioTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          return {
            ...c,
            fxPreset: fxId,
            fxIntensity: fxId === 'none' ? 0 : intensity,
            glowColor,
            glowIntensity,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyFrameWithSettings = useCallback(
    (frameId: FramePreset, color: string, thickness: number) => {
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            !isVisualTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          return {
            ...c,
            framePreset: frameId,
            frameColor: color,
            frameThickness: thickness,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyMaskWithSettings = useCallback(
    (
      maskShape: MaskShape,
      centerX: number,
      centerY: number,
      width: number,
      height: number,
      feather: number,
      invert: boolean,
      customMask?: CustomMaskItem
    ) => {
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      commitClips((prev) =>
        prev.map((c) => {
          if (
            !idSet.has(c.id) ||
            !isVisualTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          if (maskShape === 'custom' && customMask) {
            return {
              ...c,
              maskShape: 'custom',
              customMaskId: customMask.id,
              customMaskDataUrl: customMask.dataUrl,
              maskCenterX: centerX,
              maskCenterY: centerY,
              maskWidth: width,
              maskHeight: height,
              maskFeather: feather,
              maskInvert: invert,
            };
          }
          return {
            ...c,
            maskShape,
            customMaskId: undefined,
            customMaskDataUrl: undefined,
            maskCenterX: centerX,
            maskCenterY: centerY,
            maskWidth: width,
            maskHeight: height,
            maskFeather: feather,
            maskInvert: invert,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyTransitionWithSettings = useCallback(
    (transitionId: TransitionType, edge: 'in' | 'out' | 'both', duration: number) => {
      if (selectedClipIds.length === 0) return;
      const idSet = new Set(selectedClipIds);
      const includesCaption =
        autoSyncCaptionsRef.current &&
        clipsRef.current.some(
          (c) => idSet.has(c.id) && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption)
        );
      commitClips((prev) =>
        prev.map((c) => {
          const isTarget =
            idSet.has(c.id) ||
            (includesCaption && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption));
          if (
            !isTarget ||
            isAudioTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          return {
            ...c,
            ...(edge === 'in' || edge === 'both'
              ? { transitionIn: transitionId, transitionInDuration: duration }
              : {}),
            ...(edge === 'out' || edge === 'both'
              ? { transitionOut: transitionId, transitionOutDuration: duration }
              : {}),
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleApplyAnimationWithSettings = useCallback(
    (animationId: ClipAnimationPreset, duration: number, intensity: number) => {
      if (selectedClipIds.length === 0) return;
      const preset = ANIMATION_PRESETS.find((a) => a.id === animationId);
      const category = preset?.category ?? 'In';
      const idSet = new Set(selectedClipIds);
      const includesCaption =
        autoSyncCaptionsRef.current &&
        clipsRef.current.some(
          (c) => idSet.has(c.id) && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption)
        );
      commitClips((prev) =>
        prev.map((c) => {
          const isTarget =
            idSet.has(c.id) ||
            (includesCaption && isTitleTrack(c.track) && Boolean(c.textConfig?.isCaption));
          if (
            !isTarget ||
            isAudioTrack(c.track) ||
            getTrackControl(trackSettingsRef.current, c.track).locked
          ) {
            return c;
          }
          if (animationId === 'none') {
            return {
              ...c,
              animationIn: 'none',
              animationOut: 'none',
              animationCombo: 'none',
            };
          }
          if (category === 'Out') {
            return {
              ...c,
              animationOut: animationId,
              animationOutDuration: duration,
              animationIntensity: intensity,
            };
          }
          if (category === 'Combo') {
            if (animationId === 'pan-zoom' && isVisualTrack(c.track)) {
              return {
                ...c,
                ...buildPanZoomClipPatch(c),
                animationCombo: 'pan-zoom',
                animationIntensity: intensity,
              };
            }
            return {
              ...c,
              animationCombo: animationId,
              animationIntensity: intensity,
            };
          }
          return {
            ...c,
            animationIn: animationId,
            animationInDuration: duration,
            animationIntensity: intensity,
          };
        })
      );
    },
    [selectedClipIds, commitClips]
  );

  const handleResetSample = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setPast([]);
    setFuture([]);
    setExtraTrackIds([]);
    setTrackSettings(normalizeTrackSettings(DEFAULT_TRACK_SETTINGS));
    if (clips.length > 0 || assets.length > 0) {
      setAssets([]);
      setClips([]);
      setSelectedClipIds([]);
      setProjectName('Untitled Sequence');
      activeProjectThumbRef.current = undefined;
      window.setTimeout(() => {
        void pruneUnreferencedMediaBlobs(new Set());
      }, 150);
    } else {
      const fresh = buildSampleProject();
      setAssets(fresh.assets.filter((a) => a.type !== 'motion'));
      setClips(fresh.clips);
      setSelectedClipIds(fresh.clips[0]?.id ? [fresh.clips[0].id] : []);
      setProjectName('Pacific Horizon Edit');
    }
  };

  const handleTriggerToolAction = useCallback(
    (toolId: ToolContextId) => {
      switch (toolId) {
        case 'split':
          handleSplitAtPlayhead(true);
          break;
        case 'duplicate':
          handleDuplicateSelected();
          break;
        case 'delete':
          handleDeleteSelected();
          break;
        case 'select-all':
          handleSelectAllTimeline();
          break;
        case 'add-text':
          setTextStudioSeed(TEXT_STUDIO_PRESETS[0]);
          setIsTextStudioOpen(true);
          break;
        case 'snap':
          setSnapEnabled((s) => !s);
          break;
        case 'undo':
          handleUndo();
          break;
        case 'redo':
          handleRedo();
          break;
        case 'clear-project':
          handleResetSample();
          break;
        case 'save-project':
          void handleSaveProjectRef.current();
          break;
        case 'export-video':
          setIsPlaying(false);
          setIsExportOpen(true);
          break;
        case 'playback':
          handleTogglePlay();
          break;
        case 'preview-quality':
          setPreviewScale((prev) => (prev === 'auto' ? 'half' : 'auto'));
          break;
        case 'caption-settings':
          setIsCaptionStudioOpen(true);
          break;
        case 'preview-audio':
          handleToggleMute();
          break;
        case 'font-library':
          setIsFontLibraryOpen(true);
          break;
        case 'custom-mask-studio':
          setIsCustomMaskModalOpen(true);
          break;
        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      handleSplitAtPlayhead,
      handleDuplicateSelected,
      handleDeleteSelected,
      handleSelectAllTimeline,
      handleAddTitleTemplate,
      handleUndo,
      handleRedo,
      handleTogglePlay,
    ]
  );

  const handleSaveProjectRef = useRef<() => Promise<void>>(async () => {});

  const defaultSaveFileName = useMemo(() => {
    const clean = (projectName || 'Untitled Sequence')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${clean || 'framecut-project'}.framecut.json`;
  }, [projectName]);

  const promptSaveFileLocation = useCallback(
    async (mode: 'new-project' | 'save' | 'save-as' = 'save') => {
      setSaveModalMode(mode);
      const win = window as unknown as {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<SaveDirectoryHandleLike>;
        showSaveFilePicker?: (opts?: {
          suggestedName?: string;
          types?: Array<{
            description?: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<SaveFileHandleLike>;
      };

      if (typeof win.showDirectoryPicker === 'function') {
        try {
          const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
          const fileHandle = await dirHandle.getFileHandle(defaultSaveFileName, {
            create: true,
          });
          const now = Date.now();
          projectDirHandleRef.current = dirHandle;
          projectFileHandleRef.current = fileHandle;
          hasSavedOnceRef.current = true;
          savedFileNameRef.current = fileHandle.name;
          savedFolderPathRef.current = dirHandle.name;
          lastAutoSavedAtRef.current = now;
          setHasSavedOnce(true);
          setSavedFileName(fileHandle.name);
          setSavedFolderPath(dirHandle.name);
          setLastAutoSavedAt(now);
          const targetKey = activeProjectIdRef.current || 'active_target';
          await saveFileTargetToDb(
            {
              handle: fileHandle,
              dirHandle,
              fileName: fileHandle.name,
              folderPath: dirHandle.name,
              hasSavedOnce: true,
            },
            targetKey
          );
          const record = buildCurrentProjectRecord(true);
          if (record) {
            await saveProjectRecordToDb(record);
            linkProjectFolderInLocalStorage(record, {
              folderPath: dirHandle.name,
              fileName: fileHandle.name,
              hasSystemFolderHandle: true,
            });
          }
          await syncLinkedFileNow(true);
          triggerSavedFlash();
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          // Fall through to save file picker or inline modal
        }
      }

      if (typeof win.showSaveFilePicker === 'function') {
        try {
          const handle = await win.showSaveFilePicker({
            suggestedName: defaultSaveFileName,
            types: [
              {
                description: 'HBL videolab Project',
                accept: { 'application/json': ['.framecut.json', '.json'] },
              },
            ],
          });
          const now = Date.now();
          const resolvedFolder = normalizeFolderPath(
            savedFolderPathRef.current || getLastLinkedFolderPathFromLocalStorage(),
            'HBL-Projects'
          );
          projectDirHandleRef.current = null;
          projectFileHandleRef.current = handle;
          hasSavedOnceRef.current = true;
          savedFileNameRef.current = handle.name;
          savedFolderPathRef.current = resolvedFolder;
          lastAutoSavedAtRef.current = now;
          setHasSavedOnce(true);
          setSavedFileName(handle.name);
          setSavedFolderPath(resolvedFolder);
          setLastAutoSavedAt(now);
          const targetKey = activeProjectIdRef.current || 'active_target';
          await saveFileTargetToDb(
            {
              handle,
              dirHandle: null,
              fileName: handle.name,
              folderPath: resolvedFolder,
              hasSavedOnce: true,
            },
            targetKey
          );
          const record = buildCurrentProjectRecord(true);
          if (record) {
            await saveProjectRecordToDb(record);
            linkProjectFolderInLocalStorage(record, {
              folderPath: resolvedFolder,
              fileName: handle.name,
              hasSystemFolderHandle: false,
            });
          }
          await syncLinkedFileNow(true);
          triggerSavedFlash();
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          // Cross-origin iframe SecurityError or browser restriction -> open file location modal
        }
      }

      setIsSaveLocationOpen(true);
    },
    [defaultSaveFileName, buildCurrentProjectRecord, syncLinkedFileNow, triggerSavedFlash]
  );

  const handleDownloadProjectJson = useCallback(async (fileName: string) => {
    const json = await serializeProjectFileJson(
      latestProjectRef.current,
      embeddedMediaCacheRef.current
    );
    exportProjectJsonDownload(json, fileName);
  }, []);

  const handleConfirmFallbackSaveFile = useCallback(
    async (
      fileName: string,
      folderPath?: string,
      pickedHandles?: {
        fileHandle: SaveFileHandleLike;
        dirHandle?: SaveDirectoryHandleLike | null;
      }
    ) => {
      const cleanFolder = normalizeFolderPath(
        folderPath,
        savedFolderPathRef.current || getLastLinkedFolderPathFromLocalStorage() || 'HBL-Projects'
      );
      const now = Date.now();
      const json = await serializeProjectFileJson(
        latestProjectRef.current,
        embeddedMediaCacheRef.current
      );

      let activeFileHandle: SaveFileHandleLike | null = pickedHandles?.fileHandle ?? null;
      let activeDirHandle: SaveDirectoryHandleLike | null = pickedHandles?.dirHandle ?? null;

      if (activeFileHandle) {
        projectFileHandleRef.current = activeFileHandle;
        projectDirHandleRef.current = activeDirHandle;
        await ensureHandleWritePermission(activeFileHandle, true);
        await writeProjectToHandle(activeFileHandle, json);
      } else if (
        projectDirHandleRef.current &&
        cleanFolder === normalizeFolderPath(savedFolderPathRef.current, cleanFolder)
      ) {
        // Keep the existing linked OS folder handle if saving inside the same folder
        activeDirHandle = projectDirHandleRef.current;
        try {
          activeFileHandle = await activeDirHandle.getFileHandle(fileName, { create: true });
          projectFileHandleRef.current = activeFileHandle;
          await ensureHandleWritePermission(activeFileHandle, true);
          await writeProjectToHandle(activeFileHandle, json);
        } catch {
          activeFileHandle = projectFileHandleRef.current;
        }
      } else {
        // Pure LocalStorage + IndexedDB folder link (no forced browser download dialog)
        projectFileHandleRef.current = null;
        projectDirHandleRef.current = null;
        activeFileHandle = null;
        activeDirHandle = null;
      }

      hasSavedOnceRef.current = true;
      savedFileNameRef.current = fileName;
      savedFolderPathRef.current = cleanFolder;
      lastAutoSavedAtRef.current = now;
      setHasSavedOnce(true);
      setSavedFileName(fileName);
      setSavedFolderPath(cleanFolder);
      setLastAutoSavedAt(now);
      setIsSaveLocationOpen(false);
      const targetKey = activeProjectIdRef.current || 'active_target';
      await saveFileTargetToDb(
        {
          handle: activeFileHandle,
          dirHandle: activeDirHandle,
          fileName,
          folderPath: cleanFolder,
          hasSavedOnce: true,
        },
        targetKey
      );
      const record = buildCurrentProjectRecord(true);
      if (record) {
        await saveProjectRecordToDb(record);
        linkProjectFolderInLocalStorage(record, {
          folderPath: cleanFolder,
          fileName,
          hasSystemFolderHandle: Boolean(activeDirHandle),
        });
      }
      triggerSavedFlash();
    },
    [buildCurrentProjectRecord, triggerSavedFlash]
  );

  const handleSaveProject = useCallback(async () => {
    if (!hasSavedOnceRef.current && !projectFileHandleRef.current && !savedFolderPathRef.current) {
      await promptSaveFileLocation('save');
      return;
    }

    const now = Date.now();
    lastAutoSavedAtRef.current = now;
    setLastAutoSavedAt(now);
    const record = buildCurrentProjectRecord(true);
    if (record) {
      await saveProjectRecordToDb(record);
      if (savedFolderPathRef.current || getProjectFolderLinkFromLocalStorage(record.id)) {
        syncLinkedFolderLocalStorage(record, Boolean(projectDirHandleRef.current));
      } else {
        const fallbackFolder = normalizeFolderPath(
          getLastLinkedFolderPathFromLocalStorage(),
          'HBL-Projects'
        );
        savedFolderPathRef.current = fallbackFolder;
        setSavedFolderPath(fallbackFolder);
        const targetFileName = savedFileNameRef.current || defaultSaveFileName;
        savedFileNameRef.current = targetFileName;
        setSavedFileName(targetFileName);
        linkProjectFolderInLocalStorage(record, {
          folderPath: fallbackFolder,
          fileName: targetFileName,
          hasSystemFolderHandle: Boolean(projectDirHandleRef.current),
        });
      }
    }
    if (projectFileHandleRef.current || projectDirHandleRef.current) {
      const ok = await syncLinkedFileNow(true);
      if (!ok) {
        await promptSaveFileLocation('save');
        return;
      }
    }
    triggerSavedFlash();
  }, [
    promptSaveFileLocation,
    buildCurrentProjectRecord,
    syncLinkedFileNow,
    triggerSavedFlash,
    defaultSaveFileName,
  ]);

  const handleSaveProjectAs = useCallback(async () => {
    await promptSaveFileLocation('save-as');
  }, [promptSaveFileLocation]);

  handleSaveProjectRef.current = handleSaveProject;

  const resetRuntimeCachesForProjectSwitch = useCallback(() => {
    stopAllAudioNodes();
    for (const el of mediaMapRef.current.values()) {
      if (el instanceof HTMLVideoElement) {
        try {
          el.pause();
        } catch {
          // ignore
        }
      }
    }
    mediaMapRef.current.clear();
    decodedAudioRef.current.clear();
    embeddedMediaCacheRef.current.clear();
  }, [stopAllAudioNodes]);

  const handleOpenProject = useCallback(
    async (projectId: string) => {
      const loaded = await openProjectRecordFromDb(projectId);
      if (!loaded) return;

      resetRuntimeCachesForProjectSwitch();
      isProjectHydratedRef.current = false;
      suppressNextAutoSaveRef.current = true;

      activeProjectIdRef.current = loaded.id;
      activeProjectCreatedAtRef.current = loaded.createdAt;
      activeProjectThumbRef.current = loaded.thumbnailDataUrl;
      setActiveProjectId(loaded.id);
      setCurrentProjectId(loaded.id);

      setProjectName(loaded.projectName);
      setAspectRatio(loaded.aspectRatio);
      setFps(loaded.fps);
      setAssets(loaded.assets);
      setClips(loaded.clips);
      setCurrentTime(loaded.currentTime);
      setTimelineZoom(loaded.timelineZoom ?? 68);
      setSnapEnabled(loaded.snapEnabled ?? true);
      setSelectedClipIds(loaded.selectedClipIds ?? []);
      setSelectedTrackId(null);
      selectedTrackIdRef.current = null;
      setPreviewScale(loaded.previewScale ?? 'auto');
      setExtraTrackIds(loaded.extraTrackIds ?? []);
      setTrackSettings(
        normalizeTrackSettings(loaded.trackSettings, loaded.clips, loaded.extraTrackIds)
      );
      setPast([]);
      setFuture([]);
      setIsPlaying(false);
      setPropertiesTarget(null);
      setAutoCaptionStatus(null);

      const savedTarget = await loadFileTargetFromDb(loaded.id);
      const localFolderLink = getProjectFolderLinkFromLocalStorage(loaded.id);
      if (savedTarget) {
        projectFileHandleRef.current = savedTarget.handle;
        projectDirHandleRef.current = savedTarget.dirHandle ?? null;
        const savedFlag = Boolean(
          savedTarget.hasSavedOnce ||
            savedTarget.handle ||
            loaded.hasSavedOnce ||
            localFolderLink
        );
        setHasSavedOnce(savedFlag);
        hasSavedOnceRef.current = savedFlag;
        const resolvedFileName =
          savedTarget.fileName ?? loaded.savedFileName ?? localFolderLink?.fileName ?? null;
        const resolvedFolder =
          savedTarget.folderPath ?? loaded.savedFolderPath ?? localFolderLink?.folderPath ?? null;
        setSavedFileName(resolvedFileName);
        savedFileNameRef.current = resolvedFileName;
        setSavedFolderPath(resolvedFolder);
        savedFolderPathRef.current = resolvedFolder;
      } else {
        projectFileHandleRef.current = null;
        projectDirHandleRef.current = null;
        const savedFlag = Boolean(loaded.hasSavedOnce || localFolderLink);
        setHasSavedOnce(savedFlag);
        hasSavedOnceRef.current = savedFlag;
        const resolvedFileName = loaded.savedFileName ?? localFolderLink?.fileName ?? null;
        const resolvedFolder = loaded.savedFolderPath ?? localFolderLink?.folderPath ?? null;
        setSavedFileName(resolvedFileName);
        savedFileNameRef.current = resolvedFileName;
        setSavedFolderPath(resolvedFolder);
        savedFolderPathRef.current = resolvedFolder;
      }
      const restoredAutoSave = loaded.lastAutoSavedAt ?? null;
      setLastAutoSavedAt(restoredAutoSave);
      lastAutoSavedAtRef.current = restoredAutoSave;

      await setCurrentProjectIdInDb(loaded.id);
      isProjectHydratedRef.current = true;
      setActiveView('editor');
    },
    [resetRuntimeCachesForProjectSwitch]
  );

  const handleCreateProject = useCallback(
    async (opts: {
      projectName: string;
      aspectRatio: AspectRatio;
      fps: 24 | 30 | 60;
      starter: 'blank' | 'sample';
    }) => {
      const cleanTitle = opts.projectName.trim() || 'Untitled Sequence';
      const slug =
        cleanTitle
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'hbl-project';
      const suggestedFileName = `${slug}.framecut.json`;

      // Try opening native folder/file picker synchronously on the user click before DB awaits
      let pickedDirHandle: SaveDirectoryHandleLike | null = null;
      let pickedFileHandle: SaveFileHandleLike | null = null;
      let pickedFolderName: string | null = null;
      let pickedFileName: string | null = null;
      const win = window as unknown as {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<SaveDirectoryHandleLike>;
        showSaveFilePicker?: (opts?: {
          suggestedName?: string;
          types?: Array<{
            description?: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<SaveFileHandleLike>;
      };

      if (typeof win.showDirectoryPicker === 'function') {
        try {
          pickedDirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
          pickedFileHandle = await pickedDirHandle.getFileHandle(suggestedFileName, {
            create: true,
          });
          pickedFolderName = pickedDirHandle.name;
          pickedFileName = pickedFileHandle.name;
        } catch {
          pickedDirHandle = null;
          pickedFileHandle = null;
        }
      }
      if (!pickedFileHandle && typeof win.showSaveFilePicker === 'function') {
        try {
          pickedFileHandle = await win.showSaveFilePicker({
            suggestedName: suggestedFileName,
            types: [
              {
                description: 'HBL videolab Project',
                accept: { 'application/json': ['.framecut.json', '.json'] },
              },
            ],
          });
          pickedFileName = pickedFileHandle.name;
          pickedFolderName = normalizeFolderPath(
            getLastLinkedFolderPathFromLocalStorage(),
            `HBL-Projects/${slug}`
          );
        } catch {
          pickedFileHandle = null;
        }
      }

      const now = Date.now();
      const newId = uid('proj');
      const sample = opts.starter === 'sample' ? buildSampleProject() : null;
      const initialAssets = sample ? sample.assets.filter((a) => a.type !== 'motion') : [];
      const initialClips = sample ? sample.clips : [];
      const initialThumb = initialAssets.find((a) => a.type === 'image')?.thumbnailUrl;
      const didPickNative = Boolean(pickedFileHandle);

      const newRecord: StoredProjectRecord = {
        id: newId,
        projectName: cleanTitle,
        aspectRatio: opts.aspectRatio,
        fps: opts.fps,
        currentTime: 0,
        assets: initialAssets,
        clips: initialClips,
        timelineZoom: 68,
        snapEnabled: true,
        selectedClipIds: initialClips[0]?.id ? [initialClips[0].id] : [],
        previewScale: 'auto',
        trackSettings: normalizeTrackSettings(DEFAULT_TRACK_SETTINGS),
        extraTrackIds: [],
        thumbnailDataUrl: initialThumb,
        createdAt: now,
        updatedAt: now,
        hasSavedOnce: didPickNative,
        savedFileName: pickedFileName,
        savedFolderPath: pickedFolderName,
        lastAutoSavedAt: didPickNative ? now : null,
      };

      await saveProjectRecordToDb(newRecord);
      if (pickedFileHandle) {
        await saveFileTargetToDb(
          {
            handle: pickedFileHandle,
            dirHandle: pickedDirHandle,
            fileName: pickedFileName,
            folderPath: pickedFolderName,
            hasSavedOnce: true,
          },
          newId
        );
        if (pickedFolderName && pickedFileName) {
          linkProjectFolderInLocalStorage(newRecord, {
            folderPath: pickedFolderName,
            fileName: pickedFileName,
            hasSystemFolderHandle: Boolean(pickedDirHandle),
          });
        }
      }
      await setCurrentProjectIdInDb(newId);
      const updatedList = await listProjectsFromDb();
      setProjects(updatedList);
      await handleOpenProject(newId);

      if (pickedFileHandle) {
        await syncLinkedFileNow(true);
        triggerSavedFlash();
      } else {
        setSaveModalMode('new-project');
        setIsSaveLocationOpen(true);
      }
    },
    [handleOpenProject, syncLinkedFileNow, triggerSavedFlash]
  );

  const handleGoHome = useCallback(async () => {
    setIsPlaying(false);
    stopAllAudioNodes();
    if (activeProjectIdRef.current && isProjectHydratedRef.current) {
      const record = buildCurrentProjectRecord(true);
      if (record) {
        await saveProjectRecordToDb(record);
        if (hasSavedOnceRef.current || savedFolderPathRef.current) {
          syncLinkedFolderLocalStorage(record, Boolean(projectDirHandleRef.current));
        }
      }
      if (projectFileHandleRef.current || projectDirHandleRef.current) {
        await syncLinkedFileNow(false);
      }
    }
    const updatedList = await listProjectsFromDb();
    setProjects(updatedList);
    setPropertiesTarget(null);
    setActiveView('home');
  }, [stopAllAudioNodes, buildCurrentProjectRecord, syncLinkedFileNow]);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      await deleteProjectFromDb(projectId);
      const updatedList = await listProjectsFromDb();
      setProjects(updatedList);
      if (activeProjectIdRef.current === projectId) {
        activeProjectIdRef.current = null;
        setActiveProjectId(null);
      }
      setCurrentProjectId((prev) =>
        prev === projectId ? updatedList[0]?.id ?? null : prev
      );
    },
    []
  );

  const handleDuplicateProject = useCallback(async (projectId: string) => {
    await duplicateProjectInDb(projectId);
    const updatedList = await listProjectsFromDb();
    setProjects(updatedList);
  }, []);

  const handleRenameProject = useCallback(
    async (projectId: string, newName: string) => {
      await renameProjectInDb(projectId, newName);
      if (activeProjectIdRef.current === projectId) {
        setProjectName(newName.trim() || 'Untitled Sequence');
      }
      const updatedList = await listProjectsFromDb();
      setProjects(updatedList);
    },
    []
  );

  const handleImportProjectFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const imported = await importProjectFileJsonToDb(text);
      const updatedList = await listProjectsFromDb();
      setProjects(updatedList);
      await handleOpenProject(imported.id);
    },
    [handleOpenProject]
  );

  // Global keyboard shortcuts (active across the video editor)
  useEffect(() => {
    if (activeView !== 'editor') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const lowerKey = e.key.toLowerCase();

      if (mod && lowerKey === 's') {
        e.preventDefault();
        void handleSaveProject();
        return;
      }

      if (e.key === 'Escape') {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          return;
        }
        if (propertiesTarget) {
          e.preventDefault();
          setPropertiesTarget(null);
        } else if (isCaptionStudioOpen) {
          e.preventDefault();
          setIsCaptionStudioOpen(false);
        } else if (isTextStudioOpen) {
          e.preventDefault();
          setIsTextStudioOpen(false);
        } else if (isExportOpen) {
          e.preventDefault();
          setIsExportOpen(false);
        } else if (isSaveLocationOpen) {
          e.preventDefault();
          setIsSaveLocationOpen(false);
        } else if (isFontLibraryOpen) {
          e.preventDefault();
          setIsFontLibraryOpen(false);
        } else if (isCustomMaskModalOpen) {
          e.preventDefault();
          setIsCustomMaskModalOpen(false);
        } else {
          setSelectedClipIds([]);
          setSelectedTrackId(null);
          selectedTrackIdRef.current = null;
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      const inputType =
        target?.tagName === 'INPUT' ? (target as HTMLInputElement).type.toLowerCase() : '';
      const isTextEntryInput = Boolean(
        target &&
          ((target.tagName === 'INPUT' &&
            !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'].includes(
              inputType
            )) ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
      );

      if (isTextEntryInput) return;

      const hasBlockingModal =
        Boolean(propertiesTarget) ||
        isCaptionStudioOpen ||
        isTextStudioOpen ||
        isExportOpen ||
        isSaveLocationOpen ||
        isFontLibraryOpen ||
        isCustomMaskModalOpen;
      if (hasBlockingModal) return;

      if (mod && lowerKey === 'a') {
        e.preventDefault();
        handleSelectAllTimeline();
      } else if (mod && lowerKey === 'c') {
        const hasDomSelection = Boolean(window.getSelection()?.toString());
        if (!hasDomSelection && handleCopySelected()) {
          e.preventDefault();
        }
      } else if (mod && lowerKey === 'x') {
        const hasDomSelection = Boolean(window.getSelection()?.toString());
        if (!hasDomSelection && handleCutSelected()) {
          e.preventDefault();
        }
      } else if (mod && lowerKey === 'v') {
        if (handlePasteClips()) {
          e.preventDefault();
        }
      } else if (mod && lowerKey === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
      } else if (mod && lowerKey === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mod && lowerKey === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (mod && lowerKey === 'e') {
        e.preventDefault();
        setIsExportOpen(true);
      } else if ((mod && lowerKey === 'b') || (!mod && !e.altKey && lowerKey === 's')) {
        e.preventDefault();
        handleSplitAtPlayhead(false);
      } else if (e.code === 'Space') {
        if (target?.tagName === 'BUTTON' || target?.tagName === 'A') return;
        e.preventDefault();
        handleTogglePlay();
      } else if (!mod && !e.altKey && lowerKey === 'k') {
        e.preventDefault();
        handleTogglePlay();
      } else if (!mod && !e.altKey && lowerKey === 'j') {
        e.preventDefault();
        handleSeek(currentTime - 1);
      } else if (!mod && !e.altKey && lowerKey === 'l') {
        e.preventDefault();
        handleSeek(currentTime + 1);
      } else if (!mod && !e.altKey && lowerKey === 'm') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(currentTime - (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeek(currentTime + (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === 'Home') {
        e.preventDefault();
        handleSeek(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        handleSeek(totalDuration);
      } else if ((e.key === '=' || e.key === '+') && !e.altKey) {
        e.preventDefault();
        setTimelineZoom((z) => clamp(z + 12, 20, 180));
      } else if (e.key === '-' && !e.altKey) {
        e.preventDefault();
        setTimelineZoom((z) => clamp(z - 12, 20, 180));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeView,
    handleSelectAllTimeline,
    handleCopySelected,
    handleCutSelected,
    handlePasteClips,
    handleDuplicateSelected,
    handleTogglePlay,
    handleToggleMute,
    handleUndo,
    handleRedo,
    handleSplitAtPlayhead,
    handleDeleteSelected,
    handleSeek,
    handleSaveProject,
    propertiesTarget,
    isCaptionStudioOpen,
    isTextStudioOpen,
    isExportOpen,
    isSaveLocationOpen,
    isFontLibraryOpen,
    isCustomMaskModalOpen,
    currentTime,
    totalDuration,
    fps,
  ]);

  if (activeView === 'home') {
    return (
      <HomePage
        projects={projects}
        currentProjectId={currentProjectId}
        isLoading={isProjectsLoading}
        onOpenProject={(id) => void handleOpenProject(id)}
        onCreateProject={(opts) => void handleCreateProject(opts)}
        onDeleteProject={handleDeleteProject}
        onDuplicateProject={handleDuplicateProject}
        onRenameProject={handleRenameProject}
        onImportProjectFile={handleImportProjectFile}
      />
    );
  }

  return (
    <div className="animate-fc-editor-enter h-[100dvh] w-screen flex flex-col bg-[#0B0D11] text-slate-100 overflow-hidden">
      <TopBar
        projectName={projectName}
        onGoHome={() => void handleGoHome()}
        aspectRatio={aspectRatio}
        onChangeAspectRatio={setAspectRatio}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onResetSample={handleResetSample}
        onSaveProject={() => void handleSaveProject()}
        onSaveProjectAs={() => void handleSaveProjectAs()}
        isProjectSavedFlash={isProjectSavedFlash}
        savedFileName={savedFileName}
        savedFolderPath={savedFolderPath}
        lastAutoSavedAt={lastAutoSavedAt}
        hasSavedOnce={hasSavedOnce}
        onOpenExport={() => {
          setIsPlaying(false);
          setIsExportOpen(true);
        }}
        hasClips={clips.length > 0}
        hasContent={clips.length > 0 || assets.length > 0}
        onOpenProperties={setPropertiesTarget}
      />

      {/* Main 3-Pane Studio Workspace */}
      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
        <MediaBin
          assets={assets}
          customFonts={customFonts}
          customMasks={customMasks}
          downloadedTransitionIds={downloadedTransitionIds}
          downloadedEffectKeys={downloadedEffectKeys}
          hasSelectedClip={selectedClips.some((c) => !isAudioTrack(c.track))}
          hasSelectedVisualClip={selectedClips.some((c) => isVisualTrack(c.track))}
          hasRenderableClips={clips.some((c) => !isAudioTrack(c.track))}
          onImportFiles={handleImportFiles}
          onImportFonts={handleImportFonts}
          onOpenAutoFonts={() => setIsFontLibraryOpen(true)}
          onOpenCustomMaskModal={() => setIsCustomMaskModalOpen(true)}
          onOpenProperties={setPropertiesTarget}
          onDownloadTransition={handleDownloadTransition}
          onDownloadAllTransitions={handleDownloadAllTransitions}
          onApplyTransition={handleApplyTransition}
          onQuickAddTransition={handleQuickAddTransition}
          onApplyTransitionToAll={handleApplyTransitionToAll}
          onDownloadEffectItem={handleDownloadEffectItem}
          onDownloadAllEffects={handleDownloadAllEffects}
          onDownloadAllFrames={handleDownloadAllFrames}
          onDownloadAllMasks={handleDownloadAllMasks}
          onDownloadAllAnimations={handleDownloadAllAnimations}
          onDownloadAllCaptionPresets={handleDownloadAllCaptionPresets}
          onApplyVisualEffect={handleApplyVisualEffect}
          onApplyFramePreset={handleApplyFramePreset}
          onApplyMaskPreset={handleApplyMaskPreset}
          onApplyCustomMask={handleApplyCustomMask}
          onApplyAnimationPreset={handleApplyAnimationPreset}
          onAddAssetToTimeline={(asset) => handleAddAssetToTimeline(asset)}
          onAddAssetsToTimeline={(batch) => handleAddAssetsSerialToTimeline(batch)}
          onAddTitleTemplate={handleAddTitleTemplate}
          onAddSticker={(preset) => handleAddSticker(preset)}
          onAddSfxToTimeline={(presetId) => void handleAddSfxToTimeline(presetId)}
          onDownloadAllTitleTemplates={handleDownloadAllTitleTemplates}
          customTitleTemplates={customTitleTemplates}
          onSaveCustomTitleTemplate={handleSaveCustomTitleTemplate}
          onDeleteCustomTitleTemplate={handleDeleteCustomTitleTemplate}
          captionCount={captionCount}
          defaultCaptionConfig={defaultCaptionConfig}
          autoSyncCaptions={autoSyncCaptions}
          onChangeAutoSyncCaptions={setAutoSyncCaptions}
          onChangeDefaultCaptionConfig={handleChangeDefaultCaptionConfig}
          onApplyCaptionStyleToAll={handleApplyCaptionStyleToAll}
          onGenerateCaptions={handleGenerateCaptions}
          onAutoDetectAudioCaptions={handleAutoDetectAudioCaptions}
          onOfflineWhisperCaptions={handleOfflineWhisperCaptions}
          onOfflineSyncAudioCaptions={handleOfflineSyncAudioCaptions}
          onTranslateCaptions={handleTranslateCaptions}
          isAutoCaptionLoading={isAutoCaptionLoading}
          autoCaptionStatus={autoCaptionStatus}
          onDismissAutoCaptionStatus={() => setAutoCaptionStatus(null)}
          onExportCaptionsSrt={handleExportCaptionsSrt}
          onExportCaptionsVtt={handleExportCaptionsVtt}
          onExportCaptionsAss={handleExportCaptionsAss}
          onExportCaptionsTxt={handleExportCaptionsTxt}
          onClearCaptions={handleClearCaptions}
          captionClips={captionClips}
          currentTime={currentTime}
          onSeek={handleSeek}
          onUpdateCaptionText={handleUpdateCaptionCueText}
          onDeleteCaptionCue={handleDeleteCaptionCue}
          onOpenCaptionStudio={() => setIsCaptionStudioOpen(true)}
          onOpenTextStudio={(seed) => {
            setTextStudioSeed(seed ?? TEXT_STUDIO_PRESETS[0]);
            setIsTextStudioOpen(true);
          }}
          isImporting={isImporting}
          defaultImageDuration={defaultImageDuration}
          onChangeDefaultImageDuration={handleChangeDefaultImageDuration}
          width={panelSizes.mediaWidth}
        />

        {/* Vertical Resize Handle: MediaBin <-> Preview */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize media panel"
          onPointerDown={(e) => startResize('media', e)}
          onDoubleClick={() => setPanelSizes((p) => ({ ...p, mediaWidth: 272 }))}
          title="Drag to resize media library (double-click to reset)"
          className="w-2 -mx-1 z-20 cursor-col-resize shrink-0 flex items-center justify-center group"
        >
          <div
            className={`w-[2px] h-full transition-colors ${
              activeResizer === 'media'
                ? 'bg-gradient-to-b from-cyan-400 via-purple-500 to-pink-500'
                : 'bg-transparent group-hover:bg-gradient-to-b group-hover:from-cyan-400 group-hover:via-purple-500 group-hover:to-pink-500'
            }`}
          />
        </div>

        <PreviewCanvas
          aspectRatio={aspectRatio}
          fps={fps}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          isMuted={isMuted}
          previewVolume={previewVolume}
          previewScale={previewScale}
          clips={clips}
          assets={allAssets}
          mediaMap={mediaMapRef.current}
          selectedClipId={primarySelectedClipId}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onToggleMute={handleToggleMute}
          onChangePreviewVolume={handleChangePreviewVolume}
          onTogglePreviewScale={() => setPreviewScale((prev) => (prev === 'auto' ? 'half' : 'auto'))}
          onSelectClip={(id) => setSelectedClipIds(id ? [id] : [])}
          onUpdateClipPosition={(id, x, y) => {
            const movedClip = clipsRef.current.find((c) => c.id === id);
            if (movedClip?.textConfig?.isCaption) {
              handleUpdateClip(
                id,
                {
                  x,
                  y,
                  textConfig: {
                    ...movedClip.textConfig,
                    captionPosition: 'custom',
                    captionX: x,
                    captionY: y,
                  },
                },
                false
              );
            } else {
              handleUpdateClip(id, { x, y }, false);
            }
          }}
          onUpdateClipScale={(id, scale, isCaption) => {
            const clamped = clamp(scale, 15, 500);
            if (isCaption && autoSyncCaptions) {
              setDefaultCaptionConfig((prev) => ({ ...prev, captionScale: clamped }));
              commitClips(
                (prev) =>
                  prev.map((c) =>
                    isTitleTrack(c.track) &&
                    c.textConfig?.isCaption &&
                    !getTrackControl(trackSettingsRef.current, c.track).locked
                      ? {
                          ...c,
                          scale: clamped,
                          textConfig: { ...c.textConfig, captionScale: clamped },
                        }
                      : c
                  ),
                false
              );
            } else {
              commitClips(
                (prev) =>
                  prev.map((c) =>
                    c.id === id && !getTrackControl(trackSettingsRef.current, c.track).locked
                      ? {
                          ...c,
                          scale: clamped,
                          ...(c.textConfig?.isCaption
                            ? { textConfig: { ...c.textConfig, captionScale: clamped } }
                            : {}),
                        }
                      : c
                  ),
                false
              );
            }
          }}
          onUpdateTextFontSize={(id, fontSize) => {
            const resizedClip = clipsRef.current.find((c) => c.id === id);
            if (resizedClip?.textConfig) {
              handleUpdateClip(
                id,
                {
                  textConfig: { ...resizedClip.textConfig, fontSize },
                },
                false
              );
            }
          }}
          onUpdateStickerSize={handleUpdateStickerSize}
          onOpenProperties={setPropertiesTarget}
          trackSettings={trackSettings}
          fontRevision={customFonts.length}
        />

        {/* Vertical Resize Handle: Preview <-> Inspector */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize inspector panel"
          onPointerDown={(e) => startResize('inspector', e)}
          onDoubleClick={() => setPanelSizes((p) => ({ ...p, inspectorWidth: 308 }))}
          title="Drag to resize inspector (double-click to reset)"
          className="w-2 -mx-1 z-20 cursor-col-resize shrink-0 flex items-center justify-center group"
        >
          <div
            className={`w-[2px] h-full transition-colors ${
              activeResizer === 'inspector'
                ? 'bg-sky-400'
                : 'bg-transparent group-hover:bg-sky-400/75'
            }`}
          />
        </div>

        <Inspector
          projectName={projectName}
          onChangeProjectName={setProjectName}
          aspectRatio={aspectRatio}
          fps={fps}
          onChangeFps={setFps}
          totalDuration={totalDuration}
          clipCount={clips.length}
          currentTime={currentTime}
          onSeek={handleSeek}
          selectedClips={selectedClips}
          selectedAsset={selectedAsset}
          customFonts={customFonts}
          customMasks={customMasks}
          downloadedTransitionIds={downloadedTransitionIds}
          downloadedEffectKeys={downloadedEffectKeys}
          onImportFonts={handleImportFonts}
          onOpenAutoFonts={() => setIsFontLibraryOpen(true)}
          onOpenCustomMaskModal={() => setIsCustomMaskModalOpen(true)}
          onApplyCustomMask={handleApplyCustomMask}
          onUpdateClip={handleUpdateClip}
          onBatchUpdateSelected={handleBatchUpdateSelected}
          onApplyCaptionStyleToAll={handleApplyCaptionStyleToAll}
          onDuplicateSelected={handleDuplicateSelected}
          onDeleteSelected={handleDeleteSelected}
          onClearSelection={() => setSelectedClipIds([])}
          adjacentPrevClip={adjacentPrevClip}
          adjacentNextClip={adjacentNextClip}
          onApplySeamTransition={handleApplySeamTransition}
          onApplyTransitionToAll={handleApplyTransitionToAll}
          onSetBatchDuration={handleSetBatchDuration}
          width={panelSizes.inspectorWidth}
        />
      </div>

      {/* Horizontal Resize Handle: Workspace <-> Timeline */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline panel"
        onPointerDown={(e) => startResize('timeline', e)}
        onDoubleClick={() => setPanelSizes((p) => ({ ...p, timelineHeight: 248 }))}
        title="Drag to resize timeline (double-click to reset)"
        className="h-2 -my-1 z-20 cursor-row-resize shrink-0 flex items-center justify-center group"
      >
        <div
          className={`h-[2px] w-full transition-colors ${
            activeResizer === 'timeline'
              ? 'bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500'
              : 'bg-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:via-purple-500 group-hover:to-pink-500'
          }`}
        />
      </div>

      {/* Bottom Multi-Track Timeline */}
      <Timeline
        clips={clips}
        assets={allAssets}
        currentTime={currentTime}
        totalDuration={totalDuration}
        selectedClipIds={selectedClipIds}
        onChangeSelection={(ids) => {
          setSelectedTrackId(null);
          selectedTrackIdRef.current = null;
          setSelectedClipIds(ids);
        }}
        onSelectAll={handleSelectAllTimeline}
        onSeek={handleSeek}
        onMoveClips={handleMoveClips}
        onTrimClip={(id, startTime, duration, sourceOffset, record) =>
          handleUpdateClip(id, { startTime, duration, sourceOffset }, record)
        }
        onSplitAtPlayhead={handleSplitAtPlayhead}
        onDuplicateSelected={handleDuplicateSelected}
        onDeleteSelected={handleDeleteSelected}
        onAddQuickText={() => {
          setTextStudioSeed(TEXT_STUDIO_PRESETS[0]);
          setIsTextStudioOpen(true);
        }}
        onOpenCaptions={() => setIsCaptionStudioOpen(true)}
        onDropAssetsAtTime={(assetIds, dropTime, targetTrackId) => {
          const found = assetIds
            .map((id) => allAssets.find((a) => a.id === id))
            .filter((a): a is MediaAsset => Boolean(a));
          handleAddAssetsSerialToTimeline(found, dropTime, targetTrackId);
        }}
        onDropStickerAtTime={handleDropStickerAtTime}
        onDropSfxAtTime={handleDropSfxAtTime}
        onDropTransitionOnClip={(clipId, transitionType) => {
          const preset = TRANSITIONS_CATALOG.find((t) => t.id === transitionType);
          handleUpdateClip(clipId, {
            transitionIn: transitionType,
            transitionInDuration: preset?.defaultDuration ?? 0.5,
          });
          setSelectedClipIds([clipId]);
        }}
        onDropEffectOnClip={(clipId, fxPreset) => {
          const info = VISUAL_EFFECT_PRESETS.find((x) => x.id === fxPreset);
          handleUpdateClip(clipId, {
            fxPreset,
            fxIntensity: fxPreset === 'none' ? 0 : 75,
            ...(info && info.defaultGlowIntensity > 0
              ? {
                  glowColor: info.defaultGlowColor,
                  glowIntensity: info.defaultGlowIntensity,
                }
              : {}),
          });
          setSelectedClipIds([clipId]);
        }}
        onDropFrameOnClip={(clipId, framePreset) => {
          const info = FRAME_PRESETS.find((f) => f.id === framePreset);
          handleUpdateClip(clipId, {
            framePreset,
            frameColor: info?.defaultColor ?? '#38BDF8',
            frameThickness: 50,
          });
          setSelectedClipIds([clipId]);
        }}
        onDropMaskOnClip={(clipId, maskShape, customMaskId) => {
          if (maskShape === 'custom' && customMaskId) {
            const found = customMasks.find((m) => m.id === customMaskId);
            if (found) {
              handleUpdateClip(clipId, {
                maskShape: 'custom',
                customMaskId: found.id,
                customMaskDataUrl: found.dataUrl,
                maskCenterX: 0,
                maskCenterY: 0,
                maskWidth: 75,
                maskHeight: 75,
                maskFeather: 2,
              });
              setSelectedClipIds([clipId]);
            }
          } else {
            handleUpdateClip(clipId, {
              maskShape,
              customMaskId: undefined,
              customMaskDataUrl: undefined,
              maskCenterX: 0,
              maskCenterY: 0,
              maskWidth: 65,
              maskHeight: 65,
              maskFeather: 4,
            });
            setSelectedClipIds([clipId]);
          }
        }}
        onDropAnimationOnClip={(clipId, animationId) => {
          const preset = ANIMATION_PRESETS.find((a) => a.id === animationId);
          const category = preset?.category ?? 'In';
          const dur = preset?.defaultDuration ?? 0.5;
          if (animationId === 'none') {
            handleUpdateClip(clipId, {
              animationIn: 'none',
              animationOut: 'none',
              animationCombo: 'none',
            });
          } else if (category === 'Out') {
            handleUpdateClip(clipId, {
              animationOut: animationId,
              animationOutDuration: dur,
            });
          } else if (category === 'Combo') {
            if (animationId === 'pan-zoom') {
              const target = clipsRef.current.find((c) => c.id === clipId);
              if (target && isVisualTrack(target.track)) {
                handleUpdateClip(clipId, {
                  ...buildPanZoomClipPatch(target),
                  animationCombo: 'pan-zoom',
                });
              } else {
                handleUpdateClip(clipId, { animationCombo: 'pan-zoom' });
              }
            } else {
              handleUpdateClip(clipId, {
                animationCombo: animationId,
              });
            }
          } else {
            handleUpdateClip(clipId, {
              animationIn: animationId,
              animationInDuration: dur,
            });
          }
          setSelectedClipIds([clipId]);
        }}
        onOpenProperties={setPropertiesTarget}
        snapEnabled={snapEnabled}
        onChangeSnapEnabled={setSnapEnabled}
        pixelsPerSecond={timelineZoom}
        onChangePixelsPerSecond={setTimelineZoom}
        trackSettings={trackSettings}
        extraTrackIds={extraTrackIds}
        onAddTrack={handleAddTrack}
        onRemoveEmptyTrack={handleRemoveEmptyTrack}
        onToggleTrackLock={handleToggleTrackLock}
        onToggleTrackHide={handleToggleTrackHide}
        selectedTrackId={selectedTrackId}
        onSelectTrack={handleSelectTrack}
        onDuplicateTrack={handleDuplicateTrack}
        downloadedTransitionIds={downloadedTransitionIds}
        onApplySeamTransition={handleApplySeamTransition}
        onApplyTransitionToAll={handleApplyTransitionToAll}
        onResizeTransition={handleResizeTransition}
        onChangeClipVolume={handleChangeClipVolume}
        onChangeTrackVolume={handleChangeTrackVolume}
        onSetBatchDuration={handleSetBatchDuration}
        height={panelSizes.timelineHeight}
      />

      <FamousFontsModal
        isOpen={isFontLibraryOpen}
        onClose={() => setIsFontLibraryOpen(false)}
        customFonts={customFonts}
        hasSelectedTitle={selectedClips.some((c) => isTitleTrack(c.track) && Boolean(c.textConfig))}
        onDownloadAutoFont={handleDownloadAutoFont}
        onUseFont={(family) => {
          const selectedTitleIds = selectedClips
            .filter(
              (c) =>
                isTitleTrack(c.track) &&
                Boolean(c.textConfig) &&
                !getTrackControl(trackSettingsRef.current, c.track).locked
            )
            .map((c) => c.id);
          if (selectedTitleIds.length > 0) {
            const idSet = new Set(selectedTitleIds);
            commitClips((prev) =>
              prev.map((c) =>
                idSet.has(c.id) && c.textConfig
                  ? { ...c, textConfig: { ...c.textConfig, fontFamily: family } }
                  : c
              )
            );
          } else {
            handleAddTitleTemplate(family, {
              text: family,
              fontFamily: family,
              fontSize: 72,
              fontWeight: 700,
              color: '#FFFFFF',
              align: 'center',
              hasScrim: false,
              scrimOpacity: 60,
              animation: 'slide-up',
            });
          }
        }}
      />

      <CustomMaskModal
        isOpen={isCustomMaskModalOpen}
        hasSelectedVisualClip={selectedClips.some((c) => isVisualTrack(c.track))}
        onClose={() => setIsCustomMaskModalOpen(false)}
        onSaveCustomMask={handleSaveCustomMask}
      />

      <PropertiesModal
        target={propertiesTarget}
        onClose={() => setPropertiesTarget(null)}
        assets={assets}
        clips={clips}
        selectedClips={selectedClips}
        customFonts={customFonts}
        customMasks={customMasks}
        downloadedTransitionIds={downloadedTransitionIds}
        downloadedEffectKeys={downloadedEffectKeys}
        aspectRatio={aspectRatio}
        fps={fps}
        projectName={projectName}
        currentTime={currentTime}
        totalDuration={totalDuration}
        snapEnabled={snapEnabled}
        timelineZoom={timelineZoom}
        isPlaying={isPlaying}
        isMuted={isMuted}
        previewVolume={previewVolume}
        previewScale={previewScale}
        hasSavedOnce={hasSavedOnce}
        savedFileName={savedFileName}
        onUpdateAsset={handleUpdateAsset}
        onSyncAssetToClips={handleSyncAssetToClips}
        onAddAssetToTimeline={(asset) => handleAddAssetToTimeline(asset)}
        onDeleteAsset={handleDeleteAsset}
        onUpdateClip={handleUpdateClip}
        onDuplicateClip={handleDuplicateSingleClip}
        onSplitAtPlayhead={handleSplitAtPlayhead}
        onDeleteClip={handleDeleteSingleClip}
        onApplyEffectWithSettings={handleApplyEffectWithSettings}
        onApplyFrameWithSettings={handleApplyFrameWithSettings}
        onApplyMaskWithSettings={handleApplyMaskWithSettings}
        onApplyTransitionWithSettings={handleApplyTransitionWithSettings}
        onApplyTransitionToAll={handleApplyTransitionToAll}
        onApplyAnimationWithSettings={handleApplyAnimationWithSettings}
        onDownloadEffectItem={handleDownloadEffectItem}
        onDownloadTransition={handleDownloadTransition}
        onAddTitleTemplate={handleAddTitleTemplate}
        defaultCaptionConfig={defaultCaptionConfig}
        onChangeDefaultCaptionConfig={handleChangeDefaultCaptionConfig}
        onApplyCaptionStyleToAll={handleApplyCaptionStyleToAll}
        onChangeAspectRatio={setAspectRatio}
        onChangeFps={setFps}
        onChangeProjectName={setProjectName}
        onChangeSnapEnabled={setSnapEnabled}
        onChangeTimelineZoom={setTimelineZoom}
        onChangePreviewVolume={handleChangePreviewVolume}
        onTriggerToolAction={handleTriggerToolAction}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        projectName={projectName}
        aspectRatio={aspectRatio}
        defaultFps={fps}
        clips={clips}
        assets={allAssets}
        totalDuration={totalDuration}
        trackSettings={trackSettings}
      />

      <SaveLocationModal
        isOpen={isSaveLocationOpen}
        mode={saveModalMode}
        projectName={projectName}
        defaultFileName={defaultSaveFileName}
        defaultFolderPath={savedFolderPath ?? undefined}
        hasLinkedSystemFolder={Boolean(projectDirHandleRef.current)}
        onClose={() => setIsSaveLocationOpen(false)}
        onConfirmSaveFile={(fileName, folderPath, pickedHandles) =>
          void handleConfirmFallbackSaveFile(fileName, folderPath, pickedHandles)
        }
        onDownloadProjectJson={(fileName) => void handleDownloadProjectJson(fileName)}
      />

      <CaptionStudioModal
        isOpen={isCaptionStudioOpen}
        onClose={() => setIsCaptionStudioOpen(false)}
        captionCount={captionCount}
        customFonts={customFonts}
        downloadedEffectKeys={downloadedEffectKeys}
        onDownloadEffectItem={handleDownloadEffectItem}
        onDownloadAllCaptionPresets={handleDownloadAllCaptionPresets}
        defaultCaptionConfig={defaultCaptionConfig}
        autoSyncCaptions={autoSyncCaptions}
        onChangeAutoSyncCaptions={setAutoSyncCaptions}
        onChangeDefaultCaptionConfig={handleChangeDefaultCaptionConfig}
        onApplyCaptionStyleToAll={handleApplyCaptionStyleToAll}
        onGenerateCaptions={handleGenerateCaptions}
        onAddSingleCaptionCue={handleAddSingleCaptionCue}
        onAutoDetectAudioCaptions={handleAutoDetectAudioCaptions}
        onOfflineWhisperCaptions={handleOfflineWhisperCaptions}
        onOfflineSyncAudioCaptions={handleOfflineSyncAudioCaptions}
        onTranslateCaptions={handleTranslateCaptions}
        isAutoCaptionLoading={isAutoCaptionLoading}
        autoCaptionStatus={autoCaptionStatus}
        onDismissAutoCaptionStatus={() => setAutoCaptionStatus(null)}
        onExportCaptionsSrt={handleExportCaptionsSrt}
        onExportCaptionsVtt={handleExportCaptionsVtt}
        onExportCaptionsAss={handleExportCaptionsAss}
        onExportCaptionsTxt={handleExportCaptionsTxt}
        onClearCaptions={handleClearCaptions}
        captionClips={captionClips}
        currentTime={currentTime}
        onSeek={handleSeek}
        onUpdateCaptionText={handleUpdateCaptionCueText}
        onDeleteCaptionCue={handleDeleteCaptionCue}
        onOpenAutoFonts={() => setIsFontLibraryOpen(true)}
      />

      <TextStudioModal
        isOpen={isTextStudioOpen}
        onClose={() => setIsTextStudioOpen(false)}
        initialSeed={textStudioSeed}
        currentTime={currentTime}
        customFonts={customFonts}
        availableTitleTracks={getOrderedTracks(clips, extraTrackIds, trackSettings)
          .filter((t) => t.kind === 'T')
          .map((t) => t.id)}
        selectedTextClip={
          selectedClips.find((c) => isTitleTrack(c.track) && Boolean(c.textConfig)) ?? null
        }
        onOpenAutoFonts={() => setIsFontLibraryOpen(true)}
        onInsertAdvancedText={handleInsertAdvancedText}
        onUpdateSelectedTextClip={(id, patch) => handleUpdateClip(id, patch, true)}
        onSaveAsTemplate={handleSaveCustomTitleTemplate}
        onRescaleAllText={(nextScale, nextFontSize) => {
          const clampedScale = clamp(nextScale, 10, 600);
          commitClips((prev) =>
            prev.map((c) => {
              if (
                !isTitleTrack(c.track) ||
                !c.textConfig ||
                c.textConfig.isCaption ||
                getTrackControl(trackSettingsRef.current, c.track).locked
              ) {
                return c;
              }
              return {
                ...c,
                scale: clampedScale,
                textConfig:
                  nextFontSize !== undefined
                    ? { ...c.textConfig, fontSize: clamp(nextFontSize, 4, 600) }
                    : c.textConfig,
              };
            })
          );
        }}
      />

      <OfflineIndicator />
    </div>
  );
}
