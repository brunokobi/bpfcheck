import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronRight, FileText, Search, User, X } from "lucide-react";
import { useAuditList } from "@/hooks/useAudits";
import { PageHero } from "@/components/layout/PageHero";

interface AuditReportsPageProps {
  onBack: () => void;
  onPrintAudit: (auditId: string) => void;
  isAdmin?: boolean;
}

const RING_C = 2 * Math.PI * 18;

const formatDateTime = (d: string | null) => {
  if (!d) return "-";
  try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return d; }
};

/** Cor da conformidade: verde ≥ 70, âmbar ≥ 50, vermelho abaixo. */
const tone = (pct: number | null) =>
  pct == null ? { stroke: "#94A3B8", text: "text-slate-600" }
  : pct >= 70 ? { stroke: "#16A34A", text: "text-green-700" }
  : pct >= 50 ? { stroke: "#D97706", text: "text-amber-700" }
  : { stroke: "#DC2626", text: "text-red-700" };

export const AuditReportsPage = ({ onBack, onPrintAudit, isAdmin = false }: AuditReportsPageProps) => {
  const { audits: allAudits, loading } = useAuditList();
  const [search, setSearch] = useState("");

  const completed = useMemo(
    () => allAudits
      .filter(a => a.status === "completed")
      .sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? "")),
    [allAudits],
  );
  const audits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? completed.filter(a => (a.location_name || a.location || "").toLowerCase().includes(q) ||
          (isAdmin && (a.auditor_name || "").toLowerCase().includes(q)))
      : completed;
  }, [completed, search, isAdmin]);

  const withRate = completed.filter(a => a.compliance != null);
  const avg = withRate.length ? Math.round(withRate.reduce((s, a) => s + (a.compliance ?? 0), 0) / withRate.length) : null;
  const nonConf = completed.reduce((s, a) => s + a.nao_conforme_count, 0);

  return (
    <div>
      <PageHero
        title="Relatórios"
        subtitle={`${completed.length} auditoria${completed.length !== 1 ? "s" : ""} concluída${completed.length !== 1 ? "s" : ""}`}
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
        {/* Resumo real das concluídas */}
        <section aria-label="Resumo" className="bpf-pop grid grid-cols-3 gap-2.5" style={{ animationDelay: "80ms" }}>
          {[
            { label: "Concluídas", value: String(completed.length), cls: "text-sky-700" },
            { label: "Conformidade média", value: avg != null ? `${avg}%` : "—", cls: tone(avg).text },
            { label: "Não conformidades", value: String(nonConf), cls: "text-red-700" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-[20px] px-3 py-3.5 flex flex-col gap-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.10)]">
              <span className={`text-2xl font-extrabold tracking-[-0.03em] tabular-nums ${s.cls}`}>{s.value}</span>
              <span className="text-xs font-bold text-slate-700 leading-tight">{s.label}</span>
            </div>
          ))}
        </section>

        {loading && completed.length === 0 ? (
          [0, 1, 2].map(i => <div key={i} className="h-[84px] rounded-[20px] bg-white/70 animate-pulse" />)
        ) : audits.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-slate-600 text-sm">
            <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" aria-hidden="true" />
            {completed.length === 0 ? "Nenhuma auditoria concluída ainda." : "Nenhum relatório com essa busca."}
          </div>
        ) : (
          audits.map((audit, i) => {
            const t = tone(audit.compliance);
            return (
              <button
                key={audit.id} type="button" onClick={() => onPrintAudit(audit.id)}
                className="bpf-tap bpf-rise bg-white rounded-[20px] p-4 flex items-center gap-3 text-left text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
                style={{ animationDelay: `${120 + Math.min(i, 8) * 50}ms` }}
              >
                {/* Mini-anel com a conformidade real */}
                <div className="relative w-12 h-12 flex-none">
                  <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90" aria-hidden="true">
                    <circle cx="24" cy="24" r="18" fill="none" stroke="#F1F5F9" strokeWidth="6" />
                    <circle cx="24" cy="24" r="18" fill="none" stroke={t.stroke} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - (audit.compliance ?? 0) / 100)} />
                  </svg>
                  <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-extrabold tabular-nums ${t.text}`}>
                    {audit.compliance != null ? `${audit.compliance}%` : "—"}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <span className="text-[15px] font-bold truncate">{audit.location_name || audit.location || "Local não informado"}</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Calendar className="w-[13px] h-[13px] shrink-0" aria-hidden="true" />
                    {formatDateTime(audit.finished_at || audit.started_at)}
                  </span>
                  {isAdmin && audit.auditor_name && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-600 truncate">
                      <User className="w-[13px] h-[13px] shrink-0" aria-hidden="true" /> {audit.auditor_name}
                    </span>
                  )}
                  <span className="flex gap-2 text-xs font-bold">
                    <span className="text-green-700">✓ {audit.conforme_count}</span>
                    <span className="text-red-700">✗ {audit.nao_conforme_count}</span>
                    <span className="text-slate-500">N/A {audit.nao_aplicavel_count}</span>
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0 text-[#0369A1]">
                  <FileText className="w-5 h-5" aria-hidden="true" />
                  <span className="text-[11px] font-bold">PDF</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
