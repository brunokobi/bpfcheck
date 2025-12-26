import { useState, useEffect } from "react";
import { AppHeader } from "./layout/AppHeader";
import { AuthPage } from "./auth/AuthPage";
import { DashboardHome } from "./dashboard/DashboardHome";
import { ChecklistForm } from "./checklist/ChecklistForm";
import { SplashScreen } from "./splash/SplashScreen";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { WifiOff } from "lucide-react";

type AppView = "splash" | "dashboard" | "checklist" | "reports" | "history";

export const BPFCheckApp = () => {
  const [currentView, setCurrentView] = useState<AppView>("splash");
  const [showSplash, setShowSplash] = useState(true);
  const { user, loading, signOut } = useAuth();
  const { toast } = useToast();
  const { isOnline, pendingSyncs } = useOfflineStorage();

  // Handle splash screen completion
  const handleSplashComplete = () => {
    setShowSplash(false);
    if (user) {
      setCurrentView("dashboard");
    }
  };

  // Navigate to dashboard when user logs in
  useEffect(() => {
    if (!loading && user && !showSplash) {
      setCurrentView("dashboard");
    }
  }, [user, loading, showSplash]);

  const handleLogout = async () => {
    await signOut();
    setCurrentView("dashboard");
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

  // Show splash screen
  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary-foreground border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-primary-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Show auth page if not logged in
  if (!user) {
    return <AuthPage />;
  }

  // User profile info
  const userProfile = {
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm">
          <WifiOff className="w-4 h-4" />
          <span>Modo offline</span>
          {pendingSyncs.length > 0 && (
            <span className="bg-warning-foreground/20 px-2 py-0.5 rounded-full text-xs">
              {pendingSyncs.length} pendente{pendingSyncs.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      <AppHeader user={userProfile} onLogout={handleLogout} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
    </div>
  );
};
