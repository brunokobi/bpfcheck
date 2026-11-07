// Motor de sincronização: esvazia a fila (outbox) na ordem em que as operações foram feitas.
// Todas as chamadas são idempotentes na API, então reenviar depois de uma falha é seguro.
import { api, isRetryable, session, ApiError } from "./api";
import { db, OutboxOp } from "./localdb";

type SyncState = { syncing: boolean; lastError: string | null; lastSyncAt: string | null };
let state: SyncState = { syncing: false, lastError: null, lastSyncAt: null };
const listeners = new Set<() => void>();

export const getSyncState = () => state;
export const subscribeSync = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
const setState = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach(fn => fn());
};

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? `${err.status}: ${JSON.stringify(err.detail)}` : (err as Error)?.message || String(err);

/** Adiciona uma operação à fila. Operações com a mesma `key` ainda pendentes são substituídas. */
export async function enqueue(op: Pick<OutboxOp, "kind" | "key" | "auditId" | "payload">) {
  await db.transaction("rw", db.outbox, async () => {
    await db.outbox.where("key").equals(op.key).filter(o => o.failed === 0).delete();
    await db.outbox.add({ ...op, attempts: 0, failed: 0, createdAt: new Date().toISOString() });
  });
  scheduleFlush(300);
}

async function execute(op: OutboxOp, batch: OutboxOp[]) {
  const id = op.auditId;
  switch (op.kind) {
    case "audit":
      await api(`/audits/${id}`, { method: "PUT", json: op.payload });
      return;
    case "items":
      await api(`/audits/${id}/items`, { method: "PUT", json: batch.map(o => o.payload) });
      return;
    case "finalize":
      await api(`/audits/${id}/finalize`, { method: "POST", json: op.payload });
      return;
    case "photo": {
      const photoId = op.payload.photoId as string;
      const photo = await db.photos.get(photoId);
      if (!photo?.blob) return; // já subiu ou foi removida
      const form = new FormData();
      form.append("file", photo.blob, `${photoId}.jpg`);
      const res = await api<{ url: string }>(
        `/audits/${id}/items/${photo.checklistItemId}/images/${photoId}`,
        { method: "PUT", body: form },
      );
      await db.photos.update(photoId, { url: res.url, blob: undefined });
      return;
    }
  }
}

let running = false;
let rerun = false;

export async function flush(): Promise<void> {
  if (running) { rerun = true; return; }
  if (!navigator.onLine || !session.token()) return;
  running = true;
  setState({ syncing: true });
  let hadWork = false;
  try {
    for (;;) {
      const pending = await db.outbox.where("failed").equals(0).sortBy("seq");
      const op = pending[0];
      if (!op) break;
      hadWork = true;

      // Junta as respostas pendentes da mesma auditoria num único request,
      // sem passar por cima de uma operação de outro tipo (ex.: finalizar).
      let batch = [op];
      if (op.kind === "items") {
        const barrier = pending.find(o => o.auditId === op.auditId && o.kind !== "items")?.seq ?? Infinity;
        batch = pending.filter(o => o.kind === "items" && o.auditId === op.auditId && o.seq! < barrier);
      }

      try {
        await execute(op, batch);
        await db.outbox.bulkDelete(batch.map(o => o.seq!));
        setState({ lastError: null });
      } catch (err) {
        const msg = errorMessage(err);
        if (isRetryable(err)) {
          // Falha temporária: para aqui e tenta de novo depois, mantendo a ordem.
          await db.outbox.update(op.seq!, { attempts: op.attempts + 1, lastError: msg });
          setState({ lastError: msg });
          break;
        }
        // Erro definitivo (validação): tira da fila ativa para não travar o resto.
        console.error("[sync] operação rejeitada", op, err);
        await Promise.all(batch.map(o => db.outbox.update(o.seq!, { failed: 1, lastError: msg })));
        setState({ lastError: msg });
      }
    }
    if (hadWork) setState({ lastSyncAt: new Date().toISOString() });
  } finally {
    running = false;
    setState({ syncing: false });
    if (rerun) { rerun = false; void flush(); }
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleFlush(delay = 0) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flush(); }, delay);
}

/** Recoloca na fila as operações que falharam (botão "tentar novamente"). */
export async function retryFailed() {
  await db.outbox.where("failed").equals(1).modify({ failed: 0, attempts: 0 });
  scheduleFlush();
}

let started = false;
export function startSyncLoop() {
  if (started) return;
  started = true;
  window.addEventListener("online", () => scheduleFlush(1000));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleFlush(500);
  });
  setInterval(() => { if (navigator.onLine) void flush(); }, 30_000);
  scheduleFlush(1500);
}

