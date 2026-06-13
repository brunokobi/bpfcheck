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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SectionWithItems, ChecklistItemWithResult } from "@/hooks/useAudits";
import { uploadAuditImage } from "@/lib/supabase-service";
import { db } from "./db";

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
  // Per-item saving state: only blocks the item being saved
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Refs for stable access inside async callbacks/timeouts
  const blobUrlsRef = useRef<string[]>([]);
  const sectionsRef = useRef(checklistSections);
  const currentAuditRef = useRef(currentAudit);
  const pendingObservationSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevOfflineRef = useRef<boolean | null>(null);

  useEffect(() => { sectionsRef.current = checklistSections; }, [checklistSections]);
  useEffect(() => { currentAuditRef.current = currentAudit; }, [currentAudit]);

  // Revoke all blob URLs and clear pending debounces on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      pendingObservationSaves.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const showStartForm = !isEditing && !currentAudit;

  // Process the offline sync queue when connectivity is restored
  const processSyncQueue = useCallback(async () => {
    const pendingItems = await db.syncQueue
      .where("status")
      .anyOf(["pending", "processing"])
      .toArray();
    if (pendingItems.length === 0) return;

    let synced = 0;
    for (const item of pendingItems) {
      await db.syncQueue.update(item.id!, { status: "processing" });
      try {
        if (item.action === "UPLOAD_IMAGE") {
          const { auditId, itemId, file, localUrl } = item.payload as {
            auditId: string;
            itemId: string;
            file: File;
            localUrl: string;
          };
          const { data: imageUrl, error } = await uploadAuditImage(file, auditId, itemId);
          if (error) throw new Error(typeof error === "string" ? error : "Upload failed");

          if (imageUrl && localUrl) {
            URL.revokeObjectURL(localUrl);
            blobUrlsRef.current = blobUrlsRef.current.filter(u => u !== localUrl);
            setChecklistSections(prev =>
              prev.map(section => ({
                ...section,
                items: section.items.map(i => {
                  if (i.id !== itemId) return i;
                  return { ...i, photos: (i.photos || []).map(p => p === localUrl ? imageUrl : p) };
                }),
              }))
            );
          }

          await db.syncQueue.delete(item.id!);
          synced++;
        }
      } catch {
        await db.syncQueue.update(item.id!, {
          status: "failed",
          retryCount: (item.retryCount || 0) + 1,
        });
      }
    }

    if (synced > 0) {
      toast({
        title: "Sincronização concluída",
        description: `${synced} ${synced === 1 ? "item enviado" : "itens enviados"} para a nuvem.`,
      });
    }
  }, [setChecklistSections, toast]);

  // Trigger sync on mount (if already online) and on every offline→online transition
  useEffect(() => {
    const wasOffline = prevOfflineRef.current;
    prevOfflineRef.current = isOffline;
    if (!isOffline && (wasOffline === true || wasOffline === null)) {
      processSyncQueue();
    }
  }, [isOffline, processSyncQueue]);

  const autoSaveItem = useCallback(async (
    itemId: string,
    result: string | null,
    observation: string | null,
  ) => {
    if (!currentAudit || !result) return;

    setSavingItems(prev => new Set(prev).add(itemId));
    try {
      const success = await saveItems(currentAudit.id, [{
        checklist_item_id: itemId,
        result,
        observation,
      }]);

      if (!success) {
        toast({
          title: isOffline ? "Salvo localmente" : "Falha ao salvar automaticamente",
          description: isOffline
            ? "O item será sincronizado quando a conexão voltar."
            : `O item não pôde ser salvo. (item_id: ${itemId})`,
          // No destructive variant for offline local saves — those are expected
          variant: isOffline ? undefined : "destructive",
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
      setSavingItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }, [currentAudit, saveItems, toast, isOffline]);

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

  // Memoize expensive flatMap operations — each previously recalculated independently on every render
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

  const updateItemStatus = (
    itemId: string,
    result: ChecklistItemWithResult["result"],
  ) => {
    const currentItem = sections.flatMap(s => s.items).find(i => i.id === itemId);

    setChecklistSections(prev =>
      prev.map(section => ({
        ...section,
        items: section.items.map(item =>
          item.id === itemId ? { ...item, result } : item
        ),
      }))
    );

    if (result !== null) {
      autoSaveItem(itemId, result, currentItem?.observation || null);
    }
  };

  // Debounced: updates local state immediately, auto-saves 1.5s after last keystroke
  const updateItemObservations = useCallback((itemId: string, observation: string) => {
    setChecklistSections(prev =>
      prev.map(section => ({
        ...section,
        items: section.items.map(item =>
          item.id === itemId ? { ...item, observation } : item
        ),
      }))
    );

    const existing = pendingObservationSaves.current.get(itemId);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(async () => {
      pendingObservationSaves.current.delete(itemId);
      const audit = currentAuditRef.current;
      if (!audit) return;
      const currentItem = sectionsRef.current.flatMap(s => s.items).find(i => i.id === itemId);
      if (!currentItem?.result) return;

      setSavingItems(prev => new Set(prev).add(itemId));
      try {
        await saveItems(audit.id, [{
          checklist_item_id: itemId,
          result: currentItem.result,
          observation,
        }]);
      } finally {
        setSavingItems(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    }, 1500);

    pendingObservationSaves.current.set(itemId, timeout);
  }, [setChecklistSections, saveItems]);

  const handleTakePhoto = (itemId: string) => {
    setActiveItemId(itemId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeItemId || !currentAudit) return;

    setUploadingImage(activeItemId);

    try {
      if (isOffline) {
        const localUrl = URL.createObjectURL(file);
        blobUrlsRef.current.push(localUrl);

        await db.syncQueue.add({
          action: "UPLOAD_IMAGE",
          // localUrl stored so the sync worker can swap it for the real URL later
          payload: { auditId: currentAudit.id, itemId: activeItemId, file, localUrl },
          createdAt: new Date().toISOString(),
          status: "pending",
        });

        setChecklistSections(prev =>
          prev.map(section => ({
            ...section,
            items: section.items.map(item =>
              item.id === activeItemId
                ? { ...item, photos: [...(item.photos || []), localUrl] }
                : item
            ),
          }))
        );

        toast({
          title: "Foto salva no dispositivo",
          description: "Será enviada para a nuvem quando a conexão voltar.",
        });
        return;
      }

      const { data: imageUrl, error } = await uploadAuditImage(
        file,
        currentAudit.id,
        activeItemId,
      );

      if (error) {
        toast({
          title: "Erro ao enviar imagem",
          description: `Falha no upload: ${error}`,
          variant: "destructive",
        });
      } else if (imageUrl) {
        setChecklistSections(prev =>
          prev.map(section => ({
            ...section,
            items: section.items.map(item =>
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFinish = async () => {
    if (!currentAudit) return;

    setSaving(true);
    const itemsToSave = allItems
      .filter(item => item.result !== null)
      .map(item => ({
        checklist_item_id: item.id,
        result: item.result,
        observation: item.observation || null,
      }));

    try {
      const success = await finishAudit(currentAudit.id, summary, itemsToSave);
      if (success) onSave();
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
      case "conforme": return "bg-success text-success-foreground";
      case "nao_conforme": return "bg-destructive text-destructive-foreground";
      case "nao_aplicavel": return "bg-muted text-muted-foreground";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

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
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-primary">
                Checklist RDC 216/2004
              </h1>
              {isOffline && (
                <Badge variant="destructive" className="flex items-center gap-1 px-2 py-0.5 animate-pulse">
                  <WifiOff className="w-3 h-3" /> Offline
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {currentAudit.location || "Auditoria em andamento"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {savingItems.size > 0 && (
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
                  disabled={savingItems.has(item.id)}
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
                  disabled={savingItems.has(item.id)}
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
                  disabled={savingItems.has(item.id)}
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
