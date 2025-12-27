import { useState, useEffect } from "react";
import { AppHeader } from "./layout/AppHeader";
import { AuthPage } from "./auth/AuthPage";
import { DashboardHome } from "./dashboard/DashboardHome";
import { ChecklistForm } from "./checklist/ChecklistForm";
import { SplashScreen } from "./splash/SplashScreen";
import { AuditHistoryPage } from "./history/AuditHistoryPage";
import { AuditReportPage } from "./reports/AuditReportPage";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAudits } from "@/hooks/useAudits";
import { useToast } from "@/hooks/use-toast";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { WifiOff, Shield } from "lucide-react";

type AppView = "splash" | "dashboard" | "checklist" | "history" | "report-view";

export const BPFCheckApp = () => {
  const [currentView, setCurrentView] = useState<AppView>("splash");
  const [showSplash, setShowSplash] = useState(true);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [isEditingAudit, setIsEditingAudit] = useState(false);
  
  const { user, loading, signOut } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const auditsHook = useAudits();
  const { loadAudit, setCurrentAudit, currentAudit } = auditsHook;
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
    setCurrentAudit(null);
    setIsEditingAudit(false);
    setCurrentView("checklist");
  };

  const handleViewHistory = () => {
    setCurrentView("history");
  };

  const handleBackToDashboard = () => {
    setCurrentView("dashboard");
    setSelectedAuditId(null);
    setIsEditingAudit(false);
  };

  const handleSaveChecklist = () => {
    setCurrentView("dashboard");
    setIsEditingAudit(false);
    toast({
      title: "Auditoria salva",
      description: "Auditoria finalizada com sucesso!",
    });
  };

  const handleEditAudit = async (auditId: string) => {
    const success = await loadAudit(auditId);
    if (success) {
      setIsEditingAudit(true);
      setCurrentView("checklist");
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível carregar a auditoria.",
        variant: "destructive",
      });
    }
  };

  const handleViewReport = (auditId: string) => {
    setSelectedAuditId(auditId);
    setCurrentView("report-view");
  };

  const handleAuditClick = async (auditId: string, status: string | null) => {
    if (status === 'completed') {
      handleViewReport(auditId);
    } else {
      handleEditAudit(auditId);
    }
  };

  // Show splash screen
  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Show loading while checking auth
  if (loading || roleLoading) {
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

      {/* Admin indicator */}
      {isAdmin && (
        <div className="bg-primary text-primary-foreground px-4 py-1 flex items-center justify-center gap-2 text-sm">
          <Shield className="w-4 h-4" />
          <span>Modo Administrador - Visualizando dados globais</span>
        </div>
      )}

      <AppHeader user={userProfile} onLogout={handleLogout} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === "dashboard" && (
          <DashboardHome
            onNewAudit={handleNewAudit}
            onViewReports={handleViewHistory}
            onViewHistory={handleViewHistory}
            onAuditClick={handleAuditClick}
            isAdmin={isAdmin}
          />
        )}

        {currentView === "checklist" && (
          <ChecklistForm
            onBack={handleBackToDashboard}
            onSave={handleSaveChecklist}
            auditsHook={auditsHook}
            isEditing={isEditingAudit}
          />
        )}

        {currentView === "history" && (
          <AuditHistoryPage
            onBack={handleBackToDashboard}
            onViewReport={handleViewReport}
            onEditAudit={handleEditAudit}
            isAdmin={isAdmin}
          />
        )}

        {currentView === "report-view" && selectedAuditId && (
          <AuditReportPage
            auditId={selectedAuditId}
            onBack={() => setCurrentView("history")}
          />
        )}
      </main>
    </div>
  );
};
