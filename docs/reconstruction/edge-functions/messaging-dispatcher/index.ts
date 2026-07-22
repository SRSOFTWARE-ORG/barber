// =====================================================================
// messaging-dispatcher — Edge Function (Deno) para Supabase próprio
// =====================================================================
// Deploy manual:
//   supabase functions deploy messaging-dispatcher \
//     --project-ref ddrwahpcbsbxhflhskuh --no-verify-jwt
//
// Segredos (Project Settings → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (setados automaticamente pelo Supabase)
//   EVOLUTION_API_URL, EVOLUTION_API_KEY
//   RESEND_API_KEY                (opcional: e-mail)
//   WEBPUSH_VAPID_PUBLIC, WEBPUSH_VAPID_PRIVATE, WEBPUSH_VAPID_SUBJECT (opcional)
//   DISPATCHER_TOKEN              (recomendado: exige header X-Token)
//
// Aciona via pg_cron ou cron externo (a cada 30–60s).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL  = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY  = Deno.env.get("EVOLUTION_API_KEY");
const RESEND   = Deno.env.get("RESEND_API_KEY");
const DISPATCH_TOKEN = Deno.env.get("DISPATCHER_TOKEN");

const BATCH = 25;
const MAX_BACKOFF_MIN = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
};

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

interface OutboxRow {
  id: string;
  company_id: string;
  channel: "whatsapp" | "email" | "push" | "sms" | "in_app";
  kind: string;
  to_phone: string | null;
  to_email: string | null;
  to_user_id: string | null;
  subject: string | null;
  body: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

function backoffMinutes(attempt: number) {
  return Math.min(MAX_BACKOFF_MIN, Math.pow(2, attempt));
}

async function logEvent(outboxId: string, kind: string, detail: unknown = {}, statusCode?: number, providerRef?: string) {
  await sb.from("message_events").insert({
    outbox_id: outboxId, kind, detail, status_code: statusCode, provider_ref: providerRef,
  });
}

async function sendWhatsApp(row: OutboxRow) {
  if (!EVO_URL || !EVO_KEY) throw new Error("Evolution não configurada");
  if (!row.to_phone) throw new Error("to_phone ausente");
  const instance = (row.payload as { instance?: string }).instance
    ?? await getInstance(row.company_id);
  if (!instance) throw new Error("evolution_instance não configurada para a empresa");

  const url = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
    body: JSON.stringify({ number: row.to_phone.replace(/\D/g, ""), text: row.body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${text}`);
  let providerRef: string | undefined;
  try { providerRef = JSON.parse(text)?.key?.id; } catch { /* ignore */ }
  return { providerRef, raw: text };
}

async function sendEmail(row: OutboxRow) {
  if (!RESEND) throw new Error("RESEND_API_KEY não configurada");
  if (!row.to_email) throw new Error("to_email ausente");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND}` },
    body: JSON.stringify({
      from: (row.payload as { from?: string }).from ?? "no-reply@example.com",
      to: [row.to_email],
      subject: row.subject ?? "(sem assunto)",
      html: row.body,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`);
  let providerRef: string | undefined;
  try { providerRef = JSON.parse(text)?.id; } catch { /* ignore */ }
  return { providerRef, raw: text };
}

async function sendPush(row: OutboxRow) {
  // Stub: implementação Web Push requer biblioteca VAPID compatível com Deno.
  // Recomendado: usar 'https://esm.sh/web-push@3' via um worker Node dedicado,
  // ou trocar por FCM HTTP v1 se preferir apenas mobile.
  if (!row.to_user_id) throw new Error("to_user_id ausente");
  const { data: devices } = await sb.from("push_devices")
    .select("*").eq("user_id", row.to_user_id).eq("is_active", true);
  if (!devices?.length) throw new Error("Nenhum device push ativo");
  // Loga o intento; deixa a entrega efetiva para implementação futura.
  return { providerRef: undefined, raw: `push_stub:${devices.length}_devices` };
}

const instanceCache = new Map<string, string | null>();
async function getInstance(companyId: string): Promise<string | null> {
  if (instanceCache.has(companyId)) return instanceCache.get(companyId)!;
  const { data } = await sb.from("messaging_settings")
    .select("evolution_instance").eq("company_id", companyId).maybeSingle();
  const v = data?.evolution_instance ?? null;
  instanceCache.set(companyId, v);
  return v;
}

async function processOne(row: OutboxRow) {
  await sb.from("message_outbox").update({
    status: "sending", attempts: row.attempts + 1,
  }).eq("id", row.id);
  await logEvent(row.id, "sending");

  try {
    let out: { providerRef?: string; raw: string };
    switch (row.channel) {
      case "whatsapp": out = await sendWhatsApp(row); break;
      case "email":    out = await sendEmail(row);    break;
      case "push":     out = await sendPush(row);     break;
      case "in_app":   out = { providerRef: undefined, raw: "in_app_stored" }; break;
      default: throw new Error(`Canal não suportado: ${row.channel}`);
    }
    await sb.from("message_outbox").update({
      status: "sent", sent_at: new Date().toISOString(),
      provider_ref: out.providerRef, last_error: null,
    }).eq("id", row.id);
    await logEvent(row.id, "sent", { raw: out.raw?.slice(0, 500) }, 200, out.providerRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const attempts = row.attempts + 1;
    const final = attempts >= row.max_attempts;
    const nextAt = new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();
    await sb.from("message_outbox").update({
      status: final ? "failed" : "queued",
      last_error: msg,
      failed_at: final ? new Date().toISOString() : null,
      next_attempt_at: nextAt,
    }).eq("id", row.id);
    await logEvent(row.id, final ? "failed" : "enqueued", { error: msg });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (DISPATCH_TOKEN) {
    const t = req.headers.get("x-token");
    if (t !== DISPATCH_TOKEN) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await sb
    .from("message_outbox")
    .select("id, company_id, channel, kind, to_phone, to_email, to_user_id, subject, body, payload, attempts, max_attempts")
    .in("status", ["queued"])
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const list = (rows ?? []) as OutboxRow[];
  for (const r of list) {
    // sequencial para respeitar rate-limit do WhatsApp; troque por Promise.all se quiser paralelismo.
    await processOne(r);
  }

  return new Response(JSON.stringify({ processed: list.length }),
    { headers: { ...cors, "Content-Type": "application/json" } });
});
