import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Resolve o company_id principal do usuário logado.
 * Fontes (em ordem de prioridade):
 *   1. `user_roles.company_id` (tabela oficial do multi-tenant Fase 1)
 *   2. `platform_admins` → primeira empresa ativa (super-admin vê tudo)
 *   3. `profiles.company_id` (fallback se existir)
 * Retorna null enquanto carrega ou quando o usuário não está em empresa nenhuma.
 */
export function useCompanyId(): { companyId: string | null; loading: boolean } {
  const { user, role } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setCompanyId(null); setLoading(false); return; }
      setLoading(true);
      try {
        // 1) user_roles
        const { data: roles } = await (supabase as any)
          .from('user_roles')
          .select('company_id, role')
          .eq('user_id', user.id)
          .not('company_id', 'is', null)
          .limit(1);
        const roleCompany = roles?.[0]?.company_id;
        if (roleCompany) {
          if (!cancelled) setCompanyId(roleCompany);
          return;
        }

        // 2) platform admin → primeira empresa ativa
        if (role === 'ceo' || role === 'admin') {
          const { data: comp } = await (supabase as any)
            .from('companies')
            .select('id')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!cancelled && comp?.id) { setCompanyId(comp.id); return; }
        }

        // 3) profiles.company_id (se existir a coluna)
        const { data: prof } = await (supabase as any)
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .maybeSingle();
        if (!cancelled) setCompanyId((prof as any)?.company_id ?? null);
      } catch {
        if (!cancelled) setCompanyId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, role]);

  return { companyId, loading };
}
