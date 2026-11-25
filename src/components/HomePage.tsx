import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Film,
  FolderOpen,
  LayoutGrid,
  List,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ASPECT_RATIO_DIMENSIONS, AspectRatio, isTitleTrack } from '../types/editor';
import { StoredProjectRecord } from '../utils/projectStorage';
import { formatTimecode } from '../utils/time';
import { BrandWordmark } from './BrandWordmark';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';

interface HomePageProps {
  projects: StoredProjectRecord[];
  currentProjectId: string | null;
  isLoading: boolean;
  onOpenProject: (projectId: string) => void;
  onCreateProject: (opts: {
    projectName: string;
    aspectRatio: AspectRatio;
    fps: 24 | 30 | 60;
    starter: 'blank' | 'sample';
  }) => void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onDuplicateProject: (projectId: string) => Promise<void> | void;
  onRenameProject: (projectId: string, newName: string) => Promise<void> | void;
  onImportProjectFile: (file: File) => Promise<void>;
}

type HomeTab = 'all' | 'current' | 'others';
type SortMode = 'updated' | 'name' | 'duration';
type ViewMode = 'grid' | 'list';

function computeProjectDuration(project: StoredProjectRecord): number {
  return (project.clips ?? []).reduce(
    (max, clip) => Math.max(max, (clip.startTime || 0) + (clip.duration || 0)),
    0
  );
}

