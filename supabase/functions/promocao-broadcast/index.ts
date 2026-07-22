// Envia uma promoção recém-criada para clientes vinculados ao barbeiro. Requer admin/ceo dono da promoção.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { admin, getConfig } from '../_shared/evolution.ts';
import { requireRole, errorResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { user, userRoles } = await requireRole(req, ['admin', 'ceo']);
    const { promocao_id } = await req.json();
    if (!promocao_id) {
      return new Response(JSON.stringify({ error: 'promocao_id obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = admin();
    const { data: promo, error: pErr } = await supabase.from('promocoes').select('*').eq('id', promocao_id).maybeSingle();
    if (pErr || !promo) {
      return new Response(JSON.stringify({ error: 'Promoção não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!userRoles.includes('ceo') && promo.adm_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }



    const barberId = promo.adm_id as string;

    // Busca clientes vinculados a este barbeiro
    const { data: clientes } = await supabase
      .from('profiles')
      .select('id, full_name, telefone')
      .eq('adm_responsavel_id', barberId);

    const lista = (clientes || []).filter((c: any) => c.id !== barberId);

    const titulo = `🔥 ${promo.titulo}`;
    const corpo = [
      promo.descricao,
      promo.preco_promocional ? `Por ${promo.preco_promocional}${promo.preco_original ? ` (de ${promo.preco_original})` : ''}` : '',
      'Taxa do app: R$ 3,00 por serviço.',
      'Abra o app e toque na promoção para agendar!',
    ].filter(Boolean).join('\n');

    // 1) Notificações in-app
    if (lista.length > 0) {
      const rows = lista.map((c: any) => ({
        user_id: c.id,
        tipo: 'lembrete',
        titulo,
        mensagem: corpo,
      }));
      await supabase.from('notificacoes').insert(rows);
    }

    // 2) WhatsApp — só ENFILEIRA com espaçamento (anti-ban processa depois)
    const cfg = await getConfig(supabase, barberId);
    let waQueued = 0;
    if (cfg?.api_url && cfg?.api_key && cfg?.instance) {
      const gapMs = Math.max((cfg?.min_gap_seconds ?? 25) * 1000, 25_000);
      const baseTs = Date.now() + 10_000; // começa em 10s
      const rows = lista
        .filter((c: any) => !!c.telefone)
        .map((c: any, i: number) => {
          // espaçamento humano: gap + jitter ±40%
          const jitter = Math.floor(gapMs * (0.6 + Math.random() * 0.8));
          return {
            destinatario: c.telefone,
            mensagem: corpo,
            tipo: 'promocao',
            barbeiro_id: barberId,
            next_attempt_at: new Date(baseTs + i * jitter).toISOString(),
          };
        });
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('whatsapp_queue').insert(rows);
        if (!insErr) waQueued = rows.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true, clientes: lista.length, notificacoes: lista.length, whatsapp_queued: waQueued,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }

});
