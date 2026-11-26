import { buildSampleProject } from '../data/sampleProject';
import {
  AspectRatio,
  DEFAULT_TRACK_SETTINGS,
  MediaAsset,
  TimelineClip,
  TrackSettingsMap,
} from '../types/editor';
import { createSampleAmbientTrack } from './audioSynth';
import { uid } from './time';

export interface PersistedProjectState {
  projectName: string;
  aspectRatio: AspectRatio;
  fps: 24 | 30 | 60;
  currentTime: number;
  assets: MediaAsset[];
  clips: TimelineClip[];
  timelineZoom?: number;
  snapEnabled?: boolean;
  selectedClipIds?: string[];
  previewScale?: 'auto' | 'half';
  trackSettings?: TrackSettingsMap;
  extraTrackIds?: string[];
}

export interface StoredProjectRecord extends PersistedProjectState {
  id: string;
  thumbnailDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  hasSavedOnce?: boolean;
  savedFileName?: string | null;
  savedFolderPath?: string | null;
  lastAutoSavedAt?: number | null;
}

interface LegacyProjectStateRow extends PersistedProjectState {
  id: 'active_project';
  updatedAt: number;
}

interface WorkspaceMetaRow {
  id: 'workspace_meta';
  currentProjectId: string | null;
  sampleSeeded: boolean;
  legacyMigrated: boolean;
}

interface MediaBlobRow {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}

const DB_NAME = 'framecut_project_db';
const DB_VERSION = 3;
const STATE_STORE = 'project_state';
const PROJECTS_STORE = 'projects';
const APP_META_STORE = 'app_meta';
const MEDIA_STORE = 'media_blobs';
const FILE_HANDLE_STORE = 'file_handles';

