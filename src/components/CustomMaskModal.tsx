import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Eraser,
  FlipHorizontal2,
  Paintbrush,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { CustomMaskItem } from '../types/editor';
import { convertMaskFileToAlphaPng, downloadCustomMaskPng } from '../utils/maskStorage';
import { uid } from '../utils/time';

interface CustomMaskModalProps {
  isOpen: boolean;
  hasSelectedVisualClip: boolean;
  onClose: () => void;
  onSaveCustomMask: (mask: CustomMaskItem, applyToSelected: boolean) => Promise<void>;
}

const CANVAS_W = 480;
const CANVAS_H = 320;

export function CustomMaskModal({
  isOpen,
  hasSelectedVisualClip,
  onClose,
  onSaveCustomMask,
}: CustomMaskModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDrawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  const [maskName, setMaskName] = useState('Custom Mask 1');
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(34);
  const [mirrorX, setMirrorX] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toolSearch, setToolSearch] = useState('');

  const seedDefaultShape = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(CANVAS_W / 2, CANVAS_H / 2, Math.min(CANVAS_W, CANVAS_H) * 0.34, 0, Math.PI * 2);
    ctx.fill();
  };

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setToolSearch('');
    setMaskName(`Custom Mask ${Math.floor(100 + Math.random() * 899)}`);
    const raf = requestAnimationFrame(() => seedDefaultShape());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  if (!isOpen) return null;

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const drawSegment = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const strokePass = (ax: number, ay: number, bx: number, by: number) => {
      ctx.save();
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = '#FFFFFF';
      ctx.fillStyle = '#FFFFFF';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    };

    strokePass(p1.x, p1.y, p2.x, p2.y);
    if (mirrorX) {
      strokePass(CANVAS_W - p1.x, p1.y, CANVAS_W - p2.x, p2.y);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getPoint(e);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastPtRef.current = pt;
    drawSegment(pt, { x: pt.x + 0.01, y: pt.y + 0.01 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPtRef.current) return;
    const pt = getPoint(e);
    if (!pt) return;
    drawSegment(lastPtRef.current, pt);
    lastPtRef.current = pt;
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
    lastPtRef.current = null;
  };

  const applyQuickStamp = (kind: 'clear' | 'star' | 'heart' | 'slash') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (kind === 'clear') return;

    ctx.fillStyle = '#FFFFFF';
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;

    if (kind === 'star') {
      const spikes = 5;
      const outerR = Math.min(CANVAS_W, CANVAS_H) * 0.42;
      const innerR = outerR * 0.44;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i * Math.PI) / spikes - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'heart') {
      const size = Math.min(CANVAS_W, CANVAS_H) * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx, cy + size * 0.85);
      ctx.bezierCurveTo(cx - size * 1.4, cy + size * 0.1, cx - size * 0.9, cy - size * 0.95, cx, cy - size * 0.3);
      ctx.bezierCurveTo(cx + size * 0.9, cy - size * 0.95, cx + size * 1.4, cy + size * 0.1, cx, cy + size * 0.85);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'slash') {
      ctx.beginPath();
      ctx.moveTo(CANVAS_W * 0.2, 0);
      ctx.lineTo(CANVAS_W * 0.85, 0);
      ctx.lineTo(CANVAS_W * 0.65, CANVAS_H);
      ctx.lineTo(0, CANVAS_H);
      ctx.closePath();
      ctx.fill();
    }
  };

  const handleInvertMaskCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255 - d[i + 3];
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const handleUploadMaskImage = async (file: File) => {
    setErrorMsg(null);
    try {
      const dataUrl = await convertMaskFileToAlphaPng(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed loading mask'));
        img.src = dataUrl;
      });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      const base = file.name.replace(/\.[^.]+$/, '').trim();
      if (base) setMaskName(base);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not import mask file.');
    }
  };

  const exportCanvasDataUrl = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  };

  const handleDownloadPng = () => {
    const dataUrl = exportCanvasDataUrl();
    if (!dataUrl) return;
    downloadCustomMaskPng({ name: maskName, dataUrl });
  };

  const handleSave = async (applyToSelected: boolean) => {
    const dataUrl = exportCanvasDataUrl();
    if (!dataUrl) return;
    setIsSaving(true);
    try {
      const item: CustomMaskItem = {
        id: uid('mask'),
        name: maskName.trim() || 'Custom Mask',
        dataUrl,
        createdAt: Date.now(),
      };
      await onSaveCustomMask(item, applyToSelected);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl studio-panel border border-white/[0.12] rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500/25 to-violet-500/25 border border-sky-400/35 flex items-center justify-center text-sky-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Custom Mask Studio
              </h2>
              <p className="text-[11px] text-slate-400">
                Draw or upload your own mask design, download as PNG, and save permanently
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-lg border border-transparent"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls + Canvas */}
        <div className="p-5 space-y-4 overflow-y-auto studio-scroll">
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={maskName}
              onChange={(e) => setMaskName(e.target.value)}
              placeholder="Custom mask name..."
              className="flex-1 min-w-[160px] px-3 py-1.5 text-xs text-slate-100 bg-[#07090F] border border-white/[0.12] focus:border-sky-400 rounded-lg outline-none"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleUploadMaskImage(file);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="glow-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#141822] border border-white/[0.1] rounded-lg"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Upload PNG / SVG</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              className="glow-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-200 bg-sky-500/15 border border-sky-400/35 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </button>
          </div>

          {/* Drawing Toolbar */}
          {(() => {
            const needle = toolSearch.trim().toLowerCase();
            const showTool = (keywords: string) =>
              !needle || keywords.toLowerCase().includes(needle);
            return (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="Search mask tools & shapes (brush, mirror, star, heart, invert)..."
                className="w-full pl-7 pr-6 py-1 text-[11px] text-slate-100 bg-[#07090F] border border-white/[0.09] rounded-md focus:outline-none focus:border-sky-400 placeholder:text-slate-500"
              />
              {toolSearch && (
                <button
                  type="button"
                  onClick={() => setToolSearch('')}
                  className="glow-btn absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-white border border-transparent"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-[#090B10] border border-white/[0.08]">
            <div className="flex items-center gap-1.5">
              {showTool('brush draw') && (
              <button
                type="button"
                onClick={() => setTool('brush')}
                className={`glow-btn flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border ${
                  tool === 'brush'
                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                    : 'bg-[#141822] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                <span>Brush</span>
              </button>
              )}
              {showTool('eraser remove') && (
              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={`glow-btn flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border ${
                  tool === 'eraser'
                    ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                    : 'bg-[#141822] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Eraser</span>
              </button>
              )}
              {showTool('mirror flip horizontal symmetry') && (
              <button
                type="button"
                onClick={() => setMirrorX((m) => !m)}
                className={`glow-btn flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border ${
                  mirrorX
                    ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                    : 'bg-[#141822] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
                title="Mirror drawing horizontally"
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                <span>Mirror</span>
              </button>
              )}
            </div>

            {showTool('brush size thickness') && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-mono">Size {brushSize}px</span>
              <input
                type="range"
                min={6}
                max={90}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-24 studio-slider"
              />
            </div>
            )}

            <div className="flex items-center gap-1">
              {showTool('star shape') && (
              <button
                type="button"
                onClick={() => applyQuickStamp('star')}
                className="glow-btn px-2 py-1 text-[11px] rounded bg-[#141822] text-slate-300 hover:text-white border border-white/[0.08]"
              >
                Star
              </button>
              )}
              {showTool('heart shape') && (
              <button
                type="button"
                onClick={() => applyQuickStamp('heart')}
                className="glow-btn px-2 py-1 text-[11px] rounded bg-[#141822] text-slate-300 hover:text-white border border-white/[0.08]"
              >
                Heart
              </button>
              )}
              {showTool('diagonal slash shape') && (
              <button
                type="button"
                onClick={() => applyQuickStamp('slash')}
                className="glow-btn px-2 py-1 text-[11px] rounded bg-[#141822] text-slate-300 hover:text-white border border-white/[0.08]"
              >
                Diagonal
              </button>
              )}
              {showTool('invert mask') && (
              <button
                type="button"
                onClick={handleInvertMaskCanvas}
                className="glow-btn px-2 py-1 text-[11px] rounded bg-[#141822] text-slate-300 hover:text-white border border-white/[0.08]"
              >
                Invert
              </button>
              )}
              {showTool('clear reset') && (
              <button
                type="button"
                onClick={() => applyQuickStamp('clear')}
                className="glow-btn p-1.5 rounded bg-[#141822] text-slate-400 hover:text-rose-200 border border-white/[0.08]"
                title="Clear canvas"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              )}
            </div>
          </div>
          </div>
            );
          })()}

          {/* Drawing Surface */}
          <div
            className="relative rounded-xl overflow-hidden border border-white/[0.12] bg-[#07090F] flex items-center justify-center"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #101520 25%, transparent 25%), linear-gradient(-45deg, #101520 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #101520 75%), linear-gradient(-45deg, transparent 75%, #101520 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full max-w-[480px] aspect-[3/2] cursor-crosshair touch-none"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0D1017] flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">
            White areas reveal video · Transparent areas hide
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="glow-btn px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-transparent"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSave(false)}
              className="glow-btn px-3.5 py-2 text-xs font-medium text-slate-100 bg-[#161B26] border border-white/[0.12] rounded-lg"
            >
              Save to Library
            </button>
            {hasSelectedVisualClip && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSave(true)}
                className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Apply</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
