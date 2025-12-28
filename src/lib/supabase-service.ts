import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

// Types based on database schema
export type Audit = Database['public']['Tables']['audits']['Row'];
export type AuditInsert = Database['public']['Tables']['audits']['Insert'];
export type AuditItem = Database['public']['Tables']['audit_items']['Row'];
export type AuditItemInsert = Database['public']['Tables']['audit_items']['Insert'];
export type AuditLocation = Database['public']['Tables']['audit_locations']['Row'];
export type AuditSummary = Database['public']['Tables']['audit_summary']['Row'];
export type Checklist = Database['public']['Tables']['checklists']['Row'];
export type ChecklistSection = Database['public']['Tables']['checklist_sections']['Row'];
export type ChecklistItem = Database['public']['Tables']['checklist_items']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

// Error handling helper
interface SupabaseResult<T> {
  data: T | null;
  error: string | null;
}

const handleError = (error: unknown, context: string): string => {
  const message = error instanceof Error ? error.message : 'Erro desconhecido';
  console.error(`[Supabase Error - ${context}]:`, error);
  return message;
};

// ============ AUTH HELPERS ============

export const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('[Auth Error]:', error);
    return null;
  }
  return user?.id || null;
};

export const requireAuth = async (): Promise<string> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Usuário não autenticado. Faça login para continuar.');
  }
  return userId;
};

// ============ PROFILES ============

export const getProfile = async (): Promise<SupabaseResult<Profile>> => {
  try {
    const userId = await requireAuth();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getProfile') };
  }
};

export const updateProfile = async (updates: Partial<Profile>): Promise<SupabaseResult<Profile>> => {
  try {
    const userId = await requireAuth();
    
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'updateProfile') };
  }
};

// ============ CHECKLISTS ============

export const getChecklists = async (): Promise<SupabaseResult<Checklist[]>> => {
  try {
    await requireAuth();
    
    const { data, error } = await supabase
      .from('checklists')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getChecklists') };
  }
};

export const getDefaultChecklist = async (): Promise<SupabaseResult<Checklist>> => {
  try {
    await requireAuth();
    
    const { data, error } = await supabase
      .from('checklists')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getDefaultChecklist') };
  }
};

export const getChecklistWithSections = async (checklistId: string): Promise<SupabaseResult<{
  checklist: Checklist;
  sections: (ChecklistSection & { items: ChecklistItem[] })[];
}>> => {
  try {
    await requireAuth();
    
    const { data: checklist, error: checklistError } = await supabase
      .from('checklists')
      .select('*')
      .eq('id', checklistId)
      .single();

    if (checklistError) throw checklistError;

    const { data: sections, error: sectionsError } = await supabase
      .from('checklist_sections')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('order_index');

    if (sectionsError) throw sectionsError;

    const sectionsWithItems = await Promise.all(
      (sections || []).map(async (section) => {
        const { data: items, error: itemsError } = await supabase
          .from('checklist_items')
          .select('*')
          .eq('section_id', section.id)
          .order('order_index');

        if (itemsError) throw itemsError;
        return { ...section, items: items || [] };
      })
    );

    return { data: { checklist, sections: sectionsWithItems }, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getChecklistWithSections') };
  }
};

// ============ AUDITS ============

export const getAudits = async (): Promise<SupabaseResult<Audit[]>> => {
  try {
    const userId = await requireAuth();
    
    const { data, error } = await supabase
      .from('audits')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getAudits') };
  }
};

export const getAuditById = async (auditId: string): Promise<SupabaseResult<Audit>> => {
  try {
    const userId = await requireAuth();
    
    const { data, error } = await supabase
      .from('audits')
      .select('*')
      .eq('id', auditId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getAuditById') };
  }
};

export const createAudit = async (checklistId: string, location?: string, locationId?: string): Promise<SupabaseResult<Audit>> => {
  try {
    const userId = await requireAuth();
    
    const auditData: AuditInsert = {
      user_id: userId,
      checklist_id: checklistId,
      location: location || null,
      location_id: locationId || null,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    };

    console.log('[Supabase] Creating audit with data:', auditData);

    const { data, error } = await supabase
      .from('audits')
      .insert(auditData)
      .select()
      .single();

    if (error) {
      console.error('[RLS Error] Failed to create audit:', error);
      throw error;
    }

    console.log('[Supabase] Audit created successfully:', data);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'createAudit') };
  }
};

export const updateAudit = async (auditId: string, updates: Partial<Audit>): Promise<SupabaseResult<Audit>> => {
  try {
    const userId = await requireAuth();
    
    const { data, error } = await supabase
      .from('audits')
      .update(updates)
      .eq('id', auditId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[RLS Error] Failed to update audit:', error);
      throw error;
    }
    
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'updateAudit') };
  }
};

export const completeAudit = async (auditId: string): Promise<SupabaseResult<Audit>> => {
  return updateAudit(auditId, {
    status: 'completed',
    finished_at: new Date().toISOString(),
  });
};

