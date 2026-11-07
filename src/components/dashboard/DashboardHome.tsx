import { useEffect, useMemo, useState } from "react";
import {
  Calendar, ChevronRight, ClipboardCheck, Clock, CheckCircle2, CloudOff, CloudUpload, Cloud,
  FileText, History, Plus, RefreshCw, Shield, TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuditList, AuditWithDetails } from "@/hooks/useAudits";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { computeStats } from "@/lib/repo";
import { flush } from "@/lib/sync";
import { BrandMark, Orbits } from "@/components/brand/Brand";
import { useToast } from "@/hooks/use-toast";

interface DashboardProps {
  userName: string;
  onNewAudit: () => void;
  onViewReports: () => void;
  onViewHistory: () => void;
  onAuditClick?: (auditId: string, status: string | null) => void;
  isAdmin?: boolean;
}

const RING_C = 2 * Math.PI * 46; // circunferência do anel (r=46)

/** Anima de 0 até o valor (ease-out), reiniciando quando `key` muda. */
function useCountUp(target: number, duration = 1600, replayKey = 0) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setT(1); return; }
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setT(1 - Math.pow(1 - p, 4));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setT(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, replayKey]);
  return target * t;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  try { return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR }); } catch { return dateString; }
};

const StatusPill = ({ audit }: { audit: AuditWithDetails }) =>
  audit.status === "completed" ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-green-100 text-green-800 text-[11px] font-bold whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
      {audit.compliance != null ? `${audit.compliance}%` : "Concluída"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold whitespace-nowrap">
      <span className="bpf-dot w-1.5 h-1.5 rounded-full bg-amber-600" aria-hidden="true" />
      Em andamento
    </span>
  );

