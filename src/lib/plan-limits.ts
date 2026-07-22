// Helper para checar platform_plan_limits do plano ativo da empresa.
import { supabase } from "@/integrations/supabase/client";

export type PlanLimits = {
  planId: string | null;
  planName: string | null;
  status: string | null;
  limits: Record<string, number>; // limit_key -> limit_value (-1 = ilimitado)
};

export async function fetchActivePlanLimits(companyId: string): Promise<PlanLimits> {
  const { data: sub } = await supabase
    .from("platform_subscriptions" as never)
    .select("plan_id,status")
    .eq("company_id", companyId)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ plan_id: string; status: string }>();

  if (!sub?.plan_id) {
    return { planId: null, planName: null, status: null, limits: {} };
  }

  const [{ data: plan }, { data: rows }] = await Promise.all([
    supabase.from("platform_plans" as never).select("name").eq("id", sub.plan_id).maybeSingle<{ name: string }>(),
    supabase.from("platform_plan_limits" as never).select("limit_key,limit_value").eq("plan_id", sub.plan_id),
  ]);

  const limits: Record<string, number> = {};
  for (const r of (rows as { limit_key: string; limit_value: number }[] | null) ?? []) {
    limits[r.limit_key] = Number(r.limit_value);
  }
  return { planId: sub.plan_id, planName: plan?.name ?? null, status: sub.status, limits };
}

export async function currentUsage(companyId: string): Promise<{ units: number; barbers: number; services: number }> {
  const [u, b, s] = await Promise.all([
    supabase.from("units" as never).select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("barbers" as never).select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("services" as never).select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);
  return {
    units: u.count ?? 0,
    barbers: b.count ?? 0,
    services: s.count ?? 0,
  };
}

export function isWithinLimit(limit: number | undefined, current: number): boolean {
  if (limit === undefined) return true; // sem limite definido = livre
  if (limit < 0) return true; // -1 = ilimitado
  return current < limit;
}
