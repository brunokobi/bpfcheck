import { useState, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Camera,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SectionWithItems, ChecklistItemWithResult } from "@/hooks/useAudits";
import { uploadAuditImage } from "@/lib/supabase-service";
import { saveOfflinePhoto, blobToObjectUrl, addToSyncQueue } from "@/lib/offline-sync";

// Define the type for auditsHook
type AuditsHook = {
  currentAudit: any;
  checklistSections: SectionWithItems[];
  setChecklistSections: React.Dispatch<
    React.SetStateAction<SectionWithItems[]>
  >;
  startNewAudit: (locationName?: string, locationId?: string) => Promise<any>;
  saveItems: (
    auditId: string,
    items: {
      checklist_item_id: string;
      result: string | null;
      observation: string | null;
    }[]
  ) => Promise<boolean>;
  finishAudit: (
    auditId: string,
    summary: {
      conforme_count: number;
      nao_conforme_count: number;
      nao_aplicavel_count: number;
    },
    items?: {
      checklist_item_id: string;
      result: string | null;
      observation: string | null;
    }[]
  ) => Promise<boolean>;
  loading: boolean;
};

interface ChecklistFormProps {
  onBack: () => void;
  onSave: () => void;
  auditsHook: AuditsHook;
  isEditing?: boolean;
}

