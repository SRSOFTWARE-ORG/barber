// Busca QR code de pareamento da instância Evolution. Requer admin/ceo.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireRole, errorResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { user, supabase, userRoles } = await requireRole(req, ['admin', 'ceo']);
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const isCeo = userRoles.includes('ceo');
    const barbeiroId = body?.barbeiro_id ?? user.id;
    if (!isCeo && barbeiroId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: cfg } = await supabase.from('evolution_config').select('*').eq('barbeiro_id', barbeiroId).maybeSingle();
    if (!cfg?.api_url || !cfg?.api_key || !cfg?.instance) {
      return new Response(JSON.stringify({ error: 'Evolution API não configurada.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const base = cfg.api_url.replace(/\/$/, '');

    // 1) Verifica o estado ATUAL sem forçar reconexão.
    //    Chamar /instance/connect numa sessão já aberta força o WhatsApp a
    //    re-sincronizar o aparelho vinculado ("Google Chrome (Evolution API)"),
    //    o que dispara a notificação de "sincronização concluída" repetidamente.
    let state = 'unknown';
    try {
      const stResp = await fetch(`${base}/instance/connectionState/${cfg.instance}`, { headers: { apikey: cfg.api_key } });
      const stData = await stResp.json().catch(() => ({}));
      state = stData?.instance?.state || stData?.state || 'unknown';
    } catch (_e) { /* segue para connect abaixo */ }

    // Já conectado: não chama connect (evita re-sync) e marca como pareado.
    if (state === 'open' || state === 'connected') {
      await supabase.from('evolution_config').update({ paired: true, last_status: state }).eq('id', cfg.id);
      return new Response(JSON.stringify({ qr: null, state, paired: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Sem force: apenas reporta o estado atual.
    // Isso evita que polling de UI reforce /connect/ repetidamente e faça o
    // WhatsApp re-sincronizar o dispositivo vinculado várias vezes.
    if (!force) {
      await supabase.from('evolution_config').update({ paired: false, last_status: state }).eq('id', cfg.id);
      return new Response(JSON.stringify({ qr: null, state, paired: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2) Não conectado e chamado manualmente: aí sim solicita o QR/conexão.
    const url = `${base}/instance/connect/${cfg.instance}`;
    const resp = await fetch(url, { headers: { apikey: cfg.api_key } });
    const data = await resp.json().catch(() => ({}));
    const qr = data?.base64 || data?.qrcode?.base64 || data?.qr || null;
    const newState = data?.instance?.state || data?.state || state || 'unknown';
    const paired = newState === 'open' || newState === 'connected';
    if (paired) await supabase.from('evolution_config').update({ paired: true, last_status: newState }).eq('id', cfg.id);
    return new Response(JSON.stringify({ qr, state: newState, paired, raw: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
