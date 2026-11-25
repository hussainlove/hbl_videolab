import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Loader2, Search, Sparkles, X } from 'lucide-react';
import { BUILTIN_FONT_FAMILIES, CustomFont } from '../types/editor';
import { AutoFontCategory, FAMOUS_FONTS_CATALOG } from '../utils/autoFonts';

interface FamousFontsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customFonts: CustomFont[];
  hasSelectedTitle: boolean;
  onDownloadAutoFont: (family: string) => Promise<CustomFont | null>;
  onUseFont: (family: string) => void;
}

const CATEGORIES: Array<'All' | AutoFontCategory> = [
  'All',
  'Display',
  'Sans',
  'Serif',
  'Script',
  'Mono',
  'Urdu & Arabic',
  'All Languages',
];

export function FamousFontsModal({
  isOpen,
  onClose,
  customFonts,
  hasSelectedTitle,
  onDownloadAutoFont,
  onUseFont,
}: FamousFontsModalProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'All' | AutoFontCategory>('All');
  const [downloadingSet, setDownloadingSet] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const installedLower = useMemo(() => {
    const s = new Set<string>();
    for (const f of BUILTIN_FONT_FAMILIES) s.add(f.toLowerCase());
    for (const f of customFonts) s.add(f.family.toLowerCase());
    return s;
  }, [customFonts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAMOUS_FONTS_CATALOG.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.family.toLowerCase().includes(q) ||
        item.tag.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [search, category]);

  const unInstalledInView = useMemo(
    () => filtered.filter((item) => !installedLower.has(item.family.toLowerCase())),
    [filtered, installedLower]
  );

  // Lazily preview visible category fonts via Google Fonts stylesheet while modal is open
  useEffect(() => {
    if (!isOpen || filtered.length === 0) return;
    const familiesToPreview = filtered.slice(0, 18).map((f) => f.family);
    const params = familiesToPreview
      .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}`)
      .join('&');
    const href = `https://fonts.googleapis.com/css2?${params}&display=swap`;

    let link = document.getElementById('framecut-font-preview-css') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'framecut-font-preview-css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) {
      link.href = href;
    }
  }, [isOpen, filtered]);

  if (!isOpen) return null;

  const handleSingleDownload = async (family: string, autoApply = false) => {
    setErrorMsg(null);
    setDownloadingSet((prev) => new Set(prev).add(family.toLowerCase()));
    try {
      const saved = await onDownloadAutoFont(family);
      if (saved && autoApply) {
        onUseFont(saved.family);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : `Failed to download ${family}`);
    } finally {
      setDownloadingSet((prev) => {
        const next = new Set(prev);
        next.delete(family.toLowerCase());
        return next;
      });
    }
  };

  const handleDownloadAllInView = async () => {
    if (unInstalledInView.length === 0 || batchProgress) return;
    setErrorMsg(null);
    const queue = unInstalledInView.map((i) => i.family);
    setBatchProgress({ done: 0, total: queue.length });

    let done = 0;
    const batchSize = 3;
    for (let i = 0; i < queue.length; i += batchSize) {
      const chunk = queue.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (fam) => {
          setDownloadingSet((prev) => new Set(prev).add(fam.toLowerCase()));
          try {
            await onDownloadAutoFont(fam);
          } catch {
            // continue remaining fonts
          } finally {
            setDownloadingSet((prev) => {
              const next = new Set(prev);
              next.delete(fam.toLowerCase());
              return next;
            });
            done++;
            setBatchProgress({ done, total: queue.length });
          }
        })
      );
    }

    setBatchProgress(null);
  };

  const trimmedSearch = search.trim();
  const exactInCatalog = FAMOUS_FONTS_CATALOG.some(
    (f) => f.family.toLowerCase() === trimmedSearch.toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-[#11141B] border border-white/[0.1] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Famous Auto Fonts Library
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Download any famous font once — saved permanently for live preview & video export.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glow-btn w-8 h-8 rounded-lg text-slate-400 hover:text-white border border-transparent flex items-center justify-center shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + Batch Action */}
        <div className="px-5 py-3 border-b border-white/[0.08] space-y-3 shrink-0 bg-[#0D1016]">
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search famous fonts or type any Google Font name (e.g. Anton, Pacifico, Gulzar)..."
                className="w-full pl-9 pr-3 py-2 text-xs text-slate-100 bg-[#0B0D11] border border-white/[0.1] rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            {unInstalledInView.length > 0 && (
              <button
                type="button"
                onClick={() => void handleDownloadAllInView()}
                disabled={Boolean(batchProgress)}
                className="glow-btn-prism px-3.5 py-2 text-xs font-medium text-white disabled:opacity-60 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {batchProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="font-mono">
                      {batchProgress.done}/{batchProgress.total}
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download All ({unInstalledInView.length})</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto studio-scroll-thin pb-0.5">
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`glow-btn px-2.5 py-1 text-xs font-medium rounded-md border border-transparent whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1D2330] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {errorMsg && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Font Grid */}
        <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-3">
          {/* Custom Google Font lookup banner if user typed a font not in starter list */}
          {trimmedSearch.length >= 2 && !exactInCatalog && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-100 truncate">
                  Fetch &ldquo;{trimmedSearch}&rdquo; from Google Fonts
                </div>
                <div className="text-[11px] text-slate-400">
                  Auto-download any font name directly and save it permanently
                </div>
              </div>
              {installedLower.has(trimmedSearch.toLowerCase()) ? (
                <button
                  type="button"
                  onClick={() => {
                    onUseFont(trimmedSearch);
                    onClose();
                  }}
                  className="glow-btn px-3 py-1.5 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-500/15 border border-emerald-500/30 rounded-md shrink-0"
                >
                  {hasSelectedTitle ? 'Apply Font' : 'Use Font'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={downloadingSet.has(trimmedSearch.toLowerCase())}
                  onClick={() => void handleSingleDownload(trimmedSearch, true)}
                  className="glow-btn-prism px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 rounded-md flex items-center gap-1.5 shrink-0"
                >
                  {downloadingSet.has(trimmedSearch.toLowerCase()) ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Download & Save</span>
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No matching presets. Use the button above to download &ldquo;{trimmedSearch}&rdquo; directly.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filtered.map((item) => {
                const isInstalled = installedLower.has(item.family.toLowerCase());
                const isLoading = downloadingSet.has(item.family.toLowerCase());

                return (
                  <div
                    key={item.family}
                    className="glow-card p-3 rounded-lg bg-[#161A23] border border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-sm font-medium text-slate-100 truncate"
                        style={{ fontFamily: `"${item.family}", sans-serif` }}
                      >
                        {item.family}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {item.category} · {item.tag}
                      </div>
                    </div>

                    {isInstalled ? (
                      <button
                        type="button"
                        onClick={() => {
                          onUseFont(item.family);
                          onClose();
                        }}
                        className="glow-btn px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-500/10 border border-emerald-500/25 rounded-md flex items-center gap-1 shrink-0"
                        title={hasSelectedTitle ? 'Apply to selected title' : 'Insert title with this font'}
                      >
                        <Check className="w-3 h-3" />
                        <span>{hasSelectedTitle ? 'Apply' : 'Use'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => void handleSingleDownload(item.family)}
                        className="glow-btn px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#0B0D11] hover:text-white border border-white/[0.1] disabled:opacity-60 rounded-md flex items-center gap-1.5 shrink-0"
                        title={`Download ${item.family} and save permanently`}
                      >
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>{isLoading ? 'Saving' : 'Download'}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
