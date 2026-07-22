// Cria preferência MP na conta do CEO para pagar a mensalidade da plataforma.
// Body: { subscription_id }. O total é "gross-up" com 4,99% para cobrir o pior juros do MP (cartão crédito).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Juros do Mercado Pago por método. O usuário escolhe o método e o juros do método é aplicado.
const METHOD_FEES: Record<string, number> = {
  pix: 0.0099,
  debit: 0.0299,
  credit: 0.0499,
  boleto: 0.0349,
};

// Restrições MP — exclui todos os tipos exceto o escolhido.
// Tipos MP: credit_card, debit_card, ticket (boleto), bank_transfer (pix), atm
// Tipos MP válidos para excluded_payment_types:
// credit_card, debit_card, prepaid_card, ticket, bank_transfer, atm, digital_currency, digital_wallet
const ALL_TYPES = ["credit_card", "debit_card", "prepaid_card", "ticket", "bank_transfer", "atm", "digital_currency", "digital_wallet"];
const METHOD_KEEP: Record<string, string[]> = {
  pix:    ["bank_transfer"],
  debit:  ["debit_card"],
  credit: ["credit_card"],
  boleto: ["ticket"],
};
const METHOD_EXCLUDES: Record<string, string[]> = Object.fromEntries(
  Object.entries(METHOD_KEEP).map(([k, keep]) => [k, ALL_TYPES.filter((t) => !keep.includes(t))])
);

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
    const method = String(body?.method || "credit").toLowerCase();
    if (!subId) return json({ error: "subscription_id obrigatório" }, 400);
    if (!METHOD_FEES[method]) return json({ error: "Método inválido" }, 400);

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
      return json(
        { error: "MP_PLATFORM_ACCESS_TOKEN não configurado. Avise o suporte." },
        500,
      );
    }

    const net = Number(sub.total_amount);
    const fee = METHOD_FEES[method];
    // gross-up: depois do MP descontar o juros do método, sobra exatamente o net
    const gross = +(net / (1 - fee)).toFixed(2);
    const feePortion = +(gross - net).toFixed(2);

    // SECURITY: só aceita origens conhecidas para evitar open redirect via header Origin.
    const ALLOWED_ORIGINS = [
      "https://barber.srsoftwarestore.com",
      "https://id-preview--4cdc1317-2fef-49ff-a5f9-cbd5c43c6605.lovable.app",
      "http://localhost:8080",
    ];
    const reqOrigin = req.headers.get("origin") || "";
    const PUBLIC_URL = "https://barber.srsoftwarestore.com";
    const baseUrl = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : PUBLIC_URL;
    const LOGO_URL = `${PUBLIC_URL}/pwa-icon-512.png`;
    const periodLabel = new Date(sub.period_month + "T00:00:00")
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const prefPayload: Record<string, unknown> = {
      items: [{
        id: `sub-${sub.id}`,
        title: `Mensalidade Barbershop — ${periodLabel}`,
        description: `Assinatura mensal da plataforma. Inclui ${sub.team_count ?? ""} barbeiro(s). Pagamento via ${method.toUpperCase()}.`.trim(),
        picture_url: LOGO_URL,
        category_id: "services",
        quantity: 1,
        unit_price: gross,
        currency_id: "BRL",
      }],
      external_reference: `sub:${sub.id}`,
      back_urls: {
        success: `${baseUrl}/fatura?status=ok`,
        failure: `${baseUrl}/fatura?status=fail`,
        pending: `${baseUrl}/fatura?status=pending`,
      },
      auto_return: "approved",
      notification_url: "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-webhook",
      statement_descriptor: "BARBERSHOP",
      binary_mode: false,
      payment_methods: {
        excluded_payment_types: METHOD_EXCLUDES[method].map((id) => ({ id })),
        installments: method === "credit" ? 12 : 1,
        default_installments: 1,
      },
      additional_info: `Mensalidade Barbershop App — ${periodLabel}\nSubtotal: R$ ${net.toFixed(2)}\nJuros MP (${method}): R$ ${feePortion.toFixed(2)}\nTotal: R$ ${gross.toFixed(2)}`,
      metadata: {
        kind: "subscription",
        subscription_id: sub.id,
        shop_owner_id: sub.shop_owner_id,
        method,
        net_amount: net,
        fee_amount: feePortion,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prefPayload),
    });
    const mpJson = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok || !mpJson?.id) {
      return json({ error: `MP rejeitou: ${mpJson?.message || mpRes.status}`, details: mpJson }, 502);
    }

    return json({
      preference_id: mpJson.id,
      init_point: mpJson.init_point,
      sandbox_init_point: mpJson.sandbox_init_point,
      net_amount: net,
      fee_amount: feePortion,
      total_amount: gross,
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
