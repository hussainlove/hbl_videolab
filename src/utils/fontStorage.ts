export interface StoredFontVariant {
  buffer: ArrayBuffer;
  weight?: string;
  style?: string;
  unicodeRange?: string;
}

export interface StoredFontRecord {
  id: string;
  family: string;
  fileName: string;
  buffer?: ArrayBuffer;
  variants?: StoredFontVariant[];
  source?: 'upload' | 'auto';
  createdAt: number;
}

const DB_NAME = 'framecut_fonts_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_fonts';

function openFontsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
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
    req.onerror = () => reject(req.error ?? new Error('Failed to open font database'));
  });
}

export async function getAllSavedFonts(): Promise<StoredFontRecord[]> {
  try {
    const db = await openFontsDb();
    return await new Promise<StoredFontRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredFontRecord[]) ?? [];
        rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function saveCustomFontToDb(record: StoredFontRecord): Promise<void> {
  try {
    const db = await openFontsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
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
    // Graceful fallback if storage is restricted
  }
}

export async function registerStoredFontRecord(rec: StoredFontRecord): Promise<boolean> {
  const entries: StoredFontVariant[] =
    rec.variants && rec.variants.length > 0
      ? rec.variants
      : rec.buffer
      ? [{ buffer: rec.buffer }]
      : [];

  if (entries.length === 0) return false;

  let loadedCount = 0;
  for (const entry of entries) {
    try {
      const descriptors: FontFaceDescriptors = {};
      if (entry.weight) descriptors.weight = entry.weight;
      if (entry.style) descriptors.style = entry.style;
      if (entry.unicodeRange) descriptors.unicodeRange = entry.unicodeRange;
      const face = new FontFace(rec.family, entry.buffer.slice(0), descriptors);
      await face.load();
      document.fonts.add(face);
      loadedCount++;
    } catch {
      // Skip individual failing subset
    }
  }
  return loadedCount > 0;
}
