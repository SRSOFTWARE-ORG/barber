// Testa conexão com Evolution API. Requer admin/ceo (anti-SSRF).
// Restringe api_url a hosts comuns Evolution (não aceita qualquer URL arbitrária).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireRole, errorResponse } from '../_shared/auth.ts';

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    let host = u.hostname.toLowerCase();
    // Normaliza IPv6 entre colchetes
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    // Bloqueia loopback / redes privadas / link-local / metadata IPv4 (anti-SSRF)
    if (/^(localhost$|127\.|0\.|10\.|169\.254\.)/i.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    // CGNAT / shared address space (100.64.0.0/10)
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false;
    if (host === '169.254.169.254') return false;
    // Bloqueia IPv6 privado: loopback (::1), ULA (fc00::/7 -> fc/fd), link-local (fe80::/10)
    if (host === '::1' || host === '::') return false;
    if (/^f[cd][0-9a-f]{0,2}:/i.test(host)) return false;
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return false;
    // IPv6 mapeado para IPv4 (::ffff:127.0.0.1 etc.) já coberto acima por includes
    if (host.includes('::ffff:') && /(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    // Precisa ser um domínio público (tem ponto) ou um IPv6 público; bloqueia hosts sem ponto que não sejam IPv6
    if (!host.includes('.') && !host.includes(':')) return false;
    // Qualquer outro host público é permitido
    return true;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    await requireRole(req, ['admin', 'ceo']);
    const { api_url, api_key, instance } = await req.json();
    if (!api_url || !api_key || !instance) {
      return new Response(JSON.stringify({ ok: false, error: 'Campos obrigatórios: api_url, api_key, instance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!isAllowedUrl(api_url)) {
      return new Response(JSON.stringify({ ok: false, error: 'api_url não permitida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const base = String(api_url).replace(/\/$/, '');
    const url = `${base}/instance/connectionState/${encodeURIComponent(instance)}`;
    const resp = await fetch(url, { headers: { apikey: api_key } });
    const data = await resp.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || data?.status || 'unknown';
    const connected = state === 'open' || state === 'connected';
    return new Response(JSON.stringify({ ok: resp.ok, connected, state, raw: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
