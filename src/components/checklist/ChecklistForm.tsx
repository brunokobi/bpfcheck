import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
  WifiOff,
  CloudUpload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAudits, ChecklistItemWithResult } from "@/hooks/useAudits";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { IncompleteChecklistError } from "@/lib/repo";

type AuditsHook = ReturnType<typeof useAudits>;

interface ChecklistFormProps {
  onBack: () => void;
  onSave: () => void;
  auditsHook: AuditsHook;
  isEditing?: boolean;
}

const OBSERVATION_DEBOUNCE_MS = 800;

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
    startNewAudit,
    saveItem,
    addPhoto,
    finishAudit,
    loading,
    checklistUnavailable,
  } = auditsHook;
  const { online, pending: pendingSync } = useSyncStatus();
  const isOffline = !online;

  const [currentSection, setCurrentSection] = useState(0);
  const [saving, setSaving] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  // Tudo é gravado no aparelho na hora; "salvando" só aparece durante o debounce da observação.
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());

  // Rascunho das observações enquanto o usuário digita (evita o cursor pular com a leitura reativa).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const pendingObservationSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const currentAuditRef = useRef(currentAudit);
  currentAuditRef.current = currentAudit;

  const showStartForm = !isEditing && !currentAudit;

  const persistObservation = useCallback(async (itemId: string, observation: string) => {
    const audit = currentAuditRef.current;
    if (!audit) return;
    await saveItem(audit.id, itemId, { observation });
    setDrafts(prev => {
      if (prev[itemId] !== observation) return prev; // continuou digitando
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
    setSavingItems(prev => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, [saveItem]);

  // Ao sair da tela, grava o que ainda estava no debounce (antes era descartado).
  useEffect(() => {
    const timers = pendingObservationSaves.current;
    return () => {
      timers.forEach((timeout, itemId) => {
        clearTimeout(timeout);
        const audit = currentAuditRef.current;
        const text = draftsRef.current[itemId];
        if (audit && text !== undefined) void saveItem(audit.id, itemId, { observation: text });
      });
      timers.clear();
    };
  }, [saveItem]);

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
      toast({
        title: "Auditoria iniciada",
        description: isOffline
          ? "Criada no aparelho. Será enviada quando a conexão voltar."
          : "Nova auditoria criada com sucesso.",
      });
    } catch (err) {
      const message = (err as Error)?.message === "checklist_unavailable"
        ? "O checklist ainda não foi baixado. Abra o app com internet uma vez para usar offline."
        : (err as Error)?.message || "Erro desconhecido";
      toast({ title: "Erro ao iniciar auditoria", description: message, variant: "destructive" });
    }
    setSaving(false);
  };

  const sections = checklistSections;
  const currentSectionData = sections[currentSection];
  const currentSectionItems = useMemo(
    () => (currentSectionData?.items || []).map(item =>
      drafts[item.id] !== undefined ? { ...item, observation: drafts[item.id] } : item),
    [currentSectionData, drafts],
  );

  const allItems = useMemo(() => sections.flatMap(s => s.items), [sections]);
  const progress = useMemo(
    () => allItems.length > 0 ? (allItems.filter(i => i.result !== null).length / allItems.length) * 100 : 0,
    [allItems],
  );
  const summary = useMemo(() => ({
    conforme_count: allItems.filter(i => i.result === "conforme").length,
    nao_conforme_count: allItems.filter(i => i.result === "nao_conforme").length,
    nao_aplicavel_count: allItems.filter(i => i.result === "nao_aplicavel").length,
  }), [allItems]);
  const pendingCount = useMemo(() => allItems.filter(i => i.result === null).length, [allItems]);
  const canFinish = useMemo(
    () => allItems.length > 0 && allItems.every(i => i.result !== null),
    [allItems],
  );

  const calculateSectionCompliance = (sectionItems: ChecklistItemWithResult[]) => {
    const conforme = sectionItems.filter(i => i.result === "conforme").length;
    const naoConforme = sectionItems.filter(i => i.result === "nao_conforme").length;
    const total = conforme + naoConforme;
    return total > 0 ? Math.round((conforme / total) * 100) : null;
  };

  const updateItemStatus = (itemId: string, result: ChecklistItemWithResult["result"]) => {
    if (!currentAudit) return;
    const draft = drafts[itemId];
    saveItem(currentAudit.id, itemId, draft !== undefined ? { result, observation: draft } : { result })
      .catch(err => toast({
        title: "Erro ao salvar no aparelho",
        description: (err as Error)?.message || "Erro desconhecido",
        variant: "destructive",
      }));
  };

  const updateItemObservations = useCallback((itemId: string, observation: string) => {
    setDrafts(prev => ({ ...prev, [itemId]: observation }));
    setSavingItems(prev => new Set(prev).add(itemId));
    const existing = pendingObservationSaves.current.get(itemId);
    if (existing) clearTimeout(existing);
    pendingObservationSaves.current.set(itemId, setTimeout(() => {
      pendingObservationSaves.current.delete(itemId);
      void persistObservation(itemId, observation);
    }, OBSERVATION_DEBOUNCE_MS));
  }, [persistObservation]);

  const handleTakePhoto = (itemId: string) => {
    setActiveItemId(itemId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeItemId || !currentAudit) return;

    setUploadingImage(activeItemId);
    try {
      await addPhoto(currentAudit.id, activeItemId, file);
      toast({
        title: "Foto adicionada",
        description: isOffline
          ? "Guardada no aparelho. Será enviada quando a conexão voltar."
          : "A foto está sendo enviada para a nuvem.",
      });
    } catch (err) {
      toast({
        title: "Erro ao salvar a foto",
        description: (err as Error)?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(null);
      setActiveItemId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFinish = async () => {
    if (!currentAudit) return;

    setSaving(true);
    try {
      // Garante que observações ainda no debounce entrem antes de finalizar.
      const timers = pendingObservationSaves.current;
      await Promise.all([...timers.keys()].map(itemId => {
        clearTimeout(timers.get(itemId)!);
        timers.delete(itemId);
        return persistObservation(itemId, draftsRef.current[itemId] ?? "");
      }));
      await finishAudit(currentAudit.id);
      toast({
        title: "Auditoria concluída",
        description: isOffline
          ? "Finalizada no aparelho. Será enviada quando a conexão voltar."
          : "Auditoria finalizada com sucesso!",
      });
      onSave();
    } catch (err) {
      if (err instanceof IncompleteChecklistError) {
        toast({
          title: "Checklist incompleto",
          description: `Responda todos os itens antes de finalizar (${err.answered}/${err.total} respondidos).`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao finalizar auditoria",
          description: (err as Error)?.message || "Erro desconhecido",
          variant: "destructive",
        });
      }
    }
    setSaving(false);
  };

  const getStatusColor = (result: ChecklistItemWithResult["result"]) => {
    switch (result) {
      case "conforme": return "bg-success text-success-foreground";
      case "nao_conforme": return "bg-destructive text-destructive-foreground";
      case "nao_aplicavel": return "bg-muted text-muted-foreground";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  if (checklistUnavailable) {
    return (
      <div className="space-y-4 py-20 text-center">
        <WifiOff className="w-10 h-10 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">
          O checklist desta auditoria ainda não foi baixado neste aparelho. Conecte-se à internet e tente de novo.
        </p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

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

  // Section-level derived values (extracted from inline IIFEs)
  const sectionAnswered = currentSectionItems.filter(i => i.result !== null).length;
  const sectionTotal = currentSectionItems.length;
  const sectionProgress = sectionTotal > 0 ? (sectionAnswered / sectionTotal) * 100 : 0;
  const sectionConforme = currentSectionItems.filter(i => i.result === "conforme").length;
  const sectionNaoConforme = currentSectionItems.filter(i => i.result === "nao_conforme").length;
  const sectionCompliance = calculateSectionCompliance(currentSectionItems);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto min-w-0">
          {/* No celular o Voltar vira só ícone (44px) para o título caber em uma linha. */}
          <Button variant="outline" onClick={onBack} aria-label="Voltar" className="shrink-0 h-11 w-11 p-0 sm:h-10 sm:w-auto sm:px-4">
            <ArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-3xl font-bold text-primary truncate">
                Checklist RDC 216/2004
              </h1>
              {isOffline && (
                <Badge variant="destructive" className="shrink-0 hidden sm:flex items-center gap-1 px-2 py-0.5 animate-pulse">
                  <WifiOff className="w-3 h-3" /> Offline
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm truncate">
              {currentAudit.location || "Auditoria em andamento"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {savingItems.size > 0 ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Salvando...
            </span>
          ) : pendingSync > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1" title="Salvo no aparelho, aguardando envio">
              <CloudUpload className="w-3 h-3" />
              {pendingSync} para enviar
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
              {pendingCount} {pendingCount === 1 ? "pergunta pendente" : "perguntas pendentes"}
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
              <span>{Math.round(progress)}% concluído</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground pt-2">
              <span className="text-success">
                ✓ {summary.conforme_count} conforme
              </span>
              <span className="text-destructive">
                ✗ {summary.nao_conforme_count} não conforme
              </span>
              <span>— {summary.nao_aplicavel_count} N/A</span>
            </div>

            {currentSectionData && (
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Progresso da Seção:{" "}
                    <span className="font-medium text-foreground">{currentSectionData.title}</span>
                  </span>
                  <span>{Math.round(sectionProgress)}% concluído</span>
                </div>
                <Progress value={sectionProgress} className="h-2" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-semibold text-primary">
            {currentSectionData?.title || "Seção"}
          </h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-success">✓ {sectionConforme}</span>
            <span className="text-destructive">✗ {sectionNaoConforme}</span>
            {sectionCompliance !== null && (
              <span className={`font-medium ${
                sectionCompliance >= 80
                  ? "text-success"
                  : sectionCompliance >= 50
                  ? "text-warning"
                  : "text-destructive"
              }`}>
                {sectionCompliance}% conformidade
              </span>
            )}
          </div>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentSection(prev => Math.max(0, prev - 1))}
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
            onClick={() => setCurrentSection(prev => Math.min(sections.length - 1, prev + 1))}
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
            className="rounded-2xl bg-muted/50 border border-primary/40 shadow-sm transition hover:shadow-md"
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
                  className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(item.result)}`}
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
                <Button
                  type="button"
                  onClick={() =>
                    updateItemStatus(item.id, item.result === "conforme" ? null : "conforme")
                  }
                  className={`flex items-center justify-center gap-2 rounded-xl border text-xs font-medium transition-all ${
                    item.result === "conforme"
                      ? "bg-success text-white shadow-md ring-2 ring-success/30 scale-[1.02]"
                      : "bg-background hover:bg-success/10 text-success border-success/40"
                  }`}
                >
                  ✅ Conforme
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    updateItemStatus(item.id, item.result === "nao_conforme" ? null : "nao_conforme")
                  }
                  className={`flex items-center justify-center gap-2 rounded-xl border text-xs font-medium transition-all ${
                    item.result === "nao_conforme"
                      ? "bg-destructive text-white shadow-md ring-2 ring-destructive/30 scale-[1.02]"
                      : "bg-background hover:bg-destructive/10 text-destructive border-destructive/40"
                  }`}
                >
                  ❌ Não Conforme
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    updateItemStatus(item.id, item.result === "nao_aplicavel" ? null : "nao_aplicavel")
                  }
                  className={`flex items-center justify-center gap-2 rounded-xl border text-xs font-medium transition-all ${
                    item.result === "nao_aplicavel"
                      ? "bg-muted text-foreground shadow-md ring-2 ring-muted/40 scale-[1.02]"
                      : "bg-background hover:bg-muted/40 text-muted-foreground border-muted"
                  }`}
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
                  value={item.observation ?? ""}
                  onChange={(e) => updateItemObservations(item.id, e.target.value)}
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
          onClick={() => setCurrentSection(prev => Math.max(0, prev - 1))}
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
              {pendingCount} {pendingCount === 1 ? "pendente" : "pendentes"}
            </span>
          )
        ) : (
          <Button
            onClick={() => setCurrentSection(prev => Math.min(sections.length - 1, prev + 1))}
          >
            Próxima Seção
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
};
