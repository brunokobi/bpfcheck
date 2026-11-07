import { useEffect, useRef, useState } from "react";
import { Check, Minus, X } from "lucide-react";
import { BrandLogo, Orbits } from "@/components/brand/Brand";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/localdb";
import { getChecklist, refreshAudits } from "@/lib/repo";
import { flush } from "@/lib/sync";

interface SplashScreenProps {
  onComplete: () => void;
}

/** Cada etapa é trabalho real de inicialização; o progresso reflete as etapas concluídas. */
type StepState = "pending" | "running" | "ok" | "warn" | "skip";
interface Step { label: string; detail: string; state: StepState }

const STEP_TIMEOUT_MS = 8000; // rede lenta não prende a abertura do app
const MIN_VISIBLE_MS = 1200;  // tempo mínimo para a animação de entrada

const withTimeout = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<"timeout">(r => setTimeout(() => r("timeout"), STEP_TIMEOUT_MS))]);

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const { user } = useAuth();
  const [steps, setSteps] = useState<Step[]>([
    { label: "Checklist RDC 216/2004", detail: "Verificando…", state: "pending" },
    { label: "Auditorias", detail: "Aguardando…", state: "pending" },
    { label: "Envio de respostas e fotos", detail: "Aguardando…", state: "pending" },
  ]);
  const [stage, setStage] = useState("Iniciando…");
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const set = (i: number, patch: Partial<Step>) =>
      !cancelled && setSteps(prev => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

    (async () => {
      const online = navigator.onLine;

      // 1. Checklist: do aparelho ou baixado da API.
      if (!user) {
        set(0, { state: "skip", detail: "Disponível após o login" });
      } else {
        set(0, { state: "running", detail: online ? "Baixando…" : "Lendo do aparelho…" });
        setStage("Carregando checklist…");
        const checklist = await withTimeout(getChecklist()).catch(() => undefined);
        if (checklist && checklist !== "timeout") {
          const items = checklist.sections.reduce((n, s) => n + s.items.length, 0);
          set(0, { state: "ok", detail: `${plural(checklist.sections.length, "seção", "seções")} · ${plural(items, "item", "itens")}` });
        } else {
          set(0, { state: "warn", detail: online ? "Não foi possível baixar" : "Conecte-se uma vez para baixar" });
        }
      }

      // 2. Auditorias: atualiza do servidor (se online) e conta o que está no aparelho.
      if (!user) {
        set(1, { state: "skip", detail: "Disponível após o login" });
      } else {
        set(1, { state: "running", detail: online ? "Atualizando…" : "Lendo do aparelho…" });
        setStage("Atualizando auditorias…");
        const refreshed = online ? await withTimeout(refreshAudits()).catch(() => false) : false;
        const count = await db.audits.count();
        set(1, {
          state: online && refreshed !== true ? "warn" : "ok",
          detail: `${plural(count, "auditoria", "auditorias")} no aparelho${online && refreshed !== true ? " · servidor indisponível" : ""}`,
        });
      }

      // 3. Fila offline: envia o que ficou pendente.
      const before = await db.outbox.where("failed").equals(0).count();
      if (before === 0) {
        set(2, { state: "ok", detail: "Nada pendente" });
      } else if (!online || !user) {
        set(2, { state: "warn", detail: `${plural(before, "alteração aguardando", "alterações aguardando")} conexão` });
      } else {
        set(2, { state: "running", detail: `Enviando ${plural(before, "alteração", "alterações")}…` });
        setStage("Enviando pendências…");
        await withTimeout(flush()).catch(() => undefined);
        const after = await db.outbox.where("failed").equals(0).count();
        set(2, after === 0
          ? { state: "ok", detail: `${plural(before, "alteração enviada", "alterações enviadas")}` }
          : { state: "warn", detail: `${plural(after, "alteração", "alterações")} ainda na fila` });
      }

      if (cancelled) return;
      setStage(online ? "Tudo pronto!" : "Pronto para usar offline");
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - started)) + 500;
      setTimeout(() => { if (!cancelled) done.current(); }, wait);
    })();

    return () => { cancelled = true; };
    // Roda uma vez por abertura do app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finished = steps.filter(s => s.state !== "pending" && s.state !== "running").length;
  const pct = Math.round((finished / steps.length) * 100);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#0369A1] text-white flex flex-col items-center justify-between px-8 pt-[72px] pb-12">
      <Orbits size={760} rotate className="-top-[170px] left-[calc(50%-380px)] opacity-[0.18]" />

      <div className="h-6" />

      <div className="relative flex flex-col items-center gap-7">
        <div className="bpf-float relative w-28 h-28">
          <div className="bpf-ring" />
          <div className="bpf-ring bpf-ring-delay" />
          <div className="relative w-28 h-28 rounded-[32px] bg-white flex items-center justify-center shadow-[0_24px_48px_rgba(8,47,73,0.35)]">
            <BrandLogo size={78} animated />
          </div>
        </div>
        <div className="bpf-rise flex flex-col items-center gap-2" style={{ animationDelay: "150ms" }}>
          <h1 className="m-0 text-[36px] font-extrabold tracking-[-0.02em]">BPF Check</h1>
          <p className="m-0 text-base font-medium text-sky-100">Sistema de Auditoria Sanitária</p>
        </div>
      </div>

      <div className="relative w-full max-w-sm flex flex-col gap-7">
        <div className="bpf-rise flex flex-col gap-2.5" style={{ animationDelay: "300ms" }}>
          <div className="flex justify-between items-baseline text-[13px] font-semibold" aria-live="polite">
            <span className="text-sky-100">{stage}</span>
            <span className="text-[15px] font-extrabold tabular-nums">{pct}%</span>
          </div>
          <div
            className="h-2 rounded-full bg-white/[0.18] overflow-hidden"
            role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Inicialização"
          >
            <div className="relative overflow-hidden h-2 rounded-full bg-white transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, 4)}%` }}>
              <div className="bpf-shine" />
            </div>
          </div>
        </div>

        <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
          {steps.map((s, i) => {
            const ok = s.state === "ok";
            const Icon = s.state === "warn" ? X : s.state === "skip" ? Minus : Check;
            return (
              <li
                key={s.label}
                className="bpf-rise flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white/10 border border-white/[0.16]"
                style={{ animationDelay: `${450 + i * 100}ms` }}
              >
                <div
                  className={`w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center transition-colors duration-300 ${s.state === "running" ? "animate-pulse" : ""}`}
                  style={{
                    background: ok ? "#fff" : s.state === "warn" ? "#FDE68A" : "rgba(255,255,255,0.14)",
                    color: ok ? "#0369A1" : s.state === "warn" ? "#92400E" : "rgba(255,255,255,0.6)",
                  }}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex flex-col">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="text-xs text-sky-100 truncate">{s.detail}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="self-center text-xs font-medium text-sky-100 px-4 py-3 m-0">Baseado na RDC 216/2004 · ANVISA</p>
      </div>
    </div>
  );
};