export const DashboardHome = ({
  userName, onNewAudit, onViewReports, onViewHistory, onAuditClick, isAdmin = false,
}: DashboardProps) => {
  const { audits, loading, refresh } = useAuditList();
  const { online, pending, failed, syncing } = useSyncStatus();
  const { toast } = useToast();
  const stats = useMemo(() => computeStats(audits), [audits]);
  const recent = audits.slice(0, 5);
  const [replay, setReplay] = useState(0);

  // Reanima quando os números mudam (ex.: chegou a lista do servidor).
  const statsKey = `${stats.totalAudits}-${stats.completedAudits}-${stats.complianceRate}`;
  useEffect(() => { setReplay(r => r + 1); }, [statsKey]);

  const rateAnim = useCountUp(stats.complianceRate, 1800, replay);
  const totalAnim = useCountUp(stats.totalAudits, 1600, replay);
  const progAnim = useCountUp(stats.pendingAudits, 1600, replay);
  const doneAnim = useCountUp(stats.completedAudits, 1600, replay);
  const share = (n: number) => (stats.totalAudits ? (n / stats.totalAudits) * 100 : 0);
  // Fração da animação (0→1) aplicada às barras, que mostram a proporção real de cada status.
  const growth = stats.totalAudits ? totalAnim / stats.totalAudits : 0;

  const handleRefresh = async () => {
    setReplay(r => r + 1);
    if (!online) {
      toast({ title: "Sem conexão", description: "Mostrando os dados guardados no aparelho." });
      return;
    }
    await flush();
    await refresh();
  };

  const syncLabel = !online
    ? "Offline: dados salvos no aparelho"
    : failed > 0 ? `${failed} alterações recusadas`
    : pending > 0 ? `${pending} alterações a enviar`
    : "Tudo sincronizado";

  const trend = stats.completedAudits === 0
    ? { icon: Minus, text: "Sem auditorias concluídas", cls: "bg-slate-100 text-slate-700" }
    : stats.complianceRate >= 70
      ? { icon: TrendingUp, text: "Acima de 70%", cls: "bg-green-100 text-green-800" }
      : stats.complianceRate >= 50
        ? { icon: Minus, text: "Entre 50% e 70%", cls: "bg-amber-100 text-amber-800" }
        : { icon: TrendingDown, text: "Abaixo de 50%", cls: "bg-red-100 text-red-800" };
  const TrendIcon = trend.icon;

  const counters = [
    { label: "Total", value: totalAnim, width: 100, icon: ClipboardCheck, bg: "bg-sky-100", fg: "text-sky-700", bar: "bg-sky-600" },
    { label: "Em andamento", value: progAnim, width: share(stats.pendingAudits), icon: Clock, bg: "bg-amber-100", fg: "text-amber-700", bar: "bg-amber-500" },
    { label: "Concluídas", value: doneAnim, width: share(stats.completedAudits), icon: CheckCircle2, bg: "bg-green-100", fg: "text-green-700", bar: "bg-green-500" },
  ];

  return (
    <div className="-mx-4 sm:mx-0">
      {/* Cabeçalho azul */}
      <header className="relative overflow-hidden bg-[#0369A1] text-white px-5 pt-6 pb-24 rounded-b-[32px] sm:rounded-[32px]">
        <Orbits size={420} className="-top-[190px] -right-[170px] opacity-[0.16]" />
        <div className="relative flex items-center gap-3">
          <BrandMark box={46} radius={15} logo={34} className="shadow-none" />
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-sky-100">Olá,</span>
            <span className="text-lg font-extrabold tracking-[-0.01em] truncate">{userName}</span>
          </div>
          <button
            type="button" onClick={handleRefresh} aria-label="Atualizar números"
            className="w-11 h-11 rounded-[14px] border border-white/[0.22] bg-white/[0.12] flex items-center justify-center active:bg-white/20"
          >
            <RefreshCw className={`w-5 h-5 ${syncing || (loading && online) ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button" onClick={() => { void flush(); toast({ title: "Sincronização", description: syncLabel }); }}
            aria-label={syncLabel} title={syncLabel}
            className="relative w-11 h-11 rounded-[14px] border border-white/[0.22] bg-white/[0.12] flex items-center justify-center active:bg-white/20"
          >
            {!online ? <CloudOff className="w-5 h-5" /> : pending > 0 ? <CloudUpload className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
            {(pending > 0 || failed > 0) && (
              <span className={`bpf-dot absolute top-2.5 right-[11px] w-2 h-2 rounded-full border-2 border-[#0369A1] ${failed > 0 ? "bg-red-400" : "bg-amber-400"}`} />
            )}
          </button>
        </div>
        <div className="bpf-rise relative mt-6 flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">Dashboard</h1>
          <p className="m-0 text-sm text-sky-100">Gerencie suas auditorias sanitárias</p>
          {isAdmin && (
            <span className="mt-2 self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-xs font-bold">
              <Shield className="w-3.5 h-3.5" /> Administrador · dados de todos os usuários
            </span>
          )}
        </div>
      </header>

      <div className="relative -mt-[72px] px-5 sm:px-0 flex flex-col gap-4">
        {/* Taxa de conformidade */}
        <section
          aria-label="Taxa de conformidade"
          className="bpf-pop bg-white rounded-3xl p-5 flex items-center gap-5 shadow-[0_16px_40px_rgba(15,23,42,0.10)]"
          style={{ animationDelay: "120ms" }}
        >
          <div className="relative w-28 h-28 flex-none">
            <svg aria-hidden="true" width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
              <circle cx="56" cy="56" r="46" fill="none" stroke="#E0F2FE" strokeWidth="12" />
              <circle
                cx="56" cy="56" r="46" fill="none" stroke="#0284C7" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - rateAnim / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[28px] font-extrabold tracking-[-0.03em] text-[#0369A1] tabular-nums">{Math.round(rateAnim)}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.06em] uppercase text-slate-600">Taxa de conformidade</span>
            <span className="text-[15px] font-semibold leading-snug text-slate-900">Média geral das auditorias concluídas</span>
            <span className={`self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold ${trend.cls}`}>
              <TrendIcon className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" /> {trend.text}
            </span>
          </div>
        </section>

        {/* Contadores */}
        <section aria-label="Resumo" className="grid grid-cols-3 gap-2.5">
          {counters.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="bpf-pop bg-white rounded-[20px] px-3 py-3.5 flex flex-col gap-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
                style={{ animationDelay: `${200 + i * 70}ms` }}
              >
                <div className={`w-[34px] h-[34px] rounded-[11px] flex items-center justify-center ${c.bg} ${c.fg}`}>
                  <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                </div>
                <span className={`text-[30px] font-extrabold tracking-[-0.03em] leading-none tabular-nums ${c.fg}`}>
                  {Math.round(c.value)}
                </span>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-700 leading-tight">{c.label}</span>
                  <div className="h-[5px] rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-[5px] rounded-full ${c.bar}`} style={{ width: `${c.width * growth}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Nova auditoria */}
        <button
          type="button" onClick={onNewAudit}
          className="bpf-tap bpf-rise relative overflow-hidden bg-slate-900 text-white rounded-3xl p-5 flex items-center gap-4 text-left"
          style={{ animationDelay: "380ms" }}
        >
          <svg aria-hidden="true" width="200" height="200" viewBox="0 0 200 200" className="absolute -right-[60px] -top-[70px] opacity-25">
            <circle cx="100" cy="100" r="60" fill="none" stroke="#38BDF8" strokeWidth="1" />
            <circle cx="100" cy="100" r="90" fill="none" stroke="#38BDF8" strokeWidth="1" strokeDasharray="3 8" />
          </svg>
          <div className="bpf-glow w-[52px] h-[52px] flex-none rounded-2xl bg-sky-600 flex items-center justify-center">
            <Plus className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <div className="relative flex-1 min-w-0 flex flex-col gap-1">
            <span className="text-[17px] font-extrabold">Nova Auditoria</span>
            <span className="text-[13px] text-slate-300">Iniciar com base na RDC 216/2004</span>
          </div>
          <ChevronRight className="relative w-[22px] h-[22px]" aria-hidden="true" />
        </button>

        {/* Atalhos */}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: "Relatórios", sub: "Visualizar e exportar", icon: FileText, cls: "bg-sky-100 text-sky-700", onClick: onViewReports, delay: "440ms" },
            { label: "Histórico", sub: "Auditorias anteriores", icon: History, cls: "bg-purple-100 text-purple-700", onClick: onViewHistory, delay: "500ms" },
          ].map(a => {
            const Icon = a.icon;
            return (
              <button
                key={a.label} type="button" onClick={a.onClick}
                className="bpf-tap bpf-rise bg-white rounded-[20px] p-4 flex flex-col gap-3 text-left text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
                style={{ animationDelay: a.delay }}
              >
                <div className={`w-10 h-10 rounded-[13px] flex items-center justify-center ${a.cls}`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-extrabold">{a.label}</span>
                  <span className="text-xs leading-snug text-slate-600">{a.sub}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Recentes */}
        <section aria-label="Auditorias recentes" className="flex flex-col gap-2.5 mt-2">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-lg font-extrabold tracking-[-0.01em] text-slate-900">Auditorias recentes</h2>
            <button type="button" onClick={onViewHistory} className="text-[13px] font-bold text-[#0369A1] py-3 min-h-11">
              Ver todas
            </button>
          </div>

          {loading && recent.length === 0 ? (
            [0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-[18px] bg-white/70 animate-pulse" />)
          ) : recent.length === 0 ? (
            <div className="bg-white rounded-[18px] p-6 text-center text-slate-600 text-sm">
              <ClipboardCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" aria-hidden="true" />
              Nenhuma auditoria ainda. Toque em <strong>Nova Auditoria</strong> para começar.
            </div>
          ) : (
            recent.map((audit, i) => (
              <button
                key={audit.id} type="button"
                onClick={() => onAuditClick?.(audit.id, audit.status)}
                className="bpf-tap bpf-rise bg-white rounded-[18px] p-3.5 flex items-center gap-3 text-left text-slate-900 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
                style={{ animationDelay: `${560 + i * 70}ms` }}
              >
                <div className="w-11 h-11 flex-none rounded-[14px] bg-sky-50 text-sky-700 flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <span className="text-[15px] font-bold truncate">
                    {audit.location_name || audit.location || "Local não informado"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Calendar className="w-[13px] h-[13px]" aria-hidden="true" />
                    {formatDate(audit.started_at)}
                    {isAdmin && audit.auditor_name && <span className="truncate">· {audit.auditor_name}</span>}
                  </span>
                </div>
                <StatusPill audit={audit} />
              </button>
            ))
          )}
        </section>
      </div>
    </div>
  );
};
