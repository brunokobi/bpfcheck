import Dexie, { Table } from 'dexie';

export interface SyncQueueItem {
  id?: number;
  action: 'START_AUDIT' | 'SAVE_ITEMS' | 'FINISH_AUDIT' | 'UPLOAD_IMAGE';
  payload: any;
  createdAt: string;
  status: 'pending' | 'processing' | 'failed';
  retryCount?: number;
}

export interface LocalAudit {
  id: string;
  locationName: string;
  data: any;
  synced: boolean;
}

export interface CachedData {
  key: string;
  data: any;
  cachedAt: string;
}

export class BPFDatabase extends Dexie {
  syncQueue!: Table<SyncQueueItem>;
  localAudits!: Table<LocalAudit>;
  cache!: Table<CachedData>;

  constructor() {
    super('BPFCheckDB');
    this.version(1).stores({
      syncQueue: '++id, action, status, createdAt',
      localAudits: 'id, locationName, synced',
    });
    // Version 2 adds the cache table for checklist offline support
    this.version(2).stores({
      syncQueue: '++id, action, status, createdAt',
      localAudits: 'id, locationName, synced',
      cache: 'key, cachedAt',
    });
  }
}

export const db = new BPFDatabase();
