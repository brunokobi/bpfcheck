import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

const DB_NAME = 'bpf_check_offline';
const DB_VERSION = 1;

interface PendingSync {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
}

export const useOfflineStorage = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState<PendingSync[]>([]);
  const { toast } = useToast();

  // Initialize IndexedDB
  const initDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store for offline data cache
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }

        // Store for pending sync operations
        if (!db.objectStoreNames.contains('pending_syncs')) {
          const syncStore = db.createObjectStore('pending_syncs', { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Store for offline audits
        if (!db.objectStoreNames.contains('offline_audits')) {
          db.createObjectStore('offline_audits', { keyPath: 'id' });
        }

        // Store for offline audit items
        if (!db.objectStoreNames.contains('offline_audit_items')) {
          const itemsStore = db.createObjectStore('offline_audit_items', { keyPath: 'id' });
          itemsStore.createIndex('audit_id', 'audit_id', { unique: false });
        }

        // Store for offline images
        if (!db.objectStoreNames.contains('offline_images')) {
          const imagesStore = db.createObjectStore('offline_images', { keyPath: 'id' });
          imagesStore.createIndex('audit_item_id', 'audit_item_id', { unique: false });
        }
      };
    });
  }, []);

  // Cache data locally
  const cacheData = useCallback(async (key: string, data: unknown) => {
    const db = await initDB();
    const tx = db.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');
    await store.put({ key, data, timestamp: Date.now() });
  }, [initDB]);

  // Get cached data
  const getCachedData = useCallback(async <T,>(key: string): Promise<T | null> => {
    const db = await initDB();
    const tx = db.transaction('cache', 'readonly');
    const store = tx.objectStore('cache');
    
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => resolve(null);
    });
  }, [initDB]);

  // Save data for offline sync
  const saveForSync = useCallback(async (
    table: string,
    operation: 'insert' | 'update' | 'delete',
    data: Record<string, unknown>
  ) => {
    const db = await initDB();
    const tx = db.transaction('pending_syncs', 'readwrite');
    const store = tx.objectStore('pending_syncs');
    
    const syncItem: PendingSync = {
      id: crypto.randomUUID(),
      table,
      operation,
      data,
      timestamp: Date.now(),
    };

    await store.put(syncItem);
    setPendingSyncs(prev => [...prev, syncItem]);
    return syncItem;
  }, [initDB, toast]);

  // Get all pending syncs
  const getPendingSyncs = useCallback(async (): Promise<PendingSync[]> => {
    const db = await initDB();
    const tx = db.transaction('pending_syncs', 'readonly');
    const store = tx.objectStore('pending_syncs');
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }, [initDB]);

  // Remove synced item
  const removeSyncedItem = useCallback(async (id: string) => {
    const db = await initDB();
    const tx = db.transaction('pending_syncs', 'readwrite');
    const store = tx.objectStore('pending_syncs');
    await store.delete(id);
    setPendingSyncs(prev => prev.filter(item => item.id !== id));
  }, [initDB]);

  // Save offline audit
  const saveOfflineAudit = useCallback(async (audit: Record<string, unknown>) => {
    const db = await initDB();
    const tx = db.transaction('offline_audits', 'readwrite');
    const store = tx.objectStore('offline_audits');
    await store.put(audit);
  }, [initDB]);

  // Get offline audits
  const getOfflineAudits = useCallback(async (): Promise<Record<string, unknown>[]> => {
    const db = await initDB();
    const tx = db.transaction('offline_audits', 'readonly');
    const store = tx.objectStore('offline_audits');
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }, [initDB]);

  // Save offline audit item
  const saveOfflineAuditItem = useCallback(async (item: Record<string, unknown>) => {
    const db = await initDB();
    const tx = db.transaction('offline_audit_items', 'readwrite');
    const store = tx.objectStore('offline_audit_items');
    await store.put(item);
  }, [initDB]);

  // Get offline audit items
  const getOfflineAuditItems = useCallback(async (auditId: string): Promise<Record<string, unknown>[]> => {
    const db = await initDB();
    const tx = db.transaction('offline_audit_items', 'readonly');
    const store = tx.objectStore('offline_audit_items');
    const index = store.index('audit_id');
    
    return new Promise((resolve) => {
      const request = index.getAll(auditId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }, [initDB]);

  // Save offline image
  const saveOfflineImage = useCallback(async (image: { id: string; audit_item_id: string; blob: Blob }) => {
    const db = await initDB();
    const tx = db.transaction('offline_images', 'readwrite');
    const store = tx.objectStore('offline_images');
    await store.put(image);
  }, [initDB]);

  // Online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: 'Conexão restaurada',
        description: 'Sincronizando dados...',
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: 'Modo offline',
        description: 'As alterações serão sincronizadas quando a conexão voltar.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Load pending syncs on mount
    getPendingSyncs().then(setPendingSyncs);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast, getPendingSyncs]);

  return {
    isOnline,
    pendingSyncs,
    cacheData,
    getCachedData,
    saveForSync,
    getPendingSyncs,
    removeSyncedItem,
    saveOfflineAudit,
    getOfflineAudits,
    saveOfflineAuditItem,
    getOfflineAuditItems,
    saveOfflineImage,
  };
};
