// Checkout do Marketplace de produtos físicos via Mercado Pago COM split 90/10.
// A plataforma fica com a taxa (marketplace_fee) e o restante vai para a conta MP
// conectada do vendedor (Barbearia/CEO). O valor é sempre lido do servidor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { getPlatformSplitPercent, computeSplit } from "../_shared/split.ts";

const BodySchema = z.object({
  produto_id: z.string().uuid(),
  quantidade: z.number().int().min(1).max(50).default(1),
  comprador: z.object({
    nome: z.string().max(120).optional(),
    telefone: z.string().max(30).optional(),
    email: z.string().email().max(160),
  }),
});

const ALLOWED_ORIGINS = [
      "https://barber.srsoftwarestore.com",
      "https://id-preview--4cdc1317-2fef-49ff-a5f9-cbd5c43c6605.lovable.app",
      "http://localhost:8080",
    ];

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
    const buyerId = claims.claims.sub as string;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const b = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: prod, error: prodErr } = await admin
      .from("marketplace_produtos")
      .select("id, shop_owner_id, nome, preco, estoque, ativo")
      .eq("id", b.produto_id)
      .maybeSingle();
    if (prodErr || !prod) return json({ error: "Produto não encontrado" }, 404);
    if (!prod.ativo) return json({ error: "Produto indisponível" }, 409);
    if (Number(prod.estoque) < b.quantidade) {
      return json({ error: "Estoque insuficiente" }, 409);
    }

    const valorUnitario = +Number(prod.preco || 0).toFixed(2);
    const valorTotal = +(valorUnitario * b.quantidade).toFixed(2);
    if (valorTotal <= 0) return json({ error: "Valor inválido" }, 400);

    // Credencial MP do vendedor (a venda cai na conta dele; a plataforma fica com o split)
    const { data: cred } = await admin
      .from("mp_credentials")
      .select("access_token")
      .or(`barber_id.eq.${prod.shop_owner_id},shop_owner_id.eq.${prod.shop_owner_id}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!(cred as any)?.access_token) {
      return json({ error: "O vendedor ainda não conectou o Mercado Pago." }, 409);
    }
    const accessToken = (cred as any).access_token as string;

    // Split 90/10 (configurável): EXCLUSIVO do marketplace.
    const splitPercent = await getPlatformSplitPercent(admin);
    const { platformFee, sellerNet } = computeSplit(valorTotal, splitPercent);

    // Cria o pedido como pendente
    const { data: pedido, error: pedErr } = await admin
      .from("marketplace_pedidos")
      .insert({
        produto_id: prod.id,
        produto_nome: prod.nome,
        shop_owner_id: prod.shop_owner_id,
        comprador_id: buyerId,
        comprador_nome: b.comprador.nome || null,
        comprador_telefone: b.comprador.telefone || null,
        quantidade: b.quantidade,
        valor_unitario: valorUnitario,
        valor_total: valorTotal,
        amount_app_fee: platformFee,
        amount_net: sellerNet,
        status: "pendente",
      })
      .select("id")
      .single();
    if (pedErr || !pedido) return json({ error: "Erro ao criar pedido" }, 500);

    const reqOrigin = req.headers.get("origin") || "";
    const baseUrl = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];

    const prefPayload = {
      items: [
        {
          id: prod.id,
          title: prod.nome,
          description: `Compra no Marketplace — retirada na loja`,
          quantity: b.quantidade,
          unit_price: valorUnitario,
          currency_id: "BRL",
        },
      ],
      payer: { name: b.comprador.nome ?? undefined, email: b.comprador.email },
      external_reference: `mkt:${pedido.id}`,
      back_urls: {
        success: `${baseUrl}/marketplace?status=ok`,
        failure: `${baseUrl}/marketplace?status=fail`,
        pending: `${baseUrl}/marketplace?status=pending`,
      },
      auto_return: "approved",
      notification_url: "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-webhook",
      statement_descriptor: "BARBEARIA",
      // Split: a plataforma fica com a taxa; o restante vai para a conta do vendedor.
      marketplace_fee: platformFee > 0 ? platformFee : undefined,
      metadata: {
        kind: "marketplace",
        pedido_id: pedido.id,
        shop_owner_id: prod.shop_owner_id,
        split_percent: splitPercent,
        platform_fee: platformFee,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(prefPayload),
    });
    const mpJson = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok || !mpJson?.id) {
      // Cancela o pedido pendente para não sujar o feed
      await admin.from("marketplace_pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
      return json({ error: `MP rejeitou: ${mpJson?.message || mpRes.status}`, details: mpJson }, 502);
    }

    await admin
      .from("marketplace_pedidos")
      .update({ preference_id: mpJson.id })
      .eq("id", pedido.id);

    return json({
      pedido_id: pedido.id,
      preference_id: mpJson.id,
      init_point: mpJson.init_point,
      valor_total: valorTotal,
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
