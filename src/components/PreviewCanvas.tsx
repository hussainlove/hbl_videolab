import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Play,
  SkipBack,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ASPECT_RATIO_DIMENSIONS,
  AspectRatio,
  ContextPropertiesTarget,
  getTrackControl,
  getTrackIndex,
  isTitleTrack,
  isVisualTrack,
  MediaAsset,
  TimelineClip,
  TrackSettingsMap,
} from '../types/editor';
import {
  LoadedMediaMap,
  measureStickerSelectionBox,
  measureTextSelectionBox,
  renderFrameToContext,
} from '../utils/compositor';
import { clamp, formatTimecode } from '../utils/time';

interface PreviewCanvasProps {
  aspectRatio: AspectRatio;
  fps: 24 | 30 | 60;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isMuted: boolean;
  previewVolume?: number;
  previewScale?: 'auto' | 'half';
  clips: TimelineClip[];
  assets: MediaAsset[];
  mediaMap: LoadedMediaMap;
  selectedClipId: string | null;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleMute: () => void;
  onChangePreviewVolume?: (vol: number) => void;
  onTogglePreviewScale?: () => void;
  onSelectClip: (id: string | null) => void;
  onUpdateClipPosition: (id: string, x: number, y: number) => void;
  onUpdateClipScale?: (id: string, scale: number, isCaption?: boolean) => void;
  onUpdateTextFontSize: (id: string, fontSize: number) => void;
  onUpdateStickerSize?: (id: string, size: number) => void;
  onOpenProperties: (target: ContextPropertiesTarget) => void;
  fontRevision?: number;
  trackSettings?: TrackSettingsMap;
}

type CornerHandle = 'nw' | 'ne' | 'sw' | 'se';