// ============ AUDIT ITEMS ============

export const getAuditItems = async (auditId: string): Promise<SupabaseResult<AuditItem[]>> => {
  try {
    await requireAuth();
    
    const { data, error } = await supabase
      .from('audit_items')
      .select('*')
      .eq('audit_id', auditId);

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getAuditItems') };
  }
};

export const upsertAuditItem = async (item: AuditItemInsert): Promise<SupabaseResult<AuditItem>> => {
  try {
    await requireAuth();
    
    console.log('[Supabase] Upserting audit item:', item);

    const { data, error } = await supabase
      .from('audit_items')
      .upsert(item, { onConflict: 'audit_id,checklist_item_id' })
      .select()
      .single();

    if (error) {
      console.error('[RLS Error] Failed to upsert audit item:', error);
      throw error;
    }

    console.log('[Supabase] Audit item saved:', data);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'upsertAuditItem') };
  }
};

export const saveAuditItems = async (auditId: string, items: Omit<AuditItemInsert, 'audit_id'>[]): Promise<SupabaseResult<AuditItem[]>> => {
  try {
    await requireAuth();

    console.log('[Supabase] Saving audit items via transaction:', items.length, 'items');

    const { data, error } = await supabase.rpc('save_audit_transaction', {
      p_audit_id: auditId,
      p_items: items.map(item => ({
        checklist_item_id: item.checklist_item_id,
        result: item.result || null,
        observation: item.observation || null,
      })),
      p_finalize: false,
    });

    if (error) {
      console.error('[RLS Error] Failed to save audit items:', error);
      throw error;
    }

    console.log('[Supabase] Audit items saved successfully via transaction');
    // Return empty array since the RPC doesn't return items
    return { data: [], error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'saveAuditItems') };
  }
};

// Transactional save for audit with optional finalize
export const saveAuditTransaction = async (params: {
  auditId?: string | null;
  checklistId?: string | null;
  location?: string | null;
  locationId?: string | null;
  items?: { checklist_item_id: string; result: string | null; observation: string | null }[];
  finalize?: boolean;
}): Promise<SupabaseResult<string>> => {
  try {
    await requireAuth();

    console.log('[Supabase] Executing save_audit_transaction:', {
      auditId: params.auditId,
      itemCount: params.items?.length || 0,
      finalize: params.finalize,
    });

    const { data, error } = await supabase.rpc('save_audit_transaction', {
      p_audit_id: params.auditId || null,
      p_checklist_id: params.checklistId || null,
      p_location: params.location || null,
      p_location_id: params.locationId || null,
      p_items: params.items || [],
      p_finalize: params.finalize || false,
    });

    if (error) {
      console.error('[RLS Error] save_audit_transaction failed:', error);
      throw error;
    }

    console.log('[Supabase] save_audit_transaction completed, audit_id:', data);
    return { data: data as string, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'saveAuditTransaction') };
  }
};

// ============ AUDIT SUMMARY ============

export const getAuditSummary = async (auditId: string): Promise<SupabaseResult<AuditSummary>> => {
  try {
    await requireAuth();
    
    const { data, error } = await supabase
      .from('audit_summary')
      .select('*')
      .eq('audit_id', auditId)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getAuditSummary') };
  }
};

export const updateAuditSummary = async (auditId: string, summary: {
  conforme_count: number;
  nao_conforme_count: number;
  nao_aplicavel_count: number;
}): Promise<SupabaseResult<AuditSummary>> => {
  try {
    await requireAuth();
    
    const { data, error } = await supabase
      .from('audit_summary')
      .upsert({
        audit_id: auditId,
        ...summary,
        last_updated: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[RLS Error] Failed to update audit summary:', error);
      throw error;
    }
    
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'updateAuditSummary') };
  }
};

// ============ AUDIT LOCATIONS ============

export const getAuditLocations = async (): Promise<SupabaseResult<AuditLocation[]>> => {
  try {
    const userId = await requireAuth();
    
    const { data, error } = await supabase
      .from('audit_locations')
      .select('*')
      .eq('user_id', userId)
      .order('name');

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getAuditLocations') };
  }
};

export const createAuditLocation = async (location: Omit<AuditLocation, 'id' | 'created_at' | 'user_id'>): Promise<SupabaseResult<AuditLocation>> => {
  try {
    const userId = await requireAuth();
    
    const { data, error } = await supabase
      .from('audit_locations')
      .insert({
        ...location,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[RLS Error] Failed to create location:', error);
      throw error;
    }
    
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'createAuditLocation') };
  }
};

// ============ IMAGES ============

