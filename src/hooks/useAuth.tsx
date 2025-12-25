import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        let message = 'Erro ao fazer login.';
        if (error.message.includes('Invalid login credentials')) {
          message = 'E-mail ou senha incorretos.';
        } else if (error.message.includes('Email not confirmed')) {
          message = 'Por favor, confirme seu e-mail antes de fazer login.';
        }
        toast({
          title: 'Erro no login',
          description: message,
          variant: 'destructive',
        });
        return { error };
      }

      toast({
        title: 'Login realizado!',
        description: 'Bem-vindo ao BPF Check.',
      });
      return { error: null };
    } catch (err) {
      const error = err as Error;
      toast({
        title: 'Erro',
        description: 'Falha na conexão. Verifique sua internet.',
        variant: 'destructive',
      });
      return { error };
    }
  }, [toast]);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name: name,
          },
        },
      });

      if (error) {
        let message = 'Erro ao criar conta.';
        if (error.message.includes('User already registered')) {
          message = 'Este e-mail já está cadastrado.';
        } else if (error.message.includes('Password should be')) {
          message = 'A senha deve ter pelo menos 6 caracteres.';
        }
        toast({
          title: 'Erro no cadastro',
          description: message,
          variant: 'destructive',
        });
        return { error };
      }

      toast({
        title: 'Conta criada!',
        description: 'Verifique seu e-mail para confirmar o cadastro.',
      });
      return { error: null };
    } catch (err) {
      const error = err as Error;
      toast({
        title: 'Erro',
        description: 'Falha na conexão. Verifique sua internet.',
        variant: 'destructive',
      });
      return { error };
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    toast({
      title: 'Logout realizado',
      description: 'Você foi desconectado do sistema.',
    });
  }, [toast]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível enviar o e-mail de recuperação.',
          variant: 'destructive',
        });
        return { error };
      }

      toast({
        title: 'E-mail enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
      return { error: null };
    } catch (err) {
      const error = err as Error;
      toast({
        title: 'Erro',
        description: 'Falha na conexão. Verifique sua internet.',
        variant: 'destructive',
      });
      return { error };
    }
  }, [toast]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
