import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Lock, Mail, User, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

type AuthView = "login" | "signup" | "forgot-password";

const emailSchema = z.string().email("E-mail inválido");
const passwordSchema = z.string().min(6, "A senha deve ter pelo menos 6 caracteres");
const nameSchema = z.string().min(2, "O nome deve ter pelo menos 2 caracteres");

export const AuthPage = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string }>({});
  
  const { signIn, signUp, resetPassword } = useAuth();

  const validateForm = (): boolean => {
    const newErrors: { email?: string; password?: string; name?: string } = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    if (view !== "forgot-password") {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) {
        newErrors.password = passwordResult.error.errors[0].message;
      }
    }

    if (view === "signup") {
      const nameResult = nameSchema.safeParse(name);
      if (!nameResult.success) {
        newErrors.name = nameResult.error.errors[0].message;
      }
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
        const { error } = await signUp(email, password, name);
        if (!error) {
          setView("login");
          setPassword("");
        }
      } else if (view === "forgot-password") {
        const { error } = await resetPassword(email);
        if (!error) {
          setView("login");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setErrors({});
  };

  const switchView = (newView: AuthView) => {
    resetForm();
    setView(newView);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero px-4 py-8">
      <div className="w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-card rounded-2xl shadow-card mx-auto mb-4 flex items-center justify-center">
            <img 
              src="/lovable-uploads/3a9d70a7-3c10-4786-9425-c58a607bc9aa.png" 
              alt="BPF Logo" 
              className="w-16 h-16 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-primary-foreground mb-2">BPF Check</h1>
          <p className="text-primary-foreground/80">Sistema de Auditoria Sanitária</p>
        </div>

        <Card className="shadow-primary">
          <CardHeader>
            <CardTitle className="text-center text-primary flex items-center justify-center gap-2">
              {view !== "login" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="p-1 h-auto absolute left-4"
                  onClick={() => switchView("login")}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              )}
              {view === "login" && "Entrar no Sistema"}
              {view === "signup" && "Criar Conta"}
              {view === "forgot-password" && "Recuperar Senha"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name field - only for signup */}
              {view === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`pl-10 ${errors.name ? 'border-destructive' : ''}`}
                      placeholder="Seu nome completo"
                    />
                  </div>
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>
              )}

              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
                    placeholder="seu@email.com"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              {/* Password field - not for forgot password */}
              {view !== "forgot-password" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`pl-10 pr-10 ${errors.password ? 'border-destructive' : ''}`}
                      placeholder="••••••••"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-8 w-8 p-0"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:shadow-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    {view === "login" && "Entrando..."}
                    {view === "signup" && "Criando conta..."}
                    {view === "forgot-password" && "Enviando..."}
                  </span>
                ) : (
                  <>
                    {view === "login" && "Entrar"}
                    {view === "signup" && "Criar Conta"}
                    {view === "forgot-password" && "Enviar E-mail de Recuperação"}
                  </>
                )}
              </Button>

              {/* Links */}
              {view === "login" && (
                <div className="text-center space-y-2">
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => switchView("forgot-password")}
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Esqueci minha senha
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Não tem uma conta?{" "}
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => switchView("signup")}
                      className="p-0 h-auto text-primary hover:underline"
                    >
                      Cadastre-se
                    </Button>
                  </div>
                </div>
              )}

              {view === "signup" && (
                <div className="text-center text-sm text-muted-foreground">
                  Já tem uma conta?{" "}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => switchView("login")}
                    className="p-0 h-auto text-primary hover:underline"
                  >
                    Fazer login
                  </Button>
                </div>
              )}

              {view === "forgot-password" && (
                <p className="text-center text-sm text-muted-foreground">
                  Lembrou sua senha?{" "}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => switchView("login")}
                    className="p-0 h-auto text-primary hover:underline"
                  >
                    Voltar ao login
                  </Button>
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-primary-foreground/60 text-xs mt-6">
          Baseado na RDC 216/2004 - ANVISA
        </p>
      </div>
    </div>
  );
};
