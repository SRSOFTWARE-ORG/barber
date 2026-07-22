// Dispara LEMBRETES DE RETORNO: avisa clientes que ha X dias nao fazem um servico.
// Cada barbeiro define se o lembrete esta ativo e em quantos dias (evolution_config).
// As mensagens entram na fila com proteção ANTI-BAN (processada pelo cron evolution-queue).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { admin } from '../_shared/evolution.ts';
import { requireRole, errorResponse } from '../_shared/auth.ts';

function renderTemplate(content: string, vars: Record<string, string> = {}) {
  return content.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z').getTime();
  return Math.floor((Date.now() - d) / (24 * 60 * 60 * 1000));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = admin();

    // Autoriza via segredo interno (cron) OU papel admin/ceo (disparo manual).
    const internalHeader = req.headers.get('X-Internal-Secret') ?? '';
    let authorized = false;
    let onlyBarberId: string | null = null;
    if (internalHeader) {
      const { data: sec } = await supabase
        .from('internal_secrets')
        .select('value')
        .eq('name', 'webhook_evolution_queue')
        .maybeSingle();
      if (sec?.value && internalHeader === sec.value) authorized = true;
    }
    if (!authorized) {
      const { user, userRoles } = await requireRole(req, ['admin', 'ceo']);
      authorized = true;
      // Admin (barbeiro) só dispara para os próprios clientes.
      if (!userRoles.includes('ceo')) onlyBarberId = user.id;
    }

    // Template global de retorno
    const { data: tpl } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('tipo', 'retorno')
      .maybeSingle();
    if (!tpl || !tpl.ativo) {
      return new Response(JSON.stringify({ ok: true, skipped: 'template retorno inativo' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Barbeiros com lembrete de retorno ativo e instância configurada
    let cfgQ = supabase
      .from('evolution_config')
      .select('barbeiro_id, retorno_dias, api_url, api_key, instance')
      .eq('retorno_enabled', true)
      .not('barbeiro_id', 'is', null);
    if (onlyBarberId) cfgQ = cfgQ.eq('barbeiro_id', onlyBarberId);
    const { data: configs = [] } = await cfgQ;

    let enqueued = 0;
    const detail: any[] = [];

    for (const cfg of configs ?? []) {
      if (!cfg.api_url || !cfg.api_key || !cfg.instance) continue;
      const dias = Math.max(1, Number(cfg.retorno_dias || 30));
      const barbeiroId = cfg.barbeiro_id as string;

      // Atendimentos confirmados deste barbeiro (mais recentes primeiro)
      const { data: ags = [] } = await supabase
        .from('agendamentos')
        .select('cliente_nome, cliente_sobrenome, cliente_telefone, data, barbeiro_nome')
        .eq('barbeiro_id', barbeiroId)
        .eq('status', 'confirmed')
        .order('data', { ascending: false });

      // Último atendimento por telefone
      const lastByPhone = new Map<string, any>();
      for (const a of ags ?? []) {
        const phone = (a.cliente_telefone || '').trim();
        if (!phone) continue;
        if (!lastByPhone.has(phone)) lastByPhone.set(phone, a);
      }

      // Clientes já lembrados recentemente (dentro da janela de "dias")
      const sinceISO = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
      const { data: recent = [] } = await supabase
        .from('whatsapp_queue')
        .select('destinatario')
        .eq('barbeiro_id', barbeiroId)
        .eq('tipo', 'retorno')
        .gte('created_at', sinceISO);
      const alreadyReminded = new Set((recent ?? []).map((r: any) => (r.destinatario || '').trim()));

      let count = 0;
      for (const [phone, a] of lastByPhone) {
        if (alreadyReminded.has(phone)) continue;
        if (daysSince(a.data) < dias) continue; // ainda dentro do prazo

        const cliente = `${a.cliente_nome || ''} ${a.cliente_sobrenome || ''}`.trim();
        const mensagem = renderTemplate(tpl.conteudo, {
          cliente,
          dias: String(daysSince(a.data)),
          barbeiro: a.barbeiro_nome || 'seu barbeiro',
        });

        const { error } = await supabase.from('whatsapp_queue').insert({
          destinatario: phone,
          mensagem,
          tipo: 'retorno',
          barbeiro_id: barbeiroId,
          next_attempt_at: new Date(Date.now() + 3000 + Math.floor(Math.random() * 15000)).toISOString(),
        });
        if (!error) { enqueued++; count++; }
      }
      detail.push({ barbeiro_id: barbeiroId, dias, candidatos: lastByPhone.size, enfileirados: count });
    }

    return new Response(JSON.stringify({ ok: true, enqueued, detail }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
