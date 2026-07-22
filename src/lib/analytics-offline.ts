// Offline queue for analytics_events using the offline_mutations table + localStorage fallback.
// - Online: insert directly into analytics_events.
// - Offline / falha: enfileira em localStorage e replica quando voltar a rede.
// - Também espelha em offline_mutations para o worker de sync do backend (se logado).

import { supabase } from "@/integrations/supabase/client";

type Event = {
  company_id: string | null;
  user_id: string | null;
  event_name: string;
  properties: Record<string, unknown>;
  ts: number;
};

const KEY = "analytics_events_offline_queue";
const MAX = 500;

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function readQueue(): Event[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as Event[]; } catch { return []; }
}

function writeQueue(q: Event[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q.slice(-MAX))); } catch { /* ignore */ }
}

async function insertEvent(ev: Event) {
  const { error } = await supabase.from("analytics_events" as never).insert({
    company_id: ev.company_id,
    user_id: ev.user_id,
    event_name: ev.event_name,
    properties: ev.properties,
    created_at: new Date(ev.ts).toISOString(),
  } as never);
  if (error) throw error;
}

async function persistOfflineMutation(ev: Event) {
  // Best-effort mirror; ignora falha (RLS, sem sessão, etc).
  try {
    await supabase.from("offline_mutations" as never).insert({
      user_id: ev.user_id,
      company_id: ev.company_id,
      resource: "analytics_events",
      operation: "insert",
      payload: {
        event_name: ev.event_name,
        properties: ev.properties,
        created_at: new Date(ev.ts).toISOString(),
      },
      status: "pending",
    } as never);
  } catch { /* ignore */ }
}

export async function trackAnalyticsEvent(
  companyId: string | null,
  userId: string | null,
  name: string,
  properties: Record<string, unknown> = {},
) {
  const ev: Event = { company_id: companyId, user_id: userId, event_name: name, properties, ts: Date.now() };
  if (isOnline()) {
    try { await insertEvent(ev); return; } catch { /* cai para fila */ }
  }
  const q = readQueue();
  q.push(ev);
  writeQueue(q);
  void persistOfflineMutation(ev);
}

let flushing = false;
export async function flushAnalyticsQueue(): Promise<{ sent: number; kept: number }> {
  if (flushing || !isOnline()) return { sent: 0, kept: readQueue().length };
  flushing = true;
  const q = readQueue();
  const remaining: Event[] = [];
  let sent = 0;
  try {
    for (const ev of q) {
      try { await insertEvent(ev); sent++; } catch { remaining.push(ev); }
    }
    writeQueue(remaining);
  } finally {
    flushing = false;
  }
  return { sent, kept: remaining.length };
}

export function getAnalyticsQueueSize(): number {
  return readQueue().length;
}

let installed = false;
export function installAnalyticsFlusher() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("online", () => { void flushAnalyticsQueue(); });
  // Tenta esvaziar no boot também.
  void flushAnalyticsQueue();
}
