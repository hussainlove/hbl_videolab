import { CustomMaskItem } from '../types/editor';

const DB_NAME = 'framecut_masks_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_masks';
const FALLBACK_KEY = 'framecut_custom_masks_v1';

function openMaskDb(): Promise<IDBDatabase> {
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
    req.onerror = () => reject(req.error ?? new Error('Failed to open mask database'));
  });
}

function readFallbackMasks(): CustomMaskItem[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallbackMasks(items: CustomMaskItem[]): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

export async function getAllSavedCustomMasks(): Promise<CustomMaskItem[]> {
  const fallback = readFallbackMasks();
  try {
    const db = await openMaskDb();
    const rows = await new Promise<CustomMaskItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      let res: CustomMaskItem[] = [];
      req.onsuccess = () => {
        res = (req.result as CustomMaskItem[]) ?? [];
      };
      tx.oncomplete = () => {
        db.close();
        resolve(res);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    const map = new Map<string, CustomMaskItem>();
    for (const item of fallback) map.set(item.id, item);
    for (const item of rows) map.set(item.id, item);
    const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    if (merged.length > 0) writeFallbackMasks(merged);
    return merged;
  } catch {
    return fallback;
  }
}

export async function saveCustomMaskToDb(item: CustomMaskItem): Promise<void> {
  const existing = readFallbackMasks().filter((m) => m.id !== item.id);
  writeFallbackMasks([item, ...existing]);

  try {
    const db = await openMaskDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
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
    // Fallback already written
  }
}

export function downloadCustomMaskPng(mask: { name: string; dataUrl: string }): void {
  const cleanName = (mask.name || 'custom-mask')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const link = document.createElement('a');
  link.href = mask.dataUrl;
  link.download = `${cleanName || 'custom-mask'}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Converts an uploaded PNG/SVG/JPG image into a normalized white-alpha PNG mask.
 * - If the uploaded image uses transparency (alpha < 245 pixels exist), its alpha channel becomes the mask.
 * - If opaque (black-and-white luma mask), bright pixels become opaque mask areas and black pixels become transparent.
 */
export async function convertMaskFileToAlphaPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode mask image'));
      img.src = url;
    });

    const maxSide = 768;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 512, img.naturalHeight || 512));
    const w = Math.max(32, Math.round((img.naturalWidth || 512) * scale));
    const h = Math.max(32, Math.round((img.naturalHeight || 512) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let hasTransparentPixels = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 245) {
        hasTransparentPixels = true;
        break;
      }
    }

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const maskAlpha = hasTransparentPixels
        ? a
        : Math.round((0.299 * r + 0.587 * g + 0.114 * b) * (a / 255));
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = maskAlpha;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
