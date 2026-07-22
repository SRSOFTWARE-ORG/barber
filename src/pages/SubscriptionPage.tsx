import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Seo from '@/components/Seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { Check, Zap } from 'lucide-react';

interface Plan {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  features: Record<string, boolean>;
  stripe_price_id?: string | null;
}

interface CurrentSub {
  id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  provider?: string | null;
  provider_customer_id?: string | null;
}

export default function SubscriptionPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { companyId, loading: loadingCompany } = useCompanyId();
  const features = useCompanyFeatures(companyId);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<CurrentSub | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: p } = await (supabase as any)
      .from('platform_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setPlans((p as Plan[]) ?? []);

    if (companyId) {
      const { data: cs } = await (supabase as any)
        .from('company_subscriptions')
        .select('id, plan_id, status, starts_at, ends_at, trial_ends_at, current_period_end, provider, provider_customer_id')
        .eq('company_id', companyId)
        .in('status', ['trialing', 'active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setCurrent((cs as CurrentSub) ?? null);
    }
  };

  useEffect(() => { load(); }, [companyId]);

  const upgrade = async (plan: Plan) => {
    if (!companyId) { toast.error(t('subscription.no_company')); return; }
    setBusy(plan.code);
    try {
      // Se o plano tem preço no Stripe, vai pelo checkout real
      if (plan.stripe_price_id) {
        const { data, error } = await (supabase as any).functions.invoke('stripe-checkout', {
          body: { plan_id: plan.id, company_id: companyId },
        });
        if (error) throw error;
        if (data?.url) { window.location.href = data.url; return; }
        throw new Error('missing checkout url');
      }

      // Fallback manual (planos free/admin): grava direto
      await (supabase as any)
        .from('company_subscriptions')
        .update({ status: 'canceled', ends_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .in('status', ['trialing', 'active']);

      const { error } = await (supabase as any)
        .from('company_subscriptions')
        .insert({ company_id: companyId, plan_id: plan.id, status: 'active', provider: 'manual' });
      if (error) throw error;
      toast.success(t('subscription.upgraded'));
      await load();
    } catch (err: any) {
      toast.error(t('subscription.error', { msg: err?.message ?? 'unknown' }));
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    if (!companyId) return;
    setBusy('__portal');
    try {
      const { data, error } = await (supabase as any).functions.invoke('stripe-portal', {
        body: { company_id: companyId },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.message ?? 'error');
    } finally {
      setBusy(null);
    }
  };

  const fmt = (cents: number, currency: string) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency });

  const currentPlan = plans.find((p) => p.id === current?.plan_id);

  if (!user) {
    return <div className="p-6">{t('profile.loginRequired')}</div>;
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <Seo title={`${t('subscription.title')} — Barbearia`} description="Gerencie o plano da sua empresa" path="/subscription" />
      <h1 className="text-2xl font-bold">{t('subscription.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4" /> {t('subscription.current_plan')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {loadingCompany || features.loading ? (
            <span className="text-muted-foreground">{t('common.loading')}</span>
          ) : !companyId ? (
            <span className="text-muted-foreground">{t('subscription.no_company')}</span>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Badge>{(currentPlan?.name ?? features.planCode).toUpperCase()}</Badge>
                <Badge variant={current ? 'default' : 'secondary'}>
                  {current?.status === 'active' ? t('subscription.status_active')
                    : current?.status === 'trialing' ? t('subscription.status_trial')
                    : t('subscription.status_none')}
                </Badge>
              </div>
              {current?.starts_at && (
                <div className="text-muted-foreground">
                  {t('subscription.starts_at')}: {new Date(current.starts_at).toLocaleDateString()}
                </div>
              )}
              {current?.trial_ends_at && current?.status === 'trialing' && (
                <div className="text-muted-foreground">
                  Trial até: {new Date(current.trial_ends_at).toLocaleDateString()}
                </div>
              )}
              {current?.current_period_end && current?.status === 'active' && (
                <div className="text-muted-foreground">
                  Próxima cobrança: {new Date(current.current_period_end).toLocaleDateString()}
                </div>
              )}
              {current?.ends_at && (
                <div className="text-muted-foreground">
                  {t('subscription.ends_at')}: {new Date(current.ends_at).toLocaleDateString()}
                </div>
              )}
              {current?.provider === 'stripe' && current?.provider_customer_id && (
                <Button size="sm" variant="outline" disabled={busy === '__portal'} onClick={openPortal}>
                  {busy === '__portal' ? t('common.loading') : 'Gerenciar assinatura'}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-3">
        {plans.map((p) => {
          const isCurrent = current?.plan_id === p.id;
          return (
            <Card key={p.id} className={isCurrent ? 'border-primary' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{p.name}</span>
                  {isCurrent && <Badge>{t('subscription.status_active')}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold">
                  {p.price_cents === 0 ? '—' : fmt(p.price_cents, p.currency)}
                  {p.price_cents > 0 && <span className="text-sm font-normal text-muted-foreground">/mês</span>}
                </div>
                <ul className="text-sm space-y-1">
                  {Object.entries(p.features ?? {}).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-2">
                      <Check className={`w-3 h-3 ${v ? 'text-primary' : 'text-muted-foreground/40'}`} />
                      <span className={v ? '' : 'text-muted-foreground/50 line-through'}>{k}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  disabled={isCurrent || !companyId || busy !== null}
                  onClick={() => upgrade(p)}
                >
                  {busy === p.code
                    ? t('common.loading')
                    : isCurrent
                      ? t('subscription.status_active')
                      : p.code === 'premium'
                        ? t('subscription.upgrade_premium')
                        : p.code === 'pro'
                          ? t('subscription.upgrade_pro')
                          : t('premium.upgrade_cta')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
