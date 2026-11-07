import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  MapPin,
  MinusCircle,
  User,
  XCircle,
} from "lucide-react";
import { PageHero } from "@/components/layout/PageHero";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Checklist, LocalAudit } from "@/lib/localdb";
import { getChecklist, refreshAuditDetail } from "@/lib/repo";
import { usePhotoUrls } from "@/hooks/useAudits";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface AuditReportPageProps {
  auditId: string;
  onBack: () => void;
}

interface ReportData {
  audit: LocalAudit;
  summary: LocalAudit | null;
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
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [checklist, setChecklist] = useState<Checklist | undefined>();

  // Mostra a cópia local na hora; atualiza do servidor se houver conexão.
  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    (navigator.onLine ? refreshAuditDetail(auditId) : Promise.resolve(false))
      .finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [auditId]);

  const audit = useLiveQuery(() => db.audits.get(auditId), [auditId]);
  const items = useLiveQuery(() => db.auditItems.where("auditId").equals(auditId).toArray(), [auditId]);
  const photos = useLiveQuery(() => db.photos.where("auditId").equals(auditId).sortBy("createdAt"), [auditId]);
  const photoUrls = usePhotoUrls(photos);

  useEffect(() => {
    if (audit?.checklist_id) getChecklist(audit.checklist_id).then(setChecklist);
  }, [audit?.checklist_id]);

  const reportData: ReportData | null = useMemo(() => {
    if (!audit || !checklist || !items) return null;
    const byItem = new Map(items.map(i => [i.checklistItemId, i]));
    return {
      audit,
      summary: audit,
      auditorName: audit.auditor_name || "Não identificado",
      locationName: audit.location_full || audit.location_name || audit.location || "Não informado",
      sections: checklist.sections.map(section => ({
        title: section.title,
        items: section.items.map(item => ({
          description: item.description,
          result: byItem.get(item.id)?.result ?? null,
          observation: byItem.get(item.id)?.observation ?? null,
          images: (photos ?? [])
            .filter(p => p.checklistItemId === item.id)
            .map(p => photoUrls.get(p.id))
            .filter((u): u is string => !!u),
        })),
      })),
    };
  }, [audit, checklist, items, photos, photoUrls]);

  const loading = !reportData && (refreshing || audit === undefined);

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

  const RESULT_STYLE: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
    conforme: { label: "Conforme", cls: "bg-green-100 text-green-800", icon: CheckCircle2 },
    nao_conforme: { label: "Não conforme", cls: "bg-red-100 text-red-800", icon: XCircle },
    nao_aplicavel: { label: "N/A", cls: "bg-slate-100 text-slate-700", icon: MinusCircle },
    none: { label: "Não avaliado", cls: "bg-slate-100 text-slate-500", icon: MinusCircle },
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
      <div className="flex justify-center items-center py-24">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-[#0369A1] mx-auto" />
          <p className="text-slate-600 text-sm">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div>
        <PageHero title="Relatório" onBack={onBack} />
        <div className="mt-4 bg-white rounded-3xl p-6 text-center flex flex-col items-center gap-3 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
          <FileText className="w-10 h-10 text-slate-300" aria-hidden="true" />
          <p className="m-0 text-sm text-slate-700">
            Relatório não encontrado neste aparelho. Conecte-se à internet e tente de novo.
          </p>
        </div>
      </div>
    );
  }

  const summary = reportData.summary;
  const conformeCount = summary?.conforme_count || 0;
  const naoConformeCount = summary?.nao_conforme_count || 0;
  const naCount = summary?.nao_aplicavel_count || 0;
  const total = conformeCount + naoConformeCount;
  const complianceRate = total > 0 ? Math.round((conformeCount / total) * 100) : 0;
  const ringColor = complianceRate >= 70 ? "#16A34A" : complianceRate >= 50 ? "#D97706" : "#DC2626";
  const ringText = complianceRate >= 70 ? "text-green-700" : complianceRate >= 50 ? "text-amber-700" : "text-red-700";

  // Não conformidades em destaque: é o que o auditor precisa ver primeiro.
  const nonConformities = reportData.sections.flatMap(s =>
    s.items.filter(i => i.result === "nao_conforme").map(i => ({ ...i, section: s.title })));

  const info = [
    { icon: MapPin, label: "Local", value: reportData.locationName },
    { icon: User, label: "Auditor(a)", value: reportData.auditorName },
    { icon: Calendar, label: "Início", value: formatDate(reportData.audit.started_at) },
    { icon: CalendarCheck, label: "Conclusão", value: formatDate(reportData.audit.finished_at) },
  ];

  const ResultPill = ({ result }: { result: string | null }) => {
    const r = RESULT_STYLE[result ?? "none"] ?? RESULT_STYLE.none;
    const Icon = r.icon;
    return (
      <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${r.cls}`}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {r.label}
      </span>
    );
  };

  const Photos = ({ images, label }: { images: string[]; label: string }) =>
    images.length ? (
      <div className="flex flex-wrap gap-2">
        {images.map((src, i) => (
          <a key={src} href={src} target="_blank" rel="noreferrer" aria-label={`Abrir foto ${i + 1} de ${label}`}>
            <img src={src} alt={`Foto ${i + 1} de ${label}`} className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
          </a>
        ))}
      </div>
    ) : null;

  return (
    <div>
      <PageHero
        eyebrow="Relatório de auditoria"
        title={reportData.audit.location_name || reportData.audit.location || "Auditoria"}
        subtitle={`Concluída em ${formatDate(reportData.audit.finished_at)}`}
        onBack={onBack}
        overlap
      />

      <div className="relative -mt-12 flex flex-col gap-3">
        {/* Conformidade (real) */}
        <section aria-label="Resumo" className="bpf-pop bg-white rounded-3xl p-5 flex items-center gap-5 shadow-[0_16px_40px_rgba(15,23,42,0.10)]" style={{ animationDelay: "60ms" }}>
          <div className="relative w-24 h-24 flex-none">
            <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90" aria-hidden="true">
              <circle cx="48" cy="48" r="38" fill="none" stroke="#F1F5F9" strokeWidth="11" />
              <circle cx="48" cy="48" r="38" fill="none" stroke={ringColor} strokeWidth="11" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 38} strokeDashoffset={2 * Math.PI * 38 * (1 - complianceRate / 100)} />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-2xl font-extrabold tabular-nums ${ringText}`}>
              {complianceRate}%
            </span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.06em] uppercase text-slate-600">Taxa de conformidade</span>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { n: conformeCount, label: "Conforme", cls: "bg-green-50 text-green-800" },
                { n: naoConformeCount, label: "Não conf.", cls: "bg-red-50 text-red-800" },
                { n: naCount, label: "N/A", cls: "bg-slate-50 text-slate-700" },
              ].map(c => (
                <div key={c.label} className={`rounded-xl py-1.5 ${c.cls}`}>
                  <div className="text-lg font-extrabold tabular-nums leading-tight">{c.n}</div>
                  <div className="text-[10px] font-bold leading-tight">{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Informações */}
        <section aria-label="Informações" className="bpf-rise bg-white rounded-3xl px-5 py-2 shadow-[0_4px_14px_rgba(15,23,42,0.05)]" style={{ animationDelay: "120ms" }}>
          {info.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 py-2.5">
              <div className="w-10 h-10 shrink-0 rounded-[13px] bg-sky-50 text-sky-700 flex items-center justify-center">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-xs font-semibold text-slate-600">{label}</span>
                <span className="text-[15px] font-bold text-slate-900 break-words">{value}</span>
              </div>
            </div>
          ))}
        </section>

        {/* Não conformidades em destaque */}
        {nonConformities.length > 0 && (
          <section aria-label="Não conformidades" className="bpf-rise bg-red-50 border border-red-100 rounded-3xl p-4 flex flex-col gap-3" style={{ animationDelay: "180ms" }}>
            <h2 className="m-0 flex items-center gap-2 text-base font-extrabold text-red-900">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              {nonConformities.length} não conformidade{nonConformities.length > 1 ? "s" : ""}
            </h2>
            {nonConformities.map((nc, i) => (
              <div key={i} className="bg-white rounded-2xl p-3 flex flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">{nc.section}</span>
                <p className="m-0 text-sm font-semibold text-slate-900 leading-snug">{nc.description}</p>
                {nc.observation && <p className="m-0 text-sm text-slate-700 bg-slate-50 rounded-xl p-2.5">{nc.observation}</p>}
                <Photos images={nc.images} label={nc.description} />
              </div>
            ))}
          </section>
        )}

        {/* Itens por seção (recolhíveis para caber no celular) */}
        <h2 className="m-0 mt-2 px-1 text-lg font-extrabold tracking-[-0.01em] text-slate-900">Itens por seção</h2>
        {reportData.sections.map((section, sIdx) => {
          const c = section.items.filter(i => i.result === "conforme").length;
          const nc = section.items.filter(i => i.result === "nao_conforme").length;
          const pct = c + nc > 0 ? Math.round((c / (c + nc)) * 100) : null;
          return (
            <details key={sIdx} className="group bg-white rounded-[20px] shadow-[0_4px_14px_rgba(15,23,42,0.05)] overflow-hidden">
              <summary className="list-none cursor-pointer p-4 flex items-center gap-3 min-h-14 [&::-webkit-details-marker]:hidden">
                <span className="w-8 h-8 shrink-0 rounded-[10px] bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-extrabold">
                  {sIdx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-slate-900 leading-snug">{section.title}</span>
                  <span className="text-xs text-slate-600">
                    {section.items.length} itens · <span className="text-green-700 font-bold">✓ {c}</span>{" "}
                    <span className="text-red-700 font-bold">✗ {nc}</span>
                  </span>
                </div>
                {pct !== null && (
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${pct >= 80 ? "bg-green-100 text-green-800" : pct >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                    {pct}%
                  </span>
                )}
                <ChevronDown className="w-5 h-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-4 pb-4 flex flex-col divide-y divide-slate-100">
                {section.items.map((item, iIdx) => (
                  <div key={iIdx} className="py-3 flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <p className="m-0 flex-1 text-sm text-slate-900 leading-snug">{item.description}</p>
                      <ResultPill result={item.result} />
                    </div>
                    {item.observation && <p className="m-0 text-sm text-slate-700 bg-slate-50 rounded-xl p-2.5">{item.observation}</p>}
                    <Photos images={item.images} label={item.description} />
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {/* Barra fixa: baixar PDF */}
      <div className="fixed inset-x-3 z-40 mx-auto max-w-2xl" style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <div className="bg-white rounded-3xl p-2 shadow-[0_-2px_30px_rgba(15,23,42,0.14)]">
          <button
            type="button" onClick={generatePDF} disabled={generatingPdf}
            className="bpf-tap w-full h-12 rounded-2xl bg-[#0369A1] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {generatingPdf ? <><Loader2 className="w-5 h-5 animate-spin" /> Gerando PDF...</> : <><Download className="w-5 h-5" /> Baixar PDF</>}
          </button>
        </div>
      </div>
    </div>
  );
};