export interface SaveFileHandleLike {
  name: string;
  createWritable: () => Promise<{
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
  queryPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

export interface SaveDirectoryHandleLike {
  name: string;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<SaveFileHandleLike>;
  getDirectoryHandle?: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<SaveDirectoryHandleLike>;
  queryPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

export interface StoredSaveTarget {
  id: string;
  handle: SaveFileHandleLike | null;
  dirHandle?: SaveDirectoryHandleLike | null;
  fileName: string | null;
  folderPath?: string | null;
  hasSavedOnce: boolean;
  updatedAt: number;
}

export interface ProjectFolderLinkEntry {
  projectId: string;
  projectName: string;
  folderPath: string;
  fileName: string;
  storageKey: string;
  hasSystemFolderHandle: boolean;
  linkedAt: number;
  lastSyncedAt: number;
}

interface LinkedFolderLocalSnapshot {
  app: 'Framecut';
  projectId: string;
  projectName: string;
  folderPath: string;
  fileName: string;
  aspectRatio: AspectRatio;
  fps: 24 | 30 | 60;
  currentTime: number;
  clips: TimelineClip[];
  assets: Array<Pick<MediaAsset, 'id' | 'name' | 'type' | 'duration' | 'width' | 'height'>>;
  trackSettings?: TrackSettingsMap;
  extraTrackIds?: string[];
  updatedAt: number;
  lastAutoSavedAt?: number | null;
}

const PROJECT_FOLDER_LINKS_LS_KEY = 'hbl.projectFolderLinks.v1';
const FOLDER_PATH_INDEX_LS_KEY = 'hbl.folderPathIndex.v1';
const LAST_LINKED_FOLDER_LS_KEY = 'hbl.lastLinkedFolderPath.v1';
const LINKED_FOLDER_PROJECT_PREFIX = 'hbl.linkedFolderProject.v1::';

export function normalizeFolderPath(
  rawPath: string | null | undefined,
  fallback = 'HBL-Projects'
): string {
  const cleaned = (rawPath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return cleaned || fallback;
}

function readLocalStorageJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorageJson(key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getAllProjectFolderLinksFromLocalStorage(): Record<string, ProjectFolderLinkEntry> {
  const parsed = readLocalStorageJson<Record<string, ProjectFolderLinkEntry>>(
    PROJECT_FOLDER_LINKS_LS_KEY,
    {}
  );
  return parsed && typeof parsed === 'object' ? parsed : {};
}

export function getProjectFolderLinkFromLocalStorage(
  projectId: string
): ProjectFolderLinkEntry | null {
  if (!projectId) return null;
  const all = getAllProjectFolderLinksFromLocalStorage();
  return all[projectId] ?? null;
}

export function getLastLinkedFolderPathFromLocalStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const val = localStorage.getItem(LAST_LINKED_FOLDER_LS_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

function writeLinkedFolderSnapshotToLocalStorage(
  record: StoredProjectRecord,
  folderPath: string,
  fileName: string,
  storageKey: string
): void {
  const snapshot: LinkedFolderLocalSnapshot = {
    app: 'Framecut',
    projectId: record.id,
    projectName: record.projectName,
    folderPath,
    fileName,
    aspectRatio: record.aspectRatio,
    fps: record.fps,
    currentTime: record.currentTime,
    clips: record.clips,
    assets: (record.assets ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      duration: a.duration,
      width: a.width,
      height: a.height,
    })),
    trackSettings: record.trackSettings,
    extraTrackIds: record.extraTrackIds,
    updatedAt: record.updatedAt,
    lastAutoSavedAt: record.lastAutoSavedAt ?? null,
  };

  if (writeLocalStorageJson(storageKey, snapshot)) {
    return;
  }

  // Fallback compact summary if timeline exceeds localStorage ~5MB quota
  const compactSnapshot = {
    app: 'Framecut',
    projectId: record.id,
    projectName: record.projectName,
    folderPath,
    fileName,
    aspectRatio: record.aspectRatio,
    fps: record.fps,
    currentTime: record.currentTime,
    clipCount: record.clips.length,
    assetCount: record.assets.length,
    updatedAt: record.updatedAt,
    lastAutoSavedAt: record.lastAutoSavedAt ?? null,
  };
  writeLocalStorageJson(storageKey, compactSnapshot);
}

export function linkProjectFolderInLocalStorage(
  record: StoredProjectRecord,
  opts: {
    folderPath: string;
    fileName: string;
    hasSystemFolderHandle?: boolean;
  }
): ProjectFolderLinkEntry | null {
  if (typeof localStorage === 'undefined' || !record?.id) return null;

  const cleanFolder = normalizeFolderPath(opts.folderPath, 'HBL-Projects');
  const cleanFile = (opts.fileName || `${record.projectName || 'framecut-project'}.framecut.json`).trim();
  const storageKey = `${LINKED_FOLDER_PROJECT_PREFIX}${record.id}`;
  const now = Date.now();

  const links = { ...getAllProjectFolderLinksFromLocalStorage() };
  const existing = links[record.id];
  const entry: ProjectFolderLinkEntry = {
    projectId: record.id,
    projectName: record.projectName || 'Untitled Sequence',
    folderPath: cleanFolder,
    fileName: cleanFile,
    storageKey,
    hasSystemFolderHandle: opts.hasSystemFolderHandle ?? existing?.hasSystemFolderHandle ?? false,
    linkedAt: existing?.linkedAt ?? now,
    lastSyncedAt: now,
  };
  links[record.id] = entry;
  writeLocalStorageJson(PROJECT_FOLDER_LINKS_LS_KEY, links);

  const folderIndex = {
    ...readLocalStorageJson<Record<string, string[]>>(FOLDER_PATH_INDEX_LS_KEY, {}),
  };
  for (const [dir, ids] of Object.entries(folderIndex)) {
    if (dir !== cleanFolder && Array.isArray(ids) && ids.includes(record.id)) {
      const filtered = ids.filter((id) => id !== record.id);
      if (filtered.length > 0) {
        folderIndex[dir] = filtered;
      } else {
        delete folderIndex[dir];
      }
    }
  }
  const currentIds = Array.isArray(folderIndex[cleanFolder]) ? folderIndex[cleanFolder] : [];
  if (!currentIds.includes(record.id)) {
    folderIndex[cleanFolder] = [...currentIds, record.id];
  }
  writeLocalStorageJson(FOLDER_PATH_INDEX_LS_KEY, folderIndex);

  try {
    localStorage.setItem(LAST_LINKED_FOLDER_LS_KEY, cleanFolder);
  } catch {
    // ignore quota error
  }

  writeLinkedFolderSnapshotToLocalStorage(record, cleanFolder, cleanFile, storageKey);
  return entry;
}

export function syncLinkedFolderLocalStorage(
  record: StoredProjectRecord,
  hasSystemFolderHandle?: boolean
): void {
  if (!record?.id) return;
  const existing = getProjectFolderLinkFromLocalStorage(record.id);
  const folderPath = record.savedFolderPath || existing?.folderPath;
  if (!folderPath) return;

  const fileName =
    record.savedFileName ||
    existing?.fileName ||
    `${(record.projectName || 'framecut-project').trim().replace(/[^a-zA-Z0-9._-]+/g, '-') || 'framecut-project'}.framecut.json`;

  linkProjectFolderInLocalStorage(record, {
    folderPath,
    fileName,
    hasSystemFolderHandle: hasSystemFolderHandle ?? existing?.hasSystemFolderHandle,
  });
}

export function unlinkProjectFolderFromLocalStorage(projectId: string): void {
  if (typeof localStorage === 'undefined' || !projectId) return;
  const links = { ...getAllProjectFolderLinksFromLocalStorage() };
  const removed = links[projectId];
  if (removed) {
    delete links[projectId];
    writeLocalStorageJson(PROJECT_FOLDER_LINKS_LS_KEY, links);
  }

  const folderIndex = {
    ...readLocalStorageJson<Record<string, string[]>>(FOLDER_PATH_INDEX_LS_KEY, {}),
  };
  let indexChanged = false;
  for (const [dir, ids] of Object.entries(folderIndex)) {
    if (Array.isArray(ids) && ids.includes(projectId)) {
      const next = ids.filter((id) => id !== projectId);
      if (next.length > 0) {
        folderIndex[dir] = next;
      } else {
        delete folderIndex[dir];
      }
      indexChanged = true;
    }
  }
  if (indexChanged) {
    writeLocalStorageJson(FOLDER_PATH_INDEX_LS_KEY, folderIndex);
  }

  try {
    localStorage.removeItem(`${LINKED_FOLDER_PROJECT_PREFIX}${projectId}`);
  } catch {
    // ignore
  }
}

export function exportProjectJsonDownload(jsonContent: string, fileName: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function openProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(APP_META_STORE)) {
        db.createObjectStore(APP_META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILE_HANDLE_STORE)) {
        db.createObjectStore(FILE_HANDLE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open project database'));
  });
}

export async function requestPersistentBrowserStorage(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Optional best-effort persistence hint
  }
}

export async function saveFileTargetToDb(
  target: {
    handle: SaveFileHandleLike | null;
    dirHandle?: SaveDirectoryHandleLike | null;
    fileName: string | null;
    folderPath?: string | null;
    hasSavedOnce: boolean;
  },
  projectId = 'active_target'
): Promise<void> {
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILE_HANDLE_STORE, 'readwrite');
      const store = tx.objectStore(FILE_HANDLE_STORE);
      const row: StoredSaveTarget = {
        id: projectId,
        handle: target.handle,
        dirHandle: target.dirHandle ?? null,
        fileName: target.fileName,
        folderPath: target.folderPath ?? null,
        hasSavedOnce: target.hasSavedOnce,
        updatedAt: Date.now(),
      };
      store.put(row);
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
    // Ignore if handle cannot be structured-cloned in current browser
  }
}

