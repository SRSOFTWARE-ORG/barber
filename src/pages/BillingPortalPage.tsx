import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CreditCard, FileText, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Plan = {
  id: string;
  code: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string | null;
};

type Subscription = {
  id: string;
  company_id: string;
  plan_id: string;
  cycle: string;
  status: string;
  current_period_end: string | null;
};

type Invoice = {
  id: string;
  number: string | null;
  amount_total: number;
  currency: string;
  status: string;
  issued_at: string;
  hosted_url: string | null;
};

type PaymentMethod = {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
};

export default function BillingPortalPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [changingTo, setChangingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void load();
  }, [user?.id]);

  // Realtime: reflete mudanças via webhook (subscription, invoices, payment methods).
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`billing:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_subscriptions", filter: `company_id=eq.${companyId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_invoices", filter: `company_id=eq.${companyId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_payment_methods", filter: `company_id=eq.${companyId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId]);

  async function load() {
    setLoading(true);
    try {
      const { data: memberships } = await supabase
        .from("user_roles" as never)
        .select("company_id")
        .eq("user_id", user!.id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle<{ company_id: string }>();

      const cid = memberships?.company_id ?? null;
      setCompanyId(cid);
      if (!cid) return;

      const [sub, plansRes, inv, pm] = await Promise.all([
        supabase.from("platform_subscriptions" as never).select("*").eq("company_id", cid).in("status", ["active", "trialing", "past_due"]).order("created_at", { ascending: false }).limit(1).maybeSingle<Subscription>(),
        supabase.from("platform_plans" as never).select("id,code,name,price_monthly,price_yearly,currency").eq("is_active", true).order("price_monthly", { ascending: true }),
        supabase.from("platform_invoices" as never).select("id,number,amount_total,currency,status,issued_at,hosted_url").eq("company_id", cid).order("issued_at", { ascending: false }).limit(24),
        supabase.from("billing_payment_methods" as never).select("*").eq("company_id", cid).order("is_default", { ascending: false }),
      ]);

      setSubscription(sub.data ?? null);
      setPlans((plansRes.data as Plan[] | null) ?? []);
      setInvoices((inv.data as Invoice[] | null) ?? []);
      setMethods((pm.data as PaymentMethod[] | null) ?? []);
    } catch (e) {
      toast.error("Falha ao carregar dados de billing", { description: String((e as Error).message) });
    } finally {
      setLoading(false);
    }
  }

  async function setDefaultMethod(id: string) {
    if (!companyId) return;
    try {
      // Zera default anterior e marca o novo
      await supabase.from("billing_payment_methods" as never).update({ is_default: false } as never).eq("company_id", companyId);
      const { error } = await supabase.from("billing_payment_methods" as never).update({ is_default: true } as never).eq("id", id);
      if (error) throw error;
      toast.success("Cartão padrão atualizado");
      await load();
    } catch (e) {
      toast.error("Falha ao definir cartão padrão", { description: String((e as Error).message) });
    }
  }

  async function removeMethod(id: string) {
    try {
      const { error } = await supabase.from("billing_payment_methods" as never).delete().eq("id", id);
      if (error) throw error;
      toast.success("Cartão removido");
      await load();
    } catch (e) {
      toast.error("Falha ao remover cartão", { description: String((e as Error).message) });
    }
  }

  async function requestPlanChange(toPlanId: string, cycle: "monthly" | "yearly") {
    if (!companyId || !user?.id) return;
    setChangingTo(toPlanId);
    try {
      const { error } = await supabase.from("billing_plan_change_requests" as never).insert({
        company_id: companyId,
        requested_by: user.id,
        from_plan_id: subscription?.plan_id ?? null,
        to_plan_id: toPlanId,
        cycle,
      } as never);
      if (error) throw error;
      toast.success("Solicitação de troca enviada", { description: "Aplicada assim que o pagamento for confirmado." });
      await load();
    } catch (e) {
      toast.error("Falha ao solicitar troca", { description: String((e as Error).message) });
    } finally {
      setChangingTo(null);
    }
  }

  async function openPortalSession(provider: "stripe" | "paddle", intent: "update_card" | "manage" = "manage") {
    if (!companyId || !user?.id) return;
    try {
      const { data: session, error } = await supabase.from("billing_portal_sessions" as never).insert({
        company_id: companyId,
        user_id: user.id,
        provider,
        intent,
        return_url: window.location.href,
      } as never).select("id").single<{ id: string }>();
      if (error) throw error;
      toast.info("Gerando link do portal…", { description: "Aguarde alguns segundos." });

      // Poll até o worker preencher redirect_url (timeout 20s).
      const start = Date.now();
      const poll = async () => {
        if (Date.now() - start > 20000) return;
        const { data } = await supabase
          .from("billing_portal_sessions" as never)
          .select("redirect_url")
          .eq("id", session!.id)
          .maybeSingle<{ redirect_url: string | null }>();
        if (data?.redirect_url) {
          window.open(data.redirect_url, "_blank", "noopener,noreferrer");
          return;
        }
        setTimeout(poll, 1500);
      };
      void poll();
    } catch (e) {
      toast.error("Falha ao abrir portal", { description: String((e as Error).message) });
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader><CardTitle>Sem empresa vinculada</CardTitle></CardHeader>
          <CardContent>Você precisa ser owner de uma empresa para acessar o portal de billing.</CardContent>
        </Card>
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id);
  const money = (v: number, c = "BRL") => new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(v);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Portal de Billing</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu plano, cartões e faturas.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Assinatura atual</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {subscription ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{currentPlan?.name ?? "—"}</div>
                  <div className="text-sm text-muted-foreground">Ciclo: {subscription.cycle} • Status: <Badge variant="secondary">{subscription.status}</Badge></div>
                </div>
                {subscription.current_period_end && (
                  <div className="text-sm text-muted-foreground">
                    Renova em {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Nenhuma assinatura ativa.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Trocar de plano</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => {
              const isCurrent = p.id === subscription?.plan_id;
              return (
                <div key={p.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-semibold">{p.name}</div>
                    {isCurrent && <Badge>Atual</Badge>}
                  </div>
                  <div className="mb-4 text-2xl font-bold">
                    {p.price_monthly != null ? money(Number(p.price_monthly), p.currency ?? "BRL") : "—"}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      disabled={isCurrent || changingTo === p.id}
                      onClick={() => requestPlanChange(p.id, "monthly")}
                    >
                      {changingTo === p.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                      Escolher mensal
                    </Button>
                    {p.price_yearly != null && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isCurrent || changingTo === p.id}
                        onClick={() => requestPlanChange(p.id, "yearly")}
                      >
                        Anual — {money(Number(p.price_yearly), p.currency ?? "BRL")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {plans.length === 0 && <div className="text-sm text-muted-foreground">Nenhum plano cadastrado.</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><CreditCard className="mr-2 inline h-4 w-4" />Cartões</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {methods.length === 0 && <div className="text-sm text-muted-foreground">Nenhum cartão salvo.</div>}
          {methods.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded border p-3">
              <div className="text-sm">
                <span className="font-medium">{m.brand ?? "Cartão"}</span> •••• {m.last4 ?? "0000"}
                {m.exp_month && m.exp_year && <span className="ml-2 text-muted-foreground">exp. {String(m.exp_month).padStart(2, "0")}/{String(m.exp_year).slice(-2)}</span>}
              </div>
              <div className="flex items-center gap-2">
                {m.is_default ? (
                  <Badge variant="secondary">Padrão</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setDefaultMethod(m.id)}>Definir padrão</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => removeMethod(m.id)}>Remover</Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openPortalSession("stripe", "update_card")}>
              <CreditCard className="mr-1 h-3 w-3" />Adicionar/atualizar cartão (Stripe)
            </Button>
            <Button size="sm" variant="outline" onClick={() => openPortalSession("paddle", "update_card")}>
              <CreditCard className="mr-1 h-3 w-3" />Adicionar/atualizar cartão (Paddle)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openPortalSession("stripe", "manage")}>
              <ArrowUpRight className="mr-1 h-3 w-3" />Abrir portal completo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Os cartões e o status da assinatura são atualizados automaticamente quando o webhook do provedor for processado.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><FileText className="mr-2 inline h-4 w-4" />Faturas</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {invoices.length === 0 && <div className="py-3 text-sm text-muted-foreground">Nenhuma fatura ainda.</div>}
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-3">
                <div className="text-sm">
                  <div className="font-medium">{i.number ?? i.id.slice(0, 8)}</div>
                  <div className="text-muted-foreground">{new Date(i.issued_at).toLocaleDateString("pt-BR")}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={i.status === "paid" ? "default" : "secondary"}>{i.status}</Badge>
                  <div className="text-sm font-semibold">{money(Number(i.amount_total), i.currency)}</div>
                  {i.hosted_url && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={i.hosted_url} target="_blank" rel="noreferrer">Ver</a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
