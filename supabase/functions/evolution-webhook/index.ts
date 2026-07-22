// Webhook Evolution -> atualiza whatsapp_queue + persiste log em evolution_webhook_logs
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function digits(s?: string) { return (s || '').replace(/\D/g, ''); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    // Shared-secret verification — reject spoofed webhook calls
    const expected = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') ?? '';
    if (!expected) {
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Header-only delivery: never accept the secret via query string (it leaks into logs)
    const provided =
      req.headers.get('X-Webhook-Secret') ||
      req.headers.get('x-webhook-secret') ||
      '';
    if (provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const event: string = body?.event || body?.type || '';
    const instance: string = body?.instance || body?.instanceName || '';
    const data = body?.data ?? body;

    // CONNECTION
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = data?.state || data?.status || 'unknown';
      const paired = state === 'open' || state === 'connected';
      const isOpen = paired;
      const isClosed = state === 'close' || state === 'closed' || state === 'DISCONNECTED';
      const number = digits((data?.wuid || data?.ownerJid || data?.owner || data?.number || '').split('@')[0]);

      // Localiza a barbearia dona da instância e o estado anterior.
      const { data: cfg } = await supabase.from('evolution_config')
        .select('id, barbeiro_id, last_status')
        .eq('instance', instance).maybeSingle();
      const prev = cfg?.last_status || null;

      const patch: Record<string, unknown> = { last_status: state, paired };
      if (isOpen) {
        patch.connected_at = new Date().toISOString();
        if (number) patch.phone_number = number;
      }
      if (isClosed) patch.disconnected_at = new Date().toISOString();

      let upd: any = null;
      if (cfg?.id) {
        upd = await supabase.from('evolution_config').update(patch).eq('id', cfg.id);
      } else {
        upd = await supabase.from('evolution_config').update(patch).eq('instance', instance);
      }

      // Notificação interna para o barbeiro quando muda para open/closed.
      if (cfg?.barbeiro_id && prev !== state) {
        if (isOpen) {
          await supabase.from('notificacoes').insert({
            user_id: cfg.barbeiro_id,
            tipo: 'whatsapp',
            titulo: '✅ WhatsApp conectado',
            mensagem: 'A conexão do WhatsApp da sua barbearia está ativa.' + (number ? ` Número: +${number}.` : ''),
          });
        } else if (isClosed) {
          await supabase.from('notificacoes').insert({
            user_id: cfg.barbeiro_id,
            tipo: 'whatsapp',
            titulo: '⚠️ WhatsApp desconectado',
            mensagem: 'A conexão do WhatsApp da sua barbearia caiu. Reconecte gerando um novo QR Code.',
          });
        }
        // Registro de auditoria do evento de conexão (origem: webhook).
        await supabase.from('evolution_audit_log').insert({
          actor_id: null,
          actor_role: 'system',
          barbeiro_id: cfg.barbeiro_id,
          instance,
          action: isOpen ? 'connection_open' : (isClosed ? 'connection_closed' : 'connection_update'),
          detail: { state, number: number || null },
        });
      }

      await supabase.from('evolution_webhook_logs').insert({
        event, instance, status: state, matched: !!upd, payload: body,
      });
      return new Response(JSON.stringify({ ok: true, state, paired }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // MESSAGES UPDATE / UPSERT / SEND
    if (
      event === 'messages.update' || event === 'MESSAGES_UPDATE' ||
      event === 'messages.upsert' || event === 'MESSAGES_UPSERT' ||
      event === 'send.message' || event === 'SEND_MESSAGE'
    ) {
      const items = Array.isArray(data) ? data : [data];
      let processed = 0;
      for (const it of items) {
        const keyId = it?.key?.id || it?.id || it?.message?.key?.id;
        const remoteJid = it?.key?.remoteJid || it?.remoteJid || '';
        const status = (it?.status || it?.update?.status || '').toString().toUpperCase();
        const number = digits(remoteJid.split('@')[0]);

        let queueId: string | null = null;
        if (keyId) {
          const { data: rows } = await supabase.from('whatsapp_queue').select('id').eq('external_id', keyId).limit(1);
          queueId = rows?.[0]?.id || null;
        }
        if (!queueId && number) {
          const { data: rows } = await supabase.from('whatsapp_queue').select('id').eq('destinatario', number).order('created_at', { ascending: false }).limit(1);
          queueId = rows?.[0]?.id || null;
        }

        const patch: Record<string, unknown> = {};
        if (status === 'DELIVERY_ACK' || status === 'DELIVERED' || status === '3') {
          patch.delivered_at = new Date().toISOString(); patch.status = 'delivered';
        } else if (status === 'READ' || status === 'PLAYED' || status === '4' || status === '5') {
          patch.read_at = new Date().toISOString();
          patch.delivered_at = new Date().toISOString();
          patch.status = 'read';
        } else if (status === 'SERVER_ACK' || status === 'SENT' || status === '2') {
          patch.status = 'sent'; patch.sent_at = new Date().toISOString();
        } else if (status === 'ERROR' || status === 'FAILED') {
          patch.status = 'failed'; patch.erro = JSON.stringify(it).slice(0, 500);
        }
        if (queueId && Object.keys(patch).length) {
          await supabase.from('whatsapp_queue').update(patch).eq('id', queueId);
        }
        await supabase.from('evolution_webhook_logs').insert({
          event, instance, status: status || null, remote_jid: remoteJid || null,
          external_id: keyId || null, queue_id: queueId, matched: !!queueId, payload: it,
        });
        processed++;
      }
      return new Response(JSON.stringify({ ok: true, processed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Outros eventos: registrar
    await supabase.from('evolution_webhook_logs').insert({ event: event || 'unknown', instance, payload: body });
    return new Response(JSON.stringify({ ignored: true, event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