export const uploadAuditImage = async (
  file: File, 
  auditId: string, 
  checklistItemId: string
): Promise<SupabaseResult<string>> => {
  try {
    const userId = await requireAuth();
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${auditId}/${Date.now()}.${fileExt}`;

    console.log('[Supabase] Uploading image:', fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audit-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[Storage Error] Failed to upload image:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('audit-images')
      .getPublicUrl(uploadData.path);

    // First ensure the audit_item exists via RPC (uses same constraint)
    const { data: auditItem, error: itemError } = await supabase
      .from('audit_items')
      .upsert({
        audit_id: auditId,
        checklist_item_id: checklistItemId,
      }, { onConflict: 'audit_id,checklist_item_id' })
      .select()
      .single();

    if (itemError) {
      console.error('[RLS Error] Failed to upsert audit item:', itemError);
      throw itemError;
    }

    // Save image reference to database (uses unique constraint to prevent duplicates)
    const { error: dbError } = await supabase
      .from('audit_item_images')
      .upsert({
        audit_item_id: auditItem.id,
        image_url: publicUrl,
      }, { onConflict: 'audit_item_id,image_url' });

    if (dbError) {
      console.error('[RLS Error] Failed to save image reference:', dbError);
      throw dbError;
    }

    console.log('[Supabase] Image uploaded and saved:', publicUrl);
    return { data: publicUrl, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'uploadAuditImage') };
  }
};

export const getAuditItemImages = async (auditItemId: string): Promise<SupabaseResult<string[]>> => {
  try {
    await requireAuth();
    
    const { data, error } = await supabase
      .from('audit_item_images')
      .select('image_url')
      .eq('audit_item_id', auditItemId);

    if (error) throw error;
    return { data: data?.map(img => img.image_url) || [], error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getAuditItemImages') };
  }
};

// ============ STATS ============

export const getDashboardStats = async (isAdmin = false): Promise<SupabaseResult<{
  totalAudits: number;
  pendingAudits: number;
  completedAudits: number;
  complianceRate: number;
}>> => {
  try {
    const userId = await requireAuth();
    
    // Get audits based on role
    let query = supabase.from('audits').select('id, status');
    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }
    
    const { data: audits, error } = await query;

    if (error) throw error;

    const totalAudits = audits?.length || 0;
    const completedAudits = audits?.filter(a => a.status === 'completed').length || 0;
    const pendingAudits = audits?.filter(a => a.status === 'in_progress').length || 0;

    // Calculate average compliance rate from completed audits
    let complianceRate = 0;
    if (completedAudits > 0) {
      const completedAuditIds = audits
        ?.filter(a => a.status === 'completed')
        .map(a => a.id) || [];

      if (completedAuditIds.length > 0) {
        const { data: summaries } = await supabase
          .from('audit_summary')
          .select('*')
          .in('audit_id', completedAuditIds);

        if (summaries && summaries.length > 0) {
          const totalCompliance = summaries.reduce((acc, s) => {
            const total = (s.conforme_count || 0) + (s.nao_conforme_count || 0);
            if (total > 0) {
              return acc + ((s.conforme_count || 0) / total) * 100;
            }
            return acc;
          }, 0);
          complianceRate = Math.round(totalCompliance / summaries.length);
        }
      }
    }

    return {
      data: { totalAudits, pendingAudits, completedAudits, complianceRate },
      error: null,
    };
  } catch (error) {
    return { data: null, error: handleError(error, 'getDashboardStats') };
  }
};

export const getRecentAudits = async (limit = 5, isAdmin = false): Promise<SupabaseResult<(Audit & { 
  compliance?: number;
  location_name?: string;
})[]>> => {
  try {
    const userId = await requireAuth();
    
    let query = supabase
      .from('audits')
      .select(`
        *,
        audit_locations(name)
      `)
      .order('started_at', { ascending: false })
      .limit(limit);
    
    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }
    
    const { data: audits, error } = await query;

    if (error) throw error;

    // Get summaries for compliance calculation
    const auditIds = audits?.map(a => a.id) || [];
    const { data: summaries } = await supabase
      .from('audit_summary')
      .select('*')
      .in('audit_id', auditIds);

    const auditsWithCompliance = (audits || []).map(audit => {
      const summary = summaries?.find(s => s.audit_id === audit.id);
      let compliance: number | undefined;
      
      if (summary) {
        const total = (summary.conforme_count || 0) + (summary.nao_conforme_count || 0);
        if (total > 0) {
          compliance = Math.round(((summary.conforme_count || 0) / total) * 100);
        }
      }

      return {
        ...audit,
        compliance,
        location_name: (audit as any).audit_locations?.name || audit.location,
      };
    });

    return { data: auditsWithCompliance, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getRecentAudits') };
  }
};

// Get audit by ID (for admins too)
export const getAuditByIdAdmin = async (auditId: string): Promise<SupabaseResult<Audit>> => {
  try {
    await requireAuth();
    
    const { data, error } = await supabase
      .from('audits')
      .select('*')
      .eq('id', auditId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleError(error, 'getAuditByIdAdmin') };
  }
};
