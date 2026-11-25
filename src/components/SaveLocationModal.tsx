import { useEffect, useState } from 'react';
import { FolderOutput, Save, X } from 'lucide-react';

interface SaveLocationModalProps {
  isOpen: boolean;
  defaultFileName: string;
  onClose: () => void;
  onConfirmSaveFile: (fileName: string) => void;
}

export function SaveLocationModal({
  isOpen,
  defaultFileName,
  onClose,
  onConfirmSaveFile,
}: SaveLocationModalProps) {
  const [fileName, setFileName] = useState(defaultFileName);

  useEffect(() => {
    if (isOpen) {
      setFileName(defaultFileName);
    }
  }, [isOpen, defaultFileName]);

  if (!isOpen) return null;

  const trimmed = fileName.trim() || 'framecut-project';
  const normalized =
    trimmed.toLowerCase().endsWith('.framecut.json') || trimmed.toLowerCase().endsWith('.json')
      ? trimmed
      : `${trimmed}.framecut.json`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmSaveFile(normalized);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md studio-panel border border-white/[0.12] rounded-xl overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <FolderOutput className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Choose Project Save File
              </h2>
              <p className="text-[11px] text-slate-400">
                First-time save creates your project file; future saves & movements auto-save.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glow-btn p-1.5 text-slate-400 hover:text-white rounded-lg border border-transparent"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
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
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Saves as <span className="text-sky-300 font-mono">{normalized}</span>. After this first save, clicking Save Project or moving any clip auto-saves without asking again.
          </p>
        </div>

        <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0D1017] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="glow-btn px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-transparent"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="glow-btn-prism flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save File</span>
          </button>
        </div>
      </form>
    </div>
  );
}
