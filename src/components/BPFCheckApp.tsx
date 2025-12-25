import { useState } from "react";
import { AppHeader } from "./layout/AppHeader";
import { LoginForm } from "./auth/LoginForm";
import { DashboardHome } from "./dashboard/DashboardHome";
import { ChecklistForm } from "./checklist/ChecklistForm";
import { SplashScreen } from "./splash/SplashScreen";
import { useToast } from "@/hooks/use-toast";

type AppView = "splash" | "login" | "dashboard" | "checklist" | "reports" | "history";

interface User {
  name: string;
  email: string;
}

export const BPFCheckApp = () => {
  const [currentView, setCurrentView] = useState<AppView>("splash");
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSplashComplete = () => {
    setCurrentView("login");
  };

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      // Demo user authentication
      if (email === "admin@bpf.com" && password === "123456") {
        const userData = {
          name: "Admin BPF",
          email: email
        };
        setUser(userData);
        setCurrentView("dashboard");
        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo(a), ${userData.name}`,
        });
      } else {
        toast({
          title: "Erro no login",
          description: "E-mail ou senha incorretos. Use: admin@bpf.com / 123456",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    }, 1500);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView("login");
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado do sistema.",
    });
  };

  const handleForgotPassword = () => {
    toast({
      title: "Recuperação de senha",
      description: "Funcionalidade ainda não implementada.",
    });
  };

  const handleRegister = () => {
    toast({
      title: "Cadastro",
      description: "Funcionalidade ainda não implementada.",
    });
  };

  const handleNewAudit = () => {
    setCurrentView("checklist");
  };

  const handleViewReports = () => {
    toast({
      title: "Relatórios",
      description: "Funcionalidade em desenvolvimento.",
    });
  };

  const handleViewHistory = () => {
    toast({
      title: "Histórico",
      description: "Funcionalidade em desenvolvimento.",
    });
  };

  const handleBackToDashboard = () => {
    setCurrentView("dashboard");
  };

  const handleSaveChecklist = () => {
    setCurrentView("dashboard");
    toast({
      title: "Checklist salvo",
      description: "Auditoria salva com sucesso!",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {currentView === "splash" && (
        <SplashScreen onComplete={handleSplashComplete} />
      )}

      {currentView !== "login" && currentView !== "splash" && user && (
        <AppHeader user={user} onLogout={handleLogout} />
      )}
      
      {currentView !== "splash" && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {currentView === "login" && (
            <LoginForm
              onLogin={handleLogin}
              onForgotPassword={handleForgotPassword}
              onRegister={handleRegister}
              isLoading={isLoading}
            />
          )}

          {currentView === "dashboard" && (
            <DashboardHome
              onNewAudit={handleNewAudit}
              onViewReports={handleViewReports}
              onViewHistory={handleViewHistory}
            />
          )}

          {currentView === "checklist" && (
            <ChecklistForm
              onBack={handleBackToDashboard}
              onSave={handleSaveChecklist}
            />
          )}
        </main>
      )}
    </div>
  );
};