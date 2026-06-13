import { useEffect, useRef, useCallback } from 'react';
import { useOfflineStorage } from './useOfflineStorage';
import { saveAuditTransaction, saveAuditItems, updateAuditSummary } from '@/lib/supabase-service';
import { useToast } from './use-toast';

/**
 * Runs in the background and processes the offline queue when connectivity is restored.
 *
 * Queue order:
 *   1. audits:insert  → create audit in Supabase, build offline_id→real_id map
 *   2. audit_items    → deduplicate per checklist_item_id (keep latest), save via RPC
 *   3. audits:update  → finalize completed audits
 *   4. audit_summary  → save summary counts
 */
export const useSyncWorker = () => {
  const { isOnline, getPendingSyncs, removeSyncedItem } = useOfflineStorage();
  const { toast } = useToast();
  const prevOnlineRef = useRef<boolean | null>(null);

  const runSync = useCallback(async () => {
    const pendingSyncs = await getPendingSyncs();
    if (pendingSyncs.length === 0) return;

    // Process in insertion order
    const sorted = [...pendingSyncs].sort((a, b) => a.timestamp - b.timestamp);

    // Maps offline_id (e.g. "offline_1234") → real Supabase UUID
    const idMap = new Map<string, string>();
    const toRemove: string[] = [];

    // ── Step 1: Create offline-created audits ─────────────────────────────────
    const auditInserts = sorted.filter(s => s.table === 'audits' && s.operation === 'insert');
    for (const sync of auditInserts) {
      const { id: offlineId, checklist_id, location, location_id } = sync.data;
      try {
        const { data: realId, error } = await saveAuditTransaction({
          checklistId: checklist_id as string,
          location: (location as string) || null,
          locationId: (location_id as string) || null,
          items: [],
          finalize: false,
        });
        if (error || !realId) throw new Error(error || 'No audit ID returned');
        idMap.set(offlineId as string, realId);
        toRemove.push(sync.id);
      } catch (err) {
        console.error('[SyncWorker] Failed to create offline audit:', offlineId, err);
      }
    }

    const resolveId = (id: string): string => idMap.get(id) || id;

    // ── Step 2: Group item syncs by real audit ID (deduplicated) ──────────────
    const itemInserts = sorted.filter(s => s.table === 'audit_items' && s.operation === 'insert');

    // realAuditId → Map<checklistItemId, latestSync>  (latest wins)
    const dedupedByAudit = new Map<string, Map<string, typeof itemInserts[0]>>();
    // realAuditId → [all syncIds including duplicates] (need to remove them all)
    const allSyncIdsByAudit = new Map<string, string[]>();

    for (const sync of itemInserts) {
      const realAuditId = resolveId(sync.data.audit_id as string);
      if (!dedupedByAudit.has(realAuditId)) dedupedByAudit.set(realAuditId, new Map());
      if (!allSyncIdsByAudit.has(realAuditId)) allSyncIdsByAudit.set(realAuditId, []);
      dedupedByAudit.get(realAuditId)!.set(sync.data.checklist_item_id as string, sync);
      allSyncIdsByAudit.get(realAuditId)!.push(sync.id);
    }

    // Check which audits are being finalized in this sync batch
    const auditUpdates = sorted.filter(
      s => s.table === 'audits' && s.operation === 'update' && s.data.status === 'completed'
    );
    const finalizingAuditIds = new Set(auditUpdates.map(s => resolveId(s.data.id as string)));

    // ── Step 3: Save items + finalize in one transaction per audit ────────────
    for (const [realAuditId, itemMap] of dedupedByAudit.entries()) {
      const items = Array.from(itemMap.values()).map(s => ({
        checklist_item_id: s.data.checklist_item_id as string,
        result: s.data.result as string | null,
        observation: s.data.observation as string | null,
      }));

      const shouldFinalize = finalizingAuditIds.has(realAuditId);

      try {
        const { error } = await saveAuditTransaction({
          auditId: realAuditId,
          items,
          finalize: shouldFinalize,
        });
        if (error) throw new Error(error);

        allSyncIdsByAudit.get(realAuditId)?.forEach(id => toRemove.push(id));

        if (shouldFinalize) {
          const updateSync = auditUpdates.find(s => resolveId(s.data.id as string) === realAuditId);
          if (updateSync) toRemove.push(updateSync.id);
        }
      } catch (err) {
        console.error('[SyncWorker] Failed to save items for audit:', realAuditId, err);
      }
    }

    // ── Step 4: Save summaries ─────────────────────────────────────────────────
    const summaryInserts = sorted.filter(s => s.table === 'audit_summary' && s.operation === 'insert');
    for (const sync of summaryInserts) {
      const realAuditId = resolveId(sync.data.audit_id as string);
      try {
        const { error } = await updateAuditSummary(realAuditId, {
          conforme_count: sync.data.conforme_count as number,
          nao_conforme_count: sync.data.nao_conforme_count as number,
          nao_aplicavel_count: sync.data.nao_aplicavel_count as number,
        });
        if (error) throw new Error(error);
        toRemove.push(sync.id);
      } catch (err) {
        console.error('[SyncWorker] Failed to save summary for audit:', realAuditId, err);
      }
    }

    // ── Remove all successfully processed syncs ────────────────────────────────
    const uniqueIds = [...new Set(toRemove)];
    await Promise.all(uniqueIds.map(id => removeSyncedItem(id)));

    if (uniqueIds.length > 0) {
      toast({
        title: 'Sincronização concluída',
        description: 'Dados offline enviados para a nuvem com sucesso.',
      });
    }
  }, [getPendingSyncs, removeSyncedItem, toast]);

  // Run on mount (catches leftover queue from previous sessions) and on reconnect
  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (isOnline && (wasOnline === false || wasOnline === null)) {
      runSync();
    }
  }, [isOnline, runSync]);
};
