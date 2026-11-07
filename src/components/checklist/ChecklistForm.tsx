import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Camera,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
  WifiOff,
  CloudUpload,
  Check,
  X,
  Minus,
  MapPin,
  ClipboardCheck,
} from "lucide-react";
import { PageHero } from "@/components/layout/PageHero";
import { cn } from "@/lib/utils";
import { getChecklist } from "@/lib/repo";
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

  // Dados reais do checklist em cache para o formulário inicial.
  const [startInfo, setStartInfo] = useState<{ sections: number; items: number } | null | undefined>(undefined);
  useEffect(() => {
    if (!showStartForm) return;
    getChecklist().then(c =>
      setStartInfo(c ? { sections: c.sections.length, items: c.sections.reduce((n, s) => n + s.items.length, 0) } : null));
  }, [showStartForm]);

  // Ao trocar de seção, volta ao topo da lista.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [currentSection]);

  const RING_C = 2 * Math.PI * 30;

  if (checklistUnavailable) {
    return (
      <div>
        <PageHero title="Checklist indisponível" onBack={onBack} />
        <div className="mt-4 bg-white rounded-3xl p-6 text-center flex flex-col items-center gap-3 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
          <WifiOff className="w-10 h-10 text-amber-600" aria-hidden="true" />
          <p className="m-0 text-sm text-slate-700">
            O checklist desta auditoria ainda não foi baixado neste aparelho. Conecte-se à internet e tente de novo.
          </p>
        </div>
      </div>
    );
  }

  if (showStartForm) {
    return (
      <div>
        <PageHero eyebrow="Checklist RDC 216/2004" title="Nova auditoria" subtitle="Informe onde a auditoria será feita" onBack={onBack} overlap />
        <form
          onSubmit={e => { e.preventDefault(); void handleStartAudit(); }}
          className="bpf-pop relative -mt-12 bg-white rounded-3xl p-5 flex flex-col gap-4 shadow-[0_16px_40px_rgba(15,23,42,0.10)]"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="audit-location" className="text-[13px] font-bold text-slate-700">Local / Estabelecimento</label>
            <div className="bpf-field h-[54px] rounded-2xl border-[1.5px] border-slate-200 bg-slate-50 flex items-center gap-3 px-4 text-[15px]">
              <MapPin className="w-5 h-5 text-slate-500 shrink-0" aria-hidden="true" />
              <input
                id="audit-location" value={locationName} onChange={e => setLocationName(e.target.value)} disabled={saving}
                placeholder="Ex.: Restaurante Central" autoComplete="off"
                className="flex-1 min-w-0 h-full bg-transparent outline-none text-slate-900 placeholder:text-slate-500"
              />
            </div>
          </div>

          {startInfo === null ? (
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50 text-amber-900 text-sm">
              <WifiOff className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              O checklist ainda não foi baixado. Conecte-se à internet uma vez para poder auditar offline.
            </div>
          ) : startInfo && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-sky-50 text-sky-900 text-sm">
              <ClipboardCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span><strong>{startInfo.sections} seções</strong> · {startInfo.items} itens a avaliar</span>
            </div>
          )}
          {isOffline && startInfo && (
            <p className="m-0 text-xs text-slate-600">
              Sem internet agora: a auditoria fica salva no aparelho e é enviada sozinha quando a conexão voltar.
            </p>
          )}

          <button
            type="submit" disabled={saving || loading}
            className="bpf-tap h-14 rounded-2xl bg-[#0369A1] text-white flex items-center justify-center gap-2.5 text-base font-bold shadow-[0_10px_24px_rgba(3,105,161,0.3)] disabled:opacity-70"
          >
            {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Iniciando...</> : <>Iniciar auditoria <ArrowRight className="w-5 h-5" strokeWidth={2.5} /></>}
          </button>
        </form>
      </div>
    );
  }

  if (loading || sections.length === 0) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-[#0369A1] mx-auto" />
          <p className="text-slate-600 text-sm">Carregando checklist...</p>
        </div>
      </div>
    );
  }

  const answeredCount = allItems.length - pendingCount;
  const sectionCompliance = calculateSectionCompliance(currentSectionItems);
  const isLastSection = currentSection === sections.length - 1;

  const RESULT_OPTIONS: { value: NonNullable<ChecklistItemWithResult["result"]>; label: string; icon: typeof Check; on: string; off: string }[] = [
    { value: "conforme", label: "Conforme", icon: Check, on: "bg-green-600 border-green-600 text-white", off: "bg-green-50 border-green-100 text-green-800" },
    { value: "nao_conforme", label: "Não conforme", icon: X, on: "bg-red-600 border-red-600 text-white", off: "bg-red-50 border-red-100 text-red-800" },
    { value: "nao_aplicavel", label: "N/A", icon: Minus, on: "bg-slate-600 border-slate-600 text-white", off: "bg-slate-50 border-slate-200 text-slate-700" },
  ];

  return (
    <div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      <PageHero
        eyebrow="Checklist RDC 216/2004"
        title={currentAudit.location_name || currentAudit.location || "Auditoria"}
        subtitle={savingItems.size > 0 ? "Salvando no aparelho…" : pendingSync > 0 ? `${pendingSync} alteração(ões) a enviar` : isOffline ? "Offline · tudo salvo no aparelho" : "Tudo salvo"}
        onBack={onBack}
        overlap
        actions={isOffline ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-400 text-amber-950 text-xs font-bold">
            <WifiOff className="w-3.5 h-3.5" aria-hidden="true" /> Offline
          </span>
        ) : pendingSync > 0 ? (
          <CloudUpload className="w-5 h-5 shrink-0 text-sky-100" aria-label="Alterações a enviar" />
        ) : null}
      />

      <div className="relative -mt-12 flex flex-col gap-3">
        {/* Progresso geral (real) */}
        <section aria-label="Progresso" className="bpf-pop bg-white rounded-3xl p-4 flex items-center gap-4 shadow-[0_16px_40px_rgba(15,23,42,0.10)]" style={{ animationDelay: "60ms" }}>
          <div className="relative w-[76px] h-[76px] flex-none">
            <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90" aria-hidden="true">
              <circle cx="38" cy="38" r="30" fill="none" stroke="#E0F2FE" strokeWidth="9" />
              <circle cx="38" cy="38" r="30" fill="none" stroke="#0284C7" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - progress / 100)} className="transition-[stroke-dashoffset] duration-500" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-extrabold text-[#0369A1] tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <span className="text-[15px] font-extrabold text-slate-900">{answeredCount} de {allItems.length} respondidos</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold">
              <span className="text-green-700">✓ {summary.conforme_count} conforme</span>
              <span className="text-red-700">✗ {summary.nao_conforme_count} não conforme</span>
              <span className="text-slate-500">— {summary.nao_aplicavel_count} N/A</span>
            </div>
            {pendingCount > 0 && <span className="text-xs text-slate-600">{pendingCount} pendente{pendingCount > 1 ? "s" : ""}</span>}
          </div>
        </section>

        {/* Seções: rolagem horizontal com progresso de cada uma */}
        <nav aria-label="Seções" className="-mx-4 px-4 overflow-x-auto [scrollbar-width:none]">
          <div className="flex gap-2 w-max pb-1">
            {sections.map((s, i) => {
              const done = s.items.filter(it => it.result !== null).length;
              const complete = done === s.items.length && s.items.length > 0;
              const active = i === currentSection;
              return (
                <button
                  key={s.id} type="button" onClick={() => setCurrentSection(i)} aria-current={active ? "step" : undefined}
                  className={cn(
                    "min-h-11 px-3 rounded-2xl flex items-center gap-2 text-[13px] font-bold border-[1.5px] whitespace-nowrap",
                    active ? "bg-[#0369A1] border-[#0369A1] text-white" : "bg-white border-slate-200 text-slate-700",
                  )}
                >
                  <span className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[11px]",
                    complete ? (active ? "bg-white text-[#0369A1]" : "bg-green-100 text-green-700") : active ? "bg-white/20" : "bg-slate-100")}>
                    {complete ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="tabular-nums">{done}/{s.items.length}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Seção atual */}
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <span className="text-xs font-bold tracking-[0.06em] uppercase text-slate-500">Seção {currentSection + 1} de {sections.length}</span>
            <h2 className="m-0 text-lg font-extrabold tracking-[-0.01em] text-slate-900 leading-snug">{currentSectionData?.title}</h2>
          </div>
          {sectionCompliance !== null && (
            <span className={cn("shrink-0 mt-4 px-2.5 py-1 rounded-full text-xs font-bold",
              sectionCompliance >= 80 ? "bg-green-100 text-green-800" : sectionCompliance >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800")}>
              {sectionCompliance}%
            </span>
          )}
        </div>

        {currentSectionItems.map((item, index) => (
          <article key={item.id} className="bg-white rounded-[20px] p-4 flex flex-col gap-3 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
            <div className="flex gap-3">
              <span className="w-8 h-8 shrink-0 rounded-[10px] bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-extrabold">
                {index + 1}
              </span>
              <p className="m-0 text-[15px] font-semibold leading-snug text-slate-900">{item.description}</p>
            </div>

            <div role="radiogroup" aria-label={`Resultado do item ${index + 1}`} className="grid grid-cols-3 gap-2">
              {RESULT_OPTIONS.map(opt => {
                const on = item.result === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value} type="button" role="radio" aria-checked={on}
                    onClick={() => updateItemStatus(item.id, on ? null : opt.value)}
                    className={cn("bpf-tap min-h-14 rounded-2xl border-[1.5px] px-1 py-1.5 text-[12px] leading-tight font-bold flex flex-col items-center justify-center gap-1", on ? opt.on : opt.off)}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2.5} aria-hidden="true" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <label className="sr-only" htmlFor={`obs-${item.id}`}>Observações do item {index + 1}</label>
            <textarea
              id={`obs-${item.id}`}
              value={item.observation ?? ""}
              onChange={e => updateItemObservations(item.id, e.target.value)}
              placeholder={item.result === "nao_conforme" ? "Descreva a não conformidade…" : "Observações (opcional)"}
              rows={2}
              className="bpf-field w-full min-h-[72px] rounded-2xl border-[1.5px] border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none resize-y"
            />

            <div className="flex flex-wrap gap-2">
              {item.photos.map((photo, idx) => (
                <img key={photo} src={photo} alt={`Foto ${idx + 1} do item ${index + 1}`} className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
              ))}
              <button
                type="button" onClick={() => handleTakePhoto(item.id)} disabled={uploadingImage === item.id}
                className="w-16 h-16 rounded-xl border-[1.5px] border-dashed border-slate-300 text-slate-600 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold active:bg-slate-50 disabled:opacity-60"
                aria-label={`Adicionar foto ao item ${index + 1}`}
              >
                {uploadingImage === item.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Camera className="w-5 h-5" aria-hidden="true" /> Foto</>}
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Barra fixa de navegação entre seções / finalizar */}
      <div className="fixed inset-x-3 z-40 mx-auto max-w-2xl" style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <div className="bg-white rounded-3xl p-2 flex items-center gap-2 shadow-[0_-2px_30px_rgba(15,23,42,0.14)]">
          <button
            type="button" onClick={() => setCurrentSection(p => Math.max(0, p - 1))} disabled={currentSection === 0}
            aria-label="Seção anterior"
            className="w-12 h-12 shrink-0 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center disabled:opacity-40"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {isLastSection || canFinish ? (
            <button
              type="button" onClick={handleFinish} disabled={!canFinish || saving}
              className="bpf-tap flex-1 h-12 rounded-2xl bg-[#0369A1] text-white font-bold flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-600"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {canFinish ? "Finalizar auditoria" : `${pendingCount} pendente${pendingCount > 1 ? "s" : ""}`}
            </button>
          ) : (
            <button
              type="button" onClick={() => setCurrentSection(p => Math.min(sections.length - 1, p + 1))}
              className="bpf-tap flex-1 h-12 rounded-2xl bg-[#0369A1] text-white font-bold flex items-center justify-center gap-2"
            >
              Próxima seção <ArrowRight className="w-5 h-5" />
            </button>
          )}
          {!isLastSection && canFinish && (
            <button
              type="button" onClick={() => setCurrentSection(p => Math.min(sections.length - 1, p + 1))}
              aria-label="Próxima seção"
              className="w-12 h-12 shrink-0 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
