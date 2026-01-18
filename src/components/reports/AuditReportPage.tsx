import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  MinusCircle,
  FileText,
  Building,
  User,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  Audit,
  AuditSummary,
  getAuditById,
  getAuditSummary,
  getAuditItems,
  getChecklistWithSections,
} from "@/lib/supabase-service";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface AuditReportPageProps {
  auditId: string;
  onBack: () => void;
}

interface ReportData {
  audit: Audit;
  summary: AuditSummary | null;
  auditorName: string;
  locationName: string;
  sections: {
    title: string;
    items: {
      description: string;
      result: string | null;
      observation: string | null;
      images: string[];
    }[];
  }[];
}

export const AuditReportPage = ({ auditId, onBack }: AuditReportPageProps) => {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    fetchReportData();
  }, [auditId]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // Fetch audit
      const { data: audit, error: auditError } = await getAuditById(auditId);
      if (auditError || !audit)
        throw new Error(auditError || "Audit not found");

      // Fetch summary
      const { data: summary } = await getAuditSummary(auditId);

      // Fetch auditor profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", audit.user_id)
        .single();

      // Fetch location
      let locationName = audit.location || "Não informado";
      if (audit.location_id) {
        const { data: location } = await supabase
          .from("audit_locations")
          .select("name, address, city, state")
          .eq("id", audit.location_id)
          .single();
        if (location) {
          locationName = location.name;
          if (location.address) locationName += `, ${location.address}`;
          if (location.city) locationName += ` - ${location.city}`;
          if (location.state) locationName += `/${location.state}`;
        }
      }

      // Fetch checklist with sections
      const { data: checklistData } = await getChecklistWithSections(
        audit.checklist_id
      );

      // Fetch audit items
      const { data: auditItems } = await getAuditItems(auditId);

      // Fetch images for each audit item
      const auditItemIds = auditItems?.map((item) => item.id) || [];
      const { data: allImages } = await supabase
        .from("audit_item_images")
        .select("audit_item_id, image_url")
        .in("audit_item_id", auditItemIds);

      // Build sections with results
      const sections =
        checklistData?.sections.map((section) => ({
          title: section.title,
          items: section.items.map((item) => {
            const auditItem = auditItems?.find(
              (ai) => ai.checklist_item_id === item.id
            );
            const itemImages =
              allImages
                ?.filter((img) =>
                  auditItems?.find(
                    (ai) =>
                      ai.checklist_item_id === item.id &&
                      ai.id === img.audit_item_id
                  )
                )
                .map((img) => img.image_url) || [];

            return {
              description: item.description,
              result: auditItem?.result || null,
              observation: auditItem?.observation || null,
              images: itemImages,
            };
          }),
        })) || [];

      setReportData({
        audit,
        summary,
        auditorName: profile?.name || profile?.email || "Não identificado",
        locationName,
        sections,
      });
    } catch (error) {
      console.error("[AuditReportPage] Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", {
        locale: ptBR,
      });
    } catch {
      return dateString;
    }
  };

  const getResultText = (result: string | null) => {
    switch (result) {
      case "conforme":
        return "Conforme";
      case "nao_conforme":
        return "Não Conforme";
      case "nao_aplicavel":
        return "Não Aplicável";
      default:
        return "Não avaliado";
    }
  };

  const getResultColor = (result: string | null) => {
    switch (result) {
      case "conforme":
        return "text-success";
      case "nao_conforme":
        return "text-destructive";
      case "nao_aplicavel":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  };

  const getResultIcon = (result: string | null) => {
    switch (result) {
      case "conforme":
        return <CheckCircle className="w-5 h-5 text-success" />;
      case "nao_conforme":
        return <XCircle className="w-5 h-5 text-destructive" />;
      case "nao_aplicavel":
        return <MinusCircle className="w-5 h-5 text-muted-foreground" />;
      default:
        return <MinusCircle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getSignedImage = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("audit-images")
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  };

  const imageToBase64 = async (url: string): Promise<string> => {
    const res = await fetch(url);
    const blob = await res.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

const generatePDF = async () => {
  if (!reportData) return;

  setGeneratingPdf(true);

  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 0;

    /* =========================
       HELPERS
    ========================= */

    const newPageIfNeeded = (limit = 260) => {
      if (yPos > limit) {
        doc.addPage();
        yPos = 20;
      }
    };

    const imageToThumbnailBase64 = async (
      url: string,
      maxWidth = 300
    ): Promise<string> => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const scale = maxWidth / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL("image/jpeg", 0.75); // JPEG compatível com jsPDF
    };

    /* =========================
       HEADER
    ========================= */

    doc.setFillColor(0, 102, 153);
    doc.rect(0, 0, pageWidth, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("BPF CHECK", 14, 20);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Relatório de Auditoria Sanitária", 14, 30);

    doc.setTextColor(0, 0, 0);
    yPos = 55;

    /* =========================
       INFO AUDITORIA
    ========================= */

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("LOCAL:", 14, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(reportData.locationName, 40, yPos);

    yPos += 8;
    doc.setFont("helvetica", "bold");
    doc.text("AUDITOR:", 14, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(reportData.auditorName, 40, yPos);

    yPos += 8;
    doc.setFont("helvetica", "bold");
    doc.text("INÍCIO:", 14, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(reportData.audit.started_at), 40, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("TÉRMINO:", 100, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(reportData.audit.finished_at), 130, yPos);

    /* =========================
       RESUMO
    ========================= */

    yPos += 15;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos, pageWidth - 28, 25, "F");

    yPos += 10;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("RESUMO DA AUDITORIA", pageWidth / 2, yPos, { align: "center" });

    yPos += 10;
    doc.setFontSize(10);

    const s = reportData.summary;
    const conforme = s?.conforme_count || 0;
    const naoConforme = s?.nao_conforme_count || 0;
    const na = s?.nao_aplicavel_count || 0;
    const total = conforme + naoConforme;
    const taxa = total > 0 ? Math.round((conforme / total) * 100) : 0;

    doc.setTextColor(0, 128, 0);
    doc.text(`Conforme: ${conforme}`, 30, yPos);
    doc.setTextColor(255, 0, 0);
    doc.text(`Não Conforme: ${naoConforme}`, 80, yPos);
    doc.setTextColor(128, 128, 128);
    doc.text(`N/A: ${na}`, 140, yPos);
    doc.setTextColor(0, 102, 153);
    doc.text(`Taxa: ${taxa}%`, 170, yPos);

    doc.setTextColor(0, 0, 0);
    yPos += 20;

    /* =========================
       SEÇÕES + ITENS + IMAGENS
    ========================= */

    for (const section of reportData.sections) {
      newPageIfNeeded();

      // Calcular conformidade da seção
      const sectionConforme = section.items.filter((i) => i.result === "conforme").length;
      const sectionNaoConforme = section.items.filter((i) => i.result === "nao_conforme").length;
      const sectionTotal = sectionConforme + sectionNaoConforme;
      const sectionComplianceRate = sectionTotal > 0 ? Math.round((sectionConforme / sectionTotal) * 100) : null;

      // Cabeçalho da seção
      doc.setFillColor(0, 102, 153);
      doc.rect(14, yPos, pageWidth - 28, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      
      const sectionTitle = sectionComplianceRate !== null 
        ? `${section.title} - ${sectionComplianceRate}% conformidade`
        : section.title;
      doc.text(sectionTitle, 16, yPos + 6);

      doc.setTextColor(0, 0, 0);
      yPos += 12;

      for (let i = 0; i < section.items.length; i++) {
        const item = section.items[i];
        newPageIfNeeded(240);

        // Texto do item
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`${i + 1}. ${item.description}`, 14, yPos, {
          maxWidth: pageWidth - 28,
        });

        yPos += 6;

        doc.setFont("helvetica", "normal");
        doc.text(
          `Status: ${getResultText(item.result)} | Observação: ${
            item.observation || "-"
          }`,
          14,
          yPos,
          { maxWidth: pageWidth - 28 }
        );

        yPos += 6;

        // Miniaturas
        if (item.images && item.images.length > 0) {
          let x = 14;

          for (const imageUrl of item.images) {
            const thumbBase64 = await imageToThumbnailBase64(imageUrl);

            if (x + 45 > pageWidth - 14) {
              x = 14;
              yPos += 40;
            }

            newPageIfNeeded(220);
            doc.addImage(thumbBase64, "JPEG", x, yPos, 40, 30);
            x += 45;
          }

          yPos += 35;
        }

        yPos += 8;
      }
    }

    /* =========================
       FOOTER
    ========================= */

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Página ${i} de ${pageCount} - Gerado por BPF Check em ${format(
          new Date(),
          "dd/MM/yyyy 'às' HH:mm",
          { locale: ptBR }
        )}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }

    doc.save(`auditoria_${reportData.audit.id}.pdf`);
  } catch (error) {
    console.error("[generatePDF] Error:", error);
  } finally {
    setGeneratingPdf(false);
  }
};





  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Relatório não encontrado.</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const summary = reportData.summary;
  const conformeCount = summary?.conforme_count || 0;
  const naoConformeCount = summary?.nao_conforme_count || 0;
  const naCount = summary?.nao_aplicavel_count || 0;
  const total = conformeCount + naoConformeCount;
  const complianceRate =
    total > 0 ? Math.round((conformeCount / total) * 100) : 0;

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
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Relatório de Auditoria
            </h1>
            <p className="text-muted-foreground">{reportData.locationName}</p>
          </div>
        </div>
        <Button
          onClick={generatePDF}
          disabled={generatingPdf}
          className="bg-gradient-primary"
        >
          {generatingPdf ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Baixar PDF
        </Button>
      </div>

      {/* Audit Info */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            Informações da Auditoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3">
              <Building className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Local</p>
                <p className="font-medium">{reportData.locationName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <User className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Auditor</p>
                <p className="font-medium">{reportData.auditorName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Data de Início</p>
                <p className="font-medium">
                  {formatDate(reportData.audit.started_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Data de Conclusão
                </p>
                <p className="font-medium">
                  {formatDate(reportData.audit.finished_at)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-success/10 rounded-lg">
              <p className="text-3xl font-bold text-success">{conformeCount}</p>
              <p className="text-sm text-muted-foreground">Conforme</p>
            </div>
            <div className="text-center p-4 bg-destructive/10 rounded-lg">
              <p className="text-3xl font-bold text-destructive">
                {naoConformeCount}
              </p>
              <p className="text-sm text-muted-foreground">Não Conforme</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-3xl font-bold text-muted-foreground">
                {naCount}
              </p>
              <p className="text-sm text-muted-foreground">N/A</p>
            </div>
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <p className="text-3xl font-bold text-primary">
                {complianceRate}%
              </p>
              <p className="text-sm text-muted-foreground">
                Taxa de Conformidade
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      {reportData.sections.map((section, sectionIndex) => {
        const sectionConforme = section.items.filter((i) => i.result === "conforme").length;
        const sectionNaoConforme = section.items.filter((i) => i.result === "nao_conforme").length;
        const sectionTotal = sectionConforme + sectionNaoConforme;
        const sectionComplianceRate = sectionTotal > 0 ? Math.round((sectionConforme / sectionTotal) * 100) : null;
        
        return (
        <Card key={sectionIndex} className="shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{section.title}</CardTitle>
              {sectionComplianceRate !== null && (
                <span className={`text-lg font-bold ${sectionComplianceRate >= 80 ? 'text-success' : sectionComplianceRate >= 50 ? 'text-warning' : 'text-destructive'}`}>
                  {sectionComplianceRate}%
                </span>
              )}
            </div>
            <CardDescription>
              {sectionConforme} conforme, {sectionNaoConforme} não conforme
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {section.items.map((item, itemIndex) => (
                <div key={itemIndex} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.description}</p>
                      {item.observation && (
                        <p className="text-sm text-muted-foreground mt-2">
                          <strong>Observação:</strong> {item.observation}
                        </p>
                      )}
                      {item.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {item.images.map((img, imgIndex) => (
                            <img
                              key={imgIndex}
                              src={img}
                              alt={`Foto ${imgIndex + 1}`}
                              className="w-16 h-16 object-cover rounded"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {getResultIcon(item.result)}
                      <span
                        className={`text-sm font-medium ${getResultColor(
                          item.result
                        )}`}
                      >
                        {getResultText(item.result)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
};
