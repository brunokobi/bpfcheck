// Operações de dados do app. Escrevem primeiro no banco local e enfileiram para a API;
// leituras de servidor (pull) só atualizam o banco local quando há conexão.
import { api, session } from "./api";
import { db, kvGet, kvSet, Checklist, LocalAudit, LocalAuditItem, ItemResult } from "./localdb";
import { enqueue } from "./sync";

const DEFAULT_CHECKLIST_KEY = "checklist:default";
const checklistKey = (id: string) => `checklist:${id}`;

const now = () => new Date().toISOString();

// ───────────────────────── checklist ─────────────────────────

/** Busca o checklist na API e guarda no aparelho. Silencioso quando offline. */
export async function refreshChecklist(id = "default"): Promise<Checklist | undefined> {
  try {
    const checklist = await api<Checklist>(`/checklists/${id}`);
    await kvSet(checklistKey(checklist.id), checklist);
    if (id === "default") await kvSet(DEFAULT_CHECKLIST_KEY, checklist.id);
    return checklist;
  } catch {
    return undefined;
  }
}

export async function getChecklist(id?: string): Promise<Checklist | undefined> {
  const realId = id ?? await kvGet<string>(DEFAULT_CHECKLIST_KEY);
  if (realId) {
    const cached = await kvGet<Checklist>(checklistKey(realId));
    if (cached) return cached;
  }
  return refreshChecklist(id ?? "default");
}

// ────────────────────────── audits ──────────────────────────

type ServerAudit = Omit<LocalAudit, "conforme_count" | "nao_conforme_count" | "nao_aplicavel_count"> & {
  conforme_count: number;
  nao_conforme_count: number;
  nao_aplicavel_count: number;
};

interface ServerAuditDetail extends ServerAudit {
  location_full: string | null;
  items: {
    checklist_item_id: string;
    result: ItemResult;
    observation: string | null;
    updated_at: string;
    images: { id: string; url: string }[];
  }[];
}

const pendingAuditIds = async () =>
  new Set((await db.outbox.toArray()).map(o => o.auditId));

const toLocalAudit = (a: ServerAudit): LocalAudit => ({
  id: a.id,
  user_id: a.user_id,
  checklist_id: a.checklist_id,
  location: a.location,
  location_name: a.location_name,
  location_full: (a as ServerAuditDetail).location_full,
  auditor_name: a.auditor_name,
  status: a.status,
  started_at: a.started_at,
  finished_at: a.finished_at,
  conforme_count: Number(a.conforme_count) || 0,
  nao_conforme_count: Number(a.nao_conforme_count) || 0,
  nao_aplicavel_count: Number(a.nao_aplicavel_count) || 0,
  compliance: a.compliance ?? null,
});

/** Puxa a lista de auditorias. Auditorias com alterações locais pendentes não são sobrescritas. */
export async function refreshAudits(): Promise<boolean> {
  let rows: ServerAudit[];
  try {
    rows = await api<ServerAudit[]>("/audits");
  } catch {
    return false;
  }
  const pending = await pendingAuditIds();
  const serverIds = new Set(rows.map(r => r.id));
  await db.transaction("rw", [db.audits, db.auditItems, db.photos], async () => {
    const localIds = await db.audits.toCollection().primaryKeys();
    const gone = localIds.filter(id => !serverIds.has(id) && !pending.has(id));
    if (gone.length) {
      await db.audits.bulkDelete(gone);
      await db.auditItems.where("auditId").anyOf(gone).delete();
      await db.photos.where("auditId").anyOf(gone).delete();
    }
    for (const row of rows) {
      if (pending.has(row.id) && await db.audits.get(row.id)) continue;
      const existing = await db.audits.get(row.id);
      await db.audits.put({ ...existing, ...toLocalAudit(row), location_full: existing?.location_full ?? null });
    }
  });
  return true;
}

/** Puxa uma auditoria completa (respostas + fotos). Respostas com edição local pendente são preservadas. */
export async function refreshAuditDetail(auditId: string): Promise<boolean> {
  let detail: ServerAuditDetail;
  try {
    detail = await api<ServerAuditDetail>(`/audits/${auditId}`);
  } catch {
    return false;
  }
  const pendingOps = await db.outbox.where("auditId").equals(auditId).toArray();
  const pendingItemKeys = new Set(pendingOps.filter(o => o.kind === "items").map(o => o.key));
  const auditPending = pendingOps.length > 0;

  await db.transaction("rw", [db.audits, db.auditItems, db.photos], async () => {
    if (!auditPending || !(await db.audits.get(auditId))) {
      await db.audits.put(toLocalAudit(detail));
    } else {
      await db.audits.update(auditId, { location_full: detail.location_full, auditor_name: detail.auditor_name });
    }

    const remotePhotoIds = new Set<string>();
    for (const item of detail.items) {
      if (!pendingItemKeys.has(itemKey(auditId, item.checklist_item_id))) {
        const local = await db.auditItems.get([auditId, item.checklist_item_id]);
        if (!local || Date.parse(local.updatedAt) <= Date.parse(item.updated_at)) {
          await db.auditItems.put({
            auditId,
            checklistItemId: item.checklist_item_id,
            result: item.result,
            observation: item.observation,
            updatedAt: item.updated_at,
          });
        }
      }
      for (const img of item.images) {
        remotePhotoIds.add(img.id);
        const local = await db.photos.get(img.id);
        if (local?.blob) continue; // ainda subindo
        await db.photos.put({
          id: img.id, auditId, checklistItemId: item.checklist_item_id, url: img.url,
          createdAt: local?.createdAt ?? now(),
        });
      }
    }
    // Fotos que só existiam no servidor e sumiram de lá
    await db.photos.where("auditId").equals(auditId)
      .filter(p => !p.blob && !remotePhotoIds.has(p.id)).delete();
  });
  return true;
}

