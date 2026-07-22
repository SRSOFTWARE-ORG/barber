// Cria pagamento PIX direto via MP Payments API (sem redirecionar para checkout hosted).
// Body: { subscription_id, payer_email, payer_name }
// Retorna: { payment_id, qr_code, qr_code_base64, ticket_url, amount, expires_at }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const PIX_FEE = 0.0099;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: clErr } = await userClient.auth.getClaims(token);
    if (clErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const subId = body?.subscription_id;
    const payerEmail = String(body?.payer_email || "").trim().toLowerCase();
    const payerName = String(body?.payer_name || "Cliente").trim();
    if (!subId) return json({ error: "subscription_id obrigatório" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) return json({ error: "E-mail inválido" }, 400);
    // Bloqueia pseudo-email interno
    if (payerEmail.endsWith("@barbershop.app")) {
      return json({ error: "Use um e-mail real (Gmail, Outlook, etc.) para receber o comprovante." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sub, error: subErr } = await admin
      .from("platform_subscriptions")
      .select("id, shop_owner_id, total_amount, period_month, status")
      .eq("id", subId)
      .maybeSingle();
    if (subErr || !sub) return json({ error: "Fatura não encontrada" }, 404);
    if (sub.shop_owner_id !== userId) return json({ error: "Sem permissão" }, 403);
    if (sub.status === "pago") return json({ error: "Fatura já paga" }, 409);

    const accessToken = Deno.env.get("MP_PLATFORM_ACCESS_TOKEN");
    if (!accessToken) {
      return json({ error: "MP_PLATFORM_ACCESS_TOKEN não configurado." }, 500);
    }

    const net = Number(sub.total_amount);
    const gross = +(net / (1 - PIX_FEE)).toFixed(2);

    const periodLabel = new Date(sub.period_month + "T00:00:00")
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const [first, ...rest] = payerName.split(/\s+/);
    const last = rest.join(" ") || "—";

    const idempotencyKey = `sub-${sub.id}-${Date.now()}`;
    const payPayload = {
      transaction_amount: gross,
      description: `Mensalidade Barbershop — ${periodLabel}`,
      payment_method_id: "pix",
      external_reference: `sub:${sub.id}`,
      notification_url: "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-webhook",
      payer: {
        email: payerEmail,
        first_name: first || "Cliente",
        last_name: last,
      },
      metadata: {
        kind: "subscription",
        subscription_id: sub.id,
        shop_owner_id: sub.shop_owner_id,
        method: "pix",
        net_amount: net,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payPayload),
    });
    const mpJson = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok || !mpJson?.id) {
      return json({ error: `MP rejeitou: ${mpJson?.message || mpRes.status}`, details: mpJson }, 502);
    }

    const tx = mpJson.point_of_interaction?.transaction_data || {};

    return json({
      payment_id: String(mpJson.id),
      status: mpJson.status,
      qr_code: tx.qr_code || "",
      qr_code_base64: tx.qr_code_base64 || "",
      ticket_url: tx.ticket_url || "",
      amount: gross,
      net_amount: net,
      expires_at: mpJson.date_of_expiration || null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
