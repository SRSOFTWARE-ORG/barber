// Shared helpers para resolver a Evolution API por barbeiro
// + camada de ANTI-BAN rigorosa (rate-limit, jitter, presence, horário comercial, dedupe).
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/**
 * Anti-SSRF: valida que a api_url aponta para um host público.
 * Bloqueia loopback, redes privadas (RFC 1918), link-local, CGNAT e metadata
 * de nuvem (169.254.169.254), tanto IPv4 quanto IPv6.
 */
export function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    let host = u.hostname.toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    if (/^(localhost$|127\.|0\.|10\.|169\.254\.)/i.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false;
    if (host === '169.254.169.254') return false;
    if (host === '::1' || host === '::') return false;
    if (/^f[cd][0-9a-f]{0,2}:/i.test(host)) return false;
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return false;
    if (host.includes('::ffff:') && /(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (!host.includes('.') && !host.includes(':')) return false;
    return true;
  } catch { return false; }
}

/** Lança erro se a api_url da config não for um host público permitido. */
export function assertAllowedConfig(cfg: any): void {
  if (!cfg?.api_url || !isAllowedUrl(String(cfg.api_url))) {
    throw new Error('Evolution api_url não permitida (bloqueada por anti-SSRF)');
  }
}

export async function resolveBarberId(
  supabase: SupabaseClient,
  hint: { barbeiro_id?: string | null; agendamento_id?: string | null },
): Promise<string | null> {
  if (hint.barbeiro_id) return hint.barbeiro_id;
  if (hint.agendamento_id) {
    const { data } = await supabase.from('agendamentos').select('barbeiro_id').eq('id', hint.agendamento_id).maybeSingle();
    if (data?.barbeiro_id) return data.barbeiro_id;
  }
  return null;
}

export async function getConfig(
  supabase: SupabaseClient,
  barbeiro_id: string | null,
) {
  if (barbeiro_id) {
    const { data } = await supabase.from('evolution_config').select('*').eq('barbeiro_id', barbeiro_id).maybeSingle();
    if (data?.api_url && data?.api_key && data?.instance && isAllowedUrl(String(data.api_url))) return data;
  }
  const { data: any1 } = await supabase.from('evolution_config').select('*').not('api_url', 'is', null).limit(1).maybeSingle();
  if (any1?.api_url && !isAllowedUrl(String(any1.api_url))) return null;
  return any1;
}

export function normalizeBR(raw: string): string {
  let n = (raw || '').replace(/\D/g, '');
  n = n.replace(/^0+/, '');
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) return n;
  if (n.length === 10 || n.length === 11) return '55' + n;
  if (n.length >= 10 && !n.startsWith('55')) return '55' + n;
  return n;
}

// ===================== ANTI-BAN =====================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Defaults rigorosos (modo aquecimento aplica limites ainda menores)
const DEFAULTS = {
  min_gap_seconds: 25,
  max_per_hour: 25,
  max_per_day: 150,
  business_hours_start: 8,
  business_hours_end: 21,
  presence_simulation: false,
  warmup_mode: false,
};

function antibanCfg(cfg: any) {
  const c = {
    antiban_enabled: cfg?.antiban_enabled ?? true,
    min_gap_seconds: cfg?.min_gap_seconds ?? DEFAULTS.min_gap_seconds,
    max_per_hour: cfg?.max_per_hour ?? DEFAULTS.max_per_hour,
    max_per_day: cfg?.max_per_day ?? DEFAULTS.max_per_day,
    business_hours_start: cfg?.business_hours_start ?? DEFAULTS.business_hours_start,
    business_hours_end: cfg?.business_hours_end ?? DEFAULTS.business_hours_end,
    presence_simulation: cfg?.presence_simulation ?? DEFAULTS.presence_simulation,
    warmup_mode: cfg?.warmup_mode ?? DEFAULTS.warmup_mode,
  };
  if (c.warmup_mode) {
    // Aquecimento: ~3x mais restritivo
    c.min_gap_seconds = Math.max(c.min_gap_seconds, 60);
    c.max_per_hour = Math.min(c.max_per_hour, 8);
    c.max_per_day = Math.min(c.max_per_day, 40);
  }
  return c;
}

function nowInSP() {
  // Hora atual em America/Sao_Paulo
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit',
  });
  return parseInt(fmt.format(new Date()), 10);
}

