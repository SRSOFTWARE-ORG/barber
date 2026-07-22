import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyFeatures {
  companyId: string | null;
  planCode: string;
  pwaPremium: boolean;
  whatsapp: boolean;
  affiliates: boolean;
  analyticsAdvanced: boolean;
  loading: boolean;
}

const DEFAULT: CompanyFeatures = {
  companyId: null,
  planCode: 'free',
  pwaPremium: false,
  whatsapp: false,
  affiliates: false,
  analyticsAdvanced: false,
  loading: true,
};

/**
 * Lê as features liberadas para a empresa do usuário via view
 * `v_company_features` (Fase 9). Sem empresa/sem assinatura ativa → plano free.
 */
export function useCompanyFeatures(companyId?: string | null): CompanyFeatures {
  const [state, setState] = useState<CompanyFeatures>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) { setState({ ...DEFAULT, loading: false }); return; }
      const { data } = await (supabase as any)
        .from('v_company_features')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (cancelled) return;
      setState({
        companyId,
        planCode: data?.plan_code ?? 'free',
        pwaPremium: Boolean(data?.pwa_premium),
        whatsapp: Boolean(data?.whatsapp),
        affiliates: Boolean(data?.affiliates),
        analyticsAdvanced: Boolean(data?.analytics_advanced),
        loading: false,
      });
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return state;
}
