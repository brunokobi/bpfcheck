import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardCheck, 
  Plus, 
  FileText, 
  History, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Loader2
} from "lucide-react";
import { useAudits, AuditWithDetails } from "@/hooks/useAudits";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DashboardProps {
  onNewAudit: () => void;
  onViewReports: () => void;
  onViewHistory: () => void;
  onAuditClick?: (auditId: string, status: string | null) => void;
  isAdmin?: boolean;
}

export const DashboardHome = ({ onNewAudit, onViewReports, onViewHistory, onAuditClick, isAdmin = false }: DashboardProps) => {
  const { stats, audits, loading, fetchStats, fetchRecentAudits } = useAudits();

  useEffect(() => {
    fetchStats();
    fetchRecentAudits(5);
  }, [fetchStats, fetchRecentAudits]);

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return <Badge variant="secondary" className="bg-success text-success-foreground">Concluída</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="border-warning text-warning">Em andamento</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-primary">Dashboard</h1>
          <p className="text-muted-foreground">Gerencie suas auditorias sanitárias</p>
        </div>
        <Button onClick={onNewAudit} className="bg-gradient-primary hover:shadow-primary">
          <Plus className="w-4 h-4 mr-2" />
          Nova Auditoria
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Auditorias</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.totalAudits}
            </div>
            <p className="text-xs text-muted-foreground">
              Todas as auditorias
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.pendingAudits}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando conclusão
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.completedAudits}
            </div>
            <p className="text-xs text-muted-foreground">
              Finalizadas
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conformidade</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : `${stats.complianceRate}%`}
            </div>
            <p className="text-xs text-muted-foreground">
              Média geral
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card hover:shadow-primary transition-shadow cursor-pointer" onClick={onNewAudit}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Plus className="w-5 h-5 mr-2 text-primary" />
              Nova Auditoria
            </CardTitle>
            <CardDescription>
              Iniciar uma nova auditoria baseada na RDC 216/2004
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="shadow-card hover:shadow-primary transition-shadow cursor-pointer" onClick={onViewReports}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="w-5 h-5 mr-2 text-primary" />
              Relatórios
            </CardTitle>
            <CardDescription>
              Visualizar e exportar relatórios de auditorias
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="shadow-card hover:shadow-primary transition-shadow cursor-pointer" onClick={onViewHistory}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <History className="w-5 h-5 mr-2 text-primary" />
              Histórico
            </CardTitle>
            <CardDescription>
              Consultar auditorias anteriores e seus resultados
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Audits */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Auditorias Recentes</CardTitle>
          <CardDescription>
            Suas últimas auditorias realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : audits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma auditoria encontrada.</p>
              <p className="text-sm">Clique em "Nova Auditoria" para começar.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {audits.map((audit: AuditWithDetails) => (
                <div 
                  key={audit.id} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => onAuditClick?.(audit.id, audit.status)}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-gradient-secondary rounded-lg flex items-center justify-center">
                      <ClipboardCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">
                        {audit.location_name || audit.location || 'Local não informado'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(audit.started_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {audit.compliance !== undefined && (
                      <div className="text-right">
                        <p className="text-sm font-medium">{audit.compliance}%</p>
                        <p className="text-xs text-muted-foreground">Conformidade</p>
                      </div>
                    )}
                    {getStatusBadge(audit.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
