import { BrandMark } from "@/components/brand/Brand";

/** Cabeçalho compacto das telas internas (o dashboard tem o próprio cabeçalho grande). */
export const AppHeader = () => (
  <header className="bg-[#0369A1] text-white rounded-b-3xl">
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
      <BrandMark box={40} radius={13} logo={30} className="shadow-none" />
      <div className="flex flex-col leading-tight">
        <span className="text-base font-extrabold tracking-[-0.01em]">BPF Check</span>
        <span className="text-xs text-sky-100">Sistema de Auditoria Sanitária</span>
      </div>
    </div>
  </header>
);
