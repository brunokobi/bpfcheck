import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, CheckCircle2, ChevronRight, ClipboardCheck, Search, User, X } from "lucide-react";
import { AuditWithDetails, useAuditList } from "@/hooks/useAudits";
import { getChecklist } from "@/lib/repo";
import { PageHero } from "@/components/layout/PageHero";
import { cn } from "@/lib/utils";

interface AuditHistoryPageProps {
  onBack: () => void;
  onViewReport: (auditId: string) => void;
  onEditAudit: (auditId: string) => void;
  isAdmin?: boolean;
}

type StatusFilter = "all" | "in_progress" | "completed";

const formatDate = (d: string | null) => {
  if (!d) return "-";
  try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return d; }
};

const answered = (a: AuditWithDetails) => a.conforme_count + a.nao_conforme_count + a.nao_aplicavel_count;

export const AuditHistoryPage = ({ onBack, onViewReport, onEditAudit, isAdmin = false }: AuditHistoryPageProps) => {
  const { audits, loading } = useAuditList();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [date, setDate] = useState("");
  // Total de itens do checklist (real, do cache) para o progresso das auditorias em andamento.
  const [totalItems, setTotalItems] = useState(0);
  useEffect(() => {
    getChecklist().then(c => setTotalItems(c?.sections.reduce((n, s) => n + s.items.length, 0) ?? 0));
  }, []);

  const counts = useMemo(() => ({
    all: audits.length,
    in_progress: audits.filter(a => a.status === "in_progress").length,
    completed: audits.filter(a => a.status === "completed").length,
  }), [audits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return audits.filter(a =>
      (status === "all" || a.status === status) &&
      (!q || (a.location_name || a.location || "").toLowerCase().includes(q) ||
        (isAdmin && (a.auditor_name || "").toLowerCase().includes(q))) &&
      (!date || (a.started_at && format(new Date(a.started_at), "yyyy-MM-dd") === date)));
  }, [audits, search, status, date, isAdmin]);

  const chips: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "in_progress", label: "Andamento" },
    { key: "completed", label: "Concluídas" },
  ];

  return (
    <div>
      <PageHero
        title="Auditorias"
        subtitle={isAdmin ? "Todas as auditorias do sistema" : "Suas auditorias realizadas"}
        onBack={onBack}
        overlap
      >
        <label className="bpf-field flex items-center gap-3 h-[50px] rounded-2xl bg-white text-slate-900 px-4 border-[1.5px] border-transparent">
          <Search className="w-5 h-5 text-slate-500 shrink-0" aria-hidden="true" />
          <span className="sr-only">Buscar</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAdmin ? "Buscar por local ou auditor…" : "Buscar por local…"}
            className="flex-1 min-w-0 h-full bg-transparent outline-none text-[15px] placeholder:text-slate-500"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca" className="w-9 h-9 -mr-2 flex items-center justify-center text-slate-500">
              <X className="w-4 h-4" />
            </button>
          )}
        </label>
      </PageHero>

      <div className="relative -mt-12 flex flex-col gap-3">
        {/* Filtros: status (com contagem real) + data */}
        <div className="bpf-pop bg-white rounded-3xl p-2 flex gap-1 shadow-[0_16px_40px_rgba(15,23,42,0.10)]" style={{ animationDelay: "80ms" }}>
          {chips.map(c => (
            <button
              key={c.key} type="button" onClick={() => setStatus(c.key)} aria-pressed={status === c.key}
              className={cn(
                "flex-1 min-h-11 rounded-2xl text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors",
                status === c.key ? "bg-[#0369A1] text-white" : "text-slate-600 active:bg-slate-100",
              )}
            >
              {c.label}
              <span className={cn("tabular-nums text-xs px-1.5 rounded-full", status === c.key ? "bg-white/20" : "bg-slate-100")}>
                {counts[c.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="bpf-field flex-1 flex items-center gap-2 h-11 rounded-2xl bg-white px-3 border-[1.5px] border-slate-200 text-sm text-slate-700">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
            <span className="sr-only">Filtrar por data</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="flex-1 min-w-0 bg-transparent outline-none" />
          </label>
          {date && (
            <button type="button" onClick={() => setDate("")} className="h-11 px-4 rounded-2xl bg-white text-sm font-bold text-[#0369A1] border-[1.5px] border-slate-200">
              Limpar
            </button>
          )}
        </div>

        <p className="m-0 mt-1 text-[13px] font-semibold text-slate-600">
          {filtered.length} auditoria{filtered.length !== 1 ? "s" : ""}
        </p>

        {loading && audits.length === 0 ? (
          [0, 1, 2].map(i => <div key={i} className="h-[92px] rounded-[20px] bg-white/70 animate-pulse" />)
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-slate-600 text-sm">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" aria-hidden="true" />
            {audits.length === 0 ? "Nenhuma auditoria ainda." : "Nenhuma auditoria com esses filtros."}
          </div>
        ) : (
          filtered.map((audit, i) => {
            const done = audit.status === "completed";
            const pct = totalItems ? Math.round((answered(audit) / totalItems) * 100) : 0;
            return (
              <button
                key={audit.id} type="button"
                onClick={() => (done ? onViewReport(audit.id) : onEditAudit(audit.id))}
                className="bpf-tap bpf-rise bg-white rounded-[20px] p-4 flex flex-col gap-3 text-left text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("w-11 h-11 flex-none rounded-[14px] flex items-center justify-center",
                    done ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
                    {done ? <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> : <ClipboardCheck className="w-5 h-5" aria-hidden="true" />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                    <span className="text-[15px] font-bold truncate">{audit.location_name || audit.location || "Local não informado"}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Calendar className="w-[13px] h-[13px] shrink-0" aria-hidden="true" />
                      {formatDate(done ? audit.finished_at || audit.started_at : audit.started_at)}
                    </span>
                    {isAdmin && audit.auditor_name && (
                      <span className="flex items-center gap-1.5 text-xs text-slate-600 truncate">
                        <User className="w-[13px] h-[13px] shrink-0" aria-hidden="true" /> {audit.auditor_name}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
                </div>

                {done ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
                    <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800">
                      {audit.compliance != null ? `${audit.compliance}% conformidade` : "Concluída"}
                    </span>
                    <span className="text-green-700">✓ {audit.conforme_count}</span>
                    <span className="text-red-700">✗ {audit.nao_conforme_count}</span>
                    <span className="text-slate-500">N/A {audit.nao_aplicavel_count}</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-amber-800">
                        Em andamento · {answered(audit)}{totalItems ? `/${totalItems}` : ""} respondidos
                      </span>
                      <span className="text-[#0369A1]">Continuar</span>
                    </div>
                    {totalItems > 0 && (
                      <div className="h-[5px] rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-[5px] rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