export const ChecklistForm = ({
  onBack,
  onSave,
  auditsHook,
  isEditing = false,
}: ChecklistFormProps) => {
  const { toast } = useToast();
  const {
    currentAudit,
    checklistSections,
    setChecklistSections,
    startNewAudit,
    saveItems,
    finishAudit,
    loading,
  } = auditsHook;

  const [currentSection, setCurrentSection] = useState(0);
  const [saving, setSaving] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);

  // Determine if we need to show the "start audit" form
  const showStartForm = !isEditing && !currentAudit;

  // Auto-save a single item
  const autoSaveItem = useCallback(async (itemId: string, result: string | null, observation: string | null) => {
    if (!currentAudit || !result) return;

    setAutoSaving(true);
    try {
      if (navigator.onLine) {
        const success = await saveItems(currentAudit.id, [{
          checklist_item_id: itemId,
          result,
          observation,
        }]);

        if (!success) {
          toast({
            title: "Falha ao salvar automaticamente",
            description: `O item não pôde ser salvo. Verifique sua conexão e tente novamente. (item_id: ${itemId})`,
            variant: "destructive",
          });
        }
      } else {
        // Offline: queue for later sync
        await addToSyncQueue({
          type: 'save_items',
          payload: {
            auditId: currentAudit.id,
            items: [{
              checklist_item_id: itemId,
              result,
              observation,
            }],
          },
        });
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || "Erro desconhecido";
      console.error("[ChecklistForm] Auto-save error:", err);
      toast({
        title: "Erro no salvamento automático",
        description: `Detalhes: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setAutoSaving(false);
    }
  }, [currentAudit, saveItems, toast]);

  const handleStartAudit = async () => {
    if (!locationName.trim()) {
      toast({
        title: "Local obrigatório",
        description: "Informe o local da auditoria para continuar.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await startNewAudit(locationName.trim());
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || "Erro desconhecido";
      toast({
        title: "Erro ao iniciar auditoria",
        description: `Detalhes: ${errorMessage}`,
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const sections = checklistSections;
  const currentSectionData = sections[currentSection];
  const currentSectionItems = currentSectionData?.items || [];

  const calculateProgress = () => {
    const allItems = sections.flatMap((s) => s.items);
    const completedItems = allItems.filter(
      (item) => item.result !== null
    ).length;
    return allItems.length > 0 ? (completedItems / allItems.length) * 100 : 0;
  };

  const calculateSummary = () => {
    const allItems = sections.flatMap((s) => s.items);
    return {
      conforme_count: allItems.filter((i) => i.result === "conforme").length,
      nao_conforme_count: allItems.filter((i) => i.result === "nao_conforme")
        .length,
      nao_aplicavel_count: allItems.filter((i) => i.result === "nao_aplicavel")
        .length,
    };
  };

  const calculateSectionCompliance = (sectionItems: ChecklistItemWithResult[]) => {
    const conforme = sectionItems.filter((i) => i.result === "conforme").length;
    const naoConforme = sectionItems.filter((i) => i.result === "nao_conforme").length;
    const total = conforme + naoConforme;
    return total > 0 ? Math.round((conforme / total) * 100) : null;
  };

  const allItemsAnswered = () => {
    const allItems = sections.flatMap((s) => s.items);
    return allItems.length > 0 && allItems.every((item) => item.result !== null);
  };

  const getPendingCount = () => {
    const allItems = sections.flatMap((s) => s.items);
    return allItems.filter((item) => item.result === null).length;
  };

  const updateItemStatus = (
    itemId: string,
    result: ChecklistItemWithResult["result"]
  ) => {
    // Find the current item to get observation
    const currentItem = sections.flatMap(s => s.items).find(i => i.id === itemId);
    
    setChecklistSections((prev) =>
      prev.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.id === itemId ? { ...item, result } : item
        ),
      }))
    );

    // Auto-save immediately
    if (result !== null) {
      autoSaveItem(itemId, result, currentItem?.observation || null);
    }
  };

  const updateItemObservations = (itemId: string, observation: string) => {
    setChecklistSections((prev) =>
      prev.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.id === itemId ? { ...item, observation } : item
        ),
      }))
    );
  };

  const handleTakePhoto = (itemId: string) => {
    setActiveItemId(itemId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeItemId || !currentAudit) return;

    setUploadingImage(activeItemId);

    try {
      if (navigator.onLine) {
        // Online: upload directly
        const { data: imageUrl, error } = await uploadAuditImage(
          file,
          currentAudit.id,
          activeItemId
        );

        if (error) {
          toast({
            title: "Erro ao enviar imagem",
            description: `Falha no upload: ${error}`,
            variant: "destructive",
          });
        } else if (imageUrl) {
          setChecklistSections((prev) =>
            prev.map((section) => ({
              ...section,
              items: section.items.map((item) =>
                item.id === activeItemId
                  ? { ...item, photos: [...(item.photos || []), imageUrl] }
                  : item
              ),
            }))
          );
          toast({
            title: "Imagem enviada",
            description: "Foto adicionada com sucesso.",
          });
        }
      } else {
        // Offline: save blob locally
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        const offlinePhoto = await saveOfflinePhoto({
          auditId: currentAudit.id,
          checklistItemId: activeItemId,
          blob,
          mimeType: file.type,
        });

        const localUrl = blobToObjectUrl(offlinePhoto.blob);
        setChecklistSections((prev) =>
          prev.map((section) => ({
            ...section,
            items: section.items.map((item) =>
              item.id === activeItemId
                ? { ...item, photos: [...(item.photos || []), localUrl] }
                : item
            ),
          }))
        );

        toast({
          title: "Foto salva offline",
          description: "Será enviada ao servidor quando a conexão voltar.",
        });
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || "Erro desconhecido ao enviar imagem";
      console.error("[ChecklistForm] Image upload error:", err);
      toast({
        title: "Erro no upload da imagem",
        description: `Detalhes: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setUploadingImage(null);
      setActiveItemId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFinish = async () => {
    if (!currentAudit) return;

    const summary = calculateSummary();

    setSaving(true);

    const allItems = sections.flatMap((s) => s.items);
    const itemsToSave = allItems
      .filter((item) => item.result !== null)
      .map((item) => ({
        checklist_item_id: item.id,
        result: item.result,
        observation: item.observation || null,
      }));

    try {
      const success = await finishAudit(currentAudit.id, summary, itemsToSave);

      if (success) {
        onSave();
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || "Erro desconhecido";
      toast({
        title: "Erro ao finalizar auditoria",
        description: `Detalhes: ${errorMessage}`,
        variant: "destructive",
      });
    }

    setSaving(false);
  };

  const getStatusColor = (result: ChecklistItemWithResult["result"]) => {
    switch (result) {
      case "conforme":
        return "bg-success text-success-foreground";
      case "nao_conforme":
        return "bg-destructive text-destructive-foreground";
      case "nao_aplicavel":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  // Show audit start form
  if (showStartForm) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary">Nova Auditoria</h1>
            <p className="text-muted-foreground">
              Preencha os dados para iniciar
            </p>
          </div>
        </div>

        <Card className="shadow-card max-w-md">
          <CardHeader>
            <CardTitle>Dados da Auditoria</CardTitle>
            <CardDescription>
              Informe o local onde a auditoria será realizada
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Local / Estabelecimento *
              </label>
              <Input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Ex: Restaurante Central, Padaria São João..."
                disabled={saving}
              />
            </div>

            <Button
              onClick={handleStartAudit}
              className="w-full bg-gradient-primary"
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Iniciar Auditoria
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading while fetching checklist
  if (loading || sections.length === 0) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando checklist...</p>
        </div>
      </div>
    );
  }

  const pendingCount = getPendingCount();
  const canFinish = allItemsAnswered();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Checklist RDC 216/2004
            </h1>
            <p className="text-muted-foreground text-sm">
              {currentAudit.location || "Auditoria em andamento"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {autoSaving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Salvando...
            </span>
          )}
          {canFinish ? (
            <Button
              onClick={handleFinish}
              className="bg-gradient-primary flex-1 sm:flex-none"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Finalizar
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {pendingCount} {pendingCount === 1 ? 'pergunta pendente' : 'perguntas pendentes'}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      <Card className="shadow-card">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progresso do Checklist</span>
              <span>{Math.round(calculateProgress())}% concluído</span>
            </div>
            <Progress value={calculateProgress()} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground pt-2">
              <span className="text-success">
                ✓ {calculateSummary().conforme_count} conforme
              </span>
              <span className="text-destructive">
                ✗ {calculateSummary().nao_conforme_count} não conforme
              </span>
              <span>— {calculateSummary().nao_aplicavel_count} N/A</span>
            </div>

            {/* Section Progress */}
            {currentSectionData && (() => {
              const sectionAnswered = currentSectionItems.filter(i => i.result !== null).length;
              const sectionTotal = currentSectionItems.length;
              const sectionProgress = sectionTotal > 0 ? (sectionAnswered / sectionTotal) * 100 : 0;
              return (
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progresso da Seção: <span className="font-medium text-foreground">{currentSectionData.title}</span></span>
                    <span>{Math.round(sectionProgress)}% concluído</span>
                  </div>
                  <Progress value={sectionProgress} className="h-2" />
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Section Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-semibold text-primary">
            {currentSectionData?.title || "Seção"}
          </h2>
          {(() => {
            const sectionCompliance = calculateSectionCompliance(currentSectionItems);
            const sectionConforme = currentSectionItems.filter((i) => i.result === "conforme").length;
            const sectionNaoConforme = currentSectionItems.filter((i) => i.result === "nao_conforme").length;
            return (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-success">✓ {sectionConforme}</span>
                <span className="text-destructive">✗ {sectionNaoConforme}</span>
                {sectionCompliance !== null && (
                  <span className={`font-medium ${sectionCompliance >= 80 ? 'text-success' : sectionCompliance >= 50 ? 'text-warning' : 'text-destructive'}`}>
                    {sectionCompliance}% conformidade
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentSection((prev) => Math.max(0, prev - 1))}
            disabled={currentSection === 0}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground self-center whitespace-nowrap">
            {currentSection + 1} de {sections.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentSection((prev) =>
                Math.min(sections.length - 1, prev + 1)
              )
            }
            disabled={currentSection === sections.length - 1}
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="space-y-4">
        {currentSectionItems.map((item, index) => (
          <Card
            key={item.id}
            className="
                  rounded-2xl
                  bg-muted/50
                  border border-primary/40
                  shadow-sm
                  transition
                  hover:shadow-md"
          >
            {/* Header */}
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <CardTitle className="text-sm font-semibold">
                    Item {index + 1}
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm leading-relaxed">
                    {item.description}
                  </CardDescription>
                </div>

                <Badge
                  className={`
              rounded-full px-3 py-1 text-xs font-medium
              ${getStatusColor(item.result)}
            `}
                >
                  {item.result === "conforme"
                    ? "Conforme"
                    : item.result === "nao_conforme"
                    ? "Não Conforme"
                    : item.result === "nao_aplicavel"
                    ? "N/A"
                    : "Pendente"}
                </Badge>
              </div>
            </CardHeader>

            {/* Content */}
            <CardContent className="space-y-4">
              {/* Status Buttons */}
              <div className="grid grid-cols-3 gap-2">
                {/* Conforme */}
                <Button
                  type="button"
                  onClick={() =>
                    updateItemStatus(
                      item.id,
                      item.result === "conforme" ? null : "conforme"
                    )
                  }
                  disabled={autoSaving}
                  className={`
              flex items-center justify-center gap-2 rounded-xl border text-xs font-medium transition-all
              ${
                item.result === "conforme"
                  ? "bg-success text-white shadow-md ring-2 ring-success/30 scale-[1.02]"
                  : "bg-background hover:bg-success/10 text-success border-success/40"
              }
            `}
                >
                  ✅ Conforme
                </Button>

                {/* Não Conforme */}
                <Button
                  type="button"
                  onClick={() =>
                    updateItemStatus(
                      item.id,
                      item.result === "nao_conforme" ? null : "nao_conforme"
                    )
                  }
                  disabled={autoSaving}
                  className={`
              flex items-center justify-center gap-2 rounded-xl border text-xs font-medium transition-all
              ${
                item.result === "nao_conforme"
                  ? "bg-destructive text-white shadow-md ring-2 ring-destructive/30 scale-[1.02]"
                  : "bg-background hover:bg-destructive/10 text-destructive border-destructive/40"
              }
            `}
                >
                  ❌ Não Conforme
                </Button>

                {/* Não Aplicável */}
                <Button
                  type="button"
                  onClick={() =>
                    updateItemStatus(
                      item.id,
                      item.result === "nao_aplicavel" ? null : "nao_aplicavel"
                    )
                  }
                  disabled={autoSaving}
                  className={`
              flex items-center justify-center gap-2 rounded-xl border text-xs font-medium transition-all
              ${
                item.result === "nao_aplicavel"
                  ? "bg-muted text-foreground shadow-md ring-2 ring-muted/40 scale-[1.02]"
                  : "bg-background hover:bg-muted/40 text-muted-foreground border-muted"
              }
            `}
                >
                  🚫 N/A
                </Button>
              </div>

              {/* Observations */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Observações
                </label>
                <Textarea
                  value={item.observation}
                  onChange={(e) =>
                    updateItemObservations(item.id, e.target.value)
                  }
                  placeholder="Digite observações relevantes…"
                  className="min-h-[70px] rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>

              {/* Photos */}
              {item.photos && item.photos.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Fotos ({item.photos.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {item.photos.map((photo, idx) => (
                      <div
                        key={idx}
                        className="relative w-16 h-16 overflow-hidden rounded-xl border"
                      >
                        <img
                          src={photo}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Photo Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTakePhoto(item.id)}
                disabled={uploadingImage === item.id}
                className="w-full rounded-xl border-dashed transition hover:bg-primary/5"
              >
                {uploadingImage === item.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Adicionar Foto
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <Button
          variant="outline"
          onClick={() => setCurrentSection((prev) => Math.max(0, prev - 1))}
          disabled={currentSection === 0}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Seção Anterior
        </Button>
        {currentSection === sections.length - 1 ? (
          canFinish ? (
            <Button
              onClick={handleFinish}
              className="bg-gradient-primary"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Finalizar Auditoria
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground self-center">
              {pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'}
            </span>
          )
        ) : (
          <Button
            onClick={() =>
              setCurrentSection((prev) =>
                Math.min(sections.length - 1, prev + 1)
              )
            }
          >
            Próxima Seção
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
};
