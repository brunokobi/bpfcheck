import { BarChart3, ClipboardCheck, Home, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavTab = "dashboard" | "history" | "reports" | "profile";

interface BottomNavProps {
  active: NavTab | null;
  onNavigate: (tab: NavTab) => void;
  onNewAudit: () => void;
}

const Item = ({ tab, label, icon: Icon, active, onNavigate }: {
  tab: NavTab; label: string; icon: typeof Home; active: boolean; onNavigate: (t: NavTab) => void;
}) => (
  <button
    type="button"
    onClick={() => onNavigate(tab)}
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex flex-col items-center gap-1 py-2 min-h-12 text-[11px]",
      active ? "text-[#0369A1] font-extrabold" : "text-slate-600 font-semibold",
    )}
  >
    <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.2 : 2} aria-hidden="true" />
    {label}
  </button>
);

/** Navegação principal fixa no rodapé (design mobile). */
export const BottomNav = ({ active, onNavigate, onNewAudit }: BottomNavProps) => (
  <nav
    aria-label="Navegação principal"
    className="fixed inset-x-3 z-40 mx-auto max-w-md h-[72px] rounded-3xl bg-white shadow-[0_-2px_30px_rgba(15,23,42,0.12)] grid grid-cols-5 items-center"
    style={{ bottom: "calc(20px + env(safe-area-inset-bottom))" }}
  >
    <Item tab="dashboard" label="Início" icon={Home} active={active === "dashboard"} onNavigate={onNavigate} />
    <Item tab="history" label="Auditorias" icon={ClipboardCheck} active={active === "history"} onNavigate={onNavigate} />
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onNewAudit}
        aria-label="Nova auditoria"
        className="bpf-glow w-14 h-14 -mt-[30px] rounded-[18px] bg-[#0369A1] text-white flex items-center justify-center border-4 border-slate-100"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
    <Item tab="reports" label="Relatórios" icon={BarChart3} active={active === "reports"} onNavigate={onNavigate} />
    <Item tab="profile" label="Perfil" icon={User} active={active === "profile"} onNavigate={onNavigate} />
  </nav>
);
