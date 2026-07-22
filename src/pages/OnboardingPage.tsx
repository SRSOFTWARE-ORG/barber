import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { fetchActivePlanLimits, currentUsage, isWithinLimit, type PlanLimits } from "@/lib/plan-limits";

type Flow = {
  id: string;
  company_id: string;
  current_step: number;
  total_steps: number;
  status: string;
  data: Record<string, unknown>;
};

const STEPS: { key: string; title: string; description: string; limitKey?: keyof Usage; usageKey?: keyof Usage }[] = [
  { key: "company_profile", title: "Perfil da empresa", description: "Nome, timezone, moeda." },
  { key: "first_unit", title: "Primeira unidade", description: "Endereço da barbearia principal.", limitKey: "units", usageKey: "units" },
  { key: "first_barber", title: "Primeiro barbeiro", description: "Cadastre um profissional.", limitKey: "barbers", usageKey: "barbers" },
  { key: "services_catalog", title: "Serviços", description: "Cadastre pelo menos um serviço.", limitKey: "services", usageKey: "services" },
  { key: "payment_setup", title: "Pagamento", description: "Configure método de recebimento." },
  { key: "finish", title: "Concluído", description: "Tudo pronto para começar." },
];

type Usage = { units: number; barbers: number; services: number };

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null);
  const [usage, setUsage] = useState<Usage>({ units: 0, barbers: 0, services: 0 });

  useEffect(() => {
    if (!user?.id) return;
    void bootstrap();
  }, [user?.id]);

  async function refreshLimits(companyId: string) {
    const [pl, us] = await Promise.all([fetchActivePlanLimits(companyId), currentUsage(companyId)]);
    setPlanLimits(pl);
    setUsage(us);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      const { data: membership } = await supabase
        .from("user_roles" as never)
        .select("company_id")
        .eq("user_id", user!.id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle<{ company_id: string }>();

      if (!membership?.company_id) {
        toast.error("Você precisa ter uma empresa antes de iniciar o onboarding.");
        setLoading(false);
        return;
      }

      const { data: existing } = await supabase
        .from("onboarding_flows" as never)
        .select("*")
        .eq("company_id", membership.company_id)
        .maybeSingle<Flow>();

      if (existing) {
        setFlow(existing);
      } else {
        const { data: created, error } = await supabase
          .from("onboarding_flows" as never)
          .insert({
            company_id: membership.company_id,
            started_by: user!.id,
            total_steps: STEPS.length,
          } as never)
          .select("*")
          .single<Flow>();
        if (error) throw error;
        setFlow(created);
      }

      await refreshLimits(membership.company_id);
    } catch (e) {
      toast.error("Falha no onboarding", { description: String((e as Error).message) });
    } finally {
      setLoading(false);
    }
  }

  function stepBlockedReason(stepKey: string): string | null {
    const st = STEPS.find((s) => s.key === stepKey);
    if (!st?.limitKey || !planLimits) return null;
    const limit = planLimits.limits[st.limitKey];
    const used = usage[st.usageKey!];
    // No passo do onboarding, precisamos criar +1 item; então checamos used < limit.
    if (!isWithinLimit(limit, used)) {
      return `Seu plano ${planLimits.planName ?? ""} permite no máximo ${limit} ${st.limitKey}. Atualmente: ${used}. Faça upgrade em /billing.`;
    }
    return null;
  }

  async function advance() {
    if (!flow) return;
    const step = STEPS[flow.current_step - 1];
    const blocked = stepBlockedReason(step.key);
    if (blocked) {
      toast.error("Limite do plano atingido", { description: blocked });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("onboarding_advance" as never, {
        _flow_id: flow.id,
        _step_key: step.key,
        _payload: payload,
      } as never);
      if (error) throw error;

      const { data: updated } = await supabase
        .from("onboarding_flows" as never)
        .select("*")
        .eq("id", flow.id)
        .single<Flow>();

      setFlow(updated ?? flow);
      setPayload({});
      if (flow.company_id) await refreshLimits(flow.company_id);

      if (updated?.status === "completed") {
        toast.success("Onboarding concluído!");
        setTimeout(() => navigate("/dashboard"), 1200);
      }
    } catch (e) {
      toast.error("Falha ao avançar", { description: String((e as Error).message) });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!flow) {
    return <div className="p-6 text-sm text-muted-foreground">Onboarding indisponível.</div>;
  }

  const step = STEPS[flow.current_step - 1];
  const progress = (flow.current_step / flow.total_steps) * 100;
  const done = flow.status === "completed";
  const blockedReason = stepBlockedReason(step.key);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Configuração inicial</h1>
        <p className="text-sm text-muted-foreground">Passo {flow.current_step} de {flow.total_steps}</p>
        <Progress value={progress} className="mt-3" />
      </div>

      {done ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <div className="text-xl font-semibold">Tudo pronto!</div>
            <div className="text-sm text-muted-foreground">Você já pode usar a plataforma. Redirecionando…</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{step.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{step.description}</p>
            {planLimits?.planName && (
              <p className="text-xs text-muted-foreground">
                Plano ativo: <strong>{planLimits.planName}</strong> • Uso: {usage.units} unidades · {usage.barbers} barbeiros · {usage.services} serviços
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {blockedReason && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Limite do plano atingido</AlertTitle>
                <AlertDescription>
                  {blockedReason}{" "}
                  <button onClick={() => navigate("/billing")} className="underline">Fazer upgrade</button>
                </AlertDescription>
              </Alert>
            )}
            {step.key === "company_profile" && (
              <>
                <div><Label>Nome fantasia</Label><Input value={payload.brand ?? ""} onChange={(e) => setPayload({ ...payload, brand: e.target.value })} /></div>
                <div><Label>Timezone</Label><Input placeholder="America/Sao_Paulo" value={payload.timezone ?? ""} onChange={(e) => setPayload({ ...payload, timezone: e.target.value })} /></div>
              </>
            )}
            {step.key === "first_unit" && (
              <>
                <div><Label>Nome da unidade</Label><Input value={payload.unit_name ?? ""} onChange={(e) => setPayload({ ...payload, unit_name: e.target.value })} /></div>
                <div><Label>Cidade</Label><Input value={payload.city ?? ""} onChange={(e) => setPayload({ ...payload, city: e.target.value })} /></div>
              </>
            )}
            {step.key === "first_barber" && (
              <div><Label>Nome do barbeiro</Label><Input value={payload.barber_name ?? ""} onChange={(e) => setPayload({ ...payload, barber_name: e.target.value })} /></div>
            )}
            {step.key === "services_catalog" && (
              <>
                <div><Label>Nome do serviço</Label><Input value={payload.service_name ?? ""} onChange={(e) => setPayload({ ...payload, service_name: e.target.value })} /></div>
                <div><Label>Preço (R$)</Label><Input type="number" value={payload.service_price ?? ""} onChange={(e) => setPayload({ ...payload, service_price: e.target.value })} /></div>
              </>
            )}
            {step.key === "payment_setup" && (
              <div className="text-sm text-muted-foreground">Você pode configurar isso depois em <button onClick={() => navigate("/billing")} className="underline">Billing</button>.</div>
            )}
            {step.key === "finish" && (
              <div className="text-sm">Clique em concluir para finalizar.</div>
            )}
            <Button onClick={advance} disabled={submitting || !!blockedReason} className="w-full">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {flow.current_step === flow.total_steps ? "Concluir" : "Continuar"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
