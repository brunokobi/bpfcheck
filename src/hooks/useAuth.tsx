import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { api, ApiError, AppUser, NetworkError, onUnauthorized, session } from "@/lib/api";
import { clearLocalData, db, kvGet, kvSet } from "@/lib/localdb";
import { importLegacyQueues } from "@/lib/legacy";
import { scheduleFlush } from "@/lib/sync";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const OWNER_KEY = "owner";

type AuthResponse = { token: string; user: AppUser };

/**
 * Garante que os dados locais pertencem ao usuário que está entrando.
 * Se houver pendências de OUTRO usuário, bloqueia o login para não perder nada.
 */
async function claimLocalData(user: AppUser): Promise<string | null> {
  const owner = await kvGet<{ id: string; email: string }>(OWNER_KEY);
  if (owner && owner.id !== user.id) {
    const pending = await db.outbox.count();
    if (pending > 0) return owner.email;
    await clearLocalData();
  }
  await kvSet(OWNER_KEY, { id: user.id, email: user.email });
  return null;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // A sessão fica no aparelho: o app abre logado mesmo sem internet.
  const [user, setUser] = useState<AppUser | null>(() => (session.token() ? session.user() : null));
  const { toast } = useToast();

  const afterLogin = useCallback(async (res: AuthResponse) => {
    const blockedBy = await claimLocalData(res.user);
    if (blockedBy) {
      toast({
        title: "Há dados não sincronizados de outra conta",
        description: `Entre com ${blockedBy} e conecte-se à internet para enviar os dados antes de trocar de conta.`,
        variant: "destructive",
      });
      return new Error("pending_data_other_user");
    }
    session.save(res.token, res.user);
    setUser(res.user);
    const imported = await importLegacyQueues(res.user).catch(() => 0);
    if (imported > 0) {
      toast({ title: "Dados offline recuperados", description: `${imported} alterações da versão anterior serão enviadas.` });
    }
    scheduleFlush();
    return null;
  }, [toast]);

  // Renova o token e os dados do usuário quando há conexão.
  useEffect(() => {
    if (!session.token()) return;
    api<AuthResponse>("/auth/me")
      .then(async res => {
        session.save(res.token, res.user);
        setUser(res.user);
        await importLegacyQueues(res.user).catch(() => 0);
        scheduleFlush();
      })
      .catch(() => { /* offline: segue com a sessão salva; 401 é tratado abaixo */ });
  }, []);

  useEffect(() => onUnauthorized(() => {
    session.clear();
    setUser(null);
    toast({
      title: "Sessão expirada",
      description: "Entre novamente. Os dados não sincronizados continuam guardados no aparelho.",
      variant: "destructive",
    });
  }), [toast]);

  const networkError = (err: unknown) => {
    toast({
      title: "Erro",
      description: err instanceof NetworkError
        ? "Sem conexão com o servidor. Verifique sua internet."
        : "Falha inesperada. Tente novamente.",
      variant: "destructive",
    });
    return { error: err as Error };
  };

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await api<AuthResponse>("/auth/login", { method: "POST", json: { email, password }, auth: false });
      const error = await afterLogin(res);
      if (!error) toast({ title: "Login realizado!", description: "Bem-vindo ao BPF Check." });
      return { error };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast({ title: "Erro no login", description: "E-mail ou senha incorretos.", variant: "destructive" });
        return { error: err };
      }
      return networkError(err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterLogin, toast]);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    try {
      const res = await api<AuthResponse>("/auth/signup", {
        method: "POST", json: { email, password, name }, auth: false,
      });
      const error = await afterLogin(res);
      if (!error) toast({ title: "Conta criada!", description: "Bem-vindo ao BPF Check." });
      return { error };
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast({ title: "Erro no cadastro", description: "Este e-mail já está cadastrado.", variant: "destructive" });
        return { error: err };
      }
      if (err instanceof ApiError && err.status === 422) {
        toast({ title: "Erro no cadastro", description: "Verifique o e-mail e use uma senha com 6+ caracteres.", variant: "destructive" });
        return { error: err };
      }
      return networkError(err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterLogin, toast]);

  const signOut = useCallback(async () => {
    session.clear();
    setUser(null);
    toast({ title: "Logout realizado", description: "Você foi desconectado do sistema." });
  }, [toast]);

  const resetPassword = useCallback(async (_email: string) => {
    toast({
      title: "Recuperação de senha",
      description: "Peça ao administrador do BPF Check para redefinir sua senha.",
    });
    return { error: null };
  }, [toast]);

  return (
    <AuthContext.Provider value={{ user, loading: false, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
