import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Orbits } from "@/components/brand/Brand";
import { cn } from "@/lib/utils";

interface PageHeroProps {
  title: string;
  subtitle?: ReactNode;
  /** Texto pequeno acima do título (ex.: "Checklist RDC 216/2004"). */
  eyebrow?: string;
  onBack?: () => void;
  /** Botões à direita do título. */
  actions?: ReactNode;
  /** Conteúdo extra dentro do azul (ex.: busca). */
  children?: ReactNode;
  /** Espaço inferior para o conteúdo "subir" sobre o azul (como no Dashboard). */
  overlap?: boolean;
  className?: string;
}

/** Cabeçalho azul das telas internas, no mesmo visual do Dashboard. */
export const PageHero = ({
  title, subtitle, eyebrow, onBack, actions, children, overlap = false, className,
}: PageHeroProps) => (
  <header
    className={cn(
      "relative overflow-hidden bg-[#0369A1] text-white px-5 pt-5 rounded-b-[32px] sm:rounded-[32px] -mx-4 sm:mx-0",
      overlap ? "pb-20" : "pb-6",
      className,
    )}
  >
    <Orbits size={420} className="-top-[190px] -right-[170px] opacity-[0.16]" />
    <div className="relative flex items-center gap-3">
      {onBack && (
        <button
          type="button" onClick={onBack} aria-label="Voltar"
          className="w-11 h-11 shrink-0 rounded-[14px] border border-white/[0.22] bg-white/[0.12] flex items-center justify-center active:bg-white/20"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <div className="bpf-rise flex-1 min-w-0 flex flex-col gap-0.5">
        {eyebrow && <span className="text-xs font-bold tracking-[0.06em] uppercase text-sky-200 truncate">{eyebrow}</span>}
        <h1 className="m-0 text-[26px] leading-tight font-extrabold tracking-[-0.02em] truncate">{title}</h1>
        {subtitle && <p className="m-0 text-sm text-sky-100 truncate">{subtitle}</p>}
      </div>
      {actions}
    </div>
    {children && <div className="relative mt-4">{children}</div>}
  </header>
);
