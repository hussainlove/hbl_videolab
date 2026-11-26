import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Film, Search, X } from 'lucide-react';
import {
  AspectRatio,
  ExportResult,
  ExportSettings,
  MediaAsset,
  RenderProgress,
  TimelineClip,
  TrackSettingsMap,
} from '../types/editor';
import {
  computeExportDimensions,
  EncoderCapabilities,
  probeEncoderCapabilities,
  renderProjectVideo,
} from '../utils/exporter';
import { formatBytes, formatShortTime } from '../utils/time';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  aspectRatio: AspectRatio;
  defaultFps: 24 | 30 | 60;
  clips: TimelineClip[];
  assets: MediaAsset[];
  totalDuration: number;
  trackSettings?: TrackSettingsMap;
}

export function ExportModal({
  isOpen,
  onClose,
  projectName,
  aspectRatio,
  defaultFps,
  clips,
  assets,
  totalDuration,
  trackSettings,
}: ExportModalProps) {
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'mp4',
    resolution: '1080p',
    fps: defaultFps,
    quality: 'fast',
  });
  const [caps, setCaps] = useState<EncoderCapabilities | null>(null);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [settingSearch, setSettingSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSettingSearch('');
    setSettings((prev) => ({ ...prev, fps: defaultFps }));
    setProgress(null);
    setErrorMsg(null);
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, [isOpen, defaultFps]);

  useEffect(() => {
    if (!isOpen) return;
    const dims = computeExportDimensions(aspectRatio, settings.resolution);
    void probeEncoderCapabilities(dims.width, dims.height, settings.fps, 10_000_000).then(setCaps);
  }, [isOpen, aspectRatio, settings.resolution, settings.fps]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!isOpen) return null;

  const isRendering =
    progress !== null &&
    progress.phase !== 'done' &&
    progress.phase !== 'error' &&
    progress.phase !== 'cancelled';

  const dims = computeExportDimensions(aspectRatio, settings.resolution);

  const triggerVideoDownload = (exportResult: ExportResult) => {
    const link = document.createElement('a');
    link.href = exportResult.url;
    link.download = exportResult.fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    }, 1000);
  };

  const handleStartRender = async () => {
    setErrorMsg(null);
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const exportResult = await renderProjectVideo({
        projectName,
        aspectRatio,
        clips,
        assets,
        settings,
        hiddenTracks: trackSettings
          ? Object.fromEntries(Object.entries(trackSettings).map(([k, v]) => [k, v.hidden]))
          : undefined,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(exportResult);
      triggerVideoDownload(exportResult);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setProgress(null);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Export failed unexpectedly.');
        setProgress(null);
      }
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setProgress(null);
  };

  const handleClose = () => {
    if (isRendering) handleCancel();
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg max-h-[90dvh] bg-[#141821] border border-white/[0.1] rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Export Video
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              {dims.width} × {dims.height} · {formatShortTime(totalDuration)} sequence
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-lg border border-transparent"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto studio-scroll min-h-0">
          {/* Configuration Form */}
          {!isRendering && !result && (() => {
            const needle = settingSearch.trim().toLowerCase();
            const showExportRow = (keywords: string) =>
              !needle || keywords.toLowerCase().includes(needle);
            return (
            <>
              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={settingSearch}
                  onChange={(e) => setSettingSearch(e.target.value)}
                  placeholder="Search export settings (mp4, fps, 1080p, quality)..."
                  className="w-full pl-7 pr-6 py-1 text-[11px] text-slate-100 bg-[#0B0D11] border border-white/[0.09] rounded-md focus:outline-none focus:border-sky-400 placeholder:text-slate-500"
                />
                {settingSearch && (
                  <button
                    type="button"
                    onClick={() => setSettingSearch('')}
                    className="glow-btn absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-white border border-transparent"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {(showExportRow('container format mp4 webm') || showExportRow('frame rate fps 24 30 60')) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {showExportRow('container format mp4 webm') && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-slate-400">Container Format</label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/[0.06]">
                    {(['mp4', 'webm'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, format: fmt }))}
                        className={`glow-btn py-1.5 text-xs font-mono uppercase rounded-md border border-transparent ${
                          settings.format === fmt
                            ? 'bg-[#1D2330] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
                )}

                {showExportRow('frame rate fps 24 30 60') && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-slate-400">Frame Rate</label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/[0.06]">
                    {([24, 30, 60] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, fps: rate }))}
                        className={`glow-btn py-1.5 text-xs font-mono rounded-md border border-transparent ${
                          settings.fps === rate
                            ? 'bg-[#1D2330] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {rate}
                      </button>
                    ))}
                  </div>
                </div>
                )}
              </div>
              )}

              {showExportRow('resolution 720p 1080p 4k') && (
              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">Resolution</label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/[0.06]">
                  {(['720p', '1080p', '4k'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, resolution: res }))}
                      className={`glow-btn py-1.5 text-xs font-mono uppercase rounded-md border border-transparent ${
                        settings.resolution === res
                          ? 'bg-[#1D2330] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {showExportRow('encoding quality super fast balanced master hq') && (
              <div className="space-y-1.5">
                <label className="block text-xs text-slate-400">Encoding Quality</label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/[0.06]">
                  {(
                    [
                      { id: 'fast', label: 'Super Fast' },
                      { id: 'balanced', label: 'Balanced Fast' },
                      { id: 'master', label: 'Master HQ' },
                    ] as const
                  ).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, quality: q.id }))}
                      className={`glow-btn py-1.5 text-xs font-medium rounded-md border border-transparent ${
                        settings.quality === q.id
                          ? 'bg-[#1D2330] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {caps && (
                <div className="text-xs text-slate-400 pt-1">
                  {caps.webCodecsSupported &&
                  (settings.format === 'mp4' ? caps.mp4VideoCodec : caps.webmVideoCodec)
                    ? `Turbo GPU WebCodecs encoder ready · ${
                        settings.format === 'mp4'
                          ? `H.264 + ${caps.mp4AudioMuxerCodec === 'opus' ? 'Opus' : caps.mp4AudioMuxerCodec === 'aac' ? 'AAC' : 'Audio'}`
                          : 'VP8/VP9 + Opus'
                      }`
                    : 'Using browser MediaRecorder fallback encoder (with audio)'}
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {errorMsg}
                </div>
              )}
            </>
            );
          })()}

          {/* Active Rendering Progress */}
          {isRendering && progress && (
            <div className="space-y-4">
              {progress.previewDataUrl && (
                <div className="w-full h-44 rounded-lg overflow-hidden bg-black border border-white/[0.08] flex items-center justify-center">
                  <img
                    src={progress.previewDataUrl}
                    alt="Current rendered frame"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-200 font-medium capitalize">
                    {progress.phase === 'audio'
                      ? 'Mixing stereo audio...'
                      : progress.phase === 'muxing'
                      ? 'Finalizing container...'
                      : 'Rendering frames...'}
                  </span>
                  <span className="font-mono text-blue-400 font-semibold">
                    {progress.percent}%
                  </span>
                </div>

                <div className="h-2 bg-[#0B0D11] rounded-full overflow-hidden border border-white/[0.06]">
                  <div
                    className="h-full bg-blue-600 transition-[width] duration-150"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                  <span>
                    Frame {progress.currentFrame} / {progress.totalFrames}
                  </span>
                  <span>
                    {progress.fpsSpeed > 0
                      ? `${Math.round(progress.fpsSpeed)} fps · ${progress.realtimeFactor.toFixed(1)}x realtime`
                      : `${(progress.elapsedMs / 1000).toFixed(1)}s elapsed`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Completed Render Output */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 text-emerald-400 text-sm font-medium">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Rendered in {(result.renderTimeMs / 1000).toFixed(2)}s (
                    {result.realtimeFactor.toFixed(1)}x realtime)
                  </span>
                </div>
                <span className="text-[11px] font-mono text-sky-300 bg-sky-500/15 border border-sky-400/30 px-2 py-0.5 rounded shrink-0">
                  Auto-downloaded
                </span>
              </div>

              <div className="w-full rounded-lg overflow-hidden bg-black border border-white/[0.1]">
                <video
                  src={result.url}
                  controls
                  playsInline
                  className="w-full max-h-56 mx-auto"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{result.codecLabel}</span>
                <span>
                  {result.frameCount} frames · {formatBytes(result.fileSizeBytes)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-white/[0.08] bg-[#10131A] flex items-center justify-end gap-3">
          {!isRendering && !result && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="glow-btn px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-transparent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartRender}
                className="glow-btn-prism flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Render Video</span>
              </button>
            </>
          )}

          {isRendering && (
            <button
              type="button"
              onClick={handleCancel}
              className="glow-btn px-4 py-2 text-xs font-medium text-rose-300 hover:text-white bg-rose-500/15 border border-rose-500/30 rounded-lg"
            >
              Abort Render
            </button>
          )}

          {result && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (result.url) URL.revokeObjectURL(result.url);
                  setResult(null);
                  setProgress(null);
                }}
                className="glow-btn px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-transparent"
              >
                Render Again
              </button>
              <a
                href={result.url}
                download={result.fileName}
                className="glow-btn-prism flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {result.fileName.endsWith('.mp4') ? 'MP4' : 'WebM'}</span>
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
