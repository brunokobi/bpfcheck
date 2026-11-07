// Banco local (IndexedDB via Dexie) — fonte de verdade da interface.
// A tela sempre lê daqui; a API só alimenta este banco (pull) e recebe a fila (outbox).
import Dexie, { Table } from "dexie";

export type ItemResult = "conforme" | "nao_conforme" | "nao_aplicavel" | null;
export type AuditStatus = "in_progress" | "completed";

export interface ChecklistItem {
  id: string;
  description: string;
  order_index: number;
}

export interface ChecklistSection {
  id: string;
  title: string;
  order_index: number;
  items: ChecklistItem[];
}

export interface Checklist {
  id: string;
  name: string;
  description: string | null;
  sections: ChecklistSection[];
}

export interface LocalAudit {
  id: string;
  user_id: string;
  checklist_id: string;
  location: string | null;
  location_name: string | null;
  location_full?: string | null;
  auditor_name?: string | null;
  status: AuditStatus;
  started_at: string;
  finished_at: string | null;
  conforme_count: number;
  nao_conforme_count: number;
  nao_aplicavel_count: number;
  compliance: number | null;
}

export interface LocalAuditItem {
  auditId: string;
  checklistItemId: string;
  result: ItemResult;
  observation: string | null;
  updatedAt: string;
}

export interface LocalPhoto {
  id: string;
  auditId: string;
  checklistItemId: string;
  /** Presente até a foto subir para o servidor. */
  blob?: Blob;
  /** URL assinada do servidor (depois do upload ou vinda do pull). */
  url?: string;
  createdAt: string;
}

export type OutboxKind = "audit" | "items" | "finalize" | "photo";

export interface OutboxOp {
  seq?: number;
  kind: OutboxKind;
  /** Chave lógica: uma edição nova do mesmo item substitui a pendente. */
  key: string;
  auditId: string;
  payload: Record<string, unknown>;
  attempts: number;
  /** 0 = pendente, 1 = falhou de forma definitiva (ex.: validação). Número para poder indexar. */
  failed: 0 | 1;
  lastError?: string;
  createdAt: string;
}

export interface KV {
  key: string;
  value: unknown;
}

class BPFCheckDB extends Dexie {
  kv!: Table<KV, string>;
  audits!: Table<LocalAudit, string>;
  auditItems!: Table<LocalAuditItem, [string, string]>;
  photos!: Table<LocalPhoto, string>;
  outbox!: Table<OutboxOp, number>;

  constructor() {
    super("bpfcheck");
    this.version(1).stores({
      kv: "key",
      audits: "id, user_id, started_at, status",
      auditItems: "[auditId+checklistItemId], auditId",
      photos: "id, auditId, [auditId+checklistItemId]",
      outbox: "++seq, key, auditId, failed",
    });
  }
}

export const db = new BPFCheckDB();

export const kvGet = async <T,>(key: string): Promise<T | undefined> =>
  (await db.kv.get(key))?.value as T | undefined;

export const kvSet = (key: string, value: unknown) => db.kv.put({ key, value });

/** Apaga os dados locais (troca de usuário sem pendências). */
export const clearLocalData = () =>
  db.transaction("rw", [db.kv, db.audits, db.auditItems, db.photos, db.outbox], async () => {
    await Promise.all([db.kv.clear(), db.audits.clear(), db.auditItems.clear(), db.photos.clear(), db.outbox.clear()]);
  });
