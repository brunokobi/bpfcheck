import { useState, useEffect } from "react";
import { AuthPage } from "./auth/AuthPage";
import { DashboardHome } from "./dashboard/DashboardHome";
import { ChecklistForm } from "./checklist/ChecklistForm";
import { SplashScreen } from "./splash/SplashScreen";
import { AuditHistoryPage } from "./history/AuditHistoryPage";
import { AuditReportPage } from "./reports/AuditReportPage";
import { AuditReportsPage } from "./reports/AuditReportsPage";
import { ProfilePage } from "./profile/ProfilePage";
import { BottomNav, NavTab } from "./layout/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAudits } from "@/hooks/useAudits";
import { useToast } from "@/hooks/use-toast";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { retryFailed } from "@/lib/sync";
import { WifiOff, CloudUpload, AlertTriangle } from "lucide-react";

type AppView = "splash" | "dashboard" | "checklist" | "history" | "reports" | "report-view" | "profile";

export const BPFCheckApp = () => {
  const [currentView, setCurrentView] = useState<AppView>("splash");
  const [showSplash, setShowSplash] = useState(true);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [isEditingAudit, setIsEditingAudit] = useState(false);
  const [reportBackView, setReportBackView] = useState<AppView>("dashboard");

  const { user, loading, signOut } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const auditsHook = useAudits();
  const { loadAudit, closeAudit } = auditsHook;
  const { toast } = useToast();
  const { online: isOnline, pending, failed, syncing } = useSyncStatus();

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
    closeAudit();
    setSelectedAuditId(null);
    setIsEditingAudit(false);
    setReportBackView("dashboard");
    setCurrentView("checklist");
  };

  const handleViewReports = () => {
    setSelectedAuditId(null);
    setReportBackView("reports");
    setCurrentView("reports");
  };

  const handleViewHistory = () => {
    setSelectedAuditId(null);
    setReportBackView("history");
    setCurrentView("history");
  };

  const handleBackToDashboard = () => {
    closeAudit();
    setCurrentView("dashboard");
    setSelectedAuditId(null);
    setIsEditingAudit(false);
    setReportBackView("dashboard");
  };

  const handleSaveChecklist = () => {
    closeAudit();
    setCurrentView("dashboard");
    setIsEditingAudit(false);
  };

  const handleEditAudit = async (auditId: string) => {
    const success = await loadAudit(auditId);
    if (success) {
      setSelectedAuditId(null);
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

  const handleViewReport = (auditId: string, backView: AppView = "history") => {
    setSelectedAuditId(auditId);
    setIsEditingAudit(false);
    setReportBackView(backView);
    setCurrentView("report-view");
  };

  const handleAuditClick = async (auditId: string, status: string | null) => {
    if (status === "completed") {
      handleViewReport(auditId, "dashboard");
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

  const userName = user.name || user.email?.split("@")[0] || "Usuário";

  // Barra inferior nas telas de navegação; escondida nos fluxos focados (checklist e relatório).
  const navTab: NavTab | null =
    currentView === "dashboard" || currentView === "history" || currentView === "reports" || currentView === "profile"
      ? currentView : null;
  const handleNavigate = (tab: NavTab) => {
    closeAudit();
    setSelectedAuditId(null);
    setIsEditingAudit(false);
    setReportBackView(tab === "dashboard" || tab === "profile" ? "dashboard" : tab);
    setCurrentView(tab);
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="bg-amber-400 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-semibold">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span className="truncate">Offline · salvo no aparelho</span>
          {pending > 0 && (
            <span className="shrink-0 bg-amber-950/10 px-2 py-0.5 rounded-full text-xs">
              {pending} a enviar
            </span>
          )}
        </div>
      )}
      {isOnline && pending > 0 && currentView !== "dashboard" && (
        <div className="bg-sky-50 text-sky-800 px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold">
          <CloudUpload className={`w-4 h-4 shrink-0 ${syncing ? "animate-pulse" : ""}`} />
          <span className="truncate">{syncing ? "Enviando" : "A enviar:"} {pending} alteraç{pending > 1 ? "ões" : "ão"}</span>
        </div>
      )}
      {failed > 0 && (
        <div className="bg-destructive text-destructive-foreground px-4 py-1 flex items-center justify-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="truncate">{failed} recusada{failed > 1 ? "s" : ""} pelo servidor</span>
          <button
            className="shrink-0 min-h-9 px-3 rounded-md bg-destructive-foreground/15 font-medium"
            onClick={() => retryFailed()}
          >
            Tentar de novo
          </button>
        </div>
      )}


      {/* Espaço no rodapé para a barra de navegação e o botão do chat não cobrirem o conteúdo */}
      <main className={`max-w-2xl mx-auto px-4 sm:px-6 sm:pt-6 ${navTab ? "pb-44" : "pb-28"}`}>
        {currentView === "dashboard" && (
          <DashboardHome
            userName={userName}
            onNewAudit={handleNewAudit}
            onViewReports={handleViewReports}
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

        {currentView === "reports" && (
          <AuditReportsPage
            onBack={handleBackToDashboard}
            onPrintAudit={(auditId) => handleViewReport(auditId, "reports")}
            isAdmin={isAdmin}
          />
        )}

        {currentView === "history" && (
          <AuditHistoryPage
            onBack={handleBackToDashboard}
            onViewReport={(auditId) => handleViewReport(auditId, "history")}
            onEditAudit={handleEditAudit}
            isAdmin={isAdmin}
          />
        )}

        {currentView === "report-view" && selectedAuditId && (
          <AuditReportPage auditId={selectedAuditId} onBack={() => setCurrentView(reportBackView)} />
        )}

        {currentView === "profile" && <ProfilePage user={user} onLogout={handleLogout} />}
      </main>

      {navTab && <BottomNav active={navTab} onNavigate={handleNavigate} onNewAudit={handleNewAudit} />}
    </div>
  );
};
