// Processa fila com proteção ANTI-BAN: 1 envio por execução por barbeiro,
// respeitando rate-limits, gap mínimo, horário comercial e jitter humano.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { admin, safeSend, getConfig } from '../_shared/evolution.ts';
import { requireRole, errorResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = admin();

    // Autoriza por segredo interno (chamada do cron) OU por papel admin/ceo (chamada manual).
    const internalHeader = req.headers.get('X-Internal-Secret') ?? '';
    let authorized = false;
    if (internalHeader) {
      const { data: sec } = await supabase
        .from('internal_secrets')
        .select('value')
        .eq('name', 'webhook_evolution_queue')
        .maybeSingle();
      if (sec?.value && internalHeader === sec.value) authorized = true;
    }
    if (!authorized) {
      await requireRole(req, ['admin', 'ceo']);
    }


    // pega até 20 itens prontos, mas envia no máximo 1 por barbeiro por execução
    const { data: items = [] } = await supabase
      .from('whatsapp_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at')
      .limit(20);

    let sent = 0, failed = 0, skipped = 0;
    const cfgCache = new Map<string, any>();
    const usedBarbers = new Set<string>();

    for (const it of items ?? []) {
      const key = it.barbeiro_id || '__default__';
      if (usedBarbers.has(key)) continue; // 1 por execução por barbeiro
      if (!cfgCache.has(key)) cfgCache.set(key, await getConfig(supabase, it.barbeiro_id));
      const cfg = cfgCache.get(key);
      if (!cfg?.api_url || !cfg?.api_key || !cfg?.instance) {
        await supabase.from('whatsapp_queue').update({
          erro: 'Instância Evolution do barbeiro não configurada',
          next_attempt_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        }).eq('id', it.id);
        skipped++;
        continue;
      }

      const tentativas = (it.tentativas || 0) + 1;
      const result = await safeSend(supabase, cfg, it.barbeiro_id, it.destinatario, it.mensagem);
      usedBarbers.add(key);

      if (result.skipped) {
        // anti-ban segurou: reagenda sem contar como tentativa
        const wait = result.retry_after_ms ?? 60_000;
        await supabase.from('whatsapp_queue').update({
          status: 'pending',
          erro: `antiban:${result.reason}`,
          next_attempt_at: new Date(Date.now() + wait).toISOString(),
        }).eq('id', it.id);
        skipped++;
        continue;
      }

      const finalFail = !result.ok && tentativas >= (it.max_tentativas || 3);
      const backoffMs = Math.min(60_000 * Math.pow(2, tentativas), 30 * 60_000);
      await supabase.from('whatsapp_queue').update({
        tentativas,
        status: result.ok ? 'sent' : (finalFail ? 'failed' : 'pending'),
        sent_at: result.ok ? new Date().toISOString() : null,
        erro: result.ok ? null : JSON.stringify(result.data).slice(0, 500),
        resposta: result.data,
        external_id: (result.data as any)?.key?.id || (result.data as any)?.id || it.external_id,
        next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
      }).eq('id', it.id);
      if (result.ok) sent++; else failed++;
    }

    return new Response(JSON.stringify({ processed: items?.length ?? 0, sent, failed, skipped }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
