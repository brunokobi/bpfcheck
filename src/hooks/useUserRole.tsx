import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type AppRole = 'admin' | 'user';

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole>('user');
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    if (!user) {
      setRole('user');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_user_role', {
        _user_id: user.id
      });

      if (error) {
        console.error('[useUserRole] Error fetching role:', error);
        setRole('user');
      } else {
        setRole((data as AppRole) || 'user');
      }
    } catch (err) {
      console.error('[useUserRole] Failed to fetch role:', err);
      setRole('user');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  const isAdmin = role === 'admin';

  return {
    role,
    isAdmin,
    loading,
    refetch: fetchRole,
  };
};
