// Retorna a public key correta para o checkout transparente in-app.
// - Sem corpo (ou kind=subscription): public key da PLATAFORMA (mensalidade).
// - Com agendamento_id: public key da conta MP do BARBEIRO/dono (sinal do agendamento
//   cai direto na conta do barbeiro). Public keys são publicáveis com segurança.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const platformKey = Deno.env.get("MP_PLATFORM_PUBLIC_KEY") || "";

  let agendamentoId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    agendamentoId = body?.agendamento_id ?? null;
  } catch {
    agendamentoId = null;
  }

  // Mensalidade / plataforma
  if (!agendamentoId) {
    return json({ public_key: platformKey, source: "platform" });
  }

  // Sinal de agendamento → public key do barbeiro/dono
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: ag } = await admin
      .from("agendamentos")
      .select("barbeiro_id")
      .eq("id", agendamentoId)
      .maybeSingle();
    if (!ag?.barbeiro_id) return json({ public_key: null, source: "none" }, 200);

    const { data: ownerData } = await admin.rpc("get_shop_owner", { _user_id: ag.barbeiro_id });
    const shopOwnerId = (ownerData as string) || ag.barbeiro_id;

    let pk: string | null = null;
    const { data: canOwn } = await admin.rpc("can_barber_own_mp", { _barber_id: ag.barbeiro_id });
    if (canOwn) {
      const { data: credBarber } = await admin
        .from("mp_credentials")
        .select("public_key")
        .eq("barber_id", ag.barbeiro_id)
        .maybeSingle();
      pk = (credBarber as any)?.public_key || null;
    }
    if (!pk) {
      const { data: credShop } = await admin
        .from("mp_credentials")
        .select("public_key")
        .eq("shop_owner_id", shopOwnerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      pk = (credShop as any)?.public_key || null;
    }
    return json({ public_key: pk, source: pk ? "barber" : "none" });
  } catch (e) {
    return json({ public_key: null, source: "error", error: String(e) }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
