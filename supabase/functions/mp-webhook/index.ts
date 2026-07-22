// Webhook do Mercado Pago. Recebe notificação de payment, busca o pagamento
// com o token do dono, recalcula taxas reais e atualiza payment_logs + agendamento.
// PÚBLICO (sem JWT) — MP chama direto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enqueueBarberAppointmentNotice } from "../_shared/evolution.ts";

const APP_FEE_FIXED = 0; // sinal não tem taxa da plataforma (vai direto ao barbeiro)

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  try {
    const body = await req.json().catch(() => ({}));
    // MP envia { type, data: { id } } ou query string ?topic=payment&id=...
    const url = new URL(req.url);
    const paymentId =
      body?.data?.id ||
      body?.resource?.toString().split("/").pop() ||
      url.searchParams.get("id") ||
      url.searchParams.get("data.id");
    const topic = body?.type || body?.topic || url.searchParams.get("topic");

    if (!paymentId || (topic && topic !== "payment")) {
      return new Response("ignored", { status: 200 });
    }

    // Verificação de assinatura do Mercado Pago (anti-spoofing/DoS).
    // OBRIGATÓRIA: sem o segredo configurado, rejeitamos tudo (nunca processa sem validar).
    const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("mp-webhook: MP_WEBHOOK_SECRET ausente — requisições rejeitadas");
      return new Response("webhook not configured", { status: 503 });
    }
    const valid = await verifyMpSignature(req, String(paymentId), webhookSecret);
    if (!valid) {
      console.warn("mp-webhook: assinatura inválida — requisição rejeitada");
      return new Response("invalid signature", { status: 401 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Localiza o log pelo external_reference, mas não temos ainda — preferimos
    // varrer todas as credenciais até alguma reconhecer o payment. Mais simples:
    // tentamos achar log pendente pelo payment_id (se já foi salvo via redirect),
    // ou usamos qualquer credencial cujo log "pending" exista para esse cliente.
    //
    // Estratégia: buscar todos os logs sem payment_id (recentes) e tentar match
    // via preference_id no payload retornado pelo MP. Para simplificar e dado
    // que o MP retorna external_reference=agendamento_id, usamos isso.

    // 1) Tenta com qualquer credencial ativa (vamos pegar a primeira que responda 200).
    const { data: creds } = await admin
      .from("mp_credentials")
      .select("shop_owner_id, access_token");

    if (!creds || creds.length === 0) return new Response("no-creds", { status: 200 });

    let paymentData: any = null;
    let usedShopOwner: string | null = null;
    for (const c of creds) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${c.access_token}` },
      });
      if (r.ok) {
        paymentData = await r.json();
        usedShopOwner = c.shop_owner_id;
        break;
      }
    }
    if (!paymentData) return new Response("payment-not-found", { status: 200 });

    const extRef: string = paymentData?.external_reference || "";
    const status = paymentData?.status as string;

    // ===== Pagamento de MENSALIDADE da plataforma =====
    if (extRef.startsWith("sub:") || paymentData?.metadata?.kind === "subscription") {
      const subId = paymentData?.metadata?.subscription_id || extRef.replace(/^sub:/, "");
      if (status === "approved" && subId) {
        await admin
          .from("platform_subscriptions")
          .update({
            status: "pago",
            paid_at: new Date().toISOString(),
            payment_id: String(paymentId),
            notes: `Pago via MP (${paymentData?.payment_method_id || "?"})`,
          })
          .eq("id", subId);
      }
      return new Response("sub-ok", { status: 200 });
    }

    // ===== Pagamento de uma VENDA do Marketplace =====
    if (extRef.startsWith("mkt:") || paymentData?.metadata?.kind === "marketplace") {
      const pedidoId = paymentData?.metadata?.pedido_id || extRef.replace(/^mkt:/, "");
      if (status === "approved" && pedidoId) {
        // Lê o pedido ANTES de confirmar para saber se está transitando de "pendente".
        const { data: ped } = await admin
          .from("marketplace_pedidos")
          .select("status, comprador_id, shop_owner_id, produto_nome, quantidade")
          .eq("id", pedidoId)
          .maybeSingle();
        const wasPending = ped?.status === "pendente";

        // Confirma o pedido e baixa o estoque de forma atômica/idempotente
        await admin.rpc("marketplace_confirm_order", {
          _pedido_id: pedidoId,
          _payment_id: String(paymentId),
        });

        // Só AGORA (pagamento aprovado e cobrado, split 90/10 aplicado pelo MP) abrimos
        // a conversa com o vendedor. Idempotente: só na transição pendente -> pago.
        if (wasPending && ped?.comprador_id && ped?.shop_owner_id) {
          await admin.from("mensagens").insert({
            remetente_id: ped.comprador_id,
            destinatario_id: ped.shop_owner_id,
            conteudo: `Olá! Acabei de comprar o produto "${ped.produto_nome}" (x${ped.quantidade}) e o pagamento já foi confirmado. Podemos combinar se eu retiro na loja ou você entrega? 🛍️`,
          });
        }
      } else if ((status === "rejected" || status === "cancelled") && pedidoId) {
        await admin
          .from("marketplace_pedidos")
          .update({ status: "cancelado", payment_id: String(paymentId) })
          .eq("id", pedidoId)
          .eq("status", "pendente");
      }
      return new Response("mkt-ok", { status: 200 });
    }



    const agendamentoId =
      extRef || paymentData?.metadata?.agendamento_id;
    const shopOwnerId = paymentData?.metadata?.shop_owner_id || usedShopOwner;
    const barberId = paymentData?.metadata?.barber_id || null;
    const amountTotal = Number(paymentData?.transaction_amount || 0);
    const paymentMethod = paymentData?.payment_method_id || paymentData?.payment_type_id;

    // Taxa real cobrada pelo MP
    const feeDetails: any[] = paymentData?.fee_details || [];
    const cardFee = feeDetails
      .filter((f) => f.type === "mercadopago_fee" || f.type === "discount")
      .reduce((s, f) => s + Number(f.amount || 0), 0);

    const appFee = Number(paymentData?.metadata?.app_fee ?? APP_FEE_FIXED);
    const netReceived = +(amountTotal - cardFee - appFee).toFixed(2);

    // Comissão
    let commission_type = "owner";
    let commission_value: number | null = null;
    let amount_barber = netReceived;
    let amount_shop = 0;

    if (barberId && shopOwnerId && barberId !== shopOwnerId) {
      const { data: team } = await admin
        .from("barbershop_team")
        .select("commission_type, commission_value")
        .eq("barber_id", barberId)
        .eq("shop_owner_id", shopOwnerId)
        .eq("active", true)
        .maybeSingle();
      if (team) {
        commission_type = team.commission_type;
        commission_value = Number(team.commission_value);
        amount_barber =
          team.commission_type === "percentage"
            ? +(netReceived * (commission_value / 100)).toFixed(2)
            : Math.min(commission_value, netReceived);
        amount_shop = +(netReceived - amount_barber).toFixed(2);
      }
    }

    // Atualiza ou insere log
    const { data: existing } = await admin
      .from("payment_logs")
      .select("id")
      .eq("agendamento_id", agendamentoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const logRow = {
      agendamento_id: agendamentoId,
      shop_owner_id: shopOwnerId,
      barber_id: barberId,
      payment_id: String(paymentId),
      status,
      payment_method: paymentMethod,
      amount_total: amountTotal,
      amount_app_fee: appFee,
      amount_card_fee: cardFee,
      amount_net: netReceived,
      amount_barber,
      amount_shop,
      commission_type,
      commission_value,
      payload: paymentData,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await admin.from("payment_logs").update(logRow).eq("id", existing.id);
    } else {
      await admin.from("payment_logs").insert(logRow);
    }

    // Confirma sinal no agendamento se aprovado (não fica pendente)
    if (status === "approved" && agendamentoId) {
      await admin
        .from("agendamentos")
        .update({
          sinal_pago: true,
          valor_pago: amountTotal,
          status: "confirmed",
        })
        .eq("id", agendamentoId);
      // Avisa o barbeiro no WhatsApp (organizada, sem emojis, via fila anti-ban). Idempotente.
      try {
        await enqueueBarberAppointmentNotice(String(agendamentoId));
      } catch (_e) { /* WhatsApp nunca derruba o webhook */ }
    }


    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("mp-webhook error:", e);
    return new Response("error", { status: 200 }); // sempre 200 para o MP não reentregar infinitamente
  }
});

// Valida o header x-signature do Mercado Pago via HMAC-SHA256.
// Formato: "ts=<timestamp>,v1=<hash>". Manifest assinado:
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
async function verifyMpSignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  try {
    const xSignature = req.headers.get("x-signature") || "";
    const xRequestId = req.headers.get("x-request-id") || "";
    if (!xSignature) return false;

    const parts: Record<string, string> = {};
    for (const seg of xSignature.split(",")) {
      const idx = seg.indexOf("=");
      if (idx > 0) parts[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
    }
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    // IDs alfanuméricos devem ser comparados em minúsculas (regra do MP)
    const id = /[a-zA-Z]/.test(dataId) ? dataId.toLowerCase() : dataId;
    const manifest = `id:${id};request-id:${xRequestId};ts:${ts};`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
    const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return computed === v1;
  } catch {
    return false;
  }
}
