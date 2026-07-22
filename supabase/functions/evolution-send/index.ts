// Evolution API - envio com fila + retries + ANTI-BAN, instância por barbeiro
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { admin, safeSend, getConfig, resolveBarberId } from '../_shared/evolution.ts';
import { requireRole, errorResponse } from '../_shared/auth.ts';



interface SendPayload {
  number: string;
  message?: string;
  template?: string;
  vars?: Record<string, string>;
  agendamento_id?: string;
  barbeiro_id?: string;
  test?: boolean;
}

function renderTemplate(content: string, vars: Record<string, string> = {}) {
  return content.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { user, userRoles } = await requireRole(req, ['admin', 'ceo']);
    const supabase = admin();
    const body: SendPayload = await req.json();
    // Barbeiro só pode enviar em nome de si mesmo; CEO pode enviar para qualquer um.
    if (!userRoles.includes('ceo') && body.barbeiro_id && body.barbeiro_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!userRoles.includes('ceo') && !body.barbeiro_id) body.barbeiro_id = user.id;


    const barberId = await resolveBarberId(supabase, { barbeiro_id: body.barbeiro_id, agendamento_id: body.agendamento_id });
    const cfg = await getConfig(supabase, barberId);
    if (!cfg?.api_url || !cfg?.api_key || !cfg?.instance) {
      return new Response(JSON.stringify({ error: 'Nenhuma instância Evolution configurada para este barbeiro.', barbeiro_id: barberId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let message = body.message ?? '';
    if (body.template) {
      const { data: tpl } = await supabase.from('whatsapp_templates').select('*').eq('tipo', body.template).maybeSingle();
      if (!tpl) return new Response(JSON.stringify({ error: 'Template não encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!tpl.ativo) return new Response(JSON.stringify({ skipped: true, reason: 'template inativo' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      message = renderTemplate(tpl.conteudo, body.vars || {});
    }
    if (!message) return new Response(JSON.stringify({ error: 'mensagem vazia' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (body.test) {
      // Teste manual ignora anti-ban (envio único do dono)
      const { callEvolution } = await import('../_shared/evolution.ts');
      const result = await callEvolution(cfg, body.number, message);
      const invalid = (result.data as any)?.invalid_recipient;
      return new Response(JSON.stringify({ ...result, invalid_recipient: !!invalid, barbeiro_id: barberId, instance: cfg.instance }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Enfileira sempre; deixa o processador anti-ban espaçar o envio
    const { data: queued, error: qErr } = await supabase.from('whatsapp_queue').insert({
      destinatario: body.number,
      mensagem: message,
      tipo: body.template ?? null,
      agendamento_id: body.agendamento_id ?? null,
      barbeiro_id: barberId,
      next_attempt_at: new Date(Date.now() + Math.floor(Math.random() * 8000) + 2000).toISOString(),
    }).select().single();
    if (qErr) throw qErr;

    // Tenta enviar agora respeitando anti-ban; se segurar, fica pra fila.
    const result = await safeSend(supabase, cfg, barberId, body.number, message);
    if (result.skipped) {
      await supabase.from('whatsapp_queue').update({
        status: 'pending',
        erro: `antiban:${result.reason}`,
        next_attempt_at: new Date(Date.now() + (result.retry_after_ms ?? 60_000)).toISOString(),
      }).eq('id', queued.id);
    } else {
      await supabase.from('whatsapp_queue').update({
        tentativas: 1,
        status: result.ok ? 'sent' : 'pending',
        sent_at: result.ok ? new Date().toISOString() : null,
        erro: result.ok ? null : JSON.stringify(result.data).slice(0, 500),
        resposta: result.data,
        external_id: (result.data as any)?.key?.id || (result.data as any)?.id || null,
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      }).eq('id', queued.id);
    }

    return new Response(JSON.stringify({ ok: !!result.ok, queued_id: queued.id, barbeiro_id: barberId, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }

});
