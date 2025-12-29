import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { 
  Camera, 
  Save, 
  ArrowLeft, 
  ArrowRight, 
  Loader2, 
  CheckCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SectionWithItems, ChecklistItemWithResult } from "@/hooks/useAudits";
import { uploadAuditImage } from "@/lib/supabase-service";

// Define the type for auditsHook
type AuditsHook = {
  currentAudit: any;
  checklistSections: SectionWithItems[];
  setChecklistSections: React.Dispatch<React.SetStateAction<SectionWithItems[]>>;
  startNewAudit: (locationName?: string, locationId?: string) => Promise<any>;
  saveItems: (auditId: string, items: { checklist_item_id: string; result: string | null; observation: string | null }[]) => Promise<boolean>;
  finishAudit: (auditId: string, summary: { conforme_count: number; nao_conforme_count: number; nao_aplicavel_count: number }, items?: { checklist_item_id: string; result: string | null; observation: string | null }[]) => Promise<boolean>;
  loading: boolean;
};

interface ChecklistFormProps {
  onBack: () => void;
  onSave: () => void;
  auditsHook: AuditsHook;
  isEditing?: boolean;
}

export const ChecklistForm = ({ onBack, onSave, auditsHook, isEditing = false }: ChecklistFormProps) => {
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

  // Determine if we need to show the "start audit" form
  // Show form when: not editing AND no current audit loaded
  const showStartForm = !isEditing && !currentAudit;

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
    const audit = await startNewAudit(locationName.trim());
    setSaving(false);

    // After starting, the currentAudit will be set in auditsHook
    // so showStartForm will automatically become false
  };

  const sections = checklistSections;
  const currentSectionData = sections[currentSection];
  const currentSectionItems = currentSectionData?.items || [];

  const calculateProgress = () => {
    const allItems = sections.flatMap(s => s.items);
    const completedItems = allItems.filter(item => item.result !== null).length;
    return allItems.length > 0 ? (completedItems / allItems.length) * 100 : 0;
  };

  const calculateSummary = () => {
    const allItems = sections.flatMap(s => s.items);
    return {
      conforme_count: allItems.filter(i => i.result === 'conforme').length,
      nao_conforme_count: allItems.filter(i => i.result === 'nao_conforme').length,
      nao_aplicavel_count: allItems.filter(i => i.result === 'nao_aplicavel').length,
    };
  };

  const updateItemStatus = (itemId: string, result: ChecklistItemWithResult["result"]) => {
    setChecklistSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item =>
        item.id === itemId ? { ...item, result } : item
      ),
    })));
  };

  const updateItemObservations = (itemId: string, observation: string) => {
    setChecklistSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item =>
        item.id === itemId ? { ...item, observation } : item
      ),
    })));
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
      // Upload image with audit context
      const { data: imageUrl, error } = await uploadAuditImage(file, currentAudit.id, activeItemId);
      
      if (error) {
        toast({
          title: "Erro ao enviar imagem",
          description: error,
          variant: "destructive",
        });
      } else if (imageUrl) {
        // Update local state with the image
        setChecklistSections(prev => prev.map(section => ({
          ...section,
          items: section.items.map(item =>
            item.id === activeItemId 
              ? { ...item, photos: [...item.photos, imageUrl] } 
              : item
          ),
        })));

        toast({
          title: "Imagem enviada",
          description: "Foto adicionada com sucesso.",
        });
      }
    } catch (err) {
      console.error('[ChecklistForm] Image upload error:', err);
      toast({
        title: "Erro",
        description: "Falha ao enviar imagem.",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(null);
      setActiveItemId(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    if (!currentAudit) return;

    setSaving(true);

    // Prepare items for saving
    const allItems = sections.flatMap(s => s.items);
    const itemsToSave = allItems
      .filter(item => item.result !== null)
      .map(item => ({
        checklist_item_id: item.id,
        result: item.result,
        observation: item.observation || null,
      }));

    const success = await saveItems(currentAudit.id, itemsToSave);
    setSaving(false);

    if (success) {
      toast({
        title: "Progresso salvo",
        description: "Seus dados foram salvos com sucesso.",
      });
    }
  };

  const handleFinish = async () => {
    if (!currentAudit) return;

    const summary = calculateSummary();

    setSaving(true);

    // Prepare all items to save
    const allItems = sections.flatMap(s => s.items);
    const itemsToSave = allItems
      .filter(item => item.result !== null)
      .map(item => ({
        checklist_item_id: item.id,
        result: item.result,
        observation: item.observation || null,
      }));

    // Use transactional finalize that saves items + summary + marks completed atomically
    const success = await finishAudit(currentAudit.id, summary, itemsToSave);
    
    if (success) {
      onSave();
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
            <p className="text-muted-foreground">Preencha os dados para iniciar</p>
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
              <label className="text-sm font-medium">Local / Estabelecimento *</label>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">Checklist RDC 216/2004</h1>
            <p className="text-muted-foreground text-sm">
              {currentAudit.location || 'Auditoria em andamento'}
            </p>
          </div>
        </div>
        <div className="flex space-x-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            onClick={handleSave} 
            disabled={saving}
            className="flex-1 sm:flex-none"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar
          </Button>
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
              <span>
                — {calculateSummary().nao_aplicavel_count} N/A
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-lg sm:text-xl font-semibold text-primary">
          {currentSectionData?.title || 'Seção'}
        </h2>
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
          <Card key={item.id} className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <CardTitle className="text-base">Item {index + 1}</CardTitle>
                  <CardDescription className="mt-1 text-sm">{item.description}</CardDescription>
                </div>
                <Badge className={getStatusColor(item.result)}>
                  {item.result === "conforme" ? "Conforme" :
                   item.result === "nao_conforme" ? "Não Conforme" :
                   item.result === "nao_aplicavel" ? "N/A" : "Pendente"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Options */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={item.result === "conforme" ? "default" : "outline"}
                  size="sm"
                  className={item.result === "conforme" ? "bg-success hover:bg-success/90" : ""}
                  onClick={() => updateItemStatus(item.id, item.result === "conforme" ? null : "conforme")}
                >
                  ✓ Conforme
                </Button>
                <Button
                  variant={item.result === "nao_conforme" ? "default" : "outline"}
                  size="sm"
                  className={item.result === "nao_conforme" ? "bg-destructive hover:bg-destructive/90" : ""}
                  onClick={() => updateItemStatus(item.id, item.result === "nao_conforme" ? null : "nao_conforme")}
                >
                  ✗ Não Conf.
                </Button>
                <Button
                  variant={item.result === "nao_aplicavel" ? "default" : "outline"}
                  size="sm"
                  className={item.result === "nao_aplicavel" ? "bg-muted text-muted-foreground" : ""}
                  onClick={() => updateItemStatus(item.id, item.result === "nao_aplicavel" ? null : "nao_aplicavel")}
                >
                  — N/A
                </Button>
              </div>

              {/* Observations */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  value={item.observation}
                  onChange={(e) => updateItemObservations(item.id, e.target.value)}
                  placeholder="Adicione observações relevantes..."
                  className="min-h-[60px] text-sm"
                />
              </div>

              {/* Photos */}
              {item.photos.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fotos ({item.photos.length})</label>
                  <div className="flex flex-wrap gap-2">
                    {item.photos.map((photo, idx) => (
                      <div key={idx} className="relative w-16 h-16">
                        <img 
                          src={photo} 
                          alt={`Foto ${idx + 1}`} 
                          className="w-full h-full object-cover rounded-md"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTakePhoto(item.id)}
                className="w-full"
                disabled={uploadingImage === item.id}
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
