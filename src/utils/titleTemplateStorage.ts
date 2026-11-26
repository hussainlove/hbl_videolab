import { TitleTemplateItem } from '../types/editor';

const CUSTOM_TITLES_STORAGE_KEY = 'framecut.customTitleTemplates.v1';
const DB_NAME = 'framecut_titles_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_titles';

function openTitlesDb(): Promise<IDBDatabase> {
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
    req.onerror = () => reject(req.error ?? new Error('Failed to open custom titles DB'));
  });
}

export function loadCustomTitleTemplates(): TitleTemplateItem[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_TITLES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TitleTemplateItem =>
        Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && item.config)
    );
  } catch {
    return [];
  }
}

export function saveCustomTitleTemplates(items: TitleTemplateItem[]): void {
  try {
    window.localStorage.setItem(CUSTOM_TITLES_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // IndexedDB holds unlimited custom templates even if localStorage quota fills
  }
}

export async function loadCustomTitleTemplatesAsync(): Promise<TitleTemplateItem[]> {
  const fromLs = loadCustomTitleTemplates();
  try {
    const db = await openTitlesDb();
    const rows = await new Promise<TitleTemplateItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as TitleTemplateItem[]) ?? []);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });

    const byId = new Map<string, TitleTemplateItem>();
    for (const item of fromLs) byId.set(item.id, { ...item, isCustom: true });
    for (const item of rows) byId.set(item.id, { ...item, isCustom: true });

    const merged = Array.from(byId.values());
    saveCustomTitleTemplates(merged);
    return merged;
  } catch {
    return fromLs;
  }
}

export async function saveCustomTitleTemplateToDb(template: TitleTemplateItem): Promise<void> {
  const normalized: TitleTemplateItem = { ...template, isCustom: true };
  try {
    const db = await openTitlesDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(normalized);
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
    // localStorage fallback already persisted by state updater
  }
}

export async function deleteCustomTitleTemplateFromDb(id: string): Promise<void> {
  try {
    const db = await openTitlesDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
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
    // ignore
  }
}
