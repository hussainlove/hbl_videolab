import { Check, FolderOutput, Home, Redo2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { AspectRatio, ContextPropertiesTarget } from '../types/editor';
import { BrandWordmark } from './BrandWordmark';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  projectName?: string;
  onGoHome?: () => void;
  aspectRatio: AspectRatio;
  onChangeAspectRatio: (ratio: AspectRatio) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onResetSample: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  isProjectSavedFlash?: boolean;
  savedFileName?: string | null;
  hasSavedOnce?: boolean;
  onOpenExport: () => void;
  hasClips: boolean;
  hasContent?: boolean;
  onOpenProperties: (target: ContextPropertiesTarget) => void;
}

const ASPECT_OPTIONS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:5'];

export function TopBar({
  projectName,
  onGoHome,
  aspectRatio,
  onChangeAspectRatio,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onResetSample,
  onSaveProject,
  onSaveProjectAs,
  isProjectSavedFlash = false,
  savedFileName = null,
  hasSavedOnce = false,
  onOpenExport,
  hasClips,
  hasContent = hasClips,
  onOpenProperties,
}: TopBarProps) {
  return (
    <header className="min-h-13 h-auto shrink-0 studio-panel border-b border-white/[0.08] px-2.5 sm:px-4 lg:px-5 py-1.5 flex flex-wrap md:flex-nowrap items-center justify-between gap-2 sm:gap-3 lg:gap-5">
      {/* Zone 1: Home Return + Brand Wordmark */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
        {onGoHome && (
          <button
            type="button"
            onClick={onGoHome}
            className="glow-btn flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#141822] border border-white/[0.1] rounded-lg whitespace-nowrap shrink-0"
            title="Save & return to Projects Home Page"
          >
            <Home className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Projects</span>
          </button>
        )}
        <BrandWordmark size="md" />
        {projectName && (
          <span className="hidden xl:inline text-xs text-slate-400 truncate max-w-[160px] border-l border-white/[0.1] pl-2.5">
            {projectName}
          </span>
        )}
      </div>

      {/* Zone 2: Clean workspace actions & aspect ratio selector */}
      <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 min-w-0 overflow-x-auto studio-scroll-thin">
        <div className="flex items-center gap-0.5 sm:gap-1 bg-[#07090F] p-1 rounded-lg border border-white/[0.06] shrink-0">
          {ASPECT_OPTIONS.map((ratio) => {
            const active = aspectRatio === ratio;
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => onChangeAspectRatio(ratio)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenProperties({
                    kind: 'tool',
                    toolId: 'aspect-ratio',
                    title: 'Canvas Aspect Ratio & Sequence',
                    description:
                      'Configure output aspect ratio, sequence name, and frame rate for preview & export.',
                  });
                }}
                className={`glow-btn px-1.5 sm:px-2.5 py-1 text-[11px] sm:text-xs font-mono font-medium rounded-md border border-transparent whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  active
                    ? 'bg-[#1A2130] text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={`Switch canvas aspect ratio to ${ratio} (Right-click for settings)`}
              >
                {ratio}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onUndo}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'undo',
                title: 'Undo Edit',
                description: 'Revert the previous timeline edit, clip movement, trim, or effect change.',
                shortcut: 'Ctrl/Cmd+Z',
              });
            }}
            disabled={!canUndo}
            className="glow-btn flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-transparent rounded-md disabled:opacity-35 disabled:pointer-events-none whitespace-nowrap shrink-0"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Undo</span>
          </button>
          <button
            type="button"
            onClick={onRedo}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'redo',
                title: 'Redo Edit',
                description: 'Restore the next undone timeline edit or adjustment.',
                shortcut: 'Ctrl/Cmd+Shift+Z',
              });
            }}
            disabled={!canRedo}
            className="glow-btn flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-transparent rounded-md disabled:opacity-35 disabled:pointer-events-none whitespace-nowrap shrink-0"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Redo</span>
          </button>
          <button
            type="button"
            onClick={onResetSample}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'clear-project',
                title: hasContent ? 'Clear Timeline & Workspace' : 'Load Sample Project',
                description: hasContent
                  ? 'Clear current timeline clips and imported media to start fresh.'
                  : 'Load the built-in multi-track sample sequence with images, audio, and titles.',
              });
            }}
            className="glow-btn flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-transparent rounded-md whitespace-nowrap shrink-0"
            title={hasContent ? 'Clear timeline and media' : 'Load sample sequence'}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{hasContent ? 'Clear' : 'Load Sample'}</span>
          </button>
        </div>
      </div>

      {/* Zone 3: Install App, Save Project, Save As & Export Video */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <PWAInstallButton compact />
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onSaveProject}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenProperties({
                kind: 'tool',
                toolId: 'save-project',
                title: 'Save Project & Auto-Save Settings',
                description:
                  'First save asks for a project file location; subsequent saves and every movement auto-save automatically.',
                shortcut: 'Ctrl/Cmd+S',
              });
            }}
            className={`glow-btn flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 ${
              isProjectSavedFlash
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                : 'bg-[#141822] border-white/[0.1] text-slate-200 hover:text-white'
            }`}
            title={
              hasSavedOnce
                ? `Save directly${savedFileName ? ` to ${savedFileName}` : ''} (auto-saves on every movement · Ctrl/Cmd+S)`
                : 'Choose file location & save project (Ctrl/Cmd+S)'
            }
          >
            {isProjectSavedFlash ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  Save<span className="hidden md:inline"> Project</span>
                </span>
              </>
            )}
          </button>

          {hasSavedOnce && (
            <button
              type="button"
              onClick={onSaveProjectAs}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenProperties({
                  kind: 'tool',
                  toolId: 'save-project',
                  title: 'Save Project As New File',
                  description: 'Pick a new project file location and sync auto-save to it.',
                });
              }}
              className="glow-btn p-1.5 sm:p-2 text-slate-300 hover:text-white bg-[#141822] border border-white/[0.1] rounded-lg shrink-0"
              title="Choose a new save file location (Save As)"
            >
              <FolderOutput className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenExport}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenProperties({
              kind: 'tool',
              toolId: 'export-video',
              title: 'Export Video Settings',
              description:
                'Configure canvas resolution, aspect ratio, frame rate, and launch MP4/WebM export.',
            });
          }}
          disabled={!hasClips}
          className="glow-btn-prism px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:shadow-none disabled:pointer-events-none rounded-lg whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          Export<span className="hidden sm:inline"> Video</span>
        </button>
      </div>
    </header>
  );
}
