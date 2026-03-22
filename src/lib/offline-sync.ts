import { get, set, del, keys, createStore } from 'idb-keyval';

const syncStore = createStore('bpf-offline-sync', 'sync-queue');
const photosStore = createStore('bpf-offline-photos', 'photos');

// ============ SYNC QUEUE ============

export interface SyncQueueItem {
  id: string;
  type: 'save_items' | 'finish_audit' | 'create_audit' | 'upload_photo';
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

export const addToSyncQueue = async (item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>) => {
  const entry: SyncQueueItem = {
    ...item,
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    retries: 0,
  };
  await set(entry.id, entry, syncStore);
  return entry;
};

export const getSyncQueue = async (): Promise<SyncQueueItem[]> => {
  const allKeys = await keys(syncStore);
  const items: SyncQueueItem[] = [];
  for (const key of allKeys) {
    const item = await get<SyncQueueItem>(key, syncStore);
    if (item) items.push(item);
  }
  return items.sort((a, b) => a.timestamp - b.timestamp);
};

export const removeSyncItem = async (id: string) => {
  await del(id, syncStore);
};

export const updateSyncItem = async (item: SyncQueueItem) => {
  await set(item.id, item, syncStore);
};

// ============ OFFLINE PHOTOS ============

export interface OfflinePhoto {
  id: string;
  auditId: string;
  checklistItemId: string;
  blob: Blob;
  mimeType: string;
  timestamp: number;
}

export const saveOfflinePhoto = async (photo: Omit<OfflinePhoto, 'id' | 'timestamp'>): Promise<OfflinePhoto> => {
  const entry: OfflinePhoto = {
    ...photo,
    id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
  };
  await set(entry.id, entry, photosStore);
  return entry;
};

export const getOfflinePhotos = async (auditId?: string): Promise<OfflinePhoto[]> => {
  const allKeys = await keys(photosStore);
  const photos: OfflinePhoto[] = [];
  for (const key of allKeys) {
    const photo = await get<OfflinePhoto>(key, photosStore);
    if (photo && (!auditId || photo.auditId === auditId)) {
      photos.push(photo);
    }
  }
  return photos;
};

export const removeOfflinePhoto = async (id: string) => {
  await del(id, photosStore);
};

export const blobToObjectUrl = (blob: Blob): string => {
  return URL.createObjectURL(blob);
};