function formatRelativeTime(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return 'Saved';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

function resolveProjectPreviewImage(project: StoredProjectRecord): string | null {
  if (
    project.thumbnailDataUrl &&
    !project.thumbnailDataUrl.startsWith('blob:')
  ) {
    return project.thumbnailDataUrl;
  }
  const firstVisual = (project.assets ?? []).find(
    (a) =>
      (a.type === 'image' || a.type === 'video') &&
      typeof (a.thumbnailUrl || a.url) === 'string' &&
      !(a.thumbnailUrl || a.url).startsWith('blob:')
  );
  if (firstVisual) {
    return firstVisual.thumbnailUrl || firstVisual.url;
  }
  return null;
}

function ProjectThumbnail({
  project,
  className = '',
}: {
  project: StoredProjectRecord;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const previewSrc = resolveProjectPreviewImage(project);
  const firstTitle = (project.clips ?? []).find(
    (c) => isTitleTrack(c.track) && c.textConfig?.text?.trim()
  )?.textConfig?.text;

  if (previewSrc && !imgFailed) {
    return (
      <div className={`relative overflow-hidden bg-[#07090F] ${className}`}>
        <img
          src={previewSrc}
          alt={project.projectName}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent pointer-events-none"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-[#121827] via-[#0B0F1A] to-[#080B12] flex flex-col items-center justify-center p-4 ${className}`}
    >
      <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400 mb-2">
        <Film className="w-4 h-4" />
      </div>
      {firstTitle ? (
        <p className="text-xs font-medium text-slate-200 text-center line-clamp-2 max-w-[85%]">
          {firstTitle}
        </p>
      ) : (
        <p className="text-[11px] font-mono text-slate-500 tabular-nums">
          {project.aspectRatio} Canvas
        </p>
      )}
    </div>
  );
}

export function HomePage({
  projects,
  currentProjectId,
  isLoading,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onDuplicateProject,
  onRenameProject,
  onImportProjectFile,
}: HomePageProps) {
  const [activeTab, setActiveTab] = useState<HomeTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAspect, setNewAspect] = useState<AspectRatio>('16:9');
  const [newFps, setNewFps] = useState<24 | 30 | 60>(30);
  const [newStarter, setNewStarter] = useState<'blank' | 'sample'>('blank');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<StoredProjectRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentProject = useMemo(() => {
    if (projects.length === 0) return null;
    if (currentProjectId) {
      const found = projects.find((p) => p.id === currentProjectId);
      if (found) return found;
    }
    return projects[0] ?? null;
  }, [projects, currentProjectId]);

  const otherProjects = useMemo(() => {
    if (!currentProject) return projects;
    return projects.filter((p) => p.id !== currentProject.id);
  }, [projects, currentProject]);

  const filteredProjects = useMemo(() => {
    let base = projects;
    if (activeTab === 'current') {
      base = currentProject ? [currentProject] : [];
    } else if (activeTab === 'others') {
      base = otherProjects;
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (p) =>
          p.projectName.toLowerCase().includes(q) ||
          p.aspectRatio.toLowerCase().includes(q)
      );
    }

    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sortMode === 'name') {
        return a.projectName.localeCompare(b.projectName);
      }
      if (sortMode === 'duration') {
        return computeProjectDuration(b) - computeProjectDuration(a);
      }
      return b.updatedAt - a.updatedAt;
    });

    // When showing "All Projects" without search & default sort, keep Other Projects in the grid
    // while Current Project has its dedicated spotlight above — unless there's only the current project or filtered
    return sorted;
  }, [projects, currentProject, otherProjects, activeTab, searchQuery, sortMode]);

  const showCurrentSpotlight =
    Boolean(currentProject) &&
    activeTab !== 'others' &&
    searchQuery.trim() === '';

  const gridListProjects = useMemo(() => {
    if (activeTab === 'all' && showCurrentSpotlight && currentProject) {
      return filteredProjects.filter((p) => p.id !== currentProject.id);
    }
    return filteredProjects;
  }, [activeTab, showCurrentSpotlight, currentProject, filteredProjects]);

  const openNewProjectModal = () => {
    setNewName(`Sequence ${projects.length + 1}`);
    setNewAspect('16:9');
    setNewFps(30);
    setNewStarter('blank');
    setIsNewModalOpen(true);
  };

  const handleSubmitNewProject = (e: React.FormEvent) => {
    e.preventDefault();
    setIsNewModalOpen(false);
    onCreateProject({
      projectName: newName.trim() || `Sequence ${projects.length + 1}`,
      aspectRatio: newAspect,
      fps: newFps,
      starter: newStarter,
    });
  };

  const startRename = (project: StoredProjectRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(project.id);
    setRenameDraft(project.projectName);
  };

  const commitRename = async (projectId: string) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (trimmed) {
      await onRenameProject(projectId, trimmed);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteProject(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      await onImportProjectFile(file);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Could not open the selected project file.'
      );
    }
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] w-screen flex flex-col bg-[#07090F] text-slate-100 overflow-hidden">
      {/* Zone 1 - Zone 2 - Zone 3 Top Bar */}
      <header className="h-14 shrink-0 studio-panel border-b border-white/[0.08] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sm:gap-8">
        <BrandWordmark size="lg" />

        <nav
          aria-label="Project views"
          className="hidden sm:flex items-center gap-6 text-xs font-medium"
        >
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`no-multi-glow py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'all'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            All Projects ({projects.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`no-multi-glow py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'current'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Current ({currentProject ? 1 : 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('others')}
            className={`no-multi-glow py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'others'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Other Projects ({otherProjects.length})
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={openNewProjectModal}
            className="glow-btn-prism flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </header>
      <OfflineIndicator />

      {/* Main Scrollable Home Workspace */}
      <main className="flex-1 min-h-0 overflow-y-auto studio-scroll studio-stage-aura">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
          {/* Page Header & Mobile Filter Switch */}
          <div className="animate-fc-fade-up flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.06] pb-5">
            <div className="space-y-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Studio Projects
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Resume any sequence from your exact playhead and timeline state, or start a new cut. All saved projects stay here until you delete them.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.framecut.json,application/json"
                onChange={handlePickFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="glow-btn flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#121622] border border-white/[0.1] rounded-lg whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                <span>Open Project File</span>
              </button>
            </div>
          </div>

          {importError && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
              <span>{importError}</span>
              <button
                type="button"
                onClick={() => setImportError(null)}
                className="p-1 text-rose-300 hover:text-white rounded"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mobile Tab Bar */}
          <div className="flex sm:hidden items-center gap-1 p-1 bg-[#10141F] border border-white/[0.08] rounded-lg overflow-x-auto studio-scroll-thin">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap ${
                activeTab === 'all' ? 'bg-[#1B2233] text-white' : 'text-slate-400'
              }`}
            >
              All ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('current')}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap ${
                activeTab === 'current' ? 'bg-[#1B2233] text-white' : 'text-slate-400'
              }`}
            >
              Current ({currentProject ? 1 : 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('others')}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap ${
                activeTab === 'others' ? 'bg-[#1B2233] text-white' : 'text-slate-400'
              }`}
            >
              Others ({otherProjects.length})
            </button>
          </div>

          {/* Loading Skeleton */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-64 rounded-xl bg-[#10141F] border border-white/[0.07] animate-pulse"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            /* Empty State */
            <div className="studio-panel border border-white/[0.08] rounded-2xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-5">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-400/25 flex items-center justify-center text-sky-300 mx-auto">
                <Film className="w-5 h-5" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  No saved projects yet
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Create a blank timeline or start with the sample studio sequence. Every edit and timeline position saves automatically and remains here until you delete it.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={openNewProjectModal}
                  className="glow-btn-prism flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white rounded-lg min-h-[40px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Project</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onCreateProject({
                      projectName: 'Pacific Horizon Edit',
                      aspectRatio: '16:9',
                      fps: 30,
                      starter: 'sample',
                    })
                  }
                  className="glow-btn flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 bg-[#141824] border border-white/[0.1] rounded-lg min-h-[40px]"
                >
                  <Play className="w-3.5 h-3.5 text-sky-400" />
                  <span>Start with Sample Edit</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Current / Recent Project Spotlight */}
              {showCurrentSpotlight && currentProject && (
                <section aria-label="Current project" className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-display text-sm font-semibold text-slate-200">
                      Current Project
                    </h2>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      Resume at {formatTimecode(currentProject.currentTime || 0)}
                    </span>
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (renamingId !== currentProject.id) {
                        onOpenProject(currentProject.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        (e.key === 'Enter' || e.key === ' ') &&
                        renamingId !== currentProject.id
                      ) {
                        e.preventDefault();
                        onOpenProject(currentProject.id);
                      }
                    }}
                    className="glow-card group cursor-pointer studio-panel border border-white/[0.1] rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[380px_1fr] items-stretch focus-visible:outline-2 focus-visible:outline-sky-400"
                  >
                    <div className="aspect-video md:aspect-auto md:min-h-[210px] relative">
                      <ProjectThumbnail
                        project={currentProject}
                        className="w-full h-full"
                      />
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-mono text-white/95 bg-black/65 backdrop-blur-xs px-2 py-1 rounded-md border border-white/10 tabular-nums">
                        <Clock className="w-3 h-3 text-sky-400" />
                        <span>
                          {formatTimecode(currentProject.currentTime || 0)} /{' '}
                          {formatTimecode(computeProjectDuration(currentProject))}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 flex flex-col justify-between gap-5 min-w-0">
                      <div className="space-y-2.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-sky-300 font-medium">
                          <span>Active Workspace</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400 font-mono tabular-nums">
                            {formatRelativeTime(currentProject.updatedAt)}
                          </span>
                        </div>

                        {renamingId === currentProject.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void commitRename(currentProject.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              className="flex-1 min-w-0 bg-[#07090F] border border-sky-400 rounded-lg px-3 py-1.5 text-base font-display font-semibold text-white outline-none"
                            />
                            <button
                              type="submit"
                              className="glow-btn p-2 bg-sky-500/20 border border-sky-400/40 text-sky-200 rounded-lg"
                              title="Save name"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingId(null)}
                              className="glow-btn p-2 text-slate-400 hover:text-white rounded-lg"
                              title="Cancel rename"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="font-display text-xl sm:text-2xl font-bold text-white truncate">
                              {currentProject.projectName}
                            </h3>
                            <button
                              type="button"
                              onClick={(e) => startRename(currentProject, e)}
                              className="p-1.5 text-slate-400 hover:text-white rounded-md shrink-0"
                              title="Rename project"
                              aria-label="Rename project"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
                          <span>{currentProject.aspectRatio}</span>
                          <span aria-hidden="true">·</span>
                          <span>{currentProject.fps} fps</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {currentProject.clips.length}{' '}
                            {currentProject.clips.length === 1 ? 'clip' : 'clips'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {currentProject.assets.length}{' '}
                            {currentProject.assets.length === 1 ? 'asset' : 'assets'}
                          </span>
                          {currentProject.savedFileName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-300 truncate max-w-[200px]">
                                {currentProject.savedFileName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex flex-wrap items-center gap-2.5 pt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenProject(currentProject.id)}
                          className="glow-btn-prism flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 min-h-[40px]"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Continue Editing</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDuplicateProject(currentProject.id)}
                          className="glow-btn flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#141926] border border-white/[0.1] rounded-lg whitespace-nowrap shrink-0 min-h-[40px]"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Duplicate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(currentProject)}
                          className="glow-btn flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg whitespace-nowrap shrink-0 min-h-[40px]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Other / All Projects Section */}
              {activeTab !== 'current' && (
                <section aria-label="Saved projects library" className="space-y-4">
                  {/* Workspace Filter Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-200">
                      <span>
                        {activeTab === 'all' && showCurrentSpotlight
                          ? 'Other Projects'
                          : activeTab === 'others'
                          ? 'Other Projects'
                          : 'All Projects'}
                      </span>
                      <span className="text-xs font-mono text-slate-400 tabular-nums">
                        ({gridListProjects.length})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 sm:flex-initial sm:w-56">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search projects..."
                          className="w-full bg-[#10141F] border border-white/[0.1] focus:border-sky-400 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none min-h-[38px]"
                        />
                      </div>

                      <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as SortMode)}
                        aria-label="Sort projects"
                        className="bg-[#10141F] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-slate-200 outline-none min-h-[38px]"
                      >
                        <option value="updated">Last Edited</option>
                        <option value="name">Name (A–Z)</option>
                        <option value="duration">Longest Duration</option>
                      </select>

                      <div className="flex items-center gap-1 p-1 bg-[#10141F] border border-white/[0.08] rounded-lg">
                        <button
                          type="button"
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded-md ${
                            viewMode === 'grid'
                              ? 'bg-[#1B2233] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Grid view"
                          aria-label="Grid view"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 rounded-md ${
                            viewMode === 'list'
                              ? 'bg-[#1B2233] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="List view"
                          aria-label="List view"
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {/* New Project Quick Card */}
                      <button
                        type="button"
                        onClick={openNewProjectModal}
                        className="glow-card group min-h-[248px] rounded-xl border border-dashed border-white/[0.18] hover:border-sky-400/60 bg-[#0D111B]/70 flex flex-col items-center justify-center gap-3 p-6 text-center"
                      >
                        <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 group-hover:scale-105 transition-transform">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="font-display text-sm font-semibold text-white">
                            New Project
                          </div>
                          <p className="text-xs text-slate-400">
                            Start a fresh timeline sequence
                          </p>
                        </div>
                      </button>

                      {gridListProjects.map((project) => {
                        const dur = computeProjectDuration(project);
                        const isCurrent = currentProject?.id === project.id;
                        return (
                          <div
                            key={project.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (renamingId !== project.id) {
                                onOpenProject(project.id);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (
                                (e.key === 'Enter' || e.key === ' ') &&
                                renamingId !== project.id
                              ) {
                                e.preventDefault();
                                onOpenProject(project.id);
                              }
                            }}
                            className="glow-card fc-card-lift animate-fc-fade-in group cursor-pointer studio-panel border border-white/[0.09] rounded-xl overflow-hidden flex flex-col justify-between focus-visible:outline-2 focus-visible:outline-sky-400"
                          >
                            <div className="aspect-video relative">
                              <ProjectThumbnail
                                project={project}
                                className="w-full h-full"
                              />
                              <div className="absolute bottom-2.5 right-2.5 text-[11px] font-mono text-white bg-black/70 px-1.5 py-0.5 rounded border border-white/10 tabular-nums">
                                {formatTimecode(dur)}
                              </div>
                            </div>

                            <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                              <div className="space-y-1.5 min-w-0">
                                {renamingId === project.id ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      void commitRename(project.id);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1.5"
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      value={renameDraft}
                                      onChange={(e) => setRenameDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setRenamingId(null);
                                      }}
                                      className="flex-1 min-w-0 bg-[#07090F] border border-sky-400 rounded-md px-2 py-1 text-xs font-medium text-white outline-none"
                                    />
                                    <button
                                      type="submit"
                                      className="p-1 text-sky-300 hover:text-white"
                                      title="Save name"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </form>
                                ) : (
                                  <div className="flex items-center justify-between gap-2 min-w-0">
                                    <h3 className="font-display text-sm font-semibold text-white truncate">
                                      {project.projectName}
                                    </h3>
                                    <button
                                      type="button"
                                      onClick={(e) => startRename(project, e)}
                                      className="p-1 text-slate-500 hover:text-white rounded shrink-0"
                                      title="Rename project"
                                      aria-label={`Rename ${project.projectName}`}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400 font-mono tabular-nums">
                                  {isCurrent && (
                                    <>
                                      <span className="text-sky-300 font-sans font-medium">
                                        Current
                                      </span>
                                      <span aria-hidden="true">·</span>
                                    </>
                                  )}
                                  <span>{project.aspectRatio}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{project.clips.length} clips</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatRelativeTime(project.updatedAt)}</span>
                                </div>
                              </div>

                              <div
                                className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpenProject(project.id)}
                                  className="glow-btn flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-[#151B29] border border-white/[0.1] rounded-lg whitespace-nowrap min-h-[36px]"
                                >
                                  <Play className="w-3 h-3 text-sky-400 fill-current" />
                                  <span>Open</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onDuplicateProject(project.id)}
                                  className="glow-btn p-2 text-slate-300 hover:text-white bg-[#131722] border border-white/[0.08] rounded-lg shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
                                  title="Duplicate project"
                                  aria-label={`Duplicate ${project.projectName}`}
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(project)}
                                  className="glow-btn p-2 text-rose-300 hover:text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
                                  title="Delete project"
                                  aria-label={`Delete ${project.projectName}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* List View */
                    <div className="studio-panel border border-white/[0.08] rounded-xl overflow-hidden divide-y divide-white/[0.06]">
                      <button
                        type="button"
                        onClick={openNewProjectModal}
                        className="w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.03] text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-9 rounded-md border border-dashed border-sky-400/40 bg-sky-500/10 flex items-center justify-center text-sky-300 shrink-0">
                            <Plus className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white">
                              New Project
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Create a new sequence
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-sky-300 font-medium whitespace-nowrap">
                          Create
                        </span>
                      </button>

                      {gridListProjects.map((project) => {
                        const dur = computeProjectDuration(project);
                        const isCurrent = currentProject?.id === project.id;
                        return (
                          <div
                            key={project.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (renamingId !== project.id) {
                                onOpenProject(project.id);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (
                                (e.key === 'Enter' || e.key === ' ') &&
                                renamingId !== project.id
                              ) {
                                e.preventDefault();
                                onOpenProject(project.id);
                              }
                            }}
                            className="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-white/[0.03] cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                              <ProjectThumbnail
                                project={project}
                                className="w-16 h-10 rounded-md border border-white/[0.08] shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                {renamingId === project.id ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      void commitRename(project.id);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 max-w-xs"
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      value={renameDraft}
                                      onChange={(e) => setRenameDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setRenamingId(null);
                                      }}
                                      className="flex-1 min-w-0 bg-[#07090F] border border-sky-400 rounded px-2 py-1 text-xs text-white outline-none"
                                    />
                                    <button
                                      type="submit"
                                      className="p-1 text-sky-300 hover:text-white"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </form>
                                ) : (
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-white truncate">
                                      {project.projectName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => startRename(project, e)}
                                      className="p-1 text-slate-500 hover:text-white rounded shrink-0"
                                      title="Rename project"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400 font-mono tabular-nums">
                                  {isCurrent && (
                                    <>
                                      <span className="text-sky-300 font-sans font-medium">
                                        Current
                                      </span>
                                      <span aria-hidden="true">·</span>
                                    </>
                                  )}
                                  <span>{project.aspectRatio}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{project.fps} fps</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatTimecode(dur)}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{project.clips.length} clips</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatRelativeTime(project.updatedAt)}</span>
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-2 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => onOpenProject(project.id)}
                                className="glow-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-[#151B29] border border-white/[0.1] rounded-lg whitespace-nowrap min-h-[36px]"
                              >
                                <Play className="w-3 h-3 text-sky-400 fill-current" />
                                <span>Open</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void onDuplicateProject(project.id)}
                                className="glow-btn p-2 text-slate-300 hover:text-white bg-[#131722] border border-white/[0.08] rounded-lg min-h-[36px]"
                                title="Duplicate project"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(project)}
                                className="glow-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg whitespace-nowrap min-h-[36px]"
                                title="Delete project"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {gridListProjects.length === 0 && searchQuery.trim() !== '' && (
                    <div className="text-center py-8 text-xs text-slate-400">
                      No projects matched "{searchQuery}".
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* New Project Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitNewProject}
            className="animate-fc-modal-pop w-full max-w-md studio-panel border border-white/[0.12] rounded-xl overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-white">
                  Create New Project
                </h2>
                <p className="text-[11px] text-slate-400">
                  Configure sequence dimensions and starting workspace
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-lg"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Project Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Untitled Sequence"
                  className="w-full bg-[#07090F] border border-white/[0.12] focus:border-sky-400 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['16:9', '9:16', '1:1', '4:5'] as AspectRatio[]).map((ratio) => {
                    const active = newAspect === ratio;
                    return (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setNewAspect(ratio)}
                        className={`px-3 py-2 text-left rounded-lg border text-xs transition-colors ${
                          active
                            ? 'bg-sky-500/15 border-sky-400/60 text-white'
                            : 'bg-[#0A0D15] border-white/[0.08] text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="font-mono font-semibold tabular-nums">
                          {ratio}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ASPECT_RATIO_DIMENSIONS[ratio].label.replace(`${ratio} `, '')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Frame Rate
                  </label>
                  <select
                    value={newFps}
                    onChange={(e) =>
                      setNewFps(Number(e.target.value) as 24 | 30 | 60)
                    }
                    className="w-full bg-[#07090F] border border-white/[0.12] rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                  >
                    <option value={24}>24 fps (Cinema)</option>
                    <option value={30}>30 fps (Standard)</option>
                    <option value={60}>60 fps (Smooth)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Workspace Start
                  </label>
                  <select
                    value={newStarter}
                    onChange={(e) =>
                      setNewStarter(e.target.value as 'blank' | 'sample')
                    }
                    className="w-full bg-[#07090F] border border-white/[0.12] rounded-lg px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="blank">Blank Timeline</option>
                    <option value="sample">Sample Showcase</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0B0E16] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="glow-btn px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Project</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-fc-modal-pop w-full max-w-sm studio-panel border border-white/[0.12] rounded-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h2 className="font-display text-sm font-semibold text-white">
                  Delete Project
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setDeleteTarget(null)}
                className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-lg"
                aria-label="Cancel delete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-2">
              <p className="text-xs text-slate-200 leading-relaxed">
                Delete <span className="font-semibold text-white">"{deleteTarget.projectName}"</span>?
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                This removes the saved sequence ({deleteTarget.clips.length} clips) from your project library. Other saved projects will remain untouched.
              </p>
            </div>

            <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0B0E16] flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="glow-btn px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Project'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
