// =====================================================================
// evolution-webhook — recebe eventos da Evolution API (inbound + status)
// =====================================================================
// Deploy manual:
//   supabase functions deploy evolution-webhook \
//     --project-ref ddrwahpcbsbxhflhskuh --no-verify-jwt
//
// Configure na Evolution API (por instância) o webhook apontando para:
//   https://ddrwahpcbsbxhflhskuh.functions.supabase.co/evolution-webhook
// Eventos recomendados: MESSAGES_UPSERT, MESSAGES_UPDATE, SEND_MESSAGE
//
// Segurança: defina EVOLUTION_WEBHOOK_TOKEN e envie como header X-Token
// ou query ?token=... (Evolution permite headers customizados).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN    = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN");
const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
};

function ok(body: unknown = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Mapeia número (E.164 / JID) para company_id via messaging_settings.evolution_instance
async function resolveCompany(instance?: string): Promise<string | null> {
  if (!instance) return null;
  const { data } = await sb.from("messaging_settings")
    .select("company_id").eq("evolution_instance", instance).maybeSingle();
  return data?.company_id ?? null;
}

async function upsertConversation(companyId: string, phone: string) {
  const { data: existing } = await sb.from("whatsapp_conversations")
    .select("id").eq("company_id", companyId).eq("phone", phone).maybeSingle();
  if (existing) return existing.id;
  const { data: client } = await sb.from("clients")
    .select("id").eq("company_id", companyId).eq("phone", phone).maybeSingle();
  const { data: created, error } = await sb.from("whatsapp_conversations")
    .insert({ company_id: companyId, phone, client_id: client?.id ?? null, last_message_at: new Date().toISOString() })
    .select("id").single();
  if (error) throw new Error(error.message);
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (TOKEN) {
    const t = req.headers.get("x-token") ?? new URL(req.url).searchParams.get("token");
    if (t !== TOKEN) return ok({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ok({ error: "invalid_json" }, 400); }

  const event    = (body.event as string) ?? "";
  const instance = (body.instance as string) ?? (body.instanceName as string) ?? undefined;
  const data     = (body.data as Record<string, unknown>) ?? {};

  const companyId = await resolveCompany(instance);
  if (!companyId) return ok({ ignored: true, reason: "unknown_instance" });

  try {
    // Mensagens novas (envio ou recebimento)
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      const key   = (data as { key?: { remoteJid?: string; fromMe?: boolean; id?: string } }).key ?? {};
      const msg   = (data as { message?: Record<string, unknown> }).message ?? {};
      const jid   = key.remoteJid ?? "";
      const phone = jid.replace(/@.+$/, "");
      if (!phone) return ok({ ignored: true, reason: "no_phone" });

      const convId = await upsertConversation(companyId, phone);
      const text =
        (msg as { conversation?: string }).conversation
        ?? (msg as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text
        ?? null;

      await sb.from("whatsapp_messages").insert({
        conversation_id: convId,
        direction: key.fromMe ? "outbound" : "inbound",
        provider_ref: key.id ?? null,
        body: text,
        status: "delivered",
        raw: data,
      });

      await sb.from("whatsapp_conversations").update({
        last_message_at: new Date().toISOString(),
        unread_count: key.fromMe ? 0 : undefined,
      }).eq("id", convId);

      return ok();
    }

    // Atualização de status (delivered/read/failed)
    if (event === "messages.update" || event === "MESSAGES_UPDATE") {
      const arr = Array.isArray(data) ? data : [data];
      for (const item of arr as Array<Record<string, unknown>>) {
        const key = (item.key as { id?: string }) ?? {};
        const status = String(item.status ?? item.update ?? "").toLowerCase();
        if (!key.id) continue;
        const newStatus = status.includes("read") ? "read"
                       : status.includes("deliver") ? "delivered"
                       : status.includes("fail") ? "failed" : null;
        if (!newStatus) continue;

        await sb.from("whatsapp_messages").update({ status: newStatus })
          .eq("provider_ref", key.id);

        // Reflete no outbox se rastreado
        const patch: Record<string, unknown> = { status: newStatus };
        if (newStatus === "delivered") patch.delivered_at = new Date().toISOString();
        if (newStatus === "read")      patch.read_at      = new Date().toISOString();
        await sb.from("message_outbox").update(patch).eq("provider_ref", key.id);
      }
      return ok();
    }

    return ok({ ignored: true, event });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok({ error: msg }, 500);
  }
});
