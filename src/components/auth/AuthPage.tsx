import { useState, ReactNode } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BrandMark, Orbits } from "@/components/brand/Brand";
import { z } from "zod";

type AuthView = "login" | "signup" | "forgot-password";

const emailSchema = z.string().email("E-mail inválido");
const passwordSchema = z.string().min(6, "A senha deve ter pelo menos 6 caracteres");
const nameSchema = z.string().min(2, "O nome deve ter pelo menos 2 caracteres");

const COPY: Record<AuthView, { title: string; subtitle: string; submit: string; busy: string }> = {
  login: { title: "Bem-vindo de volta", subtitle: "Entre para continuar suas auditorias", submit: "Entrar", busy: "Entrando..." },
  signup: { title: "Criar conta", subtitle: "Cadastre-se para começar a auditar", submit: "Criar conta", busy: "Criando conta..." },
  "forgot-password": {
    title: "Recuperar senha",
    subtitle: "Informe seu e-mail cadastrado",
    submit: "Continuar",
    busy: "Enviando...",
  },
};

/** Campo no estilo do design: ícone à esquerda, 54px de altura, borda que acende no foco. */
const Field = ({ id, label, icon, error, action, children }: {
  id: string; label: string; icon: ReactNode; error?: string; action?: ReactNode; children: ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex justify-between items-center">
      <label htmlFor={id} className="text-[13px] font-bold text-slate-700">{label}</label>
      {action}
    </div>
    <div
      className={`bpf-field h-[54px] rounded-2xl border-[1.5px] bg-slate-50 flex items-center gap-3 pl-4 pr-1.5 text-[15px] ${
        error ? "border-destructive" : "border-slate-200"
      }`}
    >
      <span className="text-slate-500 shrink-0" aria-hidden="true">{icon}</span>
      {children}
    </div>
    {error && <p id={`${id}-error`} className="text-[13px] font-medium text-destructive m-0">{error}</p>}
  </div>
);

const inputClass = "border-0 outline-none bg-transparent text-slate-900 flex-1 min-w-0 h-full placeholder:text-slate-500";

export const AuthPage = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string }>({});

  const { signIn, signUp, resetPassword } = useAuth();
  const copy = COPY[view];

  const validateForm = (): boolean => {
    const newErrors: { email?: string; password?: string; name?: string } = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;
    if (view !== "forgot-password") {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0].message;
    }
    if (view === "signup") {
      const nameResult = nameSchema.safeParse(name);
      if (!nameResult.success) newErrors.name = nameResult.error.errors[0].message;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      if (view === "login") {
        await signIn(email, password);
      } else if (view === "signup") {
        await signUp(email, password, name);
      } else {
        const { error } = await resetPassword(email);
        if (!error) setView("login");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchView = (newView: AuthView) => {
    setPassword("");
    setName("");
    setErrors({});
    setView(newView);
  };

  const linkClass = "font-bold text-[#0369A1] hover:text-[#075985] min-h-11 inline-flex items-center";

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#0369A1] text-slate-900 flex flex-col">
      <Orbits size={520} className="-top-[200px] -right-[220px] opacity-[0.16]" />

      <div className="relative flex flex-col items-center gap-3.5 px-8 pt-14 pb-10 text-white">
        <BrandMark className="bpf-float" />
        <div className="bpf-rise flex flex-col items-center gap-1" style={{ animationDelay: "100ms" }}>
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">BPF Check</h1>
          <p className="m-0 text-sm font-medium text-sky-100">Sistema de Auditoria Sanitária</p>
        </div>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit}
        className="bpf-sheet relative flex-1 w-full max-w-md mx-auto bg-white rounded-t-[32px] px-6 pt-8 pb-7 flex flex-col gap-[18px] shadow-[0_-12px_40px_rgba(8,47,73,0.25)]"
      >
        <div className="w-10 h-[5px] rounded-full bg-slate-200 self-center -mt-4" aria-hidden="true" />

        <div className="bpf-rise flex items-start gap-2" style={{ animationDelay: "250ms" }}>
          {view !== "login" && (
            <button
              type="button"
              onClick={() => switchView("login")}
              aria-label="Voltar ao login"
              className="-ml-2 w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-slate-600 active:bg-slate-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-2xl font-extrabold tracking-[-0.02em] text-slate-900">{copy.title}</h2>
            <p className="m-0 text-sm text-slate-600">{copy.subtitle}</p>
          </div>
        </div>

        {view === "signup" && (
          <div className="bpf-rise" style={{ animationDelay: "300ms" }}>
            <Field id="name" label="Nome" icon={<User className="w-5 h-5" />} error={errors.name}>
              <input
                id="name" className={inputClass} type="text" placeholder="Seu nome completo" autoComplete="name"
                value={name} onChange={e => setName(e.target.value)} disabled={isLoading}
                aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined}
              />
            </Field>
          </div>
        )}

        <div className="bpf-rise" style={{ animationDelay: "330ms" }}>
          <Field id="email" label="E-mail" icon={<Mail className="w-5 h-5" />} error={errors.email}>
            <input
              id="email" className={inputClass} type="email" inputMode="email" placeholder="seu@email.com"
              autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={isLoading}
              aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined}
            />
          </Field>
        </div>

        {view !== "forgot-password" && (
          <div className="bpf-rise" style={{ animationDelay: "410ms" }}>
            <Field
              id="password" label="Senha" icon={<Lock className="w-5 h-5" />} error={errors.password}
              action={view === "login" && (
                <button type="button" onClick={() => switchView("forgot-password")} className={`text-[13px] ${linkClass}`}>
                  Esqueci minha senha
                </button>
              )}
            >
              <input
                id="password" className={inputClass} type={showPassword ? "text" : "password"} placeholder="••••••••"
                autoComplete={view === "signup" ? "new-password" : "current-password"}
                value={password} onChange={e => setPassword(e.target.value)} disabled={isLoading}
                aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </Field>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="bpf-tap bpf-rise mt-1.5 h-14 rounded-2xl bg-[#0369A1] text-white flex items-center justify-center gap-2.5 text-base font-bold shadow-[0_10px_24px_rgba(3,105,161,0.3)] disabled:opacity-70"
          style={{ animationDelay: "490ms" }}
        >
          {isLoading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {copy.busy}</>
          ) : (
            <>{copy.submit} <ArrowRight className="w-5 h-5" strokeWidth={2.5} /></>
          )}
        </button>

        {view === "login" && (
          <>
            <div className="bpf-rise flex items-center gap-3 text-slate-500 text-xs font-semibold" style={{ animationDelay: "560ms" }}>
              <div className="flex-1 h-px bg-slate-200" /> ou <div className="flex-1 h-px bg-slate-200" />
            </div>
            <p className="bpf-rise m-0 text-center text-sm text-slate-600" style={{ animationDelay: "620ms" }}>
              Não tem uma conta?{" "}
              <button type="button" onClick={() => switchView("signup")} className={`font-extrabold ${linkClass}`}>
                Cadastre-se
              </button>
            </p>
          </>
        )}
        {view === "signup" && (
          <p className="m-0 text-center text-sm text-slate-600">
            Já tem uma conta?{" "}
            <button type="button" onClick={() => switchView("login")} className={`font-extrabold ${linkClass}`}>
              Entrar
            </button>
          </p>
        )}

        <div className="flex-1" />
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
          <ShieldCheck className="w-4 h-4 text-[#0284C7]" aria-hidden="true" />
          Baseado na RDC 216/2004 · ANVISA
        </div>
      </form>
    </div>
  );
};
