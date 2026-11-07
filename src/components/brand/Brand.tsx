// Elementos visuais da marca (design mobile 11/2026): logo vetorial e círculos decorativos.
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** Largura do SVG em px (altura proporcional 78×56). */
  size?: number;
  /** Anima o "check" sendo desenhado (splash). */
  animated?: boolean;
  className?: string;
}

export const BrandLogo = ({ size = 54, animated = false, className }: BrandLogoProps) => (
  <svg
    role="img"
    aria-label="Logo BPF Check"
    width={size}
    height={Math.round((size * 56) / 78)}
    viewBox="0 0 78 56"
    className={className}
  >
    <path
      className={animated ? "bpf-check" : undefined}
      d="M4 30 L16 42 L36 12"
      fill="none"
      stroke="#0284C7"
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <text x="30" y="34" fontFamily="inherit" fontWeight={800} fontSize={22} fill="#0369A1">BPF</text>
    <text x="34" y="48" fontFamily="inherit" fontWeight={700} fontSize={10} letterSpacing={1.5} fill="#38BDF8">CHECK</text>
  </svg>
);

/** Logo dentro do "app icon" branco arredondado. */
export const BrandMark = ({ box = 76, radius = 22, logo = 54, className }: {
  box?: number; radius?: number; logo?: number; className?: string;
}) => (
  <div
    className={cn("bg-white flex items-center justify-center shadow-[0_18px_36px_rgba(8,47,73,0.35)]", className)}
    style={{ width: box, height: box, borderRadius: radius }}
  >
    <BrandLogo size={logo} />
  </div>
);

/** Círculos concêntricos decorativos sobre o fundo azul. */
export const Orbits = ({ size, className, rotate = false }: { size: number; className?: string; rotate?: boolean }) => {
  const c = size / 2;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("pointer-events-none absolute", rotate && "bpf-orbit", className)}
    >
      <circle cx={c} cy={c} r={size * 0.31} fill="none" stroke="#fff" strokeWidth={1} />
      <circle cx={c} cy={c} r={size * 0.46} fill="none" stroke="#fff" strokeWidth={1} strokeDasharray="4 10" />
      {rotate && (
        <>
          <circle cx={c + size * 0.26} cy={c} r={6} fill="#7DD3FC" />
          <circle cx={c} cy={c - size * 0.38} r={4} fill="#fff" />
        </>
      )}
    </svg>
  );
};