async function getCounts(supabase: SupabaseClient, barbeiroId: string | null) {
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let q1 = supabase.from('whatsapp_queue').select('id', { count: 'exact', head: true })
    .eq('status', 'sent').gte('sent_at', since1h);
  let q2 = supabase.from('whatsapp_queue').select('id', { count: 'exact', head: true })
    .eq('status', 'sent').gte('sent_at', since24h);
  let q3 = supabase.from('whatsapp_queue').select('sent_at')
    .eq('status', 'sent').order('sent_at', { ascending: false }).limit(1);
  if (barbeiroId) {
    q1 = q1.eq('barbeiro_id', barbeiroId);
    q2 = q2.eq('barbeiro_id', barbeiroId);
    q3 = q3.eq('barbeiro_id', barbeiroId);
  } else {
    q1 = q1.is('barbeiro_id', null);
    q2 = q2.is('barbeiro_id', null);
    q3 = q3.is('barbeiro_id', null);
  }
  const [{ count: c1h }, { count: c24h }, { data: last }] = await Promise.all([q1, q2, q3]);
  const lastSentAt = last?.[0]?.sent_at ? new Date(last[0].sent_at).getTime() : 0;
  return { c1h: c1h ?? 0, c24h: c24h ?? 0, lastSentAt };
}

// Adiciona pequenas variações invisíveis na mensagem para evitar spam idêntico
function obfuscate(msg: string): string {
  const zw = ['\u200B', '\u200C', '\u200D']; // zero-width
  // insere 1 char invisível em posição aleatória do final
  const c = zw[rand(0, zw.length - 1)];
  return msg + c;
}

async function sendPresence(cfg: any, number: string, presence: 'composing' | 'paused') {
  try {
    assertAllowedConfig(cfg);
    const url = `${cfg.api_url.replace(/\/$/, '')}/chat/sendPresence/${cfg.instance}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.api_key },
      body: JSON.stringify({ number, presence, delay: 1200 }),
    });
  } catch (_e) { /* presence é best-effort */ }
}

async function rawSendText(cfg: any, number: string, message: string) {
  assertAllowedConfig(cfg);
  const url = `${cfg.api_url.replace(/\/$/, '')}/message/sendText/${cfg.instance}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.api_key },
    body: JSON.stringify({ number, text: message }),
  });
  const data = await resp.json().catch(() => ({}));
  const exists = data?.response?.message?.[0]?.exists;
  if (resp.status === 400 && exists === false) {
    return { ok: false, status: 400, data: { ...data, invalid_recipient: true, normalized: number } };
  }
  return { ok: resp.ok, status: resp.status, data: { ...data, normalized: number } };
}

/**
 * Resultado do envio anti-ban.
 *  - ok=true → enviado
 *  - skipped=true → não enviado por proteção; `retry_after_ms` informa quando tentar de novo
 *  - ok=false → tentativa falhou no servidor (Evolution)
 */
export type SafeSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  data?: any;
  retry_after_ms?: number;
};

/** Envio cru — mantido para compatibilidade. Prefira `safeSend`. */
export async function callEvolution(cfg: any, number: string, message: string) {
  const normalized = normalizeBR(number);
  return rawSendText(cfg, normalized, message);
}

/**
 * Envio com proteção anti-ban rigorosa:
 *  - respeita horário comercial (08-21 BR)
 *  - intervalo mínimo entre mensagens
 *  - limite por hora e por dia
 *  - presence "composing" antes do texto
 *  - jitter aleatório (humano)
 *  - micro-obfuscação para evitar mensagem idêntica em massa
 */
export async function safeSend(
  supabase: SupabaseClient,
  cfg: any,
  barbeiroId: string | null,
  number: string,
  message: string,
): Promise<SafeSendResult> {
  const ab = antibanCfg(cfg);
  const normalized = normalizeBR(number);

  if (!ab.antiban_enabled) {
    const r = await rawSendText(cfg, normalized, message);
    return { ...r };
  }

  // 1) Horário comercial
  const hour = nowInSP();
  if (hour < ab.business_hours_start || hour >= ab.business_hours_end) {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, rand(0, 30), 0, 0);
    return {
      ok: false, skipped: true, reason: 'fora_horario_comercial',
      retry_after_ms: Math.max(15 * 60_000, nextHour.getTime() - Date.now()),
    };
  }

  // 2) Rate-limit por barbeiro
  const { c1h, c24h, lastSentAt } = await getCounts(supabase, barbeiroId);
  if (c24h >= ab.max_per_day) {
    return { ok: false, skipped: true, reason: 'limite_diario', retry_after_ms: 60 * 60_000 };
  }
  if (c1h >= ab.max_per_hour) {
    return { ok: false, skipped: true, reason: 'limite_horario', retry_after_ms: rand(20, 40) * 60_000 };
  }

  // 3) Gap mínimo entre mensagens
  const gapMs = ab.min_gap_seconds * 1000;
  const since = Date.now() - lastSentAt;
  if (lastSentAt && since < gapMs) {
    return { ok: false, skipped: true, reason: 'gap_minimo', retry_after_ms: gapMs - since + rand(500, 3000) };
  }

  // 4) Jitter humano antes de qualquer ação
  await sleep(rand(800, 2500));

  // 5) Presence composing é desligado por padrão: reduz chamadas extras à
  // Evolution/WhatsApp e evita qualquer re-sincronização desnecessária.
  if (ab.presence_simulation) {
    await sendPresence(cfg, normalized, 'composing');
    // tempo proporcional ao tamanho do texto (limites sãos)
    const typingMs = Math.min(8000, Math.max(1500, Math.floor(message.length * rand(35, 70))));
    await sleep(typingMs);
    await sendPresence(cfg, normalized, 'paused');
    await sleep(rand(300, 900));
  }

  // 6) Envia com micro-obfuscação
  const finalMsg = obfuscate(message);
  const result = await rawSendText(cfg, normalized, finalMsg);
  return { ...result };
}