export async function loadFileTargetFromDb(
  projectId = 'active_target'
): Promise<StoredSaveTarget | null> {
  try {
    const db = await openProjectDb();
    const row = await new Promise<StoredSaveTarget | undefined>((resolve, reject) => {
      const tx = db.transaction(FILE_HANDLE_STORE, 'readonly');
      const req = tx.objectStore(FILE_HANDLE_STORE).get(projectId);
      let res: StoredSaveTarget | undefined;
      req.onsuccess = () => {
        res = req.result as StoredSaveTarget | undefined;
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
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getMediaBlobsByIds(assetIds: string[]): Promise<Map<string, Blob>> {
  const result = new Map<string, Blob>();
  if (assetIds.length === 0) return result;
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const store = tx.objectStore(MEDIA_STORE);
      for (const id of assetIds) {
        const req = store.get(id);
        req.onsuccess = () => {
          const row = req.result as MediaBlobRow | undefined;
          if (row?.blob) {
            result.set(id, row.blob);
          }
        };
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
    // ignore read errors
  }
  return result;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed reading blob'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

const MAX_EMBED_BLOB_BYTES = 18 * 1024 * 1024;

export async function serializeProjectFileJson(
  state: PersistedProjectState,
  embeddedMediaCache: Map<string, string>
): Promise<string> {
  const missingBlobAssetIds = state.assets
    .filter((a) => a.url.startsWith('blob:') && !embeddedMediaCache.has(a.id))
    .map((a) => a.id);

  if (missingBlobAssetIds.length > 0) {
    const blobs = await getMediaBlobsByIds(missingBlobAssetIds);
    for (const [id, blob] of blobs.entries()) {
      if (blob.size <= MAX_EMBED_BLOB_BYTES) {
        try {
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl) {
            embeddedMediaCache.set(id, dataUrl);
          }
        } catch {
          // Skip oversize/unreadable blob
        }
      }
    }
  }

  const serializableAssets = state.assets.map((asset) => {
    const cachedDataUrl = embeddedMediaCache.get(asset.id);
    if (cachedDataUrl) {
      return {
        ...asset,
        url: cachedDataUrl,
        thumbnailUrl: asset.type === 'image' ? cachedDataUrl : asset.thumbnailUrl,
      };
    }
    return asset;
  });

  return JSON.stringify(
    {
      app: 'Framecut',
      version: 1,
      savedAt: new Date().toISOString(),
      projectName: state.projectName,
      aspectRatio: state.aspectRatio,
      fps: state.fps,
      currentTime: state.currentTime,
      assets: serializableAssets,
      clips: state.clips,
      trackSettings: state.trackSettings ?? DEFAULT_TRACK_SETTINGS,
    },
    null,
    2
  );
}

let activeFileWriteQueue: Promise<boolean> = Promise.resolve(true);

export function writeProjectToHandle(
  handle: SaveFileHandleLike,
  jsonContent: string
): Promise<boolean> {
  activeFileWriteQueue = activeFileWriteQueue
    .catch(() => false)
    .then(async () => {
      try {
        const writable = await handle.createWritable();
        await writable.write(jsonContent);
        await writable.close();
        return true;
      } catch {
        return false;
      }
    });
  return activeFileWriteQueue;
}

export async function ensureHandleWritePermission(
  handle: SaveFileHandleLike,
  promptUserIfNeeded: boolean
): Promise<boolean> {
  try {
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission({ mode: 'readwrite' });
      if (current === 'granted') return true;
      if (promptUserIfNeeded && typeof handle.requestPermission === 'function') {
        const requested = await handle.requestPermission({ mode: 'readwrite' });
        return requested === 'granted';
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function saveMediaBlobToDb(
  assetId: string,
  blob: Blob,
  name: string
): Promise<void> {
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE);
      const row: MediaBlobRow = {
        id: assetId,
        blob,
        name,
        type: blob.type,
      };
      store.put(row);
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
    // Graceful fallback if storage quota is exceeded
  }
}

export async function saveMediaBlobsToDb(
  entries: Array<{ assetId: string; blob: Blob; name: string }>
): Promise<void> {
  if (entries.length === 0) return;
  const CHUNK_SIZE = 100;
  try {
    const db = await openProjectDb();
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(MEDIA_STORE);
        for (const item of chunk) {
          const row: MediaBlobRow = {
            id: item.assetId,
            blob: item.blob,
            name: item.name,
            type: item.blob.type,
          };
          store.put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    db.close();
  } catch {
    // Graceful fallback if storage quota is exceeded
  }
}

/**
 * Only deletes media blobs that are NOT referenced by ANY saved project in IndexedDB.
 * Never removes assets still belonging to any other saved project.
 */
export async function pruneUnreferencedMediaBlobs(
  extraKeepAssetIds: Set<string> = new Set()
): Promise<void> {
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PROJECTS_STORE, MEDIA_STORE], 'readwrite');
      const projectsStore = tx.objectStore(PROJECTS_STORE);
      const mediaStore = tx.objectStore(MEDIA_STORE);

      const allProjectsReq = projectsStore.getAll();
      const mediaKeysReq = mediaStore.getAllKeys();
      let projectsRes: StoredProjectRecord[] = [];
      let mediaKeys: string[] = [];

      allProjectsReq.onsuccess = () => {
        projectsRes = (allProjectsReq.result as StoredProjectRecord[]) ?? [];
      };
      mediaKeysReq.onsuccess = () => {
        mediaKeys = (mediaKeysReq.result as string[]) ?? [];
      };

      tx.oncomplete = () => {
        // Need a follow-up cleanup write if any unreferenced keys exist
        const keepIds = new Set<string>(extraKeepAssetIds);
        for (const p of projectsRes) {
          for (const a of p.assets ?? []) {
            keepIds.add(a.id);
          }
        }
        const toDelete = mediaKeys.filter((k) => !keepIds.has(k));
        if (toDelete.length === 0) {
          db.close();
          resolve();
          return;
        }
        const delTx = db.transaction(MEDIA_STORE, 'readwrite');
        const delStore = delTx.objectStore(MEDIA_STORE);
        for (const k of toDelete) {
          delStore.delete(k);
        }
        delTx.oncomplete = () => {
          db.close();
          resolve();
        };
        delTx.onerror = () => {
          db.close();
          resolve();
        };
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore cleanup errors
  }
}

export function hydrateProjectAssetsFromBlobs(
  assets: MediaAsset[],
  blobMap: Map<string, Blob>
): MediaAsset[] {
  const restoredAssets: MediaAsset[] = [];

  for (const asset of assets) {
    if (asset.id === 'sample_ambient_audio') {
      const ambient = createSampleAmbientTrack(12);
      restoredAssets.push({
        ...asset,
        url: ambient.url,
        waveform: asset.waveform ?? ambient.waveform,
      });
      continue;
    }

    const storedBlob = blobMap.get(asset.id);
    if (storedBlob) {
      const freshUrl = URL.createObjectURL(storedBlob);
      restoredAssets.push({
        ...asset,
        url: freshUrl,
        thumbnailUrl: asset.type === 'image' ? freshUrl : asset.thumbnailUrl,
      });
      continue;
    }

    if (!asset.url.startsWith('blob:')) {
      restoredAssets.push(asset);
    }
  }

  return restoredAssets;
}

/**
 * Saves or updates a project record in the multi-project IndexedDB store.
 * Strips ephemeral blob: URLs from serialized metadata (since real blobs live in MEDIA_STORE)
 * while keeping static URLs and non-blob thumbnails intact.
 */
export async function saveProjectRecordToDb(record: StoredProjectRecord): Promise<void> {
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = tx.objectStore(PROJECTS_STORE);
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
    // ignore storage errors
  }
}

export async function setCurrentProjectIdInDb(projectId: string | null): Promise<void> {
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(APP_META_STORE, 'readwrite');
      const store = tx.objectStore(APP_META_STORE);
      const getReq = store.get('workspace_meta');
      getReq.onsuccess = () => {
        const existing = (getReq.result as WorkspaceMetaRow | undefined) ?? {
          id: 'workspace_meta',
          currentProjectId: null,
          sampleSeeded: true,
          legacyMigrated: true,
        };
        store.put({
          ...existing,
          id: 'workspace_meta',
          currentProjectId: projectId,
        });
      };
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

export async function bootstrapProjectsFromDb(): Promise<{
  projects: StoredProjectRecord[];
  currentProjectId: string | null;
}> {
  await requestPersistentBrowserStorage();

  try {
    const db = await openProjectDb();
    const result = await new Promise<{
      projects: StoredProjectRecord[];
      currentProjectId: string | null;
    }>((resolve, reject) => {
      const tx = db.transaction(
        [PROJECTS_STORE, APP_META_STORE, STATE_STORE, FILE_HANDLE_STORE],
        'readwrite'
      );
      const projectsStore = tx.objectStore(PROJECTS_STORE);
      const metaStore = tx.objectStore(APP_META_STORE);
      const legacyStateStore = tx.objectStore(STATE_STORE);
      const handleStore = tx.objectStore(FILE_HANDLE_STORE);

      const projectsReq = projectsStore.getAll();
      const metaReq = metaStore.get('workspace_meta');
      const legacyReq = legacyStateStore.get('active_project');
      const legacyHandleReq = handleStore.get('active_target');

      let allProjects: StoredProjectRecord[] = [];
      let meta: WorkspaceMetaRow | undefined;
      let legacyState: LegacyProjectStateRow | undefined;
      let legacyTarget: StoredSaveTarget | undefined;

      projectsReq.onsuccess = () => {
        allProjects = (projectsReq.result as StoredProjectRecord[]) ?? [];
      };
      metaReq.onsuccess = () => {
        meta = metaReq.result as WorkspaceMetaRow | undefined;
      };
      legacyReq.onsuccess = () => {
        legacyState = legacyReq.result as LegacyProjectStateRow | undefined;
      };
      legacyHandleReq.onsuccess = () => {
        legacyTarget = legacyHandleReq.result as StoredSaveTarget | undefined;
      };

      tx.oncomplete = () => {
        const needsLegacyMigration = Boolean(legacyState && !meta?.legacyMigrated);
        const folderLinks = getAllProjectFolderLinksFromLocalStorage();
        const mergeFolderLink = (p: StoredProjectRecord): StoredProjectRecord => {
          const link = folderLinks[p.id];
          if (!link) return p;
          return {
            ...p,
            hasSavedOnce: p.hasSavedOnce ?? true,
            savedFileName: p.savedFileName ?? link.fileName,
            savedFolderPath: p.savedFolderPath ?? link.folderPath,
          };
        };

        let finalProjects = allProjects.map(mergeFolderLink);
        let currentId = meta?.currentProjectId ?? null;
        let sampleSeeded = meta?.sampleSeeded ?? false;
        let legacyMigrated = meta?.legacyMigrated ?? false;

        if (needsLegacyMigration && legacyState) {
          const migratedId = uid('proj');
          const migratedRecord: StoredProjectRecord = {
            id: migratedId,
            projectName: legacyState.projectName || 'Untitled Sequence',
            aspectRatio: legacyState.aspectRatio || '16:9',
            fps: legacyState.fps === 24 || legacyState.fps === 60 ? legacyState.fps : 30,
            currentTime: Number.isFinite(legacyState.currentTime) ? legacyState.currentTime : 0,
            assets: Array.isArray(legacyState.assets) ? legacyState.assets : [],
            clips: Array.isArray(legacyState.clips) ? legacyState.clips : [],
            createdAt: legacyState.updatedAt || Date.now(),
            updatedAt: legacyState.updatedAt || Date.now(),
            hasSavedOnce: legacyTarget?.hasSavedOnce ?? false,
            savedFileName: legacyTarget?.fileName ?? null,
            savedFolderPath: legacyTarget?.folderPath ?? null,
          };

          const writeTx = db.transaction(
            [PROJECTS_STORE, APP_META_STORE, FILE_HANDLE_STORE],
            'readwrite'
          );
          writeTx.objectStore(PROJECTS_STORE).put(migratedRecord);
          if (legacyTarget) {
            writeTx.objectStore(FILE_HANDLE_STORE).put({
              ...legacyTarget,
              id: migratedId,
            });
          }
          finalProjects.push(migratedRecord);
          currentId = migratedId;
          legacyMigrated = true;
          sampleSeeded = true;
          writeTx.objectStore(APP_META_STORE).put({
            id: 'workspace_meta',
            currentProjectId: currentId,
            sampleSeeded,
            legacyMigrated,
          });
          writeTx.oncomplete = () => {
            db.close();
            finalProjects.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve({ projects: finalProjects, currentProjectId: currentId });
          };
          writeTx.onerror = () => {
            db.close();
            finalProjects.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve({ projects: finalProjects, currentProjectId: currentId });
          };
          return;
        }

        // First-ever visit with zero projects: seed 1 sample project once so Home Page feels alive.
        // Once seeded, if the user deletes it, it will NEVER auto-return!
        if (finalProjects.length === 0 && !sampleSeeded) {
          const sample = buildSampleProject();
          const sampleId = 'proj_sample_horizon';
          const now = Date.now();
          const sampleRecord: StoredProjectRecord = {
            id: sampleId,
            projectName: 'Pacific Horizon Edit',
            aspectRatio: '16:9',
            fps: 30,
            currentTime: 0,
            assets: sample.assets.filter((a) => a.type !== 'motion'),
            clips: sample.clips,
            thumbnailDataUrl: sample.assets.find((a) => a.type === 'image')?.thumbnailUrl,
            createdAt: now,
            updatedAt: now,
            hasSavedOnce: false,
            savedFileName: null,
          };
          const seedTx = db.transaction([PROJECTS_STORE, APP_META_STORE], 'readwrite');
          seedTx.objectStore(PROJECTS_STORE).put(sampleRecord);
          seedTx.objectStore(APP_META_STORE).put({
            id: 'workspace_meta',
            currentProjectId: sampleId,
            sampleSeeded: true,
            legacyMigrated: true,
          });
          finalProjects = [sampleRecord];
          currentId = sampleId;
          seedTx.oncomplete = () => {
            db.close();
            resolve({ projects: finalProjects, currentProjectId: currentId });
          };
          seedTx.onerror = () => {
            db.close();
            resolve({ projects: finalProjects, currentProjectId: currentId });
          };
          return;
        }

        // Ensure currentId points to a valid existing project (or most recent) without altering saved projects
        if (currentId && !finalProjects.some((p) => p.id === currentId)) {
          currentId = finalProjects[0]?.id ?? null;
        }

        db.close();
        finalProjects.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve({ projects: finalProjects, currentProjectId: currentId });
      };

      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    return result;
  } catch {
    return { projects: [], currentProjectId: null };
  }
}

export async function listProjectsFromDb(): Promise<StoredProjectRecord[]> {
  try {
    const db = await openProjectDb();
    const list = await new Promise<StoredProjectRecord[]>((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readonly');
      const req = tx.objectStore(PROJECTS_STORE).getAll();
      let res: StoredProjectRecord[] = [];
      req.onsuccess = () => {
        res = (req.result as StoredProjectRecord[]) ?? [];
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
    const folderLinks = getAllProjectFolderLinksFromLocalStorage();
    return list
      .map((p) => {
        const link = folderLinks[p.id];
        if (!link) return p;
        return {
          ...p,
          hasSavedOnce: p.hasSavedOnce ?? true,
          savedFileName: p.savedFileName ?? link.fileName,
          savedFolderPath: p.savedFolderPath ?? link.folderPath,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function openProjectRecordFromDb(
  projectId: string
): Promise<StoredProjectRecord | null> {
  try {
    const db = await openProjectDb();
    const { project, mediaRows } = await new Promise<{
      project: StoredProjectRecord | undefined;
      mediaRows: MediaBlobRow[];
    }>((resolve, reject) => {
      const tx = db.transaction([PROJECTS_STORE, MEDIA_STORE], 'readonly');
      const projReq = tx.objectStore(PROJECTS_STORE).get(projectId);
      const mediaReq = tx.objectStore(MEDIA_STORE).getAll();
      let projRes: StoredProjectRecord | undefined;
      let mediaRes: MediaBlobRow[] = [];

      projReq.onsuccess = () => {
        projRes = projReq.result as StoredProjectRecord | undefined;
      };
      mediaReq.onsuccess = () => {
        mediaRes = (mediaReq.result as MediaBlobRow[]) ?? [];
      };
      tx.oncomplete = () => {
        db.close();
        resolve({ project: projRes, mediaRows: mediaRes });
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    if (!project) return null;

    const folderLink = getProjectFolderLinkFromLocalStorage(project.id);
    const blobMap = new Map(mediaRows.map((m) => [m.id, m.blob]));
    const restoredAssets = hydrateProjectAssetsFromBlobs(project.assets ?? [], blobMap);

    return {
      ...project,
      projectName: project.projectName || 'Untitled Sequence',
      aspectRatio: project.aspectRatio || '16:9',
      fps: project.fps === 24 || project.fps === 60 ? project.fps : 30,
      currentTime: Number.isFinite(project.currentTime) ? project.currentTime : 0,
      assets: restoredAssets,
      clips: Array.isArray(project.clips) ? project.clips : [],
      hasSavedOnce: project.hasSavedOnce ?? Boolean(folderLink),
      savedFileName: project.savedFileName ?? folderLink?.fileName ?? null,
      savedFolderPath: project.savedFolderPath ?? folderLink?.folderPath ?? null,
    };
  } catch {
    return null;
  }
}

export async function deleteProjectFromDb(projectId: string): Promise<void> {
  unlinkProjectFolderFromLocalStorage(projectId);
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [PROJECTS_STORE, FILE_HANDLE_STORE, APP_META_STORE],
        'readwrite'
      );
      tx.objectStore(PROJECTS_STORE).delete(projectId);
      tx.objectStore(FILE_HANDLE_STORE).delete(projectId);
      const metaStore = tx.objectStore(APP_META_STORE);
      const metaReq = metaStore.get('workspace_meta');
      metaReq.onsuccess = () => {
        const meta = metaReq.result as WorkspaceMetaRow | undefined;
        if (meta && meta.currentProjectId === projectId) {
          metaStore.put({ ...meta, currentProjectId: null });
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    await pruneUnreferencedMediaBlobs();
  } catch {
    // ignore
  }
}

export async function duplicateProjectInDb(
  sourceProjectId: string
): Promise<StoredProjectRecord | null> {
  const list = await listProjectsFromDb();
  const source = list.find((p) => p.id === sourceProjectId);
  if (!source) return null;

  const now = Date.now();
  const clone: StoredProjectRecord = {
    ...source,
    id: uid('proj'),
    projectName: `${source.projectName} Copy`,
    assets: source.assets.map((a) => ({ ...a })),
    clips: source.clips.map((c) => ({
      ...c,
      id: uid('clip'),
      textConfig: c.textConfig ? { ...c.textConfig } : undefined,
      keyframes: c.keyframes ? c.keyframes.map((k) => ({ ...k })) : undefined,
    })),
    createdAt: now,
    updatedAt: now,
    hasSavedOnce: false,
    savedFileName: null,
    savedFolderPath: null,
  };

  await saveProjectRecordToDb(clone);
  return clone;
}

export async function renameProjectInDb(
  projectId: string,
  newName: string
): Promise<StoredProjectRecord | null> {
  const cleanName = newName.trim() || 'Untitled Sequence';
  const list = await listProjectsFromDb();
  const target = list.find((p) => p.id === projectId);
  if (!target) return null;

  const updated: StoredProjectRecord = {
    ...target,
    projectName: cleanName,
    updatedAt: Date.now(),
  };
  await saveProjectRecordToDb(updated);
  syncLinkedFolderLocalStorage(updated);
  return updated;
}

export async function importProjectFileJsonToDb(
  jsonText: string
): Promise<StoredProjectRecord> {
  const parsed = JSON.parse(jsonText) as Partial<PersistedProjectState> & {
    assets?: MediaAsset[];
    clips?: TimelineClip[];
  };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.clips)) {
    throw new Error('Invalid Framecut project file.');
  }

  const rawAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
  const assetIdMap = new Map<string, string>();
  const importedAssets: MediaAsset[] = [];

  for (const asset of rawAssets) {
    if (asset.type === 'motion' || asset.id === 'sample_ambient_audio') {
      assetIdMap.set(asset.id, asset.id);
      importedAssets.push({ ...asset });
      continue;
    }

    const newAssetId = uid(asset.type === 'audio' ? 'aud' : asset.type === 'video' ? 'vid' : 'img');
    assetIdMap.set(asset.id, newAssetId);

    if (typeof asset.url === 'string' && asset.url.startsWith('data:')) {
      const blob = await dataUrlToBlob(asset.url);
      if (blob) {
        await saveMediaBlobToDb(newAssetId, blob, asset.name);
        importedAssets.push({
          ...asset,
          id: newAssetId,
          url: `blob:stored-${newAssetId}`,
          thumbnailUrl:
            asset.type === 'image' ? undefined : asset.thumbnailUrl,
        });
        continue;
      }
    }

    importedAssets.push({
      ...asset,
      id: newAssetId,
    });
  }

  const importedClips: TimelineClip[] = (parsed.clips ?? []).map((clip) => ({
    ...clip,
    id: uid('clip'),
    assetId: assetIdMap.get(clip.assetId) ?? clip.assetId,
    textConfig: clip.textConfig ? { ...clip.textConfig } : undefined,
    keyframes: clip.keyframes ? clip.keyframes.map((k) => ({ ...k })) : undefined,
  }));

  const firstImgThumb =
    rawAssets.find((a) => a.type === 'image' && typeof a.url === 'string' && !a.url.startsWith('blob:'))
      ?.url ||
    rawAssets.find((a) => typeof a.thumbnailUrl === 'string' && !a.thumbnailUrl.startsWith('blob:'))
      ?.thumbnailUrl;

  const now = Date.now();
  const record: StoredProjectRecord = {
    id: uid('proj'),
    projectName: (parsed.projectName || 'Imported Sequence').trim(),
    aspectRatio:
      parsed.aspectRatio === '9:16' ||
      parsed.aspectRatio === '1:1' ||
      parsed.aspectRatio === '4:5'
        ? parsed.aspectRatio
        : '16:9',
    fps: parsed.fps === 24 || parsed.fps === 60 ? parsed.fps : 30,
    currentTime: Number.isFinite(parsed.currentTime) ? Number(parsed.currentTime) : 0,
    assets: importedAssets,
    clips: importedClips,
    trackSettings: parsed.trackSettings
      ? {
          T1: {
            locked: Boolean(parsed.trackSettings.T1?.locked),
            hidden: Boolean(parsed.trackSettings.T1?.hidden),
          },
          V1: {
            locked: Boolean(parsed.trackSettings.V1?.locked),
            hidden: Boolean(parsed.trackSettings.V1?.hidden),
          },
          A1: {
            locked: Boolean(parsed.trackSettings.A1?.locked),
            hidden: Boolean(parsed.trackSettings.A1?.hidden),
          },
        }
      : {
          T1: { locked: false, hidden: false },
          V1: { locked: false, hidden: false },
          A1: { locked: false, hidden: false },
        },
    thumbnailDataUrl: firstImgThumb,
    createdAt: now,
    updatedAt: now,
    hasSavedOnce: false,
    savedFileName: null,
  };

  await saveProjectRecordToDb(record);
  await setCurrentProjectIdInDb(record.id);
  return record;
}

export function captureActivePreviewThumbnail(): string | undefined {
  try {
    const canvas = document.querySelector(
      'canvas[data-framecut-preview="true"]'
    ) as HTMLCanvasElement | null;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return undefined;

    const maxW = 360;
    const scale = Math.min(1, maxW / canvas.width);
    const outW = Math.max(96, Math.round(canvas.width * scale));
    const outH = Math.max(54, Math.round(canvas.height * scale));
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const ctx = off.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(canvas, 0, 0, outW, outH);
    return off.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}
