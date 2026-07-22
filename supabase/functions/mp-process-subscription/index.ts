// Processa a MENSALIDADE da plataforma (fatura) via checkout transparente in-app.
// Suporta cartão (token gerado no client com a public key da PLATAFORMA) e boleto.
// O valor é sempre lido da fatura no servidor (nunca confiamos no client) e processado
// na conta MP da PLATAFORMA. Ao aprovar, marca a fatura como paga na hora.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";

const BodySchema = z.object({
  subscription_id: z.string().uuid(),
  method: z.enum(["card", "boleto"]),
  card_kind: z.enum(["credit", "debit"]).optional(),
  token: z.string().min(1).max(200).optional(),
  payment_method_id: z.string().min(1).max(60),
  installments: z.number().int().min(1).max(12).optional(),
  issuer_id: z.string().max(60).optional(),
  payer: z.object({
    email: z.string().email().max(160),
    first_name: z.string().max(80).optional(),
    last_name: z.string().max(80).optional(),
    identification_type: z.string().max(20).optional(),
    identification_number: z.string().max(30).optional(),
  }),
});

// Juros do MP por tipo, usado para "gross-up" (cliente paga o juros).
const FEES = { credit: 0.0499, debit: 0.0299, boleto: 0.0349 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const accessToken = Deno.env.get("MP_PLATFORM_ACCESS_TOKEN");
    if (!accessToken) return json({ error: "Plataforma sem credencial de pagamento" }, 500);

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

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const b = parsed.data;
    if (b.method === "card" && !b.token) return json({ error: "Token do cartão ausente" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: sub, error: subErr } = await admin
      .from("platform_subscriptions")
      .select("id, shop_owner_id, total_amount, period_month, status, team_count")
      .eq("id", b.subscription_id)
      .maybeSingle();
    if (subErr || !sub) return json({ error: "Fatura não encontrada" }, 404);
    if (sub.shop_owner_id !== userId) return json({ error: "Sem permissão" }, 403);
    if (sub.status === "pago") return json({ error: "Fatura já paga" }, 409);

    const net = +Number(sub.total_amount || 0).toFixed(2);
    if (net <= 0) return json({ error: "Valor inválido" }, 400);

    const feeKind = b.method === "boleto" ? "boleto" : (b.card_kind || "credit");
    const fee = FEES[feeKind as keyof typeof FEES] ?? FEES.credit;
    const gross = +(net / (1 - fee)).toFixed(2);

    const periodLabel = new Date(sub.period_month + "T00:00:00")
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const paymentBody: Record<string, unknown> = {
      transaction_amount: gross,
      description: `Mensalidade Barbershop — ${periodLabel}`,
      payment_method_id: b.payment_method_id,
      external_reference: `sub:${sub.id}`,
      notification_url: "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-webhook",
      metadata: {
        kind: "subscription",
        subscription_id: sub.id,
        shop_owner_id: sub.shop_owner_id,
        net_amount: net,
        in_app: true,
      },
      payer: {
        email: b.payer.email,
        first_name: b.payer.first_name || undefined,
        last_name: b.payer.last_name || undefined,
        identification:
          b.payer.identification_type && b.payer.identification_number
            ? { type: b.payer.identification_type, number: b.payer.identification_number }
            : undefined,
      },
    };

    if (b.method === "card") {
      paymentBody.token = b.token;
      paymentBody.installments = b.installments || 1;
      if (b.issuer_id) paymentBody.issuer_id = b.issuer_id;
    }

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${sub.id}-${b.method}-${b.token || "boleto"}`,
      },
      body: JSON.stringify(paymentBody),
    });
    const mp = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      return json({ error: mp?.message || "Pagamento recusado", details: mp?.cause || mp }, 502);
    }

    const status = mp?.status as string;
    const statusDetail = mp?.status_detail as string;
    const boletoUrl = mp?.transaction_details?.external_resource_url || null;

    if (status === "approved") {
      await admin
        .from("platform_subscriptions")
        .update({ status: "pago", paid_at: new Date().toISOString(), payment_id: String(mp?.id ?? "") })
        .eq("id", sub.id);
    }

    return json({
      status,
      status_detail: statusDetail,
      payment_id: mp?.id,
      boleto_url: boletoUrl,
      net,
      amount: gross,
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