const itemKey = (auditId: string, checklistItemId: string) => `items:${auditId}:${checklistItemId}`;

export async function createAudit(location: string): Promise<LocalAudit> {
  const user = session.user();
  if (!user) throw new Error("not_authenticated");
  const checklist = await getChecklist();
  if (!checklist) throw new Error("checklist_unavailable");

  const audit: LocalAudit = {
    id: crypto.randomUUID(),
    user_id: user.id,
    checklist_id: checklist.id,
    location,
    location_name: location,
    location_full: location,
    auditor_name: user.name || user.email,
    status: "in_progress",
    started_at: now(),
    finished_at: null,
    conforme_count: 0,
    nao_conforme_count: 0,
    nao_aplicavel_count: 0,
    compliance: null,
  };
  await db.audits.put(audit);
  await enqueue({
    kind: "audit",
    key: `audit:${audit.id}`,
    auditId: audit.id,
    payload: { checklist_id: audit.checklist_id, location, started_at: audit.started_at },
  });
  return audit;
}

const compliance = (c: number, nc: number) => (c + nc > 0 ? Math.round((c / (c + nc)) * 100) : null);

async function recountAudit(auditId: string) {
  const items = await db.auditItems.where("auditId").equals(auditId).toArray();
  const count = (r: ItemResult) => items.filter(i => i.result === r).length;
  const c = count("conforme"), nc = count("nao_conforme"), na = count("nao_aplicavel");
  const audit = await db.audits.get(auditId);
  await db.audits.update(auditId, {
    conforme_count: c,
    nao_conforme_count: nc,
    nao_aplicavel_count: na,
    compliance: audit?.status === "completed" ? compliance(c, nc) : null,
  });
}

export async function saveItem(
  auditId: string,
  checklistItemId: string,
  patch: { result?: ItemResult; observation?: string | null },
) {
  const existing = await db.auditItems.get([auditId, checklistItemId]);
  const item: LocalAuditItem = {
    auditId,
    checklistItemId,
    result: patch.result !== undefined ? patch.result : existing?.result ?? null,
    observation: patch.observation !== undefined ? patch.observation : existing?.observation ?? null,
    updatedAt: now(),
  };
  await db.auditItems.put(item);
  await recountAudit(auditId);
  await enqueue({
    kind: "items",
    key: itemKey(auditId, checklistItemId),
    auditId,
    payload: {
      checklist_item_id: checklistItemId,
      result: item.result,
      observation: item.observation,
      updated_at: item.updatedAt,
    },
  });
}

export class IncompleteChecklistError extends Error {
  constructor(public answered: number, public total: number) {
    super(`checklist_incomplete:${answered}/${total}`);
  }
}

export async function finishAudit(auditId: string) {
  const audit = await db.audits.get(auditId);
  if (!audit) throw new Error("audit_not_found");
  const checklist = await getChecklist(audit.checklist_id);
  const total = checklist?.sections.reduce((n, s) => n + s.items.length, 0) ?? 0;
  const answered = await db.auditItems.where("auditId").equals(auditId).filter(i => i.result !== null).count();
  if (total > 0 && answered < total) throw new IncompleteChecklistError(answered, total);

  const finishedAt = now();
  await db.audits.update(auditId, { status: "completed", finished_at: finishedAt });
  await recountAudit(auditId);
  await enqueue({ kind: "finalize", key: `finalize:${auditId}`, auditId, payload: { finished_at: finishedAt } });
}

// ────────────────────────── photos ──────────────────────────

/** Reduz a foto (máx. 1600px, JPEG 80%) antes de guardar: economiza IndexedDB e dados móveis. */
async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function addPhoto(auditId: string, checklistItemId: string, file: File) {
  const blob = await compressImage(file);
  const id = crypto.randomUUID();
  await db.photos.put({ id, auditId, checklistItemId, blob, createdAt: now() });
  await enqueue({ kind: "photo", key: `photo:${id}`, auditId, payload: { photoId: id } });
  return id;
}

// ────────────────────────── stats ──────────────────────────

export interface DashboardStats {
  totalAudits: number;
  pendingAudits: number;
  completedAudits: number;
  complianceRate: number;
}

export function computeStats(audits: LocalAudit[]): DashboardStats {
  const completed = audits.filter(a => a.status === "completed");
  const withCompliance = completed.filter(a => a.compliance !== null);
  return {
    totalAudits: audits.length,
    pendingAudits: audits.filter(a => a.status === "in_progress").length,
    completedAudits: completed.length,
    complianceRate: withCompliance.length
      ? Math.round(withCompliance.reduce((s, a) => s + (a.compliance ?? 0), 0) / withCompliance.length)
      : 0,
  };
}
