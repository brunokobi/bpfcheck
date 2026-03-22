import { useCallback, useEffect, useRef } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { useToast } from './use-toast';
import {
  getSyncQueue,
  removeSyncItem,
  updateSyncItem,
  SyncQueueItem,
  getOfflinePhotos,
  removeOfflinePhoto,
} from '@/lib/offline-sync';
import { saveAuditTransaction, uploadAuditImage } from '@/lib/supabase-service';

const MAX_RETRIES = 5;

export const useSyncManager = () => {
  const { isOnline, isSyncing, setIsSyncing, status } = useOnlineStatus();
  const { toast } = useToast();
  const syncingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    
    const queue = await getSyncQueue();
    if (queue.length === 0) {
      // Also check photos
      const photos = await getOfflinePhotos();
      if (photos.length === 0) return;
    }

    syncingRef.current = true;
    setIsSyncing(true);

    try {
      // Process sync queue items
      const queue = await getSyncQueue();
      let successCount = 0;
      let failCount = 0;

      for (const item of queue) {
        if (!navigator.onLine) break;

        try {
          await processSyncItem(item);
          await removeSyncItem(item.id);
          successCount++;
        } catch (err) {
          console.error('[SyncManager] Failed to sync item:', item.id, err);
          item.retries++;
          if (item.retries >= MAX_RETRIES) {
            await removeSyncItem(item.id);
            failCount++;
          } else {
            await updateSyncItem(item);
          }
        }
      }

      // Process offline photos
      const photos = await getOfflinePhotos();
      for (const photo of photos) {
        if (!navigator.onLine) break;
        try {
          const file = new File([photo.blob], `offline_${photo.id}.jpg`, { type: photo.mimeType });
          const { error } = await uploadAuditImage(file, photo.auditId, photo.checklistItemId);
          if (!error) {
            await removeOfflinePhoto(photo.id);
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Sincronização concluída',
          description: `${successCount} item(ns) sincronizado(s) com sucesso.${failCount > 0 ? ` ${failCount} falha(s).` : ''}`,
        });
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [setIsSyncing, toast]);

  const processSyncItem = async (item: SyncQueueItem) => {
    switch (item.type) {
      case 'save_items': {
        const { auditId, items } = item.payload as { auditId: string; items: any[] };
        const { error } = await saveAuditTransaction({
          auditId,
          items,
          finalize: false,
        });
        if (error) throw new Error(error);
        break;
      }
      case 'finish_audit': {
        const { auditId, items } = item.payload as { auditId: string; items: any[] };
        const { error } = await saveAuditTransaction({
          auditId,
          items,
          finalize: true,
        });
        if (error) throw new Error(error);
        break;
      }
      case 'create_audit': {
        const { checklistId, location, locationId } = item.payload as any;
        const { error } = await saveAuditTransaction({
          checklistId,
          location,
          locationId,
          items: [],
          finalize: false,
        });
        if (error) throw new Error(error);
        break;
      }
      default:
        console.warn('[SyncManager] Unknown sync type:', item.type);
    }
  };

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline) {
      // Small delay to let network stabilize
      const timer = setTimeout(processQueue, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, processQueue]);

  return { isOnline, isSyncing, status, processQueue };
};
