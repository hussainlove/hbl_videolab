import { TransitionPreset, TransitionType } from '../types/editor';

export const TRANSITIONS_CATALOG: TransitionPreset[] = [
  // Built-in Starter Transitions
  {
    id: 'dissolve',
    label: 'Cross Dissolve',
    category: 'Basic',
    description: 'Smooth optical opacity blend',
    builtIn: true,
    defaultDuration: 0.6,
  },
  {
    id: 'dip-black',
    label: 'Dip to Black',
    category: 'Basic',
    description: 'Fade cleanly through obsidian black',
    builtIn: true,
    defaultDuration: 0.65,
  },
  {
    id: 'slide-left',
    label: 'Slide Left',
    category: 'Slide',
    description: 'Push frame horizontally from right',
    builtIn: true,
    defaultDuration: 0.5,
  },
  {
    id: 'slide-right',
    label: 'Slide Right',
    category: 'Slide',
    description: 'Push frame horizontally from left',
    builtIn: true,
    defaultDuration: 0.5,
  },
  {
    id: 'wipe-left',
    label: 'Wipe Left',
    category: 'Wipe',
    description: 'Crisp linear reveal from right to left',
    builtIn: true,
    defaultDuration: 0.55,
  },
  {
    id: 'zoom-in',
    label: 'Zoom Push',
    category: 'Zoom',
    description: 'Dynamic punch-in focal zoom',
    builtIn: true,
    defaultDuration: 0.5,
  },

  // Downloadable Pro Transitions (Saved Permanently in IndexedDB)
  {
    id: 'slide-up',
    label: 'Slide Up',
    category: 'Slide',
    description: 'Vertical lift transition from bottom',
    builtIn: false,
    defaultDuration: 0.5,
  },
  {
    id: 'slide-down',
    label: 'Slide Down',
    category: 'Slide',
    description: 'Vertical drop transition from top',
    builtIn: false,
    defaultDuration: 0.5,
  },
  {
    id: 'wipe-right',
    label: 'Wipe Right',
    category: 'Wipe',
    description: 'Clean horizontal curtain wipe',
    builtIn: false,
    defaultDuration: 0.55,
  },
  {
    id: 'wipe-up',
    label: 'Curtain Wipe Up',
    category: 'Wipe',
    description: 'Vertical stage reveal upward',
    builtIn: false,
    defaultDuration: 0.55,
  },
  {
    id: 'zoom-out',
    label: 'Zoom Pull',
    category: 'Zoom',
    description: 'Smooth pull-back wide reveal',
    builtIn: false,
    defaultDuration: 0.55,
  },
  {
    id: 'spin-zoom',
    label: 'Spin & Zoom',
    category: 'Zoom',
    description: 'Energetic kinetic whip-spin cut',
    builtIn: false,
    defaultDuration: 0.5,
  },
  {
    id: 'blur-dissolve',
    label: 'Dream Blur Dissolve',
    category: 'FX',
    description: 'Soft optical defocus blend',
    builtIn: false,
    defaultDuration: 0.7,
  },
  {
    id: 'flash-white',
    label: 'Light Flash',
    category: 'FX',
    description: 'Bright camera strobe exposure flash',
    builtIn: false,
    defaultDuration: 0.45,
  },
  {
    id: 'iris-circle',
    label: 'Circle Iris Reveal',
    category: 'Wipe',
    description: 'Classic cinema circular aperture',
    builtIn: false,
    defaultDuration: 0.65,
  },
  {
    id: 'glitch-rgb',
    label: 'Digital Glitch Cut',
    category: 'FX',
    description: 'RGB split & scanline slice cut',
    builtIn: false,
    defaultDuration: 0.45,
  },
  {
    id: 'film-burn',
    label: 'Warm Film Burn',
    category: 'FX',
    description: 'Golden analog light-leak transition',
    builtIn: false,
    defaultDuration: 0.65,
  },
];

export const BUILTIN_TRANSITION_IDS: TransitionType[] = TRANSITIONS_CATALOG.filter(
  (t) => t.builtIn
).map((t) => t.id);

export interface StoredTransitionRecord {
  id: TransitionType;
  label: string;
  category: TransitionPreset['category'];
  defaultDuration: number;
  downloadedAt: number;
}

const DB_NAME = 'framecut_transitions_db';
const DB_VERSION = 1;
const STORE_NAME = 'saved_transitions';
const LS_FALLBACK_KEY = 'framecut_saved_transitions_v1';

function openTransitionsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open transitions database'));
  });
}

function readLocalFallback(): TransitionType[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TransitionType[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFallback(ids: TransitionType[]): void {
  try {
    const unique = Array.from(new Set(ids));
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(unique));
  } catch {
    // ignore storage quota errors
  }
}

export async function getAllSavedTransitionIds(): Promise<TransitionType[]> {
  const fromLs = readLocalFallback();
  try {
    const db = await openTransitionsDb();
    const rows = await new Promise<StoredTransitionRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredTransitionRecord[]) ?? []);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    const merged = Array.from(new Set([...fromLs, ...rows.map((r) => r.id)]));
    if (merged.length > fromLs.length) {
      writeLocalFallback(merged);
    }
    return merged;
  } catch {
    return fromLs;
  }
}

export async function saveTransitionToDb(preset: TransitionPreset): Promise<void> {
  const existing = readLocalFallback();
  writeLocalFallback([...existing, preset.id]);

  try {
    const db = await openTransitionsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredTransitionRecord = {
        id: preset.id,
        label: preset.label,
        category: preset.category,
        defaultDuration: preset.defaultDuration,
        downloadedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // localStorage fallback already persisted above
  }
}
