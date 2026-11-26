import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FolderOpen, FolderOutput, HardDrive, Save, X } from 'lucide-react';
import {
  getLastLinkedFolderPathFromLocalStorage,
  normalizeFolderPath,
  SaveDirectoryHandleLike,
  SaveFileHandleLike,
} from '../utils/projectStorage';

interface SaveLocationModalProps {
  isOpen: boolean;
  mode?: 'new-project' | 'save' | 'save-as';
  projectName?: string;
  defaultFileName: string;
  defaultFolderPath?: string;
  hasLinkedSystemFolder?: boolean;
  onClose: () => void;
  onConfirmSaveFile: (
    fileName: string,
    folderPath?: string,
    pickedHandles?: {
      fileHandle: SaveFileHandleLike;
      dirHandle?: SaveDirectoryHandleLike | null;
    }
  ) => void;
  onDownloadProjectJson?: (fileName: string) => void;
}

export function SaveLocationModal({
  isOpen,
  mode = 'save',
  projectName,
  defaultFileName,
  defaultFolderPath,
  hasLinkedSystemFolder = false,
  onClose,
  onConfirmSaveFile,
  onDownloadProjectJson,
}: SaveLocationModalProps) {
  const [fileName, setFileName] = useState(defaultFileName);
  const [folderPath, setFolderPath] = useState('');
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [pickedHandles, setPickedHandles] = useState<{
    fileHandle: SaveFileHandleLike;
    dirHandle?: SaveDirectoryHandleLike | null;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFileName(defaultFileName);
      const projectSlug =
        (projectName || 'Sequence')
          .trim()
          .replace(/[^a-zA-Z0-9._ -]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'Project';
      const lastRoot = getLastLinkedFolderPathFromLocalStorage();
      const baseRoot = lastRoot ? lastRoot.split('/')[0] || 'HBL-Projects' : 'HBL-Projects';
      const cleanFolder =
        defaultFolderPath?.trim() || `${baseRoot}/${projectSlug}`;
      setFolderPath(cleanFolder);
      setPickerNotice(null);
      setIsPicking(false);
      setPickedHandles(null);
    }
  }, [isOpen, defaultFileName, defaultFolderPath, projectName]);

  if (!isOpen) return null;

  const trimmed = fileName.trim() || 'hbl-project';
  const normalized =
    trimmed.toLowerCase().endsWith('.framecut.json') || trimmed.toLowerCase().endsWith('.json')
      ? trimmed
      : `${trimmed}.framecut.json`;
  const normalizedFolder = normalizeFolderPath(folderPath, 'HBL-Projects');

  const handleBrowseSystemLocation = async () => {
    setPickerNotice(null);
    setIsPicking(true);
    try {
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
          const fileHandle = await dirHandle.getFileHandle(normalized, { create: true });
          setFolderPath(dirHandle.name);
          setFileName(fileHandle.name);
          setPickedHandles({ fileHandle, dirHandle });
          onConfirmSaveFile(fileHandle.name, dirHandle.name, { fileHandle, dirHandle });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          // Fall through to save file picker if directory picker was blocked
        }
      }

      if (typeof win.showSaveFilePicker === 'function') {
        try {
          const fileHandle = await win.showSaveFilePicker({
            suggestedName: normalized,
            types: [
              {
                description: 'HBL videolab Project',
                accept: { 'application/json': ['.framecut.json', '.json'] },
              },
            ],
          });
          setFileName(fileHandle.name);
          setPickedHandles({ fileHandle, dirHandle: null });
          onConfirmSaveFile(fileHandle.name, normalizedFolder, { fileHandle, dirHandle: null });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
        }
      }

      setPickerNotice(
        'Browser preview restricts OS folder dialogs — confirm your Project Folder Path below to link it directly with Local Storage and enable 30s auto-save.'
      );
    } finally {
      setIsPicking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmSaveFile(normalized, normalizedFolder, pickedHandles ?? undefined);
  };

  const heading =
    mode === 'new-project'
      ? 'Link Project Folder & File Path'
      : mode === 'save-as'
      ? 'Save Project As (Link New Folder)'
      : 'Link Project Folder & Save';

  const isDiskFolderReady = Boolean(pickedHandles?.dirHandle || hasLinkedSystemFolder);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md studio-panel border border-white/[0.12] rounded-xl overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
              <FolderOutput className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold text-white truncate">
                {heading}
              </h2>
              <p className="text-[11px] text-slate-400">
                Links this project folder with Local Storage &amp; auto-saves every 30s.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-lg border border-transparent shrink-0"
            title="Skip for now"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5">
          <button
            type="button"
            disabled={isPicking}
            onClick={() => void handleBrowseSystemLocation()}
            className="glow-btn w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-xs font-semibold text-sky-100 disabled:opacity-50"
          >
            <FolderOpen className="w-4 h-4 text-sky-300" />
            <span>{isPicking ? 'Opening Folder Picker...' : 'Browse & Link Device Folder...'}</span>
          </button>

          {pickerNotice && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200 leading-relaxed">
              {pickerNotice}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs text-slate-300 font-medium">
              Project Folder Path (Linked to Local Storage)
            </label>
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="HBL-Projects/My-Video"
              className="w-full bg-[#090B10] border border-white/[0.12] focus:border-sky-400 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-slate-300 font-medium">
              Project File Name
            </label>
            <input
              type="text"
              autoFocus
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="my-sequence.framecut.json"
              className="w-full bg-[#090B10] border border-white/[0.12] focus:border-sky-400 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none"
            />
          </div>

          <div className="rounded-lg bg-[#090C13] border border-white/[0.08] px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Local Storage Folder Link</span>
              </span>
              {isDiskFolderReady && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-sky-300">
                  <HardDrive className="w-3 h-3" />
                  <span>Device Folder Attached</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 font-mono break-all">
              {normalizedFolder}/{normalized}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every 30 seconds and on timeline edits, this project stays synced to this linked folder in Local Storage.
            </p>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0D1017] flex flex-wrap items-center justify-between gap-2">
          <div>
            {onDownloadProjectJson && (
              <button
                type="button"
                onClick={() => onDownloadProjectJson(normalized)}
                className="glow-btn flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-[#131823] border border-white/[0.1] rounded-lg"
                title="Download a portable .framecut.json backup copy"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Export .json Copy</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="glow-btn px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-transparent"
            >
              {mode === 'new-project' ? 'Later' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save &amp; Link Folder</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
