import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft, 
  ClipboardCheck, 
  Search,
  FileText,
  Loader2,
  Calendar,
  Filter
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AuditWithDetails, useAuditList } from "@/hooks/useAudits";

interface AuditHistoryPageProps {
  onBack: () => void;
  onViewReport: (auditId: string) => void;
  onEditAudit: (auditId: string) => void;
  isAdmin?: boolean;
}

export const AuditHistoryPage = ({ onBack, onViewReport, onEditAudit, isAdmin = false }: AuditHistoryPageProps) => {
  const { audits, loading } = useAuditList();
  const [filteredAudits, setFilteredAudits] = useState<AuditWithDetails[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");

  useEffect(() => {
    let filtered = [...audits];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(audit => 
        (audit.location_name || audit.location || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(audit => audit.status === statusFilter);
    }

    // Date filter
    if (dateFilter) {
      filtered = filtered.filter(audit => {
        if (!audit.started_at) return false;
        return audit.started_at.startsWith(dateFilter);
      });
    }

    setFilteredAudits(filtered);
  }, [searchTerm, statusFilter, dateFilter, audits]);

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
      return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">Histórico de Auditorias</h1>
            <p className="text-muted-foreground">
              {isAdmin ? 'Todas as auditorias do sistema' : 'Suas auditorias realizadas'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por local..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="completed">Concluídas</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audits List */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Auditorias</CardTitle>
          <CardDescription>
            {filteredAudits.length} auditoria{filteredAudits.length !== 1 ? 's' : ''} encontrada{filteredAudits.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAudits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma auditoria encontrada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAudits.map((audit) => (
                <div 
                  key={audit.id} 
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 w-full sm:w-auto">
                    <div className="w-10 h-10 shrink-0 bg-gradient-secondary rounded-lg flex items-center justify-center">
                      <ClipboardCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium truncate">
                        {audit.location_name || audit.location || 'Local não informado'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(audit.started_at)}
                      </p>
                      {isAdmin && audit.auditor_name && (
                        <p className="text-xs text-muted-foreground">
                          Auditor: {audit.auditor_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    {audit.compliance != null && (
                      <div className="text-right">
                        <p className="text-sm font-medium">{audit.compliance}%</p>
                        <p className="text-xs text-muted-foreground">Conformidade</p>
                      </div>
                    )}
                    {getStatusBadge(audit.status)}
                    {/* Ação alinhada à direita e com altura de toque no celular */}
                    <div className="flex gap-2 ml-auto">
                      {audit.status === 'in_progress' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-9"
                          onClick={() => onEditAudit(audit.id)}
                        >
                          Continuar
                        </Button>
                      )}
                      {audit.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-9"
                          onClick={() => onViewReport(audit.id)}
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Relatório
                        </Button>
                      )}
                    </div>
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
