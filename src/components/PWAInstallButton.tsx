import React, { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install HBL videolab for full offline desktop & mobile use"
        className={`glow-btn flex items-center gap-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-xs font-medium text-sky-100 whitespace-nowrap shrink-0 transition-colors ${
          compact ? 'px-2.5 py-1.5' : 'px-3 py-2 min-h-[40px]'
        }`}
      >
        <Download className="w-3.5 h-3.5 text-sky-300 shrink-0" />
        <span className={compact ? 'hidden md:inline' : ''}>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Install HBL videolab on iPhone / iPad"
          className={`glow-btn flex items-center gap-1.5 rounded-lg bg-[#141822] hover:bg-[#1B212F] border border-white/[0.12] text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 ${
            compact ? 'px-2.5 py-1.5' : 'px-3 py-2 min-h-[40px]'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className={compact ? 'hidden md:inline' : ''}>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-xl bg-[#141822] border border-white/[0.1] p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-white">
                  Install HBL videolab Offline App
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-xs text-slate-300 leading-relaxed list-decimal pl-4">
                <li>
                  Tap the <strong className="text-white inline-flex items-center gap-1"><Share className="w-3 h-3 inline" /> Share</strong> button in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                </li>
                <li>
                  Launch HBL videolab anytime from your Home Screen — works offline!
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="glow-btn-prism w-full py-2 rounded-lg text-xs font-semibold text-white"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  if (isOnline || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-[#141822]/95 border border-amber-400/40 px-3 py-2 text-xs font-medium text-amber-200 shadow-xl backdrop-blur-md">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline Mode — Editing, Sync Captions & Export Ready</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-1 text-amber-300/75 hover:text-white"
        aria-label="Dismiss offline notice"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};
