import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Checklist, ChecklistItem, ChecklistSection, ItemResult, LocalAudit, LocalPhoto } from "@/lib/localdb";
import * as repo from "@/lib/repo";
import { useOnline } from "./useSyncStatus";

export type AuditWithDetails = LocalAudit;

export interface ChecklistItemWithResult extends ChecklistItem {
  result: ItemResult;
  observation: string;
  photos: string[];
}

export interface SectionWithItems extends Omit<ChecklistSection, "items"> {
  items: ChecklistItemWithResult[];
}

/** URLs exibíveis das fotos: URL do servidor ou object URL do blob local (revogado ao sair). */
export function usePhotoUrls(photos: LocalPhoto[] | undefined) {
  const cache = useRef(new Map<string, string>());
  const urls = useMemo(() => {
    const next = new Map<string, string>();
    for (const p of photos ?? []) {
      if (p.blob) {
        next.set(p.id, cache.current.get(p.id)?.startsWith("blob:") ? cache.current.get(p.id)! : URL.createObjectURL(p.blob));
      } else if (p.url) {
        next.set(p.id, p.url);
      }
    }
    cache.current.forEach((url, id) => {
      if (url.startsWith("blob:") && next.get(id) !== url) URL.revokeObjectURL(url);
    });
    cache.current = next;
    return next;
  }, [photos]);
  useEffect(() => () => cache.current.forEach(u => u.startsWith("blob:") && URL.revokeObjectURL(u)), []);
  return urls;
}

/** Lista de auditorias (banco local) + atualização a partir da API quando online. */
export const useAuditList = () => {
  const online = useOnline();
  const audits = useLiveQuery(() => db.audits.orderBy("started_at").reverse().toArray(), [], undefined);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await repo.refreshAudits();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (online) void refresh();
  }, [online, refresh]);

  return { audits: audits ?? [], loading: audits === undefined || (refreshing && !audits?.length), refresh };
};

/** Estado da auditoria aberta no formulário. */
export const useAudits = () => {
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Checklist | undefined>();
  const [loading, setLoading] = useState(false);

  const currentAudit = useLiveQuery(
    () => (currentAuditId ? db.audits.get(currentAuditId) : undefined), [currentAuditId]);
  const items = useLiveQuery(
    () => (currentAuditId ? db.auditItems.where("auditId").equals(currentAuditId).toArray() : []), [currentAuditId]);
  const photos = useLiveQuery(
    () => (currentAuditId ? db.photos.where("auditId").equals(currentAuditId).sortBy("createdAt") : []), [currentAuditId]);
  const photoUrls = usePhotoUrls(photos);

  const checklistId = currentAudit?.checklist_id;
  useEffect(() => {
    if (!checklistId) return;
    let cancelled = false;
    repo.getChecklist(checklistId).then(c => { if (!cancelled) setChecklist(c); });
    return () => { cancelled = true; };
  }, [checklistId]);

  const checklistSections: SectionWithItems[] = useMemo(() => {
    if (!checklist) return [];
    const byItem = new Map((items ?? []).map(i => [i.checklistItemId, i]));
    const photosByItem = new Map<string, string[]>();
    for (const p of photos ?? []) {
      const url = photoUrls.get(p.id);
      if (url) photosByItem.set(p.checklistItemId, [...(photosByItem.get(p.checklistItemId) ?? []), url]);
    }
    return checklist.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        result: byItem.get(item.id)?.result ?? null,
        observation: byItem.get(item.id)?.observation ?? "",
        photos: photosByItem.get(item.id) ?? [],
      })),
    }));
  }, [checklist, items, photos, photoUrls]);

  const startNewAudit = useCallback(async (location: string) => {
    setLoading(true);
    try {
      const audit = await repo.createAudit(location);
      setCurrentAuditId(audit.id);
      return audit;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Abre uma auditoria: mostra a cópia local na hora e atualiza do servidor se houver conexão. */
  const loadAudit = useCallback(async (auditId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const hasLocal = !!(await db.audits.get(auditId));
      const refreshed = navigator.onLine ? await repo.refreshAuditDetail(auditId) : false;
      if (!hasLocal && !refreshed) return false;
      setCurrentAuditId(auditId);
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const closeAudit = useCallback(() => {
    setCurrentAuditId(null);
    setChecklist(undefined);
  }, []);

  return {
    currentAudit: currentAudit ?? null,
    checklistSections,
    loading: loading || (!!currentAuditId && (!checklist || items === undefined)),
    checklistUnavailable: !!currentAudit && checklist === undefined && !loading,
    startNewAudit,
    loadAudit,
    closeAudit,
    saveItem: repo.saveItem,
    addPhoto: repo.addPhoto,
    finishAudit: repo.finishAudit,
  };
};
