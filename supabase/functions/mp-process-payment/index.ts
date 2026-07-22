// Processa o SINAL do agendamento via Mercado Pago (checkout transparente in-app).
// Suporta cartão (token gerado no client com a public key do BARBEIRO) e boleto.
// O valor é sempre lido do agendamento no servidor (nunca confiamos no client).
// O pagamento cai DIRETO na conta MP do barbeiro/dono (cada um cadastra no painel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { enqueueBarberAppointmentNotice } from "../_shared/evolution.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BodySchema = z.object({
  agendamento_id: z.string().uuid(),
  method: z.enum(["card", "boleto"]),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    const { data: ag, error: agErr } = await admin
      .from("agendamentos")
      .select("id, barbeiro_id, cliente_id, cliente_nome, cliente_sobrenome, valor_sinal, status, sinal_pago, data, hora, pix_gerado_em")
      .eq("id", b.agendamento_id)
      .maybeSingle();
    if (agErr || !ag) return json({ error: "Agendamento não encontrado" }, 404);

    // Autorização: se o agendamento pertence a um cliente cadastrado, somente esse
    // cliente (ou o barbeiro/CEO) pode iniciar o pagamento. Agendamentos anônimos
    // (sem cliente_id) permanecem pagáveis pelo fluxo público de reserva.
    if (ag.cliente_id) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const { data: userData } = token
        ? await admin.auth.getUser(token)
        : { data: { user: null } };
      const uid = userData?.user?.id || null;
      if (!uid) return json({ error: "Autenticação necessária" }, 401);
      let allowed = uid === ag.cliente_id || uid === ag.barbeiro_id;
      if (!allowed) {
        const { data: roleRows } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        allowed = (roleRows ?? []).some((r: any) => r.role === "ceo");
      }
      if (!allowed) return json({ error: "Sem permissão para este agendamento" }, 403);
    }

    if (ag.sinal_pago) return json({ error: "Sinal já foi pago" }, 409);
    if (ag.status === "cancelled") return json({ error: "Agendamento cancelado" }, 409);
    if (!ag.barbeiro_id) return json({ error: "Agendamento sem barbeiro" }, 400);



    const amount = +Number(ag.valor_sinal || 0).toFixed(2);
    if (amount <= 0) return json({ error: "Valor inválido" }, 400);

    const { data: ownerData } = await admin.rpc("get_shop_owner", { _user_id: ag.barbeiro_id });
    const shopOwnerId = (ownerData as string) || ag.barbeiro_id;

    // Resolve a credencial MP do barbeiro (ou do dono, como fallback).
    let cred: { access_token: string } | null = null;
    const { data: canOwn } = await admin.rpc("can_barber_own_mp", { _barber_id: ag.barbeiro_id });
    if (canOwn) {
      const { data: credBarber } = await admin
        .from("mp_credentials")
        .select("access_token")
        .eq("barber_id", ag.barbeiro_id)
        .maybeSingle();
      cred = (credBarber as any) || null;
    }
    if (!cred?.access_token) {
      const { data: credShop } = await admin
        .from("mp_credentials")
        .select("access_token")
        .eq("shop_owner_id", shopOwnerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      cred = (credShop as any) || null;
    }
    if (!cred?.access_token) {
      return json({ error: "O barbeiro ainda não conectou o Mercado Pago. Use PIX ou peça para ele vincular a conta." }, 409);
    }

    // SEM split no sinal: o pagamento cai INTEGRAL na conta MP do barbeiro/dono.
    // (O split da plataforma é exclusivo do Marketplace, não do sinal de agendamento.)
    const description = `Sinal de agendamento ${ag.data} ${String(ag.hora).slice(0, 5)}`;
    const paymentBody: Record<string, unknown> = {
      transaction_amount: amount,
      description,
      payment_method_id: b.payment_method_id,
      external_reference: ag.id,
      notification_url: "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-webhook",
      metadata: {
        agendamento_id: ag.id,
        shop_owner_id: shopOwnerId,
        barber_id: ag.barbeiro_id,
        in_app: true,
      },
      payer: {
        email: b.payer.email,
        first_name: b.payer.first_name || ag.cliente_nome || undefined,
        last_name: b.payer.last_name || ag.cliente_sobrenome || undefined,
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
        Authorization: `Bearer ${cred.access_token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${ag.id}-${b.method}-${b.token || "boleto"}`,
      },
      body: JSON.stringify(paymentBody),
    });
    const mp = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      return json({ error: mp?.message || "Pagamento recusado", details: mp?.cause || mp }, 502);
    }

    const status = mp?.status as string; // approved | pending | in_process | rejected
    const statusDetail = mp?.status_detail as string;
    const boletoUrl = mp?.transaction_details?.external_resource_url || null;
    const barcode = mp?.barcode?.content || mp?.point_of_interaction?.transaction_data?.ticket_url || null;

    await admin.from("payment_logs").insert({
      agendamento_id: ag.id,
      shop_owner_id: shopOwnerId,
      barber_id: ag.barbeiro_id,
      payment_id: String(mp?.id ?? ""),
      status,
      payment_method: b.method === "card" ? b.payment_method_id : "boleto",
      amount_total: amount,
      amount_app_fee: 0,
      amount_card_fee: 0,
      amount_net: amount,
      amount_barber: amount,
      amount_shop: 0,
      commission_type: "owner",
      payload: mp,
    });

    // Cartão aprovado na hora → confirma o agendamento imediatamente (não fica pendente)
    if (status === "approved") {
      await admin
        .from("agendamentos")
        .update({ sinal_pago: true, valor_pago: amount, status: "confirmed" })
        .eq("id", ag.id);
      // Avisa o barbeiro no WhatsApp (mensagem organizada, sem emojis, via fila anti-ban)
      try {
        await enqueueBarberAppointmentNotice(ag.id);
      } catch (_e) { /* nunca quebra o pagamento por causa do WhatsApp */ }
    }


    return json({
      status,
      status_detail: statusDetail,
      payment_id: mp?.id,
      boleto_url: boletoUrl,
      barcode,
      amount,
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
