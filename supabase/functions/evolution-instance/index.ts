// Gerencia instâncias da Evolution API de forma centralizada usando a chave global.
// Ações: create (cria + webhook + qr), qr, status, disconnect, restart, ceo-list.
// Inclui auditoria (evolution_audit_log), persistência de metadados e erros por etapa.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireRole, errorResponse, adminClient } from '../_shared/auth.ts';
import { isAllowedUrl } from '../_shared/evolution.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Slug do nome da barbearia: minúsculo, sem acentos, espaços -> underline.
function slugInstance(name: string): string {
  return (name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

type GlobalCfg = { url: string; key: string };

async function resolveGlobal(supabase: any): Promise<GlobalCfg> {
  let url = Deno.env.get('EVOLUTION_API_URL') || '';
  let key = Deno.env.get('EVOLUTION_API_KEY') || '';
  if (!url || !key) {
    const { data } = await supabase.from('internal_secrets').select('name, value').in('name', ['evolution_api_url', 'evolution_api_key']);
    for (const r of data || []) {
      if (r.name === 'evolution_api_url' && !url) url = r.value;
      if (r.name === 'evolution_api_key' && !key) key = r.value;
    }
  }
  // NOTE: the global API key is intentionally NOT read back from evolution_config
  // rows, since those are readable by admins via RLS. Keep it only in env/secrets.
  if (!url) {
    const { data } = await supabase.from('evolution_config').select('api_url').not('api_url', 'is', null).limit(1).maybeSingle();
    if (data) url = url || data.api_url;
  }
  return { url: (url || '').replace(/\/$/, ''), key };
}

async function shopName(supabase: any, barbeiroId: string): Promise<string> {
  const { data: p } = await supabase.from('profiles').select('nome_barbearia').eq('id', barbeiroId).maybeSingle();
  if (p?.nome_barbearia && p.nome_barbearia.trim()) return p.nome_barbearia.trim();
  const { data: ur } = await supabase.from('user_roles').select('display_name').eq('user_id', barbeiroId).eq('role', 'admin').maybeSingle();
  return (ur?.display_name || 'barbearia').trim();
}

// fetch com timeout para nunca pendurar a edge function.
async function evoFetch(g: GlobalCfg, path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  if (!g.url || !isAllowedUrl(g.url)) {
    throw new StepError('config', 'Evolution api_url não permitida (bloqueada por anti-SSRF)', 400);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${g.url}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: g.key, ...(init.headers || {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

// Erro estruturado por etapa (create/webhook/qr/connect/status...).
class StepError extends Error {
  step: string;
  status: number;
  constructor(step: string, message: string, status = 502) {
    super(message);
    this.step = step;
    this.status = status;
  }
}

function extractQr(data: any): string | null {
  return data?.base64 || data?.qrcode?.base64 || data?.qr?.base64 || data?.qr || data?.code || null;
}
function extractState(data: any): string {
  return data?.instance?.state || data?.instance?.status || data?.state
    || data?.status || data?.connectionStatus || data?.instance?.connectionStatus || 'unknown';
}
function extractNumber(data: any): string | null {
  const jid = data?.number || data?.ownerJid || data?.instance?.owner || data?.owner
    || data?.instance?.ownerJid || data?.wuid || '';
  const digits = String(jid).split('@')[0].replace(/\D/g, '');
  return digits || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { user, userRoles } = await requireRole(req, ['admin', 'ceo']);
    const supabase = adminClient();
    const isCeo = userRoles.includes('ceo');
    const body = await req.json().catch(() => ({}));
    const action: string = body?.action || 'status';

    const g = await resolveGlobal(supabase);
    if (!g.url || !g.key) {
      return json({ error: 'Servidor WhatsApp não configurado. Avise o suporte para configurar a chave da API.', step: 'config' }, 400);
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/evolution-webhook`;
    const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') || '';

    // ---- CEO: lista de saúde de todas as barbearias ----
    if (action === 'ceo-list') {
      if (!isCeo) return json({ error: 'Apenas o CEO pode listar todas as integrações.' }, 403);
      const { data: admins } = await supabase
        .from('user_roles').select('user_id, display_name').eq('role', 'admin');
      const results = await Promise.all((admins || []).map(async (a: any) => {
        const { data: cfg } = await supabase.from('evolution_config')
          .select('instance, paired, last_status, phone_number, connected_at, disconnected_at')
          .eq('barbeiro_id', a.user_id).maybeSingle();
        const name = await shopName(supabase, a.user_id);
        const instance = (cfg?.instance && /^[a-z0-9_]+$/.test(cfg.instance)) ? cfg.instance : slugInstance(name);
        let state = 'not_created';
        try {
          const r = await evoFetch(g, `/instance/connectionState/${instance}`);
          if (r.ok) {
            const d = await r.json().catch(() => ({}));
            state = extractState(d);
          } else if (r.status === 404) {
            state = 'not_created';
          } else {
            state = 'error';
          }
        } catch { state = 'error'; }
        return {
          user_id: a.user_id,
          shop_name: name,
          display_name: a.display_name,
          instance,
          state,
          number: cfg?.phone_number ?? null,
          paired: state === 'open',
          connected_at: cfg?.connected_at ?? null,
          disconnected_at: cfg?.disconnected_at ?? null,
        };
      }));
      return json({ items: results });
    }

    // Demais ações operam sobre um barbeiro específico
    const barbeiroId: string = (isCeo && body?.barbeiro_id) ? body.barbeiro_id : user.id;
    if (!isCeo && body?.barbeiro_id && body.barbeiro_id !== user.id) {
      return json({ error: 'Você só pode gerenciar a sua própria integração.' }, 403);
    }

    const name = await shopName(supabase, barbeiroId);
    // Reaproveita instância já gravada, se houver; senão gera pelo nome.
    const { data: existing } = await supabase.from('evolution_config')
      .select('id, instance').eq('barbeiro_id', barbeiroId).maybeSingle();
    const instance = (existing?.instance && /^[a-z0-9_]+$/.test(existing.instance)) ? existing.instance : slugInstance(name);

    async function persist(patch: Record<string, unknown>) {
      // SECURITY: never store the global Evolution API key in per-barber rows.
      // It is resolved server-side at runtime from env/internal_secrets only,
      // so an admin cannot SELECT it through RLS on evolution_config.
      const payload = { barbeiro_id: barbeiroId, api_url: g.url, instance, ...patch };
      if (existing?.id) await supabase.from('evolution_config').update(payload).eq('id', existing.id);
      else await supabase.from('evolution_config').insert(payload);
    }

    async function audit(act: string, detail?: Record<string, unknown>) {
      try {
        await supabase.from('evolution_audit_log').insert({
          actor_id: user.id,
          actor_role: isCeo ? 'ceo' : 'admin',
          barbeiro_id: barbeiroId,
          instance,
          action: act,
          detail: detail ?? null,
        });
      } catch { /* auditoria nunca quebra o fluxo */ }
    }

    // Constrói patch de metadados a partir do estado atual.
    function statePatch(state: string, number?: string | null): Record<string, unknown> {
      const patch: Record<string, unknown> = { paired: state === 'open', last_status: state };
      if (state === 'open') {
        patch.connected_at = new Date().toISOString();
        if (number) patch.phone_number = number;
      }
      if (state === 'close' || state === 'closed' || state === 'deleted') {
        patch.disconnected_at = new Date().toISOString();
      }
      return patch;
    }

    async function setWebhook(): Promise<boolean> {
      const wbody = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: webhookSecret ? { 'X-Webhook-Secret': webhookSecret, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
          byEvents: false,
          base64: true,
          events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
        },
      };
      try {
        let r = await evoFetch(g, `/webhook/set/${instance}`, { method: 'POST', body: JSON.stringify(wbody) });
        if (!r.ok) {
          const legacy = {
            url: wbody.webhook.url, webhook_by_events: false, webhook_base64: true,
            events: wbody.webhook.events,
          };
          r = await evoFetch(g, `/webhook/set/${instance}`, { method: 'POST', body: JSON.stringify(legacy) });
        }
        return r.ok;
      } catch {
        return false;
      }
    }

    async function readCurrentState(): Promise<{ state: string; number: string | null; exists: boolean }> {
      try {
        const r = await evoFetch(g, `/instance/connectionState/${instance}`);
        if (r.status === 404) return { state: 'not_created', number: null, exists: false };
        const d = await r.json().catch(() => ({}));
        return { state: extractState(d), number: extractNumber(d), exists: true };
      } catch {
        return { state: 'unknown', number: null, exists: true };
      }
    }

    if (action === 'create') {
      const warnings: string[] = [];
      const current = await readCurrentState();
      if (current.state === 'open') {
        await persist(statePatch(current.state, current.number));
        return json({ instance, qr: null, state: current.state, paired: true, warnings: [] });
      }
      // 1) cria a instância (idempotente: se já existir, seguimos para connect)
      const token = crypto.randomUUID().replace(/-/g, '');
      const createBody = { instanceName: instance, token, qrcode: true, integration: 'WHATSAPP-BAILEYS' };
      let crData: any = {};
      try {
        const cr = await evoFetch(g, '/instance/create', { method: 'POST', body: JSON.stringify(createBody) });
        crData = await cr.json().catch(() => ({}));
        // 403/409 normalmente indicam "instância já existe": seguimos para connect.
        if (!cr.ok && cr.status !== 403 && cr.status !== 409) {
          const msg = crData?.message || crData?.error || `HTTP ${cr.status}`;
          await audit('create_failed', { step: 'create', error: String(msg).slice(0, 300) });
          throw new StepError('create', `Não foi possível criar a instância: ${String(msg).slice(0, 200)}`);
        }
      } catch (e) {
        if (e instanceof StepError) throw e;
        await audit('create_failed', { step: 'create', error: 'network' });
        throw new StepError('create', 'Falha de conexão com o servidor WhatsApp ao criar a instância.');
      }

      // 2) configura webhook (não bloqueia em caso de falha)
      const webhookOk = await setWebhook();
      if (!webhookOk) warnings.push('webhook');

      // 3) busca QR
      let qr = extractQr(crData?.qrcode || crData);
      let state = extractState(crData);
      if (!qr) {
        try {
          const conn = await evoFetch(g, `/instance/connect/${instance}`);
          const cd = await conn.json().catch(() => ({}));
          qr = extractQr(cd);
          state = extractState(cd) !== 'unknown' ? extractState(cd) : state;
        } catch {
          warnings.push('connect');
        }
      }

      if (!qr && state !== 'open') {
        await audit('create_failed', { step: 'qr', warnings });
        throw new StepError('qr', 'Instância criada, mas o QR Code não foi gerado. Tente "Gerar novo QR".');
      }

      const patch = statePatch(state);
      patch.last_qr_at = new Date().toISOString();
      await persist(patch);
      await audit('create', { state, warnings });
      return json({ instance, qr, state, paired: state === 'open', warnings });
    }

    if (action === 'qr') {
      const current = await readCurrentState();
      if (current.state === 'open') {
        await persist(statePatch(current.state, current.number));
        return json({ instance, qr: null, state: current.state, paired: true });
      }
      let cd: any = {};
      try {
        const conn = await evoFetch(g, `/instance/connect/${instance}`);
        cd = await conn.json().catch(() => ({}));
        if (!conn.ok && conn.status !== 200) {
          throw new StepError('qr', `Não foi possível gerar o QR Code (HTTP ${conn.status}).`);
        }
      } catch (e) {
        if (e instanceof StepError) throw e;
        throw new StepError('qr', 'Falha de conexão com o servidor WhatsApp ao gerar o QR Code.');
      }
      const qr = extractQr(cd);
      const state = extractState(cd);
      if (!qr && state !== 'open') {
        throw new StepError('qr', 'O servidor não retornou um QR Code. Tente novamente em alguns segundos.');
      }
      const patch = statePatch(state);
      patch.last_qr_at = new Date().toISOString();
      await persist(patch);
      await audit('qr_refresh', { state });
      return json({ instance, qr, state, paired: state === 'open' });
    }

    if (action === 'status') {
      let r: Response;
      try {
        r = await evoFetch(g, `/instance/connectionState/${instance}`);
      } catch {
        throw new StepError('status', 'Falha de conexão ao verificar o status do WhatsApp.');
      }
      if (r.status === 404) {
        await persist({ paired: false, last_status: 'not_created' });
        return json({ instance, state: 'not_created', paired: false, number: null });
      }
      const d = await r.json().catch(() => ({}));
      const state = extractState(d);
      let number: string | null = null;
      if (state === 'open') {
        try {
          const fi = await evoFetch(g, `/instance/fetchInstances?instanceName=${instance}`);
          const fd = await fi.json().catch(() => ({}));
          const inst = Array.isArray(fd) ? fd[0] : (fd?.instance || fd);
          number = extractNumber(inst) || extractNumber(d);
        } catch { /* opcional */ }
      }
      await persist(statePatch(state, number));
      return json({ instance, state, paired: state === 'open', number });
    }

    if (action === 'disconnect') {
      // logout + delete da instância
      await evoFetch(g, `/instance/logout/${instance}`, { method: 'DELETE' }).catch(() => {});
      const del = await evoFetch(g, `/instance/delete/${instance}`, { method: 'DELETE' }).catch(() => null);
      await persist({ paired: false, last_status: 'deleted', disconnected_at: new Date().toISOString(), phone_number: null });
      await audit('disconnect', { ok: !!del });
      return json({ instance, ok: !!del, state: 'deleted', paired: false });
    }

    if (action === 'restart') {
      // Reiniciar uma sessão ativa força o WhatsApp/Evolution a sincronizar o
      // aparelho novamente, gerando a notificação nativa indesejada no celular.
      // Mantemos a ação como no-op seguro para que nenhum painel volte a disparar sync.
      const current = await readCurrentState();
      await persist(statePatch(current.state, current.number));
      await audit('restart_blocked', { state: current.state });
      return json({ instance, ok: true, state: current.state, paired: current.state === 'open', restart_blocked: true });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (err) {
    if (err instanceof StepError) {
      return json({ error: err.message, step: err.step }, err.status);
    }
    return errorResponse(err, corsHeaders);
  }
});