export function PreviewCanvas({
  aspectRatio,
  fps,
  currentTime,
  totalDuration,
  isPlaying,
  isMuted,
  previewVolume = 100,
  previewScale: controlledPreviewScale,
  clips,
  assets,
  mediaMap,
  selectedClipId,
  onTogglePlay,
  onSeek,
  onToggleMute,
  onChangePreviewVolume,
  onTogglePreviewScale,
  onSelectClip,
  onUpdateClipPosition,
  onUpdateClipScale,
  onUpdateTextFontSize,
  onUpdateStickerSize,
  onOpenProperties,
  fontRevision = 0,
  trackSettings,
}: PreviewCanvasProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageSize, setStageSize] = useState({ width: 640, height: 360 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [internalPreviewScale, setInternalPreviewScale] = useState<'auto' | 'half'>('auto');
  const previewScale = controlledPreviewScale ?? internalPreviewScale;
  const handleToggleScale = () => {
    if (onTogglePreviewScale) onTogglePreviewScale();
    else setInternalPreviewScale((prev) => (prev === 'auto' ? 'half' : 'auto'));
  };
  const [canvasCursor, setCanvasCursor] = useState<string>('default');

  const handleToggleFullscreen = async () => {
    const el = sectionRef.current;
    if (!isFullscreen) {
      setIsFullscreen(true);
      if (el && typeof el.requestFullscreen === 'function') {
        try {
          await el.requestFullscreen();
        } catch {
          // Fallback to full-viewport CSS fullscreen overlay when iframe blocks native fullscreen
        }
      }
    } else {
      setIsFullscreen(false);
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      }
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      const el = sectionRef.current;
      if (typeof document !== 'undefined' && document.fullscreenElement === el) {
        setIsFullscreen(true);
      } else if (typeof document !== 'undefined' && !document.fullscreenElement) {
        setIsFullscreen((prev) => (prev ? false : prev));
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);
  const dragStateRef = useRef<
    | {
        mode: 'move';
        clipId: string;
        startClientX: number;
        startClientY: number;
        origX: number;
        origY: number;
      }
    | {
        mode: 'resize';
        kind: 'text' | 'sticker';
        clipId: string;
        isCaption?: boolean;
        anchorX: number;
        anchorY: number;
        startCanvasX: number;
        startCanvasY: number;
        origSize: number;
        origScale: number;
      }
    | null
  >(null);

  const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio];

  // ResizeObserver to fit canvas perfectly inside available center stage without distortion or overflow
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const pad = Math.min(28, Math.max(8, Math.floor(Math.min(rect.width, rect.height) * 0.06)));
      const availW = Math.max(40, rect.width - pad);
      const availH = Math.max(40, rect.height - pad);
      const targetRatio = dims.width / dims.height;

      let w = availW;
      let h = w / targetRatio;
      if (h > availH) {
        h = availH;
        w = h * targetRatio;
      }
      setStageSize({ width: Math.max(32, Math.floor(w)), height: Math.max(24, Math.floor(h)) });
    };

    updateSize();
    const obs = new ResizeObserver(updateSize);
    obs.observe(el);
    return () => obs.disconnect();
  }, [dims.width, dims.height, isFullscreen]);

  // Render frame whenever time, clips, aspect ratio, or media changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const scaleFactor = previewScale === 'half' ? 0.5 : isFullscreen ? 1 : 0.667;
    const renderW = Math.max(320, Math.round(dims.width * scaleFactor));
    const renderH = Math.max(180, Math.round(dims.height * scaleFactor));

    if (canvas.width !== renderW || canvas.height !== renderH) {
      canvas.width = renderW;
      canvas.height = renderH;
    }

    const selectedClip = clips.find((c) => c.id === selectedClipId);
    const selCtrl = selectedClip ? getTrackControl(trackSettings, selectedClip.track) : null;
    const selectedTextClipId =
      selectedClip &&
      isTitleTrack(selectedClip.track) &&
      selCtrl &&
      !selCtrl.hidden &&
      !selCtrl.locked
        ? selectedClip.id
        : null;

    const hiddenTracks = trackSettings
      ? Object.fromEntries(Object.entries(trackSettings).map(([k, v]) => [k, Boolean(v.hidden)]))
      : undefined;

    renderFrameToContext(ctx, renderW, renderH, currentTime, clips, assets, mediaMap, {
      selectedTextClipId,
      hideSelectionOutline: isPlaying,
      hiddenTracks,
    });
  }, [
    currentTime,
    clips,
    assets,
    mediaMap,
    dims.width,
    dims.height,
    previewScale,
    selectedClipId,
    isPlaying,
    isFullscreen,
    fontRevision,
    trackSettings,
  ]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      hitRadius: Math.max(16, scaleX * 16),
    };
  };

  const hitTestCorners = (
    box: { boxX: number; boxY: number; boxW: number; boxH: number },
    px: number,
    py: number,
    hitRadius: number
  ): CornerHandle | null => {
    const corners: Array<{ key: CornerHandle; cx: number; cy: number }> = [
      { key: 'nw', cx: box.boxX, cy: box.boxY },
      { key: 'ne', cx: box.boxX + box.boxW, cy: box.boxY },
      { key: 'sw', cx: box.boxX, cy: box.boxY + box.boxH },
      { key: 'se', cx: box.boxX + box.boxW, cy: box.boxY + box.boxH },
    ];
    for (const c of corners) {
      if (Math.abs(px - c.cx) <= hitRadius && Math.abs(py - c.cy) <= hitRadius) {
        return c.key;
      }
    }
    return null;
  };

  const measureOverlayBox = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    clip: TimelineClip
  ) => {
    if (clip.textConfig) return measureTextSelectionBox(ctx, width, height, time, clip);
    if (clip.stickerConfig) return measureStickerSelectionBox(ctx, width, height, time, clip);
    return null;
  };

  // Dragging or resizing text / sticker overlay directly on preview canvas
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const pt = getCanvasPoint(e);
    if (!canvas || !pt) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const activeOverlayClips = clips
      .filter(
        (c) =>
          isTitleTrack(c.track) &&
          !getTrackControl(trackSettings, c.track).hidden &&
          (c.textConfig || c.stickerConfig) &&
          currentTime >= c.startTime &&
          currentTime < c.startTime + c.duration
      )
      .sort((a, b) => {
        const layerDiff = getTrackIndex(a.track) - getTrackIndex(b.track);
        return layerDiff !== 0 ? layerDiff : a.startTime - b.startTime;
      });
    if (activeOverlayClips.length === 0) return;

    // 1. Check resize corner handles on currently selected text/sticker overlay
    if (!isPlaying && selectedClipId) {
      const selectedOverlay = activeOverlayClips.find((c) => c.id === selectedClipId);
      if (
        selectedOverlay &&
        !getTrackControl(trackSettings, selectedOverlay.track).locked &&
        (selectedOverlay.textConfig || selectedOverlay.stickerConfig)
      ) {
        const box = measureOverlayBox(ctx, canvas.width, canvas.height, currentTime, selectedOverlay);
        if (box) {
          const corner = hitTestCorners(box, pt.x, pt.y, pt.hitRadius);
          if (corner) {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragStateRef.current = {
              mode: 'resize',
              kind: selectedOverlay.textConfig ? 'text' : 'sticker',
              clipId: selectedOverlay.id,
              isCaption: Boolean(selectedOverlay.textConfig?.isCaption),
              anchorX: box.centerX,
              anchorY: box.centerY,
              startCanvasX: pt.x,
              startCanvasY: pt.y,
              origSize: selectedOverlay.textConfig
                ? selectedOverlay.textConfig.fontSize
                : selectedOverlay.stickerConfig!.size,
              origScale: selectedOverlay.scale ?? 100,
            };
            return;
          }
        }
      }
    }

    // 2. Check if pointer is inside any active overlay bounding box (top-most first)
    let hitClip: TimelineClip | null = null;
    for (let i = activeOverlayClips.length - 1; i >= 0; i--) {
      const candidate = activeOverlayClips[i];
      const box = measureOverlayBox(ctx, canvas.width, canvas.height, currentTime, candidate);
      if (
        box &&
        pt.x >= box.boxX - 14 &&
        pt.x <= box.boxX + box.boxW + 14 &&
        pt.y >= box.boxY - 14 &&
        pt.y <= box.boxY + box.boxH + 14
      ) {
        hitClip = candidate;
        break;
      }
    }

    if (!hitClip) return;

    onSelectClip(hitClip.id);
    if (getTrackControl(trackSettings, hitClip.track).locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      mode: 'move',
      clipId: hitClip.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: hitClip.x,
      origY: hitClip.y,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!drag) {
      if (isPlaying) {
        if (canvasCursor !== 'default') setCanvasCursor('default');
        return;
      }
      const pt = getCanvasPoint(e);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!pt || !ctx) return;

      const activeOverlayClips = clips
        .filter(
          (c) =>
            isTitleTrack(c.track) &&
            !getTrackControl(trackSettings, c.track).hidden &&
            (c.textConfig || c.stickerConfig) &&
            currentTime >= c.startTime &&
            currentTime < c.startTime + c.duration
        )
        .sort((a, b) => {
          const layerDiff = getTrackIndex(a.track) - getTrackIndex(b.track);
          return layerDiff !== 0 ? layerDiff : a.startTime - b.startTime;
        });

      const selectedOverlay = activeOverlayClips.find((c) => c.id === selectedClipId);
      if (selectedOverlay && !getTrackControl(trackSettings, selectedOverlay.track).locked) {
        const box = measureOverlayBox(ctx, canvas.width, canvas.height, currentTime, selectedOverlay);
        if (box) {
          const corner = hitTestCorners(box, pt.x, pt.y, pt.hitRadius);
          if (corner === 'nw' || corner === 'se') {
            setCanvasCursor('nwse-resize');
            return;
          }
          if (corner === 'ne' || corner === 'sw') {
            setCanvasCursor('nesw-resize');
            return;
          }
        }
      }

      for (let i = activeOverlayClips.length - 1; i >= 0; i--) {
        const cand = activeOverlayClips[i];
        if (getTrackControl(trackSettings, cand.track).locked) continue;
        const box = measureOverlayBox(
          ctx,
          canvas.width,
          canvas.height,
          currentTime,
          cand
        );
        if (
          box &&
          pt.x >= box.boxX - 14 &&
          pt.x <= box.boxX + box.boxW + 14 &&
          pt.y >= box.boxY - 14 &&
          pt.y <= box.boxY + box.boxH + 14
        ) {
          setCanvasCursor('move');
          return;
        }
      }
      setCanvasCursor('default');
      return;
    }

    if (drag.mode === 'resize') {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      const dirX = drag.startCanvasX - drag.anchorX;
      const dirY = drag.startCanvasY - drag.anchorY;
      const distStart = Math.hypot(dirX, dirY) || 1;
      const projected = ((pt.x - drag.anchorX) * dirX + (pt.y - drag.anchorY) * dirY) / distStart;
      const ratio = Math.max(0.08, projected / distStart);
      if (drag.kind === 'text') {
        if (onUpdateClipScale) {
          const nextScale = Math.round(clamp(drag.origScale * ratio, 15, 500));
          onUpdateClipScale(drag.clipId, nextScale, drag.isCaption);
        } else {
          const nextFontSize = Math.round(clamp(drag.origSize * ratio, 6, 2000));
          onUpdateTextFontSize(drag.clipId, nextFontSize);
        }
      } else {
        const nextStickerSize = Math.round(clamp(drag.origSize * ratio, 24, 360));
        onUpdateStickerSize?.(drag.clipId, nextStickerSize);
      }
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    onUpdateClipPosition(
      drag.clipId,
      clamp(Number((drag.origX + dxPct).toFixed(1)), -80, 80),
      clamp(Number((drag.origY + dyPct).toFixed(1)), -80, 80)
    );
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const stepFrame = (dir: -1 | 1) => {
    const delta = 1 / fps;
    onSeek(clamp(currentTime + dir * delta, 0, Math.max(0, totalDuration)));
  };

  return (
    <section
      ref={sectionRef}
      className={
        isFullscreen
          ? '@container fixed inset-0 z-50 w-screen h-screen bg-[#05070B] flex flex-col'
          : '@container flex-1 min-w-0 min-h-0 bg-[#07090F] flex flex-col h-full'
      }
    >
      {/* Viewport Canvas Stage */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 min-w-0 flex items-center justify-center relative overflow-hidden p-1.5 @[420px]:p-3 studio-stage-aura"
      >
        <button
          type="button"
          onClick={() => void handleToggleFullscreen()}
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Preview'}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
          className="glow-btn absolute top-2.5 right-2.5 z-20 h-8 px-2.5 rounded-lg bg-[#0B0E16]/85 hover:bg-[#141A28] backdrop-blur-md border border-white/[0.14] text-slate-200 hover:text-white flex items-center gap-1.5 shadow-lg"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              <span className="text-[11px] font-medium">Exit Fullscreen</span>
            </>
          ) : (
            <Maximize2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          )}
        </button>
        <div
          className="relative rounded-lg overflow-hidden border border-white/[0.14] bg-black shadow-[0_24px_64px_-16px_rgba(0,0,0,0.92),0_0_52px_-12px_rgba(56,189,248,0.2)] max-w-full max-h-full"
          style={{
            width: stageSize.width,
            height: stageSize.height,
            aspectRatio: `${dims.width} / ${dims.height}`,
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={() => {
              if (!dragStateRef.current) setCanvasCursor('default');
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const canvas = canvasRef.current;
              const pt = getCanvasPoint(e);
              const ctx = canvas?.getContext('2d', { alpha: false });
              if (canvas && pt && ctx) {
                const activeOverlay = clips
                  .filter(
                    (c) =>
                      isTitleTrack(c.track) &&
                      !getTrackControl(trackSettings, c.track).hidden &&
                      (c.textConfig || c.stickerConfig) &&
                      currentTime >= c.startTime &&
                      currentTime < c.startTime + c.duration
                  )
                  .sort((a, b) => {
                    const layerDiff = getTrackIndex(a.track) - getTrackIndex(b.track);
                    return layerDiff !== 0 ? layerDiff : a.startTime - b.startTime;
                  });
                for (let i = activeOverlay.length - 1; i >= 0; i--) {
                  const cand = activeOverlay[i];
                  const box = measureOverlayBox(ctx, canvas.width, canvas.height, currentTime, cand);
                  if (
                    box &&
                    pt.x >= box.boxX - 8 &&
                    pt.x <= box.boxX + box.boxW + 8 &&
                    pt.y >= box.boxY - 8 &&
                    pt.y <= box.boxY + box.boxH + 8
                  ) {
                    onSelectClip(cand.id);
                    onOpenProperties({ kind: 'clip', clipId: cand.id });
                    return;
                  }
                }
              }
              const visibleActiveVisuals = clips
                .filter(
                  (c) =>
                    isVisualTrack(c.track) &&
                    !getTrackControl(trackSettings, c.track).hidden &&
                    currentTime >= c.startTime &&
                    currentTime < c.startTime + c.duration
                )
                .sort((a, b) => getTrackIndex(b.track) - getTrackIndex(a.track));
              const activeVisual =
                visibleActiveVisuals.find((c) => c.id === selectedClipId) ??
                visibleActiveVisuals[0];
              if (activeVisual) {
                onSelectClip(activeVisual.id);
                onOpenProperties({ kind: 'clip', clipId: activeVisual.id });
              } else {
                onOpenProperties({
                  kind: 'tool',
                  toolId: 'aspect-ratio',
                  title: 'Preview Stage Settings',
                  description: 'Configure canvas aspect ratio, resolution, and frame rate.',
                });
              }
            }}
            style={{ cursor: canvasCursor }}
            data-framecut-preview="true"
            className="w-full h-full block"
          />
          {clips.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
              <p className="text-sm font-medium text-slate-300">
                Timeline is empty
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Import video, image, or audio from the Media panel or add a Title overlay
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Preview Playback Seek Slider (Synced Bidirectionally with Timeline Playhead) */}
      <div className="shrink-0 studio-panel border-t border-white/[0.08] px-3 @[480px]:px-4 py-1.5 flex items-center gap-2.5">
        <span className="font-mono text-[10.5px] tabular-nums text-sky-300 shrink-0 min-w-[66px]">
          {formatTimecode(currentTime, fps)}
        </span>
        <div className="relative flex-1 flex items-center h-5 group">
          <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-[#07090F] border border-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 transition-[width] duration-75"
              style={{
                width: `${totalDuration > 0 ? clamp((currentTime / totalDuration) * 100, 0, 100) : 0}%`,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0.01, Number(totalDuration.toFixed(3)))}
            step={Number((1 / fps).toFixed(4))}
            disabled={totalDuration <= 0}
            value={totalDuration > 0 ? clamp(currentTime, 0, totalDuration) : 0}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Preview playback position"
            title="Scrub video playback (linked with timeline playhead)"
            className="relative z-10 w-full studio-slider !bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>
        <span className="font-mono text-[10.5px] tabular-nums text-slate-400 shrink-0 flex items-center gap-1.5">
          <span>{formatTimecode(totalDuration, fps)}</span>
          <span className="hidden @[500px]:inline text-[10px] text-slate-500">
            ({totalDuration > 0 ? Math.round(clamp((currentTime / totalDuration) * 100, 0, 100)) : 0}%)
          </span>
        </span>
      </div>

      {/* Transport Bar */}
      <div className="min-h-11 h-auto shrink-0 studio-panel border-t border-white/[0.06] px-2.5 @[480px]:px-4 py-1.5 flex flex-wrap @[720px]:grid @[720px]:grid-cols-[1fr_auto_1fr] items-center justify-between gap-2 overflow-x-auto studio-scroll-thin">
        {/* Left: Timecode Readout */}
        <div className="justify-self-start min-w-0 flex items-center gap-1 @[480px]:gap-1.5 text-[11px] @[480px]:text-xs font-mono text-slate-300">
          <span className="text-white font-semibold truncate">{formatTimecode(currentTime, fps)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400 truncate">{formatTimecode(totalDuration, fps)}</span>
        </div>

        {/* Center: Playback Transport Controls */}
        <div className="justify-self-center flex items-center gap-1 @[480px]:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onSeek(0)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'playback',
                title: 'Playback Controls',
                description: 'Jump to sequence start, step frame-by-frame, or toggle playback.',
                shortcut: 'Home / Space',
              });
            }}
            className="glow-btn w-7 h-7 @[480px]:w-8 @[480px]:h-8 rounded-md text-slate-400 hover:text-white border border-transparent flex items-center justify-center"
            title="Jump to start (Home)"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stepFrame(-1)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'playback',
                title: 'Previous Frame Step',
                description: 'Step backward by one frame at the active sequence FPS.',
                shortcut: 'Left Arrow',
              });
            }}
            className="glow-btn w-7 h-7 @[480px]:w-8 @[480px]:h-8 rounded-md text-slate-400 hover:text-white border border-transparent flex items-center justify-center"
            title="Previous frame (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'playback',
                title: 'Play / Pause Sequence',
                description: 'Toggle real-time canvas & audio playback from the playhead.',
                shortcut: 'Space',
              });
            }}
            className="glow-btn-prism w-8 h-7 @[480px]:w-9 @[480px]:h-8 rounded-md text-white flex items-center justify-center"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => stepFrame(1)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'playback',
                title: 'Next Frame Step',
                description: 'Step forward by one frame at the active sequence FPS.',
                shortcut: 'Right Arrow',
              });
            }}
            className="glow-btn w-7 h-7 @[480px]:w-8 @[480px]:h-8 rounded-md text-slate-400 hover:text-white border border-transparent flex items-center justify-center"
            title="Next frame (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Preview Quality & Audio Volume/Mute Group */}
        <div className="justify-self-end flex items-center gap-1.5 p-1 rounded-lg bg-white/[0.03] border border-white/[0.08] shrink-0 max-w-full">
          <button
            type="button"
            onClick={handleToggleScale}
            aria-pressed={previewScale === 'auto'}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'preview-quality',
                title: 'Preview Render Resolution',
                description:
                  'Switch between HD Preview and 1/2 Res for faster scrubbing with heavy effects.',
              });
            }}
            className={`glow-btn h-7 px-2 @[420px]:px-2.5 rounded-md text-[11px] font-medium border flex items-center gap-1.5 whitespace-nowrap ${
              previewScale === 'half'
                ? 'text-amber-300 bg-amber-500/12 border-amber-400/30'
                : 'text-sky-300 bg-sky-500/12 border-sky-400/30'
            }`}
            title="Toggle preview render resolution (HD Preview / 1/2 Res)"
          >
            <Monitor className="w-3.5 h-3.5 shrink-0" />
            <span className="@[420px]:hidden">{previewScale === 'half' ? '1/2' : 'HD'}</span>
            <span className="hidden @[420px]:inline">
              {previewScale === 'half' ? '1/2 Res' : 'HD Preview'}
            </span>
          </button>

          <div className="w-px h-4 bg-white/[0.1]" />

          <div
            className="flex items-center gap-1.5"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'preview-audio',
                title: 'Preview Audio Output',
                description: 'Adjust master preview volume or mute live audio playback.',
              });
            }}
          >
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={isMuted}
              className={`glow-btn h-7 px-2 @[560px]:px-2.5 rounded-md text-[11px] font-medium border flex items-center gap-1.5 whitespace-nowrap ${
                isMuted || previewVolume === 0
                  ? 'text-rose-300 bg-rose-500/12 border-rose-400/30'
                  : 'text-slate-200 bg-white/[0.04] border-white/[0.08] hover:text-white'
              }`}
              title={isMuted ? 'Unmute preview audio' : 'Mute preview audio'}
              aria-label={isMuted ? 'Unmute preview audio' : 'Mute preview audio'}
            >
              {isMuted || previewVolume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              ) : previewVolume <= 50 ? (
                <Volume1 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="hidden @[640px]:inline">
                {isMuted || previewVolume === 0 ? 'Muted' : 'Audio'}
              </span>
            </button>

            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : previewVolume}
              onChange={(e) => onChangePreviewVolume?.(Number(e.target.value))}
              className="w-14 @[420px]:w-16 @[600px]:w-20 studio-slider cursor-pointer"
              aria-label="Preview audio volume"
              title={`Preview audio volume: ${isMuted ? 0 : previewVolume}%`}
            />
            <span className="hidden @[700px]:inline font-mono text-[10px] text-slate-400 w-7 text-right">
              {isMuted ? 0 : previewVolume}%
            </span>
          </div>

          <div className="w-px h-4 bg-white/[0.1]" />

          <button
            type="button"
            onClick={() => void handleToggleFullscreen()}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Exit Fullscreen Preview (Esc)' : 'Fullscreen Preview'}
            aria-label={isFullscreen ? 'Exit Fullscreen Preview' : 'Fullscreen Preview'}
            className={`glow-btn h-7 px-2 @[480px]:px-2.5 rounded-md text-[11px] font-medium border flex items-center gap-1.5 whitespace-nowrap ${
              isFullscreen
                ? 'text-sky-200 bg-sky-500/20 border-sky-400/45'
                : 'text-slate-200 bg-white/[0.04] border-white/[0.08] hover:text-white'
            }`}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            )}
            <span className="hidden @[540px]:inline">
              {isFullscreen ? 'Exit' : 'Full'}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
