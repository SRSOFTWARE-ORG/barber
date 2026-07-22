// Cria uma preferência de pagamento no Mercado Pago do ADM dono da barbearia.
// Body: { agendamento_id }
// Lê access_token do dono, calcula taxa do app (R$3) e estimativa de taxa de cartão dinâmica,
// e registra uma linha em payment_logs com status="pending".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Taxas estimadas do Mercado Pago (PT-BR, atualizar conforme negociar):
// - PIX: 0.99%
// - Cartão crédito 1x: 4.99%
// - Cartão débito: 2.99%
// Usamos a maior (crédito) como estimativa pessimista no momento da criação;
// o valor real só é conhecido no webhook.
const APP_FEE_FIXED = 3.0;
const CARD_FEE_PERCENT = 0.0499;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: clErr } = await userClient.auth.getClaims(token);
    if (clErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const agendamentoId = body?.agendamento_id;
    if (!agendamentoId) return json({ error: "agendamento_id obrigatório" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: ag, error: agErr } = await admin
      .from("agendamentos")
      .select("id, barbeiro_id, cliente_id, cliente_nome, valor_sinal, taxa_app, status, data, hora")
      .eq("id", agendamentoId)
      .maybeSingle();
    if (agErr || !ag) return json({ error: "Agendamento não encontrado" }, 404);

    // Cliente ou barbeiro do agendamento pode criar
    if (ag.cliente_id !== userId && ag.barbeiro_id !== userId) {
      return json({ error: "Sem permissão" }, 403);
    }

    // Descobre dono da barbearia
    const { data: ownerData, error: ownerErr } = await admin.rpc("get_shop_owner", {
      _user_id: ag.barbeiro_id,
    });
    if (ownerErr || !ownerData) return json({ error: "Barbearia não encontrada" }, 404);
    const shopOwnerId = ownerData as string;

    // Busca credencial: só usa a do barbeiro se ele tem permissão (allow_own_mp).
    // Caso contrário, sempre cai na conta do dono (que faz o repasse).
    let cred: { access_token: string; is_test: boolean } | null = null;
    const { data: canOwn } = await admin.rpc("can_barber_own_mp", { _barber_id: ag.barbeiro_id });
    if (canOwn) {
      const { data: credBarber } = await admin
        .from("mp_credentials")
        .select("access_token, is_test")
        .eq("barber_id", ag.barbeiro_id)
        .maybeSingle();
      cred = (credBarber as any) || null;
    }
    if (!cred?.access_token) {
      const { data: credShop } = await admin
        .from("mp_credentials")
        .select("access_token, is_test")
        .eq("shop_owner_id", shopOwnerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      cred = (credShop as any) || null;
    }
    if (!cred?.access_token) {
      return json(
        { error: "Este barbeiro ainda não conectou o Mercado Pago. Peça para ele vincular a conta em Pagamentos." },
        409
      );
    }


    const valorSinal = Number(ag.valor_sinal || 0);
    const amountTotal = +valorSinal.toFixed(2);
    if (amountTotal <= 0) return json({ error: "Valor inválido" }, 400);

    // SEM split no sinal: o valor cai INTEGRAL na conta MP conectada do dono/barbeiro.
    // (O split da plataforma é exclusivo do Marketplace.)
    const appFee = 0;

    // Comissão configurada (se barbeiro for membro de time)
    const { data: teamRow } = await admin
      .from("barbershop_team")
      .select("commission_type, commission_value")
      .eq("barber_id", ag.barbeiro_id)
      .eq("active", true)
      .maybeSingle();

    // Cria preference no MP
    // SECURITY: só aceita origens conhecidas para evitar open redirect via header Origin.
    const ALLOWED_ORIGINS = [
      "https://barber.srsoftwarestore.com",
      "https://id-preview--4cdc1317-2fef-49ff-a5f9-cbd5c43c6605.lovable.app",
      "http://localhost:8080",
    ];
    const reqOrigin = req.headers.get("origin") || "";
    const baseUrl = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : "https://barber.srsoftwarestore.com";
    const LOGO_URL = "https://barber.srsoftwarestore.com/pwa-icon-512.png";
    const prefPayload = {
      items: [
        {
          id: ag.id,
          title: `Sinal de Agendamento — Barbershop`,
          description: `Reserva do horário ${ag.data} às ${ag.hora}. Sinal de R$ ${amountTotal.toFixed(2)} para garantir seu atendimento.`,
          picture_url: LOGO_URL,
          category_id: "services",
          quantity: 1,
          unit_price: amountTotal,
          currency_id: "BRL",
        },
      ],
      payer: { name: ag.cliente_nome ?? undefined },
      external_reference: ag.id,
      back_urls: {
        success: `${baseUrl}/pagamento/${ag.id}?status=ok`,
        failure: `${baseUrl}/pagamento/${ag.id}?status=fail`,
        pending: `${baseUrl}/pagamento/${ag.id}?status=pending`,
      },
      auto_return: "approved",
      notification_url: "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-webhook",
      statement_descriptor: "BARBEARIA",
      additional_info: `Sinal de agendamento — ${ag.data} ${ag.hora}\nValor: R$ ${amountTotal.toFixed(2)}`,
      metadata: {
        agendamento_id: ag.id,
        shop_owner_id: shopOwnerId,
        barber_id: ag.barbeiro_id,
        app_fee: appFee,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cred.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prefPayload),
    });
    const mpJson = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok || !mpJson?.id) {
      return json(
        { error: `MP rejeitou: ${mpJson?.message || mpRes.status}`, details: mpJson },
        502
      );
    }

    // Estimativa pessimista para registro inicial
    const estCardFee = +(amountTotal * CARD_FEE_PERCENT).toFixed(2);
    const netEstimate = +(amountTotal - appFee - estCardFee).toFixed(2);
    let barberShare = 0;
    if (teamRow) {
      barberShare =
        teamRow.commission_type === "percentage"
          ? +(netEstimate * (Number(teamRow.commission_value) / 100)).toFixed(2)
          : Math.min(Number(teamRow.commission_value), netEstimate);
    } else {
      // Barbeiro é o próprio dono → tudo é dele
      barberShare = netEstimate;
    }
    const shopShare = +(netEstimate - barberShare).toFixed(2);

    await admin.from("payment_logs").insert({
      agendamento_id: ag.id,
      shop_owner_id: shopOwnerId,
      barber_id: ag.barbeiro_id,
      preference_id: mpJson.id,
      status: "pending",
      amount_total: amountTotal,
      amount_app_fee: appFee,
      amount_card_fee: estCardFee,
      amount_net: netEstimate,
      amount_barber: barberShare,
      amount_shop: shopShare,
      commission_type: teamRow?.commission_type ?? "owner",
      commission_value: teamRow?.commission_value ?? null,
      payload: mpJson,
    });

    return json({
      preference_id: mpJson.id,
      init_point: mpJson.init_point,
      amount_total: amountTotal,
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