// ===================== NOTIFICAÇÃO AO BARBEIRO =====================

function fmtBRDate(d: string): string {
  // d esperado "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || '');
}

function fmtMoney(n: number): string {
  return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
}

/**
 * Enfileira (com anti-ban) uma mensagem ORGANIZADA e SEM EMOJIS para o WhatsApp
 * do barbeiro que vai executar o serviço, contendo: horário, nome do cliente,
 * serviços, valor pago (sinal) e valor pendente.
 *
 * Idempotente: não duplica se já houver um aviso para o mesmo agendamento.
 */
export async function enqueueBarberAppointmentNotice(agendamentoId: string): Promise<boolean> {
  if (!agendamentoId) return false;
  const supabase = admin();

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, barbeiro_id, cliente_nome, cliente_sobrenome, data, hora, servico_ids, valor_sinal, taxa_app, valor_pago')
    .eq('id', agendamentoId)
    .maybeSingle();
  if (!ag?.barbeiro_id) return false;

  // Evita duplicidade de aviso por agendamento
  const { data: dup } = await supabase
    .from('whatsapp_queue')
    .select('id')
    .eq('agendamento_id', ag.id)
    .eq('tipo', 'barbeiro_agendamento')
    .limit(1)
    .maybeSingle();
  if (dup) return false;

  // Telefone do barbeiro
  const { data: barber } = await supabase
    .from('profiles')
    .select('telefone')
    .eq('id', ag.barbeiro_id)
    .maybeSingle();
  if (!barber?.telefone) return false;

  // Precisa ter instância Evolution configurada para esse barbeiro
  const cfg = await getConfig(supabase, ag.barbeiro_id);
  if (!cfg?.api_url || !cfg?.api_key || !cfg?.instance) return false;

  // Serviços + total
  let serviceNames: string[] = [];
  let serviceTotal = 0;
  if (Array.isArray(ag.servico_ids) && ag.servico_ids.length > 0) {
    const { data: svcs } = await supabase
      .from('servicos')
      .select('nome, preco')
      .in('id', ag.servico_ids);
    serviceNames = (svcs || []).map((s: any) => s.nome).filter(Boolean);
    serviceTotal = (svcs || []).reduce((t: number, s: any) => t + Number(s.preco || 0), 0);
  }

  const taxa = Number(ag.taxa_app || 0);
  const pago = Number(ag.valor_pago || ag.valor_sinal || 0);
  const sinalServico = Math.max(0, Number(ag.valor_sinal || 0) - taxa); // parte do sinal que abate o serviço
  const pendente = Math.max(0, +(serviceTotal - sinalServico).toFixed(2));

  const cliente = `${ag.cliente_nome || ''} ${ag.cliente_sobrenome || ''}`.trim();

  // Mensagem sem emojis (anti-ban)
  const mensagem = [
    'Novo agendamento confirmado',
    `Cliente: ${cliente}`,
    `Data: ${fmtBRDate(ag.data)} as ${String(ag.hora).slice(0, 5)}`,
    serviceNames.length ? `Servicos: ${serviceNames.join(', ')}` : null,
    `Valor pago (sinal): ${fmtMoney(pago)}`,
    `Valor pendente: ${fmtMoney(pendente)}`,
  ].filter(Boolean).join('\n');

  const { error } = await supabase.from('whatsapp_queue').insert({
    destinatario: barber.telefone,
    mensagem,
    tipo: 'barbeiro_agendamento',
    barbeiro_id: ag.barbeiro_id,
    agendamento_id: ag.id,
    next_attempt_at: new Date(Date.now() + 3000 + Math.floor(Math.random() * 6000)).toISOString(),
  });
  return !error;
}
