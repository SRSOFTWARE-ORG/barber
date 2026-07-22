// Fluxo de teste: dispara lembrete + comprovante para um agendamento real. Requer admin/ceo (e barbeiro só dispara para próprios agendamentos).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { admin, safeSend, getConfig } from '../_shared/evolution.ts';
import { requireRole, errorResponse } from '../_shared/auth.ts';

interface Body { agendamento_id: string; tipos?: string[]; }

function renderTemplate(content: string, vars: Record<string, string> = {}) {
  return content.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { user, userRoles } = await requireRole(req, ['admin', 'ceo']);
    const supabase = admin();

    const body: Body = await req.json();
    if (!body.agendamento_id) {
      return new Response(JSON.stringify({ error: 'agendamento_id obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const tipos = body.tipos?.length ? body.tipos : ['lembrete', 'sinal_pago'];

    const { data: ag } = await supabase.from('agendamentos').select('*').eq('id', body.agendamento_id).maybeSingle();
    if (!ag) return new Response(JSON.stringify({ error: 'Agendamento não encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!userRoles.includes('ceo') && ag.barbeiro_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }



    const cfg = await getConfig(supabase, ag.barbeiro_id);
    if (!cfg?.api_url || !cfg?.api_key || !cfg?.instance) {
      return new Response(JSON.stringify({ error: 'Instância Evolution não configurada para este barbeiro', barbeiro_id: ag.barbeiro_id }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const vars = {
      cliente: `${ag.cliente_nome} ${ag.cliente_sobrenome ?? ''}`.trim(),
      data: new Date(ag.data).toLocaleDateString('pt-BR'),
      hora: String(ag.hora).slice(0,5),
      valor_sinal: ag.valor_sinal ? `R$ ${Number(ag.valor_sinal).toFixed(2)}` : 'R$ 0,00',
      barbeiro: ag.barbeiro_nome || 'Barbeiro',
    };

    const results: any[] = [];
    for (const tipo of tipos) {
      const { data: tpl } = await supabase.from('whatsapp_templates').select('*').eq('tipo', tipo).maybeSingle();
      if (!tpl) { results.push({ tipo, skipped: 'template não existe' }); continue; }
      if (!tpl.ativo) { results.push({ tipo, skipped: 'template inativo' }); continue; }
      const message = renderTemplate(tpl.conteudo, vars);

      const { data: row } = await supabase.from('whatsapp_queue').insert({
        destinatario: ag.cliente_telefone,
        mensagem: message,
        tipo,
        agendamento_id: ag.id,
        barbeiro_id: ag.barbeiro_id,
      }).select().single();

      // Envio com proteção ANTI-BAN. Se o anti-ban segurar, mantém na fila para o cron enviar.
      let res; try { res = await safeSend(supabase, cfg, ag.barbeiro_id, ag.cliente_telefone, message); } catch (e: any) { res = { ok: false, status: 0, data: { error: e.message } }; }

      if (res.skipped) {
        await supabase.from('whatsapp_queue').update({
          status: 'pending',
          erro: `antiban:${res.reason}`,
          next_attempt_at: new Date(Date.now() + (res.retry_after_ms ?? 60_000)).toISOString(),
        }).eq('id', row.id);
        results.push({ tipo, queued_id: row.id, ok: false, skipped: true, reason: res.reason });
        continue;
      }

      await supabase.from('whatsapp_queue').update({
        tentativas: 1,
        status: res.ok ? 'sent' : 'pending',
        sent_at: res.ok ? new Date().toISOString() : null,
        erro: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
        resposta: res.data,
        external_id: (res.data as any)?.key?.id || (res.data as any)?.id || null,
      }).eq('id', row.id);

      results.push({ tipo, queued_id: row.id, ok: res.ok, status: res.status });
    }

    return new Response(JSON.stringify({ ok: true, agendamento_id: ag.id, instance: cfg.instance, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }

});
