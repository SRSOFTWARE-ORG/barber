import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Resolve o company_id do usuário logado usando o schema REAL.
 * Ordem oficial:
 *   1. barbers.profile_id = auth.uid()   → barbers.company_id
 *   2. clients.profile_id = auth.uid()   → clients.company_id
 *   3. companies.owner_id = auth.uid()   → companies.id
 *
 * NÃO usa: profiles.company_id, user_roles.company_id, companies.is_active
 * (essas colunas não existem no schema).
 */
export async function resolveCompanyIdForUser(userId: string): Promise<string | null> {
  // 1) barbers
  const { data: barber } = await (supabase as any)
    .from('barbers')
    .select('company_id')
    .eq('profile_id', userId)
    .not('company_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (barber?.company_id) return barber.company_id as string;

  // 2) clients
  const { data: client } = await (supabase as any)
    .from('clients')
    .select('company_id')
    .eq('profile_id', userId)
    .not('company_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (client?.company_id) return client.company_id as string;

  // 3) companies.owner_id
  const { data: owned } = await (supabase as any)
    .from('companies')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned?.id) return owned.id as string;

  return null;
}

export function useCompanyId(): { companyId: string | null; loading: boolean } {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setCompanyId(null); setLoading(false); return; }
      setLoading(true);
      try {
        const cid = await resolveCompanyIdForUser(user.id);
        if (!cancelled) {
          setCompanyId(cid);
          console.log('Resolved company:', cid);
        }
      } catch (err) {
        console.warn('[useCompanyId] failed to resolve company:', err);
        if (!cancelled) setCompanyId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { companyId, loading };
}
