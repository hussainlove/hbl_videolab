import {
  ANIMATION_PRESETS,
  CAPTION_STYLE_PRESETS,
  FRAME_PRESETS,
  MASK_PRESETS,
  TITLE_AND_LOWER_THIRD_TEMPLATES,
  VISUAL_EFFECT_PRESETS,
} from '../types/editor';

export interface StoredEffectRecord {
  key: string; // e.g. 'fx:radial-blur', 'frame:film-strip', 'mask:star', 'anim:elastic-snap', 'caption:neon-karaoke', or 'title:headline'
  label: string;
  downloadedAt: number;
}

const DB_NAME = 'framecut_effects_db';
const DB_VERSION = 1;
const STORE_NAME = 'saved_effects';
const LS_FALLBACK_KEY = 'framecut_saved_effects_v1';

export function makeFxStorageKey(id: string): string {
  return `fx:${id}`;
}

export function makeFrameStorageKey(id: string): string {
  return `frame:${id}`;
}

export function makeMaskStorageKey(id: string): string {
  return `mask:${id}`;
}

export function makeAnimationStorageKey(id: string): string {
  return `anim:${id}`;
}

export function makeCaptionPresetStorageKey(id: string): string {
  return `caption:${id}`;
}

export function makeTitleStorageKey(id: string): string {
  return `title:${id}`;
}

export const BUILTIN_EFFECT_KEYS: string[] = [
  ...VISUAL_EFFECT_PRESETS.filter((e) => e.builtIn).map((e) => makeFxStorageKey(e.id)),
  ...FRAME_PRESETS.filter((f) => f.builtIn).map((f) => makeFrameStorageKey(f.id)),
  ...MASK_PRESETS.filter((m) => m.builtIn).map((m) => makeMaskStorageKey(m.id)),
  ...ANIMATION_PRESETS.filter((a) => a.builtIn).map((a) => makeAnimationStorageKey(a.id)),
  ...CAPTION_STYLE_PRESETS.filter((c) => c.builtIn).map((c) => makeCaptionPresetStorageKey(c.id)),
  ...TITLE_AND_LOWER_THIRD_TEMPLATES.filter((t) => t.builtIn).map((t) =>
    makeTitleStorageKey(t.id)
  ),
];

function openEffectsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open effects database'));
  });
}

function readLocalFallback(): string[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFallback(keys: string[]): void {
  try {
    const unique = Array.from(new Set(keys));
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(unique));
  } catch {
    // ignore storage quota errors
  }
}

export async function getAllSavedEffectKeys(): Promise<string[]> {
  const fromLs = readLocalFallback();
  try {
    const db = await openEffectsDb();
    const rows = await new Promise<StoredEffectRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredEffectRecord[]) ?? []);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    const merged = Array.from(new Set([...fromLs, ...rows.map((r) => r.key)]));
    if (merged.length > fromLs.length) {
      writeLocalFallback(merged);
    }
    return merged;
  } catch {
    return fromLs;
  }
}

export async function saveEffectKeyToDb(key: string, label: string): Promise<void> {
  const existing = readLocalFallback();
  writeLocalFallback([...existing, key]);

  try {
    const db = await openEffectsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredEffectRecord = {
        key,
        label,
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

export async function saveManyEffectKeysToDb(
  items: Array<{ key: string; label: string }>
): Promise<void> {
  if (items.length === 0) return;
  const existing = readLocalFallback();
  writeLocalFallback([...existing, ...items.map((i) => i.key)]);

  try {
    const db = await openEffectsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const now = Date.now();
      for (const item of items) {
        store.put({
          key: item.key,
          label: item.label,
          downloadedAt: now,
        } satisfies StoredEffectRecord);
      }
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
