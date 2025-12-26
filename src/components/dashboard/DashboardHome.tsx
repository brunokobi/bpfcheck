import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardCheck, 
  Plus, 
  FileText, 
  History, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp
} from "lucide-react";

interface DashboardProps {
  onNewAudit: () => void;
  onViewReports: () => void;
  onViewHistory: () => void;
}

export const DashboardHome = ({ onNewAudit, onViewReports, onViewHistory }: DashboardProps) => {
  const [stats] = useState({
    totalAudits: 42,
    pendingAudits: 3,
    completedAudits: 39,
    complianceRate: 85
  });

  const recentAudits = [
    {
      id: 1,
      name: "Restaurante Central",
      date: "2024-03-15",
      status: "completed",
      compliance: 92
    },
    {
      id: 2,
      name: "Padaria São João",
      date: "2024-03-14",
      status: "pending",
      compliance: null
    },
    {
      id: 3,
      name: "Lanchonete Moderna",
      date: "2024-03-13",
      status: "completed",
      compliance: 78
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="secondary" className="bg-success text-success-foreground">Concluída</Badge>;
      case "pending":
        return <Badge variant="outline" className="border-warning text-warning">Pendente</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
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
            <div className="text-2xl font-bold text-primary">{stats.totalAudits}</div>
            <p className="text-xs text-muted-foreground">
              +2 desde o mês passado
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.pendingAudits}</div>
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
            <div className="text-2xl font-bold text-success">{stats.completedAudits}</div>
            <p className="text-xs text-muted-foreground">
              Este mês
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conformidade</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.complianceRate}%</div>
            <p className="text-xs text-muted-foreground">
              +5% desde o mês passado
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
          <div className="space-y-4">
            {recentAudits.map((audit) => (
              <div key={audit.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-secondary rounded-lg flex items-center justify-center">
                    <ClipboardCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">{audit.name}</h4>
                    <p className="text-sm text-muted-foreground">{audit.date}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {audit.compliance && (
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
        </CardContent>
      </Card>
    </div>
  );
};