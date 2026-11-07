// Importa dados offline que ficaram presos nas filas da versão antiga do app
// (IndexedDB "bpf_check_offline" e Dexie "BPFCheckDB") para a fila nova, e apaga os bancos antigos.
import { db, LocalAudit } from "./localdb";
import { enqueue } from "./sync";
import { AppUser } from "./api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros da versão antiga, sem tipo
type LegacyRecord = Record<string, any>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function dbExists(name: string) {
  if (!("databases" in indexedDB)) return true; // sem a API: tenta abrir mesmo assim
  return (await indexedDB.databases()).some(d => d.name === name);
}

function readAll(name: string, store: string): Promise<LegacyRecord[]> {
  return new Promise(resolve => {
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => req.transaction?.abort(); // não existia: não cria
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const conn = req.result;
      if (!conn.objectStoreNames.contains(store)) { conn.close(); return resolve([]); }
      const all = conn.transaction(store, "readonly").objectStore(store).getAll();
      all.onsuccess = () => { conn.close(); resolve(all.result || []); };
      all.onerror = () => { conn.close(); resolve([]); };
    };
  });
}

const deleteDb = (name: string) =>
  new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });

export async function importLegacyQueues(user: AppUser): Promise<number> {
  let imported = 0;
  const idMap = new Map<string, string>();
  const resolve = (id: string) => idMap.get(id) ?? (UUID_RE.test(id) ? id : null);

  if (await dbExists("bpf_check_offline")) {
    const syncs = (await readAll("bpf_check_offline", "pending_syncs")).sort((a, b) => a.timestamp - b.timestamp);
    for (const s of syncs) {
      const d = s.data || {};
      if (s.table === "audits" && s.operation === "insert") {
        const id = UUID_RE.test(d.id) ? d.id : crypto.randomUUID();
        idMap.set(d.id, id);
        const audit: LocalAudit = {
          id, user_id: user.id, checklist_id: d.checklist_id, location: d.location ?? null,
          location_name: d.location ?? null, auditor_name: user.name || user.email, status: "in_progress",
          started_at: d.started_at || new Date(s.timestamp).toISOString(), finished_at: null,
          conforme_count: 0, nao_conforme_count: 0, nao_aplicavel_count: 0, compliance: null,
        };
        await db.audits.put(audit);
        await enqueue({ kind: "audit", key: `audit:${id}`, auditId: id,
          payload: { checklist_id: d.checklist_id, location: d.location ?? null, started_at: audit.started_at } });
        imported++;
      } else if (s.table === "audit_items") {
        const auditId = resolve(d.audit_id);
        if (!auditId || !d.checklist_item_id) continue;
        const updatedAt = new Date(s.timestamp).toISOString();
        await db.auditItems.put({ auditId, checklistItemId: d.checklist_item_id, result: d.result ?? null,
          observation: d.observation ?? null, updatedAt });
        await enqueue({ kind: "items", key: `items:${auditId}:${d.checklist_item_id}`, auditId,
          payload: { checklist_item_id: d.checklist_item_id, result: d.result ?? null,
            observation: d.observation ?? null, updated_at: updatedAt } });
        imported++;
      } else if (s.table === "audits" && s.operation === "update" && d.status === "completed") {
        const auditId = resolve(d.id);
        if (!auditId) continue;
        await enqueue({ kind: "finalize", key: `finalize:${auditId}`, auditId,
          payload: { finished_at: d.finished_at || new Date(s.timestamp).toISOString() } });
        imported++;
      }
    }
    await deleteDb("bpf_check_offline");
  }

  if (await dbExists("BPFCheckDB")) {
    const queue = await readAll("BPFCheckDB", "syncQueue");
    for (const q of queue) {
      if (q.action !== "UPLOAD_IMAGE" || !q.payload?.file) continue;
      const auditId = resolve(q.payload.auditId);
      if (!auditId) continue;
      const id = crypto.randomUUID();
      await db.photos.put({ id, auditId, checklistItemId: q.payload.itemId, blob: q.payload.file,
        createdAt: q.createdAt || new Date().toISOString() });
      await enqueue({ kind: "photo", key: `photo:${id}`, auditId, payload: { photoId: id } });
      imported++;
    }
    await deleteDb("BPFCheckDB");
  }
  return imported;
}
