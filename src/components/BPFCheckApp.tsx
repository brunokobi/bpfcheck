import { useState, useEffect } from "react";
import { AppHeader } from "./layout/AppHeader";
import { AuthPage } from "./auth/AuthPage";
import { DashboardHome } from "./dashboard/DashboardHome";
import { ChecklistForm } from "./checklist/ChecklistForm";
import { SplashScreen } from "./splash/SplashScreen";
import { AuditHistoryPage } from "./history/AuditHistoryPage";
import { AuditReportPage } from "./reports/AuditReportPage";
import { AuditReportsPage } from "./reports/AuditReportsPage";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAudits } from "@/hooks/useAudits";
import { useToast } from "@/hooks/use-toast";
import { useSyncManager } from "@/hooks/useSyncManager";
import { getSyncQueue, getOfflinePhotos } from "@/lib/offline-sync";
import { Shield } from "lucide-react";

type AppView = "splash" | "dashboard" | "checklist" | "history" | "reports" | "report-view";

export const BPFCheckApp = () => {
  const [currentView, setCurrentView] = useState<AppView>("splash");
  const [showSplash, setShowSplash] = useState(true);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [isEditingAudit, setIsEditingAudit] = useState(false);
  const [reportBackView, setReportBackView] = useState<AppView>("dashboard");
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const { user, loading, signOut } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const auditsHook = useAudits();
  const { loadAudit, setCurrentAudit } = auditsHook;
  const { toast } = useToast();
  const { status: connectionStatus, isOnline } = useSyncManager();

  // Track pending sync count
  useEffect(() => {
    const updatePendingCount = async () => {
      const queue = await getSyncQueue();
      const photos = await getOfflinePhotos();
      setPendingSyncCount(queue.length + photos.length);
    };
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

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
    setCurrentView("dashboard");
    setSelectedAuditId(null);
    setIsEditingAudit(false);
    setReportBackView("dashboard");
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

  // User profile info
  const userProfile = {
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Admin indicator */}
      {isAdmin && (
        <div className="bg-primary text-primary-foreground px-4 py-1 flex items-center justify-center gap-2 text-sm">
          <Shield className="w-4 h-4" />
          <span>Modo Administrador - Visualizando dados globais</span>
        </div>
      )}

      <AppHeader
        user={userProfile}
        onLogout={handleLogout}
        connectionStatus={connectionStatus}
        pendingSyncCount={pendingSyncCount}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === "dashboard" && (
          <DashboardHome
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
      </main>
    </div>
  );
};
