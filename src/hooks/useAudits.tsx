import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import {
  Audit,
  AuditItem,
  Checklist,
  ChecklistSection,
  ChecklistItem,
  getAudits,
  getAuditById,
  createAudit,
  updateAudit,
  completeAudit,
  getAuditItems,
  saveAuditItems,
  saveAuditTransaction,
  getDefaultChecklist,
  getChecklistWithSections,
  getDashboardStats,
  getRecentAudits,
  updateAuditSummary,
  getAuditLocations,
  createAuditLocation,
  getAuditImagesForAudit,
  AuditLocation,
} from '@/lib/supabase-service';

export interface AuditWithDetails extends Audit {
  compliance?: number;
  location_name?: string;
}

export interface ChecklistItemWithResult extends ChecklistItem {
  result: 'conforme' | 'nao_conforme' | 'nao_aplicavel' | null;
  observation: string;
  photos: string[];
}

export interface SectionWithItems extends ChecklistSection {
  items: ChecklistItemWithResult[];
}

interface DashboardStats {
  totalAudits: number;
  pendingAudits: number;
  completedAudits: number;
  complianceRate: number;
}

export const useAudits = () => {
  const { toast } = useToast();
  const { isOnline, saveForSync, saveOfflineAudit, getOfflineAudits } = useOfflineStorage();

  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState<AuditWithDetails[]>([]);
  const [currentAudit, setCurrentAudit] = useState<Audit | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalAudits: 0,
    pendingAudits: 0,
    completedAudits: 0,
    complianceRate: 0,
  });
  const [locations, setLocations] = useState<AuditLocation[]>([]);
  const [defaultChecklist, setDefaultChecklist] = useState<Checklist | null>(null);
  const [checklistSections, setChecklistSections] = useState<SectionWithItems[]>([]);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    if (!isOnline) {
      console.log('[Offline] Using cached stats');
      return;
    }

    const { data, error } = await getDashboardStats();
    if (error) {
      console.error('[useAudits] Failed to fetch stats:', error);
      toast({
        title: 'Erro ao carregar estatísticas',
        description: error,
        variant: 'destructive',
      });
      return;
    }

    if (data) {
      setStats(data);
    }
  }, [isOnline, toast]);

  // Fetch recent audits
  const fetchRecentAudits = useCallback(async (limit = 10) => {
    if (!isOnline) {
      console.log('[Offline] Using cached audits');
      const offlineAudits = await getOfflineAudits();
      setAudits(offlineAudits as unknown as AuditWithDetails[]);
      return;
    }

    setLoading(true);
    const { data, error } = await getRecentAudits(limit);
    setLoading(false);

    if (error) {
      console.error('[useAudits] Failed to fetch audits:', error);
      toast({
        title: 'Erro ao carregar auditorias',
        description: error,
        variant: 'destructive',
      });
      return;
    }

    if (data) {
      setAudits(data);
    }
  }, [isOnline, toast, getOfflineAudits]);

  // Fetch all audits
  const fetchAllAudits = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getAudits();
    setLoading(false);

    if (error) {
      console.error('[useAudits] Failed to fetch all audits:', error);
      return;
    }

    if (data) {
      setAudits(data);
    }
  }, []);

  // Fetch locations
  const fetchLocations = useCallback(async () => {
    const { data, error } = await getAuditLocations();
    if (error) {
      console.error('[useAudits] Failed to fetch locations:', error);
      return;
    }
    if (data) {
      setLocations(data);
    }
  }, []);

  // Load default checklist
  const loadDefaultChecklist = useCallback(async (): Promise<Checklist | null> => {
    const { data, error } = await getDefaultChecklist();
    if (error) {
      console.error('[useAudits] Failed to load default checklist:', error);
      toast({
        title: 'Erro ao carregar checklist',
        description: error,
        variant: 'destructive',
      });
      return null;
    }
    
    if (data) {
      setDefaultChecklist(data);
    }
    return data;
  }, [toast]);

  // Load checklist with sections and items
  const loadChecklistWithItems = useCallback(async (checklistId: string): Promise<SectionWithItems[]> => {
    const { data, error } = await getChecklistWithSections(checklistId);
    if (error) {
      console.error('[useAudits] Failed to load checklist items:', error);
      toast({
        title: 'Erro ao carregar itens do checklist',
        description: error,
        variant: 'destructive',
      });
      return [];
    }

    if (data) {
      const sectionsWithResults: SectionWithItems[] = data.sections.map(section => ({
        ...section,
        items: section.items.map(item => ({
          ...item,
          result: null,
          observation: '',
          photos: [],
        })),
      }));
      setChecklistSections(sectionsWithResults);
      return sectionsWithResults;
    }
    return [];
  }, [toast]);

  // Start new audit using transactional RPC
  const startNewAudit = useCallback(async (locationName?: string, locationId?: string): Promise<Audit | null> => {
    setLoading(true);

    // Load default checklist first
    let checklist = defaultChecklist;
    if (!checklist) {
      checklist = await loadDefaultChecklist();
    }

    if (!checklist) {
      setLoading(false);
      toast({
        title: 'Erro',
        description: 'Nenhum checklist padrão encontrado.',
        variant: 'destructive',
      });
      return null;
    }

    if (isOnline) {
      // Use transactional RPC to create audit + location atomically
      const { data: auditId, error } = await saveAuditTransaction({
        checklistId: checklist.id,
        location: locationName || null,
        locationId: locationId || null,
        items: [],
        finalize: false,
      });

      if (error || !auditId) {
        setLoading(false);
        toast({
          title: 'Erro ao criar auditoria',
          description: error || 'Falha ao criar auditoria',
          variant: 'destructive',
        });
        return null;
      }

      // Fetch the created audit
      const { data: audit, error: fetchError } = await getAuditById(auditId);
      setLoading(false);

      if (fetchError || !audit) {
        toast({
          title: 'Erro ao carregar auditoria',
          description: fetchError || 'Auditoria não encontrada',
          variant: 'destructive',
        });
        return null;
      }

      setCurrentAudit(audit);
      await loadChecklistWithItems(checklist.id);
      toast({
        title: 'Auditoria iniciada',
        description: 'Nova auditoria criada com sucesso.',
      });
      return audit;
    } else {
      // Offline mode - create local audit
      const offlineAudit: Record<string, unknown> = {
        id: `offline_${Date.now()}`,
        checklist_id: checklist.id,
        location: locationName,
        location_id: locationId,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        _offline: true,
      };

      await saveOfflineAudit(offlineAudit);
      await saveForSync('audits', 'insert', offlineAudit as Record<string, unknown>);
      
      setLoading(false);
      setCurrentAudit(offlineAudit as unknown as Audit);
      await loadChecklistWithItems(checklist.id);
      
      toast({
        title: 'Auditoria criada offline',
        description: 'Será sincronizada quando voltar online.',
      });
      
      return offlineAudit as unknown as Audit;
    }
  }, [defaultChecklist, loadDefaultChecklist, loadChecklistWithItems, isOnline, saveOfflineAudit, saveForSync, toast]);

  // Save audit items
  const saveItems = useCallback(async (
    auditId: string, 
    items: { checklist_item_id: string; result: string | null; observation: string | null }[]
  ): Promise<boolean> => {
    if (!isOnline) {
      // Save offline
      for (const item of items) {
        await saveForSync('audit_items', 'insert', {
          audit_id: auditId,
          ...item,
        });
      }
      toast({
        title: 'Itens salvos offline',
        description: 'Serão sincronizados quando voltar online.',
      });
      return true;
    }

    const { error } = await saveAuditItems(auditId, items);
    if (error) {
      toast({
        title: 'Erro ao salvar itens',
        description: error,
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }, [isOnline, saveForSync, toast]);

  // Complete audit with summary using transactional RPC
  const finishAudit = useCallback(async (
    auditId: string,
    summary: { conforme_count: number; nao_conforme_count: number; nao_aplicavel_count: number },
    items: { checklist_item_id: string; result: string | null; observation: string | null }[] = []
  ): Promise<boolean> => {
    if (!isOnline) {
      await saveForSync('audits', 'update', {
        id: auditId,
        status: 'completed',
        finished_at: new Date().toISOString(),
      });
      await saveForSync('audit_summary', 'insert', {
        audit_id: auditId,
        ...summary,
      });
      toast({
        title: 'Auditoria finalizada offline',
        description: 'Será sincronizada quando voltar online.',
      });
      return true;
    }

    // Use transactional RPC that saves items + summary + marks completed atomically
    const { data, error } = await saveAuditTransaction({
      auditId,
      items,
      finalize: true,
    });

    if (error) {
      // Parse special error messages
      if (error.includes('checklist_incomplete')) {
        const match = error.match(/checklist_incomplete:(\d+)\/(\d+)/);
        const answered = match ? match[1] : '?';
        const total = match ? match[2] : '?';
        toast({
          title: 'Checklist incompleto',
          description: `Responda todos os itens antes de finalizar (${answered}/${total} respondidos).`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro ao finalizar auditoria',
          description: error,
          variant: 'destructive',
        });
      }
      return false;
    }

    toast({
      title: 'Auditoria concluída',
      description: 'Auditoria finalizada com sucesso!',
    });

    // Refresh data
    await fetchStats();
    await fetchRecentAudits();

    setCurrentAudit(null);
    return true;
  }, [isOnline, saveForSync, fetchStats, fetchRecentAudits, toast]);

  // Add new location
  const addLocation = useCallback(async (name: string, address?: string, city?: string, state?: string): Promise<AuditLocation | null> => {
    const { data, error } = await createAuditLocation({ name, address: address || null, city: city || null, state: state || null });
    if (error) {
      toast({
        title: 'Erro ao criar local',
        description: error,
        variant: 'destructive',
      });
      return null;
    }
    
    if (data) {
      setLocations(prev => [...prev, data]);
      return data;
    }
    return null;
  }, [toast]);

  // Load audit for editing
  const loadAudit = useCallback(async (auditId: string): Promise<boolean> => {
    setLoading(true);
    
    const { data: audit, error } = await getAuditById(auditId);
    if (error || !audit) {
      setLoading(false);
      toast({
        title: 'Erro ao carregar auditoria',
        description: error || 'Auditoria não encontrada',
        variant: 'destructive',
      });
      return false;
    }

    setCurrentAudit(audit);

    // Load checklist items
    await loadChecklistWithItems(audit.checklist_id);

    // Load existing audit items and images
    const { data: existingItems } = await getAuditItems(auditId);
    const { data: imagesByItemId } = await getAuditImagesForAudit(auditId);
    
    if (existingItems && existingItems.length > 0) {
      // Create a map from checklist_item_id to audit_item for quick lookup
      const auditItemMap = new Map(existingItems.map(ei => [ei.checklist_item_id, ei]));
      
      // Update sections with existing results and photos
      setChecklistSections(prev => prev.map(section => ({
        ...section,
        items: section.items.map(item => {
          const existing = auditItemMap.get(item.id);
          if (existing) {
            // Get photos for this audit_item from the images map
            const photos = imagesByItemId?.[existing.id] || [];
            return {
              ...item,
              result: existing.result as 'conforme' | 'nao_conforme' | 'nao_aplicavel' | null,
              observation: existing.observation || '',
              photos,
            };
          }
          return item;
        }),
      })));
    }

    setLoading(false);
    return true;
  }, [loadChecklistWithItems, toast]);

  // Initialize data
  useEffect(() => {
    if (isOnline) {
      fetchStats();
      fetchRecentAudits();
      fetchLocations();
      loadDefaultChecklist();
    }
  }, [isOnline, fetchStats, fetchRecentAudits, fetchLocations, loadDefaultChecklist]);

  return {
    // State
    loading,
    audits,
    currentAudit,
    stats,
    locations,
    defaultChecklist,
    checklistSections,
    
    // Actions
    fetchStats,
    fetchRecentAudits,
    fetchAllAudits,
    fetchLocations,
    startNewAudit,
    loadAudit,
    saveItems,
    finishAudit,
    addLocation,
    loadChecklistWithItems,
    setChecklistSections,
    setCurrentAudit,
  };
};
