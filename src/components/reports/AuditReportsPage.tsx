import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuditList } from "@/hooks/useAudits";
import { ArrowLeft, ClipboardCheck, Loader2, Printer, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditReportsPageProps {
  onBack: () => void;
  onPrintAudit: (auditId: string) => void;
  isAdmin?: boolean;
}

export const AuditReportsPage = ({ onBack, onPrintAudit, isAdmin = false }: AuditReportsPageProps) => {
  const { audits: allAudits, loading } = useAuditList();
  const audits = useMemo(
    () => allAudits
      .filter(a => a.status === "completed")
      .sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? "")),
    [allAudits],
  );

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  return (
    <section className="space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">Relatórios</h1>
            <p className="text-muted-foreground">Selecione uma auditoria concluída para imprimir.</p>
          </div>
        </div>
      </header>

      <main>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Auditorias concluídas</CardTitle>
            <CardDescription>Lista pronta para impressão/exportação.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : audits.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma auditoria concluída encontrada.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {audits.map((audit) => (
                  <article
                    key={audit.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium">
                          {audit.location_name || audit.location || "Local não informado"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {formatDateTime(audit.finished_at || audit.started_at)}
                        </span>
                        {isAdmin && audit.auditor_name && <span>Auditor: {audit.auditor_name}</span>}
                      </div>
                    </div>

                    <Button
                      className="bg-gradient-primary"
                      onClick={() => onPrintAudit(audit.id)}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </section>
  );
};
