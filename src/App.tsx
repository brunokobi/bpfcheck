import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useOnline } from "@/hooks/useSyncStatus";
import { startSyncLoop } from "@/lib/sync";
import { refreshChecklist } from "@/lib/repo";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Liga a fila de sincronização e baixa o checklist para uso offline sempre que houver conexão.
const SyncBootstrap = () => {
  const { user } = useAuth();
  const online = useOnline();
  useEffect(() => { startSyncLoop(); }, []);
  useEffect(() => {
    if (user && online) void refreshChecklist();
  }, [user, online]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SyncBootstrap />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
