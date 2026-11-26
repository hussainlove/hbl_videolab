import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Captions,
  Check,
  CheckSquare,
  Copy,
  Eye,
  EyeOff,
  Film,
  Lock,
  Magnet,
  Music,
  Plus,
  Scissors,
  Search,
  Smile,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ClipAnimationPreset,
  ContextPropertiesTarget,
  DEFAULT_TRACK_SETTINGS,
  FramePreset,
  getOrderedTracks,
  getTrackControl,
  getTrackKind,
  MaskShape,
  MediaAsset,
  TimelineClip,
  TrackDescriptor,
  TrackId,
  TrackKind,
  TrackSettingsMap,
  TransitionType,
  VisualEffectPreset,
} from '../types/editor';
import { TRANSITIONS_CATALOG } from '../utils/transitionsStorage';
import { clamp, formatShortTime, snapTime } from '../utils/time';

interface TimelineProps {
  clips: TimelineClip[];
  assets: MediaAsset[];
  currentTime: number;
  totalDuration: number;
  selectedClipIds: string[];
  onChangeSelection: (ids: string[]) => void;
  onSelectAll: () => void;
  onSeek: (time: number) => void;
  onMoveClips: (
    updates: Array<{ id: string; startTime: number; track?: TrackId }>,
    recordHistory?: boolean
  ) => void;
  onTrimClip: (
    id: string,
    newStartTime: number,
    newDuration: number,
    newSourceOffset: number,
    recordHistory?: boolean
  ) => void;
  onSplitAtPlayhead: (splitAnyIfUnselected?: boolean) => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onAddQuickText: () => void;
  onOpenCaptions?: () => void;
  onDropAssetsAtTime: (assetIds: string[], time: number, targetTrackId?: TrackId) => void;
  onDropStickerAtTime?: (stickerId: string, time: number, targetTrackId?: TrackId) => void;
  onDropSfxAtTime?: (presetId: string, time: number, targetTrackId?: TrackId) => void;
  onDropTransitionOnClip?: (clipId: string, transitionType: TransitionType) => void;
  onDropEffectOnClip?: (clipId: string, fxPreset: VisualEffectPreset) => void;
  onDropFrameOnClip?: (clipId: string, framePreset: FramePreset) => void;
  onDropMaskOnClip?: (clipId: string, maskShape: MaskShape, customMaskId?: string) => void;
  onDropAnimationOnClip?: (clipId: string, animationId: ClipAnimationPreset) => void;
  onOpenProperties: (target: ContextPropertiesTarget) => void;
  snapEnabled: boolean;
  onChangeSnapEnabled: (enabled: boolean) => void;
  pixelsPerSecond: number;
  onChangePixelsPerSecond: (pps: number) => void;
  trackSettings?: TrackSettingsMap;
  extraTrackIds?: string[];
  onAddTrack?: (kind: TrackKind) => void;
  onRemoveEmptyTrack?: (trackId: TrackId) => void;
  onToggleTrackLock?: (trackId: TrackId) => void;
  onToggleTrackHide?: (trackId: TrackId) => void;
  selectedTrackId?: TrackId | null;
  onSelectTrack?: (trackId: TrackId | null) => void;
  onDuplicateTrack?: (trackId: TrackId) => void;
  downloadedTransitionIds?: TransitionType[];
  onApplySeamTransition?: (
    prevClipId: string,
    nextClipId: string,
    transitionType: TransitionType,
    duration: number
  ) => void;
  onApplyTransitionToAll?: (transitionType: TransitionType, duration: number) => void;
  onResizeTransition?: (
    clipId: string,
    edge: 'in' | 'out',
    duration: number,
    recordHistory?: boolean
  ) => void;
  onChangeClipVolume?: (
    clipId: string,
    volume: number,
    recordHistory?: boolean
  ) => void;
  onChangeTrackVolume?: (
    trackId: TrackId,
    volume: number,
    recordHistory?: boolean
  ) => void;
  onSetBatchDuration?: (durationSeconds: number, rippleSequence?: boolean) => void;
  height?: number;
}

function getTrackVisualMeta(track: TrackDescriptor) {
  if (track.kind === 'T') {
    return {
      heightPx: 44,
      badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
      accentClass: 'bg-violet-400/75',
      Icon: Type,
    };
  }
  if (track.kind === 'V') {
    return {
      heightPx: 56,
      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
      accentClass: 'bg-sky-400/80',
      Icon: Film,
    };
  }
  return {
    heightPx: 46,
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    accentClass: 'bg-emerald-400/80',
    Icon: Music,
  };
}

interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Timeline({
  clips,
  assets,
  currentTime,
  totalDuration,
  selectedClipIds,
  onChangeSelection,
  onSelectAll,
  onSeek,
  onMoveClips,
  onTrimClip,
  onSplitAtPlayhead,
  onDuplicateSelected,
  onDeleteSelected,
  onAddQuickText,
  onOpenCaptions,
  onDropAssetsAtTime,
  onDropStickerAtTime,
  onDropSfxAtTime,
  onDropTransitionOnClip,
  onDropEffectOnClip,
  onDropFrameOnClip,
  onDropMaskOnClip,
  onDropAnimationOnClip,
  onOpenProperties,
  snapEnabled,
  onChangeSnapEnabled,
  pixelsPerSecond,
  onChangePixelsPerSecond,
  trackSettings = DEFAULT_TRACK_SETTINGS,
  extraTrackIds = [],
  onAddTrack,
  onRemoveEmptyTrack,
  onToggleTrackLock,
  onToggleTrackHide,
  selectedTrackId = null,
  onSelectTrack,
  onDuplicateTrack,
  downloadedTransitionIds = [],
  onApplySeamTransition,
  onApplyTransitionToAll,
  onResizeTransition,
  onChangeClipVolume,
  onChangeTrackVolume,
  onSetBatchDuration,
  height = 248,
}: TimelineProps) {
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(600);
  const [batchDurDraft, setBatchDurDraft] = useState('4');
  const [resizingTransInfo, setResizingTransInfo] = useState<{
    clipId: string;
    edge: 'in' | 'out';
    duration: number;
  } | null>(null);
  const [draggingClipVolume, setDraggingClipVolume] = useState<{
    clipId: string;
    volume: number;
  } | null>(null);
  const [draggingTrackVolume, setDraggingTrackVolume] = useState<{
    trackId: TrackId;
    volume: number;
  } | null>(null);
  const [seamPopover, setSeamPopover] = useState<{
    prevClipId: string;
    nextClipId: string;
    prevName: string;
    nextName: string;
    trackId: TrackId;
    activeType: TransitionType;
    duration: number;
    leftPx: number;
  } | null>(null);
  const [seamSearch, setSeamSearch] = useState('');

  const timelineRootRef = useRef<HTMLElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const labelsScrollRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const trackRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const syncingScrollRef = useRef<'tracks' | 'labels' | null>(null);
  const anchorClipIdRef = useRef<string | null>(null);

  const availableTransitions = useMemo(() => {
    const installed = new Set(downloadedTransitionIds);
    return TRANSITIONS_CATALOG.filter((t) => t.builtIn || installed.has(t.id));
  }, [downloadedTransitionIds]);

  const filteredSeamTransitions = useMemo(() => {
    const q = seamSearch.trim().toLowerCase();
    if (!q) return availableTransitions;
    return availableTransitions.filter(
      (t) =>
        t.id === seamPopover?.activeType ||
        t.label.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [availableTransitions, seamSearch, seamPopover?.activeType]);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const selectedSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);
  const effectiveTrackSettings = trackSettings ?? DEFAULT_TRACK_SETTINGS;

  const orderedTracks = useMemo(
    () => getOrderedTracks(clips, extraTrackIds, effectiveTrackSettings),
    [clips, extraTrackIds, effectiveTrackSettings]
  );

  const timelineSpanSeconds = Math.max(20, Math.ceil(totalDuration + 10));
  const timelineWidthPx = timelineSpanSeconds * pixelsPerSecond;
  const maxScrollLeft = Math.max(0, timelineWidthPx - viewportWidth);

  useEffect(() => {
    const el = tracksScrollRef.current;
    if (!el) return;
    const updateWidth = () => setViewportWidth(Math.max(120, el.clientWidth));
    updateWidth();
    const obs = new ResizeObserver(updateWidth);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleTracksScroll = () => {
    const el = tracksScrollRef.current;
    if (!el) return;
    if (rulerScrollRef.current) {
      rulerScrollRef.current.scrollLeft = el.scrollLeft;
    }
    setScrollLeft(el.scrollLeft);
    if (syncingScrollRef.current !== 'labels' && labelsScrollRef.current) {
      syncingScrollRef.current = 'tracks';
      labelsScrollRef.current.scrollTop = el.scrollTop;
      requestAnimationFrame(() => {
        if (syncingScrollRef.current === 'tracks') syncingScrollRef.current = null;
      });
    }
  };

  const handleLabelsScroll = () => {
    const el = labelsScrollRef.current;
    if (!el) return;
    if (syncingScrollRef.current !== 'tracks' && tracksScrollRef.current) {
      syncingScrollRef.current = 'labels';
      tracksScrollRef.current.scrollTop = el.scrollTop;
      requestAnimationFrame(() => {
        if (syncingScrollRef.current === 'labels') syncingScrollRef.current = null;
      });
    }
  };

  const canSplit = useMemo(() => {
    if (selectedClipIds.length === 0) return false;
    return clips.some(
      (c) =>
        selectedSet.has(c.id) &&
        !getTrackControl(effectiveTrackSettings, c.track).locked &&
        currentTime > c.startTime + 0.1 &&
        currentTime < c.startTime + c.duration - 0.1
    );
  }, [clips, selectedClipIds.length, selectedSet, currentTime, effectiveTrackSettings]);

  const canSplitAny = useMemo(
    () =>
      clips.some(
        (c) =>
          !getTrackControl(effectiveTrackSettings, c.track).locked &&
          currentTime > c.startTime + 0.1 &&
          currentTime < c.startTime + c.duration - 0.1
      ),
    [clips, currentTime, effectiveTrackSettings]
  );

  const getSnapPoints = (excludeIds: Set<string>): number[] => {
    if (!snapEnabled) return [];
    const points = [0, currentTime];
    for (const c of clips) {
      if (excludeIds.has(c.id)) continue;
      points.push(c.startTime, c.startTime + c.duration);
    }
    return points;
  };

  const focusTimeline = () => {
    timelineRootRef.current?.focus({ preventScroll: true });
  };

  const handleTimelineKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      onSelectAll();
    }
  };

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    focusTimeline();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const updateFromEvent = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, rect.width);
      onSeek(Number((x / pixelsPerSecond).toFixed(3)));
    };

    updateFromEvent(e.clientX);

    const onMove = (moveEv: PointerEvent) => updateFromEvent(moveEv.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const findHoveredTrackAtClientY = (clientY: number): TrackDescriptor | null => {
    for (const track of orderedTracks) {
      const row = trackRowRefs.current[track.id];
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return track;
      }
    }
    return null;
  };

  const handleTracksAreaPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    focusTimeline();
    const area = tracksAreaRef.current;
    if (!area) return;

    const areaRect = area.getBoundingClientRect();
    const startX = clamp(e.clientX - areaRect.left, 0, areaRect.width);
    const startY = clamp(e.clientY - areaRect.top, 0, areaRect.height);
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    const baseSelection = additive ? [...selectedClipIds] : [];
    let dragged = false;

    const getTrackYBounds = (trackId: TrackId): { top: number; bottom: number } => {
      const rowEl = trackRowRefs.current[trackId];
      if (rowEl) {
        return { top: rowEl.offsetTop, bottom: rowEl.offsetTop + rowEl.offsetHeight };
      }
      return { top: 0, bottom: 0 };
    };

    const onMove = (moveEv: PointerEvent) => {
      const curX = clamp(moveEv.clientX - areaRect.left, 0, areaRect.width);
      const curY = clamp(moveEv.clientY - areaRect.top, 0, areaRect.height);
      if (Math.abs(curX - startX) > 4 || Math.abs(curY - startY) > 4) {
        dragged = true;
      }
      if (!dragged) return;

      const box: MarqueeBox = {
        left: Math.min(startX, curX),
        top: Math.min(startY, curY),
        width: Math.abs(curX - startX),
        height: Math.abs(curY - startY),
      };
      setMarqueeBox(box);

      const boxRight = box.left + box.width;
      const boxBottom = box.top + box.height;
      const hitIds: string[] = [];

      for (const clip of clips) {
        const clipLeft = clip.startTime * pixelsPerSecond;
        const clipRight = clipLeft + Math.max(18, clip.duration * pixelsPerSecond);
        const { top, bottom } = getTrackYBounds(clip.track);

        const intersectsX = clipLeft <= boxRight && clipRight >= box.left;
        const intersectsY = top <= boxBottom && bottom >= box.top;
        if (intersectsX && intersectsY) {
          hitIds.push(clip.id);
        }
      }

      if (additive) {
        const merged = Array.from(new Set([...baseSelection, ...hitIds]));
        onChangeSelection(merged);
      } else {
        onChangeSelection(hitIds);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setMarqueeBox(null);
      if (!dragged && !additive) {
        onChangeSelection([]);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startClipDrag = (e: React.PointerEvent, clip: TimelineClip) => {
    e.stopPropagation();
    focusTimeline();

    const isToggleMod = e.metaKey || e.ctrlKey;
    const isRangeMod = e.shiftKey;

    if (isToggleMod) {
      const exists = selectedSet.has(clip.id);
      const next = exists
        ? selectedClipIds.filter((id) => id !== clip.id)
        : [...selectedClipIds, clip.id];
      onChangeSelection(next);
      anchorClipIdRef.current = clip.id;
      return;
    }

    if (isRangeMod && anchorClipIdRef.current) {
      const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
      const idxA = sorted.findIndex((c) => c.id === anchorClipIdRef.current);
      const idxB = sorted.findIndex((c) => c.id === clip.id);
      if (idxA !== -1 && idxB !== -1) {
        const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        const rangeIds = sorted.slice(lo, hi + 1).map((c) => c.id);
        onChangeSelection(Array.from(new Set([...selectedClipIds, ...rangeIds])));
        return;
      }
    }

    const dragSelectionIds = selectedSet.has(clip.id) ? selectedClipIds : [clip.id];
    if (!selectedSet.has(clip.id)) {
      onChangeSelection([clip.id]);
    }
    anchorClipIdRef.current = clip.id;

    if (getTrackControl(effectiveTrackSettings, clip.track).locked) {
      return;
    }

    const dragSet = new Set(dragSelectionIds);
    const dragClips = clips.filter(
      (c) => dragSet.has(c.id) && !getTrackControl(effectiveTrackSettings, c.track).locked
    );
    if (dragClips.length === 0) return;

    const origStarts = new Map(dragClips.map((c) => [c.id, c.startTime]));
    const minOrigStart = Math.min(...dragClips.map((c) => c.startTime));
    const draggedKind = getTrackKind(clip.track);
    const canSwitchTrack = dragClips.every((c) => getTrackKind(c.track) === draggedKind);

    const startX = e.clientX;
    const startY = e.clientY;
    const origDraggedStart = clip.startTime;
    const snapPoints = getSnapPoints(dragSet);
    const snapThreshold = 10 / pixelsPerSecond;
    let moved = false;

    const computeGroupUpdates = (clientX: number, clientY: number) => {
      const dx = clientX - startX;
      let targetDraggedStart = Math.max(0, origDraggedStart + dx / pixelsPerSecond);

      if (snapEnabled) {
        const startSnap = snapTime(targetDraggedStart, snapPoints, snapThreshold);
        const endSnap = snapTime(targetDraggedStart + clip.duration, snapPoints, snapThreshold);
        if (startSnap.snappedTo !== null) {
          targetDraggedStart = startSnap.time;
          setActiveSnapLine(startSnap.snappedTo);
        } else if (endSnap.snappedTo !== null) {
          targetDraggedStart = Math.max(0, endSnap.time - clip.duration);
          setActiveSnapLine(endSnap.snappedTo);
        } else {
          setActiveSnapLine(null);
        }
      }

      const rawDelta = targetDraggedStart - origDraggedStart;
      const safeDelta = Math.max(-minOrigStart, rawDelta);

      let nextTrackForGroup: TrackId | undefined;
      if (canSwitchTrack) {
        const hovered = findHoveredTrackAtClientY(clientY);
        if (
          hovered &&
          hovered.kind === draggedKind &&
          !getTrackControl(effectiveTrackSettings, hovered.id).locked
        ) {
          nextTrackForGroup = hovered.id;
        }
      }

      return dragClips.map((c) => ({
        id: c.id,
        startTime: Number(((origStarts.get(c.id) ?? c.startTime) + safeDelta).toFixed(3)),
        ...(nextTrackForGroup ? { track: nextTrackForGroup } : {}),
      }));
    };

    const onMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      onMoveClips(computeGroupUpdates(moveEv.clientX, moveEv.clientY), false);
    };

    const onUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setActiveSnapLine(null);
      if (moved) {
        onMoveClips(computeGroupUpdates(upEv.clientX, upEv.clientY), true);
      } else if (dragSelectionIds.length > 1) {
        onChangeSelection([clip.id]);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startClipTrim = (
    e: React.PointerEvent,
    clip: TimelineClip,
    edge: 'left' | 'right'
  ) => {
    e.stopPropagation();
    focusTimeline();
    onChangeSelection([clip.id]);
    anchorClipIdRef.current = clip.id;
    if (getTrackControl(effectiveTrackSettings, clip.track).locked) return;

    const startX = e.clientX;
    const origStart = clip.startTime;
    const origDur = clip.duration;
    const origOffset = clip.sourceOffset;
    const asset = assetById.get(clip.assetId);
    const isBoundedMedia = asset?.type === 'video' || asset?.type === 'audio';
    const maxMediaDur = asset?.duration ?? 60;
    const snapPoints = getSnapPoints(new Set([clip.id]));
    const snapThreshold = 9 / pixelsPerSecond;

    const computeTrim = (clientX: number) => {
      const dt = (clientX - startX) / pixelsPerSecond;
      if (edge === 'left') {
        let nextStart = clamp(origStart + dt, 0, origStart + origDur - 0.25);
        if (snapEnabled) {
          const s = snapTime(nextStart, snapPoints, snapThreshold);
          if (s.snappedTo !== null) {
            nextStart = clamp(s.time, 0, origStart + origDur - 0.25);
            setActiveSnapLine(s.snappedTo);
          } else {
            setActiveSnapLine(null);
          }
        }
        const delta = nextStart - origStart;
        const nextOffset = isBoundedMedia
          ? clamp(origOffset + delta * clip.speed, 0, Math.max(0, maxMediaDur - 0.25))
          : origOffset;
        const actualDelta = isBoundedMedia ? (nextOffset - origOffset) / clip.speed : delta;
        const clampedStart = Math.max(0, origStart + actualDelta);
        const nextDur = Math.max(0.25, origDur - (clampedStart - origStart));
        return { start: clampedStart, duration: nextDur, offset: nextOffset };
      } else {
        let nextEnd = Math.max(origStart + 0.25, origStart + origDur + dt);
        if (snapEnabled) {
          const s = snapTime(nextEnd, snapPoints, snapThreshold);
          if (s.snappedTo !== null) {
            nextEnd = Math.max(origStart + 0.25, s.time);
            setActiveSnapLine(s.snappedTo);
          } else {
            setActiveSnapLine(null);
          }
        }
        let nextDur = nextEnd - origStart;
        if (isBoundedMedia) {
          const maxAvailDur = Math.max(0.25, (maxMediaDur - origOffset) / clip.speed);
          nextDur = Math.min(nextDur, maxAvailDur);
        }
        return { start: origStart, duration: nextDur, offset: origOffset };
      }
    };

    const onMove = (moveEv: PointerEvent) => {
      const res = computeTrim(moveEv.clientX);
      onTrimClip(
        clip.id,
        Number(res.start.toFixed(3)),
        Number(res.duration.toFixed(3)),
        Number(res.offset.toFixed(3)),
        false
      );
    };

    const onUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setActiveSnapLine(null);
      const res = computeTrim(upEv.clientX);
      onTrimClip(
        clip.id,
        Number(res.start.toFixed(3)),
        Number(res.duration.toFixed(3)),
        Number(res.offset.toFixed(3)),
        true
      );
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startTransitionResize = (
    e: React.PointerEvent,
    clip: TimelineClip,
    edge: 'in' | 'out'
  ) => {
    e.stopPropagation();
    focusTimeline();
    if (!onResizeTransition || getTrackControl(effectiveTrackSettings, clip.track).locked) return;

    const startX = e.clientX;
    const origDur =
      edge === 'in'
        ? clip.transitionInDuration ?? 0.5
        : clip.transitionOutDuration ?? 0.5;
    const maxDur = clamp(Number((clip.duration * 0.85).toFixed(2)), 0.2, 3.0);

    const computeDur = (clientX: number) => {
      const dx = clientX - startX;
      const deltaSeconds = (edge === 'in' ? dx : -dx) / pixelsPerSecond;
      return Number(clamp(origDur + deltaSeconds, 0.15, maxDur).toFixed(2));
    };

    setResizingTransInfo({ clipId: clip.id, edge, duration: origDur });

    const onMove = (moveEv: PointerEvent) => {
      const nextDur = computeDur(moveEv.clientX);
      setResizingTransInfo({ clipId: clip.id, edge, duration: nextDur });
      onResizeTransition(clip.id, edge, nextDur, false);
    };

    const onUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const nextDur = computeDur(upEv.clientX);
      setResizingTransInfo(null);
      onResizeTransition(clip.id, edge, nextDur, true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startClipVolumeDrag = (e: React.PointerEvent, clip: TimelineClip) => {
    e.stopPropagation();
    e.preventDefault();
    focusTimeline();
    if (!onChangeClipVolume || getTrackControl(effectiveTrackSettings, clip.track).locked) return;

    const startY = e.clientY;
    const origVol = clip.muted ? 0 : Math.round(clamp(clip.volume ?? 100, 0, 200));

    const computeVol = (clientY: number) => {
      const dy = startY - clientY;
      return Math.round(clamp(origVol + (dy / 56) * 200, 0, 200));
    };

    setDraggingClipVolume({ clipId: clip.id, volume: origVol });

    const onMove = (moveEv: PointerEvent) => {
      const nextVol = computeVol(moveEv.clientY);
      setDraggingClipVolume({ clipId: clip.id, volume: nextVol });
      onChangeClipVolume(clip.id, nextVol, false);
    };

    const onUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const nextVol = computeVol(upEv.clientY);
      setDraggingClipVolume(null);
      onChangeClipVolume(clip.id, nextVol, true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startTrackVolumeDrag = (
    e: React.PointerEvent,
    trackId: TrackId,
    initialVol: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    focusTimeline();
    if (!onChangeTrackVolume || getTrackControl(effectiveTrackSettings, trackId).locked) return;

    const startY = e.clientY;
    const origVol = Math.round(clamp(initialVol, 0, 200));

    const computeVol = (clientY: number) => {
      const dy = startY - clientY;
      return Math.round(clamp(origVol + (dy / 56) * 200, 0, 200));
    };

    setDraggingTrackVolume({ trackId, volume: origVol });

    const onMove = (moveEv: PointerEvent) => {
      const nextVol = computeVol(moveEv.clientY);
      setDraggingTrackVolume({ trackId, volume: nextVol });
      onChangeTrackVolume(trackId, nextVol, false);
    };

    const onUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const nextVol = computeVol(upEv.clientY);
      setDraggingTrackVolume(null);
      onChangeTrackVolume(trackId, nextVol, true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const tickStep = pixelsPerSecond >= 90 ? 1 : pixelsPerSecond >= 45 ? 2 : 5;
  const ticks: number[] = [];
  for (let s = 0; s <= timelineSpanSeconds; s += tickStep) {
    ticks.push(s);
  }

  return (
    <section
      ref={timelineRootRef}
      tabIndex={0}
      onKeyDown={handleTimelineKeyDown}
      onMouseDown={focusTimeline}
      style={{ height }}
      className="shrink-0 studio-panel border-t border-white/[0.08] flex flex-col select-none outline-none focus-visible:ring-1 focus-visible:ring-sky-400/40"
    >
      {/* Timeline Toolbar */}
      <div className="min-h-10 h-auto py-1 shrink-0 px-2.5 sm:px-4 border-b border-white/[0.08] flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 overflow-x-auto studio-scroll-thin">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => onSplitAtPlayhead(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'split',
                title: 'Split Clip Tool',
                description:
                  'Cut selected clips (or click the Scissors button on the playhead pointer) at the current time.',
                shortcut: 'S',
              });
            }}
            disabled={!canSplit}
            className="glow-btn flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white border border-transparent rounded-md disabled:opacity-35 disabled:pointer-events-none whitespace-nowrap"
            title="Split selected clips at playhead (S)"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>
          <button
            type="button"
            onClick={onDuplicateSelected}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'duplicate',
                title: selectedTrackId ? 'Duplicate Selected Track' : 'Duplicate Clips Tool',
                description: selectedTrackId
                  ? 'Create a new track and duplicate all clips from the selected track onto it.'
                  : 'Clone all currently selected timeline clips immediately after them.',
              });
            }}
            disabled={selectedClipIds.length === 0 && !selectedTrackId}
            className={`glow-btn flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium border rounded-md disabled:opacity-35 disabled:pointer-events-none whitespace-nowrap ${
              selectedTrackId
                ? 'text-sky-200 hover:text-white bg-sky-500/15 border-sky-400/40'
                : 'text-slate-200 hover:text-white border-transparent'
            }`}
            title={
              selectedTrackId
                ? `Duplicate track ${selectedTrackId} to a new track (Ctrl+D)`
                : 'Duplicate selected clips (Ctrl+D)'
            }
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {selectedTrackId ? 'Duplicate Track' : 'Duplicate'}
            </span>
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'delete',
                title: 'Delete Clips Tool',
                description: 'Remove selected clips from the timeline (undoable with Ctrl+Z).',
                shortcut: 'Delete',
              });
            }}
            disabled={selectedClipIds.length === 0}
            className="glow-btn flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-rose-400 border border-transparent rounded-md disabled:opacity-35 disabled:pointer-events-none whitespace-nowrap"
            title="Delete selected clips (Delete)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Delete</span>
          </button>

          <div className="w-px h-4 bg-white/[0.1] mx-1" />

          <button
            type="button"
            onClick={onSelectAll}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'select-all',
                title: 'Select All Timeline Clips',
                description: 'Select every clip across all Title, Video, and Audio tracks.',
                shortcut: 'Ctrl/Cmd+A',
              });
            }}
            disabled={clips.length === 0}
            className="glow-btn flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white border border-transparent rounded-md disabled:opacity-35 disabled:pointer-events-none whitespace-nowrap"
            title="Select all clips on timeline (Ctrl/Cmd+A)"
          >
            <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden lg:inline">Select All</span>
          </button>

          <button
            type="button"
            onClick={onAddQuickText}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'add-text',
                title: 'Add Text Overlay Tool',
                description:
                  'Insert a new title overlay at the playhead (auto-expands to T2+ if needed).',
              });
            }}
            className="glow-btn flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white border border-transparent rounded-md whitespace-nowrap"
            title="Open Advanced Text Overlay Studio"
          >
            <Type className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Add Text</span>
          </button>

          {onOpenCaptions && (
            <button
              type="button"
              onClick={onOpenCaptions}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenCaptions();
              }}
              className="glow-btn flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white border border-transparent rounded-md whitespace-nowrap"
              title="Open Advanced Captions Studio"
            >
              <Captions className="w-3.5 h-3.5 text-violet-300" />
              <span className="hidden sm:inline">Captions</span>
            </button>
          )}

          {selectedTrackId ? (
            <span className="ml-1 sm:ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/40 text-[11px] font-mono text-sky-200 whitespace-nowrap">
              <span>Track {selectedTrackId}</span>
              <button
                type="button"
                onClick={() => onSelectTrack?.(null)}
                className="text-sky-300/80 hover:text-white"
                title="Clear track selection"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ) : (
            selectedClipIds.length > 1 && (
              <span className="ml-1 sm:ml-2 text-xs font-mono text-sky-300 whitespace-nowrap">
                {selectedClipIds.length} selected
              </span>
            )
          )}

          {selectedClipIds.length > 1 && onSetBatchDuration && (
            <div
              className="ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#0B101B] border border-sky-400/35 shrink-0"
              title="Set one manual duration for all selected clips/pictures in sequence"
            >
              <span className="text-[10.5px] text-slate-400 hidden md:inline">Dur</span>
              <input
                type="number"
                min={0.1}
                max={3600}
                step={0.1}
                value={batchDurDraft}
                onChange={(e) => setBatchDurDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    const parsed = parseFloat(batchDurDraft);
                    if (Number.isFinite(parsed) && parsed >= 0.1) {
                      const next = Number(clamp(parsed, 0.1, 3600).toFixed(2));
                      setBatchDurDraft(String(next));
                      onSetBatchDuration(next, true);
                    }
                  }
                }}
                aria-label="Batch duration in seconds"
                className="w-12 px-1 py-0.5 text-[11px] font-mono text-right text-slate-100 bg-[#07090F] border border-white/[0.12] rounded focus:outline-none focus:border-sky-400"
              />
              <span className="text-[10px] font-mono text-slate-500">s</span>
              <button
                type="button"
                onClick={() => {
                  const parsed = parseFloat(batchDurDraft);
                  if (!Number.isFinite(parsed) || parsed < 0.1) return;
                  const next = Number(clamp(parsed, 0.1, 3600).toFixed(2));
                  setBatchDurDraft(String(next));
                  onSetBatchDuration(next, true);
                }}
                className="glow-btn-prism px-2 py-0.5 rounded text-[10.5px] font-semibold text-white whitespace-nowrap"
              >
                Apply All
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onChangeSnapEnabled(!snapEnabled)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'snap',
                title: 'Magnetic Snapping Settings',
                description: 'Snap clip edges cleanly to playhead and adjacent clip boundaries.',
              });
            }}
            className={`glow-btn flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap ${
              snapEnabled
                ? 'bg-sky-500/15 text-sky-200 border-sky-400/40'
                : 'text-slate-400 hover:text-white border-transparent'
            }`}
            title="Toggle magnetic clip snapping"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Snap</span>
          </button>

          <div
            className="flex items-center gap-1.5 sm:gap-2"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'zoom',
                title: 'Timeline Zoom Settings',
                description: 'Adjust pixels-per-second horizontal zoom across all timeline tracks.',
              });
            }}
          >
            <button
              type="button"
              onClick={() => onChangePixelsPerSecond(Math.max(24, pixelsPerSecond - 14))}
              className="glow-btn p-1 text-slate-400 hover:text-white rounded border border-transparent"
              title="Zoom out timeline"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={24}
              max={160}
              value={pixelsPerSecond}
              onChange={(e) => onChangePixelsPerSecond(Number(e.target.value))}
              className="w-16 sm:w-20 md:w-24 studio-slider"
              aria-label="Timeline zoom"
            />
            <button
              type="button"
              onClick={() => onChangePixelsPerSecond(Math.min(160, pixelsPerSecond + 14))}
              className="glow-btn p-1 text-slate-400 hover:text-white rounded border border-transparent"
              title="Zoom in timeline"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Header Row: Tracks Controls + Time Ruler */}
      <div className="h-7 shrink-0 flex border-b border-white/[0.08] bg-[#0B0E16]">
        <div className="w-40 sm:w-52 shrink-0 border-r border-white/[0.08] px-2 sm:px-2.5 flex items-center justify-between gap-1 text-[10px] font-mono text-slate-400">
          <span className="truncate">Tracks ({orderedTracks.length})</span>
          {onAddTrack && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onAddTrack('T')}
                title="Add Title Track"
                className="px-1.5 py-0.5 rounded bg-violet-500/10 hover:bg-violet-500/25 border border-violet-400/25 text-violet-300 flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>T</span>
              </button>
              <button
                type="button"
                onClick={() => onAddTrack('V')}
                title="Add Video Track"
                className="px-1.5 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/25 border border-sky-400/25 text-sky-300 flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>V</span>
              </button>
              <button
                type="button"
                onClick={() => onAddTrack('A')}
                title="Add Audio Track"
                className="px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-400/25 text-emerald-300 flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>A</span>
              </button>
            </div>
          )}
        </div>

        <div ref={rulerScrollRef} className="flex-1 min-w-0 overflow-hidden relative bg-[#0B0E16]">
          <div
            onPointerDown={handleRulerPointerDown}
            style={{ width: timelineWidthPx }}
            className="h-full relative cursor-pointer"
          >
            {ticks.map((sec) => (
              <div
                key={sec}
                className="absolute top-0 bottom-0 border-l border-white/[0.1] pl-1.5 flex items-center text-[10px] font-mono text-slate-500 pointer-events-none"
                style={{ left: sec * pixelsPerSecond }}
              >
                {formatShortTime(sec)}
              </div>
            ))}

            {/* Top Playhead Split Handle & Ruler Indicator */}
            <div
              className="absolute top-0 bottom-0 w-px bg-cyan-400/90 pointer-events-none z-20"
              style={{ left: currentTime * pixelsPerSecond }}
            >
              <button
                type="button"
                disabled={!canSplitAny}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSplitAtPlayhead(true);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenProperties({
                    kind: 'tool',
                    toolId: 'split',
                    title: 'Playhead Pointer Split Tool',
                    description:
                      'Click directly on the scissors icon above the playhead needle to split clips at the current frame.',
                    shortcut: 'S',
                  });
                }}
                title={
                  canSplitAny
                    ? 'Split clip at playhead pointer'
                    : 'Move playhead inside a clip to split'
                }
                className={`pointer-events-auto absolute top-0.5 -translate-x-1/2 w-6 h-5 rounded-md flex items-center justify-center border transition-all ${
                  canSplitAny
                    ? 'glow-btn-prism text-white border-white/30 cursor-pointer shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                    : 'glow-btn bg-[#111624] text-slate-500 border-white/[0.14] opacity-70 cursor-not-allowed'
                }`}
              >
                <Scissors className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Vertically & Horizontally Scrollable Tracks Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Track Labels Column (Synced vertical scroll) */}
        <div
          ref={labelsScrollRef}
          onScroll={handleLabelsScroll}
          className="w-44 sm:w-56 shrink-0 bg-[#0B0E16] border-r border-white/[0.08] overflow-y-auto overflow-x-hidden studio-scroll-thin"
        >
          {orderedTracks.map((track) => {
            const { heightPx, badgeClass, accentClass, Icon: TrackIcon } =
              getTrackVisualMeta(track);
            const state = getTrackControl(effectiveTrackSettings, track.id);
            const isLocked = state.locked;
            const isHidden = state.hidden;
            const isAudio = track.kind === 'A';
            const HideIcon = isAudio
              ? isHidden
                ? VolumeX
                : Volume2
              : isHidden
              ? EyeOff
              : Eye;
            const trackClipList = clips.filter((c) => c.track === track.id);
            const trackClipCount = trackClipList.length;
            const canRemove = track.index > 1 && trackClipCount === 0 && Boolean(onRemoveEmptyTrack);
            const isTrackSelected = selectedTrackId === track.id;

            const audioCapableTrackClips = trackClipList.filter((c) => {
              if (isAudio) return true;
              if (track.kind !== 'V') return false;
              const a = assetById.get(c.assetId);
              return a?.type === 'video';
            });
            const showTrackVolControl =
              Boolean(onChangeTrackVolume) &&
              (isAudio || (track.kind === 'V' && audioCapableTrackClips.length > 0));
            const computedTrackVol =
              audioCapableTrackClips.length > 0
                ? Math.round(
                    audioCapableTrackClips.reduce(
                      (sum, c) => sum + (c.muted ? 0 : clamp(c.volume ?? 100, 0, 200)),
                      0
                    ) / audioCapableTrackClips.length
                  )
                : 100;
            const displayTrackVol =
              draggingTrackVolume?.trackId === track.id
                ? draggingTrackVolume.volume
                : computedTrackVol;

            return (
              <div
                key={track.id}
                style={{ height: heightPx }}
                onClick={() => onSelectTrack?.(track.id)}
                title={`${track.label} — Click to select track${isLocked ? ' (Locked)' : ''}${
                  isHidden ? (isAudio ? ' (Muted)' : ' (Hidden)') : ''
                }`}
                className={`relative border-b border-white/[0.06] px-2 sm:px-2.5 flex items-center justify-between gap-1 whitespace-nowrap overflow-hidden transition-colors cursor-pointer ${
                  isTrackSelected
                    ? 'bg-sky-500/15 ring-1 ring-inset ring-sky-400/60'
                    : isHidden
                    ? 'bg-white/[0.015]'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r ${
                    isTrackSelected
                      ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]'
                      : isHidden
                      ? 'bg-slate-600/50'
                      : accentClass
                  }`}
                />
                <div
                  className={`min-w-0 flex items-center gap-1.5 ${
                    isHidden ? 'opacity-45' : ''
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${badgeClass}`}
                  >
                    <TrackIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex items-center gap-1 text-[11px] font-medium leading-none">
                    <span
                      className={`font-mono font-semibold ${
                        isTrackSelected ? 'text-sky-200' : 'text-slate-200'
                      }`}
                    >
                      {track.code}
                    </span>
                    <span className="hidden sm:inline text-slate-500">·</span>
                    <span className="hidden sm:inline text-slate-400 truncate max-w-[46px]">
                      {track.name}
                    </span>
                  </div>
                </div>

                {/* Per-track Volume Drag, Duplicate, Lock, Hide & Optional Remove Controls */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {showTrackVolControl && (
                    <div
                      role="slider"
                      aria-label={`${track.code} track volume`}
                      aria-valuemin={0}
                      aria-valuemax={200}
                      aria-valuenow={displayTrackVol}
                      onPointerDown={(e) => startTrackVolumeDrag(e, track.id, displayTrackVol)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!isLocked) onChangeTrackVolume?.(track.id, 100, true);
                      }}
                      title={`Drag up/down to adjust ${track.code} volume (${displayTrackVol}%). Double-click to reset 100%.`}
                      className={`relative h-5.5 min-w-[34px] px-1 rounded-md border flex items-center justify-center overflow-hidden select-none text-[10px] font-mono tabular-nums transition-colors ${
                        isLocked
                          ? 'opacity-40 cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-slate-500'
                          : draggingTrackVolume?.trackId === track.id
                          ? 'cursor-ns-resize border-emerald-400/70 bg-emerald-500/20 text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.28)]'
                          : 'cursor-ns-resize border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 bottom-0 right-0 pointer-events-none transition-all ${
                          isAudio ? 'bg-emerald-400/20' : 'bg-sky-400/20'
                        }`}
                        style={{ height: `${clamp((displayTrackVol / 200) * 100, 0, 100)}%` }}
                      />
                      <span className="relative z-10">{displayTrackVol}%</span>
                    </div>
                  )}
                  {onDuplicateTrack && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateTrack(track.id);
                      }}
                      title={`Duplicate ${track.code} track to a new track`}
                      className={`w-5.5 h-5.5 rounded-md border flex items-center justify-center transition-colors ${
                        isTrackSelected
                          ? 'bg-sky-500/20 text-sky-200 border-sky-400/50 hover:bg-sky-500/35'
                          : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:text-sky-200 hover:border-sky-400/40'
                      }`}
                    >
                      <Copy className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTrackLock?.(track.id);
                    }}
                    aria-pressed={isLocked}
                    title={
                      isLocked
                        ? `Unlock ${track.code} track`
                        : `Lock ${track.code} track (prevent editing)`
                    }
                    className={`w-5.5 h-5.5 rounded-md border flex items-center justify-center transition-colors ${
                      isLocked
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-[0_0_8px_rgba(251,191,36,0.2)]'
                        : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-200 hover:border-white/[0.15]'
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <Unlock className="w-3 h-3" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTrackHide?.(track.id);
                    }}
                    aria-pressed={isHidden}
                    title={
                      isAudio
                        ? isHidden
                          ? `Unmute ${track.code} track`
                          : `Mute / Hide ${track.code} track`
                        : isHidden
                        ? `Show ${track.code} track`
                        : `Hide ${track.code} track`
                    }
                    className={`w-5.5 h-5.5 rounded-md border flex items-center justify-center transition-colors ${
                      isHidden
                        ? 'bg-rose-500/20 text-rose-300 border-rose-400/50 shadow-[0_0_8px_rgba(244,63,94,0.2)]'
                        : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:text-slate-100 hover:border-white/[0.15]'
                    }`}
                  >
                    <HideIcon className="w-3 h-3" aria-hidden="true" />
                  </button>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveEmptyTrack?.(track.id);
                      }}
                      title={`Remove empty ${track.code} track`}
                      className="w-5 h-5 rounded border border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-rose-300 hover:border-rose-400/40 flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable Tracks Canvas (Horizontal + Vertical Scrollbars) */}
        <div
          ref={tracksScrollRef}
          onScroll={handleTracksScroll}
          className="flex-1 min-w-0 min-h-0 overflow-x-auto overflow-y-auto studio-scroll bg-[#07090F] relative"
        >
          <div
            ref={tracksAreaRef}
            onPointerDown={handleTracksAreaPointerDown}
            style={{ width: timelineWidthPx }}
            className="relative min-h-full flex flex-col"
            onDragOver={(e) => {
              if (
                e.dataTransfer.types.includes('application/x-framecut-assets') ||
                e.dataTransfer.types.includes('application/x-framecut-asset') ||
                e.dataTransfer.types.includes('application/x-framecut-sticker') ||
                e.dataTransfer.types.includes('application/x-framecut-sfx')
              ) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const dropTime = Math.max(0, (e.clientX - rect.left) / pixelsPerSecond);
              const hoveredTrack = findHoveredTrackAtClientY(e.clientY);

              const sfxId = e.dataTransfer.getData('application/x-framecut-sfx');
              if (sfxId) {
                e.preventDefault();
                const preferredAudioTrack =
                  hoveredTrack?.kind === 'A' ? hoveredTrack.id : undefined;
                onDropSfxAtTime?.(sfxId, Number(dropTime.toFixed(2)), preferredAudioTrack);
                return;
              }

              const stickerId = e.dataTransfer.getData('application/x-framecut-sticker');
              if (stickerId) {
                e.preventDefault();
                const preferredTitleTrack =
                  hoveredTrack?.kind === 'T' ? hoveredTrack.id : undefined;
                onDropStickerAtTime?.(stickerId, Number(dropTime.toFixed(2)), preferredTitleTrack);
                return;
              }

              const multiRaw = e.dataTransfer.getData('application/x-framecut-assets');
              const singleId = e.dataTransfer.getData('application/x-framecut-asset');
              let ids: string[] = [];
              if (multiRaw) {
                try {
                  const parsed = JSON.parse(multiRaw);
                  if (Array.isArray(parsed)) {
                    ids = parsed.filter((x): x is string => typeof x === 'string');
                  }
                } catch {
                  // fallback to singleId
                }
              }
              if (ids.length === 0 && singleId) {
                ids = [singleId];
              }
              if (ids.length === 0) return;
              e.preventDefault();
              onDropAssetsAtTime(
                ids,
                Number(dropTime.toFixed(2)),
                hoveredTrack?.id
              );
            }}
          >
            {orderedTracks.map((track) => {
              const { heightPx } = getTrackVisualMeta(track);
              const trackClips = clips.filter((c) => c.track === track.id);
              const visibleLeftPx = Math.max(0, scrollLeft - 240);
              const visibleRightPx = scrollLeft + viewportWidth + 240;
              const visibleTrackClips =
                trackClips.length <= 80
                  ? trackClips
                  : trackClips.filter((clip) => {
                      const cLeft = clip.startTime * pixelsPerSecond;
                      const cRight = (clip.startTime + clip.duration) * pixelsPerSecond;
                      return cRight >= visibleLeftPx && cLeft <= visibleRightPx;
                    });
              const trackState = getTrackControl(effectiveTrackSettings, track.id);
              const isTrackLocked = trackState.locked;
              const isTrackHidden = trackState.hidden;
              const isTitle = track.kind === 'T';
              const isVisual = track.kind === 'V';
              const isAudio = track.kind === 'A';
              const isTrackSelected = selectedTrackId === track.id;

              return (
                <div
                  key={track.id}
                  ref={(el) => {
                    trackRowRefs.current[track.id] = el;
                  }}
                  style={{ height: heightPx }}
                  className={`shrink-0 border-b border-white/[0.06] relative transition-all ${
                    isTrackSelected ? 'bg-sky-500/[0.08] ring-1 ring-inset ring-sky-400/25' : ''
                  } ${isTrackHidden ? 'opacity-40 bg-rose-950/10' : ''} ${
                    isTrackLocked ? 'bg-amber-950/[0.06]' : ''
                  }`}
                >
                  {isTrackLocked && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 opacity-20"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(251,191,36,0.14) 10px, rgba(251,191,36,0.14) 11px)',
                      }}
                    />
                  )}
                  {visibleTrackClips.map((clip) => {
                    const leftPx = clip.startTime * pixelsPerSecond;
                    const widthPx = Math.max(18, clip.duration * pixelsPerSecond);
                    const isSelected = selectedSet.has(clip.id);
                    const asset = assetById.get(clip.assetId);

                    const hasGlowOrFx =
                      (clip.glowIntensity ?? 0) > 0 ||
                      (clip.fxPreset && clip.fxPreset !== 'none') ||
                      (clip.framePreset && clip.framePreset !== 'none') ||
                      (clip.maskShape && clip.maskShape !== 'none') ||
                      (clip.animationIn && clip.animationIn !== 'none') ||
                      (clip.animationOut && clip.animationOut !== 'none') ||
                      (clip.animationCombo && clip.animationCombo !== 'none');

                    const baseColor = isTitle
                      ? clip.stickerConfig
                        ? 'bg-gradient-to-b from-[#3B2150]/95 to-[#261436]/95 border-[#C084FC]/80'
                        : 'bg-gradient-to-b from-[#332752]/95 to-[#221A38]/95 border-[#7C68C8]/80'
                      : isAudio
                      ? 'bg-gradient-to-b from-[#11352F]/95 to-[#0B231F]/95 border-[#228671]/80'
                      : 'bg-gradient-to-b from-[#1B2F4B]/95 to-[#122035]/95 border-[#3A6CAE]/85';

                    return (
                      <div
                        key={clip.id}
                        title={`${clip.name} (${clip.duration.toFixed(2)}s)`}
                        onPointerDown={(e) => startClipDrag(e, clip)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onChangeSelection([clip.id]);
                          onOpenProperties({ kind: 'clip', clipId: clip.id });
                        }}
                        onDragOver={(e) => {
                          if (isTrackLocked) return;
                          if (
                            !isAudio &&
                            (e.dataTransfer.types.includes('application/x-framecut-transition') ||
                              e.dataTransfer.types.includes('application/x-framecut-fx') ||
                              e.dataTransfer.types.includes('application/x-framecut-animation') ||
                              (isVisual &&
                                (e.dataTransfer.types.includes('application/x-framecut-frame') ||
                                  e.dataTransfer.types.includes('application/x-framecut-mask') ||
                                  e.dataTransfer.types.includes(
                                    'application/x-framecut-custom-mask'
                                  ))))
                          ) {
                            e.preventDefault();
                          }
                        }}
                        onDrop={(e) => {
                          if (isAudio || isTrackLocked) return;
                          const trans = e.dataTransfer.getData(
                            'application/x-framecut-transition'
                          ) as TransitionType;
                          const fx = e.dataTransfer.getData(
                            'application/x-framecut-fx'
                          ) as VisualEffectPreset;
                          const animId = e.dataTransfer.getData(
                            'application/x-framecut-animation'
                          ) as ClipAnimationPreset;
                          const frame = e.dataTransfer.getData(
                            'application/x-framecut-frame'
                          ) as FramePreset;
                          const maskShape = e.dataTransfer.getData(
                            'application/x-framecut-mask'
                          ) as MaskShape;
                          const customMaskId = e.dataTransfer.getData(
                            'application/x-framecut-custom-mask'
                          );

                          if (trans) {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropTransitionOnClip?.(clip.id, trans);
                          } else if (fx) {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropEffectOnClip?.(clip.id, fx);
                          } else if (animId) {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropAnimationOnClip?.(clip.id, animId);
                          } else if (frame && isVisual) {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropFrameOnClip?.(clip.id, frame);
                          } else if (customMaskId && isVisual) {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropMaskOnClip?.(clip.id, 'custom', customMaskId);
                          } else if (maskShape && isVisual) {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropMaskOnClip?.(clip.id, maskShape);
                          }
                        }}
                        style={{ left: leftPx, width: widthPx }}
                        className={`glow-card group absolute top-1 bottom-1 rounded-md border overflow-hidden ${
                          isTrackLocked
                            ? 'cursor-not-allowed'
                            : 'cursor-grab active:cursor-grabbing'
                        } ${baseColor} ${
                          isSelected
                            ? 'ring-2 ring-sky-400 border-sky-300 z-10 shadow-[0_0_16px_rgba(56,189,248,0.35)]'
                            : ''
                        }`}
                      >
                        {clip.transitionIn && clip.transitionIn !== 'none' && (() => {
                          const dur = clip.transitionInDuration ?? 0.5;
                          const transWidthPx = Math.min(
                            widthPx * 0.65,
                            Math.max(12, dur * pixelsPerSecond)
                          );
                          const isResizingThis =
                            resizingTransInfo?.clipId === clip.id &&
                            resizingTransInfo.edge === 'in';
                          return (
                            <div
                              className="absolute left-0 top-0 bottom-0 bg-sky-400/25 border-r-2 border-sky-400/80 z-20 pointer-events-none"
                              style={{ width: transWidthPx }}
                              title={`In: ${clip.transitionIn} (${dur.toFixed(2)}s)`}
                            >
                              {!isTrackLocked && onResizeTransition && (
                                <div
                                  onPointerDown={(e) => startTransitionResize(e, clip, 'in')}
                                  title="Drag horizontally to adjust Transition In duration"
                                  className="pointer-events-auto absolute -right-1.5 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center group/trans"
                                >
                                  <span className="w-1 h-4 rounded-full bg-sky-300/80 group-hover/trans:bg-white shadow" />
                                </div>
                              )}
                              {isResizingThis && (
                                <span className="absolute left-1 bottom-1 px-1 py-0.5 rounded bg-[#07090F]/90 text-[9px] font-mono text-sky-200 border border-sky-400/50">
                                  {resizingTransInfo.duration.toFixed(2)}s
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {clip.transitionOut && clip.transitionOut !== 'none' && (() => {
                          const dur = clip.transitionOutDuration ?? 0.5;
                          const transWidthPx = Math.min(
                            widthPx * 0.65,
                            Math.max(12, dur * pixelsPerSecond)
                          );
                          const isResizingThis =
                            resizingTransInfo?.clipId === clip.id &&
                            resizingTransInfo.edge === 'out';
                          return (
                            <div
                              className="absolute right-0 top-0 bottom-0 bg-amber-400/25 border-l-2 border-amber-400/80 z-20 pointer-events-none"
                              style={{ width: transWidthPx }}
                              title={`Out: ${clip.transitionOut} (${dur.toFixed(2)}s)`}
                            >
                              {!isTrackLocked && onResizeTransition && (
                                <div
                                  onPointerDown={(e) => startTransitionResize(e, clip, 'out')}
                                  title="Drag horizontally to adjust Transition Out duration"
                                  className="pointer-events-auto absolute -left-1.5 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center group/trans"
                                >
                                  <span className="w-1 h-4 rounded-full bg-amber-300/80 group-hover/trans:bg-white shadow" />
                                </div>
                              )}
                              {isResizingThis && (
                                <span className="absolute right-1 bottom-1 px-1 py-0.5 rounded bg-[#07090F]/90 text-[9px] font-mono text-amber-200 border border-amber-400/50">
                                  {resizingTransInfo.duration.toFixed(2)}s
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {((clip.animationIn && clip.animationIn !== 'none') ||
                          (clip.animationOut && clip.animationOut !== 'none') ||
                          (clip.animationCombo && clip.animationCombo !== 'none')) && (
                          <div
                            className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 pointer-events-none z-20"
                            title={`Anim: ${[
                              clip.animationIn && clip.animationIn !== 'none'
                                ? `In(${clip.animationIn})`
                                : '',
                              clip.animationCombo && clip.animationCombo !== 'none'
                                ? `Loop(${clip.animationCombo})`
                                : '',
                              clip.animationOut && clip.animationOut !== 'none'
                                ? `Out(${clip.animationOut})`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}`}
                          />
                        )}

                        {isVisual && asset?.thumbnailUrl && (
                          <div
                            className="absolute inset-0 opacity-35 bg-repeat-x bg-center pointer-events-none"
                            style={{
                              backgroundImage: `url(${asset.thumbnailUrl})`,
                              backgroundSize: 'auto 100%',
                            }}
                          />
                        )}

                        {isAudio && asset?.waveform && (() => {
                          const effectiveVol = clip.muted
                            ? 0
                            : clamp(clip.volume ?? 100, 0, 200);
                          const gainScale = effectiveVol / 100;
                          return (
                            <div className="absolute inset-x-1 bottom-1 top-4 flex items-end gap-[2px] opacity-60 pointer-events-none overflow-hidden">
                              {asset.waveform.map((peak, idx) => (
                                <div
                                  key={idx}
                                  className="flex-1 bg-emerald-400/80 rounded-t-[1px] transition-[height] duration-75"
                                  style={{
                                    height: `${Math.min(100, Math.round(peak * gainScale * 100))}%`,
                                  }}
                                />
                              ))}
                            </div>
                          );
                        })()}

                        {(isAudio || (isVisual && asset?.type === 'video')) &&
                          onChangeClipVolume &&
                          (() => {
                            const effectiveVol =
                              draggingClipVolume?.clipId === clip.id
                                ? draggingClipVolume.volume
                                : clip.muted
                                ? 0
                                : Math.round(clamp(clip.volume ?? 100, 0, 200));
                            const lineBottomPct = clamp(
                              (effectiveVol / 200) * 84 + 8,
                              8,
                              92
                            );
                            const isDraggingThisVol =
                              draggingClipVolume?.clipId === clip.id;
                            return (
                              <>
                                <div
                                  aria-hidden="true"
                                  className={`absolute inset-x-0 bottom-0 pointer-events-none transition-all duration-75 ${
                                    isAudio ? 'bg-emerald-400/10' : 'bg-sky-400/10'
                                  }`}
                                  style={{ height: `${lineBottomPct}%` }}
                                />
                                {!isTrackLocked && (
                                  <div
                                    role="slider"
                                    aria-label={`${clip.name} volume`}
                                    aria-valuemin={0}
                                    aria-valuemax={200}
                                    aria-valuenow={effectiveVol}
                                    onPointerDown={(e) => startClipVolumeDrag(e, clip)}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      onChangeClipVolume(clip.id, 100, true);
                                    }}
                                    title={`Drag up/down to adjust volume (${effectiveVol}%). Double-click to reset 100%.`}
                                    style={{ bottom: `${lineBottomPct}%` }}
                                    className="group/vol absolute left-2 right-2 h-3 translate-y-1/2 cursor-ns-resize z-20 flex items-center"
                                  >
                                    <div
                                      className={`w-full h-[2px] rounded-full transition-colors ${
                                        isDraggingThisVol
                                          ? isAudio
                                            ? 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                                            : 'bg-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.9)]'
                                          : isAudio
                                          ? 'bg-emerald-300/65 group-hover/vol:bg-emerald-200'
                                          : 'bg-sky-300/55 group-hover/vol:bg-sky-200'
                                      }`}
                                    />
                                    <span
                                      className={`absolute left-1/2 -translate-x-1/2 ${
                                        lineBottomPct > 58 ? 'translate-y-3' : '-translate-y-3.5'
                                      } px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold border whitespace-nowrap pointer-events-none transition-opacity ${
                                        isDraggingThisVol
                                          ? 'opacity-100 bg-[#07090F]/95 text-emerald-200 border-emerald-400/70 shadow-md'
                                          : 'opacity-0 group-hover/vol:opacity-100 bg-[#07090F]/90 text-slate-100 border-white/20'
                                      }`}
                                    >
                                      {effectiveVol === 0 ? '0% Muted' : `${effectiveVol}%`}
                                    </span>
                                  </div>
                                )}
                              </>
                            );
                          })()}

                        <div className="relative z-10 px-2 py-1 flex items-center justify-between gap-1 text-[11px] font-medium text-slate-100 pointer-events-none">
                          <span className="truncate flex items-center gap-1.5">
                            {hasGlowOrFx && (
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: clip.glowColor || '#38BDF8',
                                  boxShadow: `0 0 8px ${clip.glowColor || '#38BDF8'}`,
                                }}
                              />
                            )}
                            {isTitle && clip.stickerConfig ? (
                              clip.stickerConfig.emoji ? (
                                <span className="text-[11px] leading-none shrink-0">
                                  {clip.stickerConfig.emoji}
                                </span>
                              ) : (
                                <Smile className="w-3 h-3 text-fuchsia-300 shrink-0" />
                              )
                            ) : isTitle && clip.textConfig ? (
                              <Type className="w-3 h-3 text-sky-300/80 shrink-0" />
                            ) : isVisual ? (
                              <Film className="w-3 h-3 text-sky-300/85 shrink-0" />
                            ) : isAudio ? (
                              <Music className="w-3 h-3 text-emerald-300/85 shrink-0" />
                            ) : null}
                            <span className="truncate">{clip.name}</span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {isTrackLocked && (
                              <Lock className="w-2.5 h-2.5 text-amber-300/90" aria-hidden="true" />
                            )}
                            {widthPx > 85 && (
                              <span className="font-mono text-[10px] text-slate-300/80">
                                {clip.duration.toFixed(1)}s
                              </span>
                            )}
                          </span>
                        </div>

                        {clip.keyframes && clip.keyframes.length > 0 && (
                          <div className="absolute inset-x-0 bottom-1 h-2.5 pointer-events-none z-20">
                            {clip.keyframes.map((kf) => {
                              const leftRatio = clamp(
                                kf.time / Math.max(0.01, clip.duration),
                                0.02,
                                0.98
                              );
                              return (
                                <button
                                  key={kf.id}
                                  type="button"
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    onChangeSelection([clip.id]);
                                    onSeek(clip.startTime + kf.time);
                                  }}
                                  style={{ left: `${leftRatio * 100}%` }}
                                  className="pointer-events-auto absolute top-0.5 -translate-x-1/2 w-2 h-2 rotate-45 bg-amber-400 border border-amber-100 shadow-[0_0_8px_rgba(251,191,36,0.9)] hover:scale-125 transition-transform"
                                  title={`Keyframe @ ${kf.time.toFixed(2)}s`}
                                />
                              );
                            })}
                          </div>
                        )}

                        {!isTrackLocked && (
                          <>
                            <div
                              onPointerDown={(e) => startClipTrim(e, clip, 'left')}
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/0 hover:bg-gradient-to-b hover:from-cyan-400 hover:via-purple-500 hover:to-pink-500 transition-all z-20"
                              title="Drag to trim start"
                            />
                            <div
                              onPointerDown={(e) => startClipTrim(e, clip, 'right')}
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/0 hover:bg-gradient-to-b hover:from-cyan-400 hover:via-purple-500 hover:to-pink-500 transition-all z-20"
                              title="Drag to trim end"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Seam Transition Junctions between adjacent clips on visual/title tracks */}
                  {!isAudio &&
                    onApplySeamTransition &&
                    (() => {
                      const sorted = [...trackClips].sort((a, b) => a.startTime - b.startTime);
                      const seams: Array<{ prev: TimelineClip; next: TimelineClip }> = [];
                      for (let i = 0; i < sorted.length - 1; i++) {
                        const prev = sorted[i];
                        const next = sorted[i + 1];
                        if (Math.abs(prev.startTime + prev.duration - next.startTime) <= 0.14) {
                          seams.push({ prev, next });
                        }
                      }
                      return seams.map(({ prev, next }) => {
                        const leftPx = next.startTime * pixelsPerSecond;
                        if (
                          trackClips.length > 80 &&
                          (leftPx < visibleLeftPx || leftPx > visibleRightPx)
                        ) {
                          return null;
                        }
                        const activeType: TransitionType =
                          next.transitionIn && next.transitionIn !== 'none'
                            ? next.transitionIn
                            : prev.transitionOut && prev.transitionOut !== 'none'
                            ? prev.transitionOut
                            : 'none';
                        const activeDur =
                          next.transitionIn && next.transitionIn !== 'none'
                            ? next.transitionInDuration ?? 0.5
                            : prev.transitionOutDuration ?? 0.5;
                        const hasActive = activeType !== 'none';
                        return (
                          <button
                            key={`seam_${prev.id}_${next.id}`}
                            type="button"
                            disabled={isTrackLocked}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSeamSearch('');
                              setSeamPopover({
                                prevClipId: prev.id,
                                nextClipId: next.id,
                                prevName: prev.name,
                                nextName: next.name,
                                trackId: track.id,
                                activeType,
                                duration: activeDur,
                                leftPx,
                              });
                            }}
                            onDragOver={(e) => {
                              if (isTrackLocked) return;
                              if (e.dataTransfer.types.includes('application/x-framecut-transition')) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                            onDrop={(e) => {
                              if (isTrackLocked) return;
                              const trans = e.dataTransfer.getData(
                                'application/x-framecut-transition'
                              ) as TransitionType;
                              if (trans) {
                                e.preventDefault();
                                e.stopPropagation();
                                const preset = TRANSITIONS_CATALOG.find((t) => t.id === trans);
                                onApplySeamTransition(
                                  prev.id,
                                  next.id,
                                  trans,
                                  preset?.defaultDuration ?? 0.5
                                );
                              }
                            }}
                            style={{ left: leftPx }}
                            title={
                              hasActive
                                ? `${activeType} (${activeDur.toFixed(2)}s) — Click to edit / Apply All`
                                : `Add transition between "${prev.name}" & "${next.name}"`
                            }
                            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-25 flex items-center justify-center rounded-full border shadow-md transition-transform hover:scale-110 disabled:opacity-40 ${
                              hasActive
                                ? 'h-5 px-1.5 bg-sky-500 text-slate-950 border-sky-200 text-[9px] font-bold gap-0.5'
                                : 'w-5 h-5 bg-[#111624] text-slate-300 hover:text-white border-sky-400/50 hover:border-sky-300'
                            }`}
                          >
                            {hasActive ? (
                              <>
                                <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" />
                                <span className="font-mono leading-none">
                                  {activeDur.toFixed(1)}s
                                </span>
                              </>
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                          </button>
                        );
                      });
                    })()}
                </div>
              );
            })}

            {/* Marquee Selection Box */}
            {marqueeBox && (
              <div
                className="absolute border border-sky-400 bg-sky-500/15 pointer-events-none z-25 rounded-[2px]"
                style={{
                  left: marqueeBox.left,
                  top: marqueeBox.top,
                  width: marqueeBox.width,
                  height: marqueeBox.height,
                }}
              />
            )}

            {/* Magnetic Snap Indicator Line */}
            {activeSnapLine !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-amber-400 pointer-events-none z-20"
                style={{ left: activeSnapLine * pixelsPerSecond }}
              />
            )}

            {/* Vertical Playhead Needle Line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-cyan-400 via-purple-400 to-pink-400 shadow-[0_0_12px_rgba(56,189,248,0.85)] pointer-events-none z-30"
              style={{ left: currentTime * pixelsPerSecond }}
            />
          </div>
        </div>

        {/* Inline Seam Transition Popover */}
        {seamPopover && onApplySeamTransition && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed bottom-16 right-6 z-50 w-72 rounded-xl bg-[#0F131C] border border-sky-400/35 shadow-2xl p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Transition Between Clips</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  {seamPopover.prevName} ↔ {seamPopover.nextName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSeamPopover(null)}
                className="glow-btn p-1 rounded text-slate-400 hover:text-white border border-transparent"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={seamSearch}
                onChange={(e) => setSeamSearch(e.target.value)}
                placeholder="Search transitions..."
                className="w-full pl-7 pr-2 py-1 text-[11px] text-slate-100 bg-[#07090F] border border-white/[0.1] rounded-md focus:outline-none focus:border-sky-400 placeholder:text-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto studio-scroll pr-0.5">
              {filteredSeamTransitions.map((t) => {
                const active = seamPopover.activeType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSeamPopover((prev) =>
                        prev ? { ...prev, activeType: t.id } : prev
                      );
                      onApplySeamTransition(
                        seamPopover.prevClipId,
                        seamPopover.nextClipId,
                        t.id,
                        seamPopover.duration
                      );
                    }}
                    className={`glow-btn px-2 py-1.5 text-[11px] font-medium rounded border text-left truncate flex items-center justify-between gap-1 ${
                      active
                        ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                        : 'bg-[#07090F] border-white/[0.08] text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{t.label}</span>
                    {active && <Check className="w-3 h-3 text-sky-300 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1 pt-1 border-t border-white/[0.08]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Duration</span>
                <span className="font-mono text-slate-200">{seamPopover.duration.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={2.5}
                step={0.05}
                value={seamPopover.duration}
                onChange={(e) => {
                  const nextDur = parseFloat(e.target.value);
                  setSeamPopover((prev) => (prev ? { ...prev, duration: nextDur } : prev));
                  if (seamPopover.activeType !== 'none') {
                    onApplySeamTransition(
                      seamPopover.prevClipId,
                      seamPopover.nextClipId,
                      seamPopover.activeType,
                      nextDur
                    );
                  }
                }}
                className="w-full studio-slider"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onApplySeamTransition(
                    seamPopover.prevClipId,
                    seamPopover.nextClipId,
                    'none',
                    0.5
                  );
                  setSeamPopover(null);
                }}
                className="glow-btn py-1.5 px-2 text-[11px] font-medium rounded-lg bg-[#07090F] text-slate-300 hover:text-white border border-white/[0.1]"
              >
                Cut (Remove)
              </button>
              {onApplyTransitionToAll && (
                <button
                  type="button"
                  onClick={() => {
                    const chosen =
                      seamPopover.activeType !== 'none' ? seamPopover.activeType : 'dissolve';
                    onApplyTransitionToAll(chosen, seamPopover.duration);
                    setSeamPopover(null);
                  }}
                  className="glow-btn py-1.5 px-2 text-[11px] font-semibold rounded-lg bg-sky-500/20 hover:bg-sky-500/35 text-sky-100 border border-sky-400/40"
                >
                  Apply All
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Horizontal Timeline Pan Slider Bar */}
      <div className="h-6 shrink-0 border-t border-white/[0.06] bg-[#0B0E16] flex items-center">
        <div className="w-40 sm:w-52 shrink-0 border-r border-white/[0.08] px-2.5 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Scroll · {formatShortTime(scrollLeft / pixelsPerSecond)}</span>
          <span>{formatShortTime(timelineSpanSeconds)}</span>
        </div>
        <div className="flex-1 px-3 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(maxScrollLeft))}
            value={Math.min(Math.round(scrollLeft), Math.max(1, Math.round(maxScrollLeft)))}
            disabled={maxScrollLeft <= 1}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (tracksScrollRef.current) {
                tracksScrollRef.current.scrollLeft = next;
              }
            }}
            aria-label="Scroll timeline horizontally"
            className="w-full studio-slider disabled:opacity-35"
          />
        </div>
      </div>
    </section>
  );
}
