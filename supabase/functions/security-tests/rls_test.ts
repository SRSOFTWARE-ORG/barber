// RLS regression tests — verify that the `avaliacoes` and `realtime.messages`
// access rules cannot be bypassed by an authenticated user acting on data that
// is not theirs.
//
// Run with: supabase test (Deno) — needs --allow-net --allow-env.
// Uses the service-role key to provision throwaway test accounts, then drives
// the Data API as each user with the anon key (RLS enforced).

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON =
  Deno.env.get('SUPABASE_ANON_KEY') ??
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
  Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY')!;

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function makeUser(tag: string) {
  const email = `rls-test-${tag}-${crypto.randomUUID()}@example.com`;
  const password = `Pw!${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  // Ensure a profiles row exists so RLS/trigger tests target a real row.
  await admin.from('profiles').upsert({ id: data.user!.id, full_name: `Test ${tag}` });
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw signInErr;
  return { id: data.user!.id, client };
}

async function cleanupUser(id: string) {
  await admin.from('profiles').delete().eq('id', id);
  await admin.auth.admin.deleteUser(id);
}

Deno.test('avaliacoes: user cannot review another user\'s appointment', async () => {
  const a = await makeUser('a');
  const b = await makeUser('b');
  try {
    // Appointment that belongs to user A (created via service role).
    const { data: appt, error: apptErr } = await admin
      .from('agendamentos')
      .insert({
        cliente_id: a.id,
        cliente_nome: 'Cliente',
        cliente_sobrenome: 'A',
        cliente_telefone: '11999999999',
        servico_ids: [],
        barbeiro_id: b.id, // arbitrary
        data: '2999-01-01',
        hora: '10:00',
        status: 'pending',
      })
      .select('id')
      .single();
    assertEquals(apptErr, null);

    // User B tries to review A's appointment → must be blocked by RLS WITH CHECK.
    const { error: hijackErr } = await b.client.from('avaliacoes').insert({
      agendamento_id: appt!.id,
      cliente_id: b.id,
      adm_id: b.id,
      nota: 5,
    });
    assert(hijackErr !== null, 'cross-user review insert should be rejected');

    // The legitimate owner A also cannot spoof someone else as cliente_id.
    const { error: spoofErr } = await a.client.from('avaliacoes').insert({
      agendamento_id: appt!.id,
      cliente_id: b.id, // not the caller
      adm_id: b.id,
      nota: 1,
    });
    assert(spoofErr !== null, 'review with foreign cliente_id should be rejected');

    // Owner A reviewing their own appointment as themselves should succeed.
    const { error: okErr } = await a.client.from('avaliacoes').insert({
      agendamento_id: appt!.id,
      cliente_id: a.id,
      adm_id: b.id,
      nota: 5,
    });
    assertEquals(okErr, null);

    // User B must not be able to read A's review.
    const { data: bSees } = await b.client
      .from('avaliacoes')
      .select('id')
      .eq('agendamento_id', appt!.id);
    assertEquals((bSees ?? []).length, 0, 'B must not read A reviews');
  } finally {
    await cleanupUser(a.id);
    await cleanupUser(b.id);
  }
});

Deno.test('profiles: user cannot self-assign adm_responsavel_id directly', async () => {
  const a = await makeUser('link');
  try {
    // Direct write to the tenant-scope column must be blocked by the guard trigger.
    const { error } = await a.client
      .from('profiles')
      .update({ adm_responsavel_id: a.id })
      .eq('id', a.id);
    assert(error !== null, 'direct adm_responsavel_id self-write must be blocked');

    // The sanctioned RPC must reject a non-barber target.
    const { error: rpcErr } = await a.client.rpc('link_self_to_barber', {
      _barber_id: a.id,
    });
    assert(rpcErr !== null, 'linking to a non-barber must be rejected');
  } finally {
    await cleanupUser(a.id);
  }
});

Deno.test('mensagens: a user cannot read another user\'s messages', async () => {
  const a = await makeUser('msg-a');
  const b = await makeUser('msg-b');
  const c = await makeUser('msg-c');
  try {
    // A sends a private message to B.
    const { data: msg, error: sendErr } = await a.client
      .from('mensagens')
      .insert({ remetente_id: a.id, destinatario_id: b.id, conteudo: 'segredo' })
      .select('id')
      .single();
    assertEquals(sendErr, null);

    // C (a third party) must not be able to read it.
    const { data: cSees } = await c.client
      .from('mensagens')
      .select('id')
      .eq('id', msg!.id);
    assertEquals((cSees ?? []).length, 0, 'third party must not read the message');

    // B (the recipient) can read it.
    const { data: bSees } = await b.client
      .from('mensagens')
      .select('id')
      .eq('id', msg!.id);
    assertEquals((bSees ?? []).length, 1, 'recipient must read the message');

    // C cannot spoof the sender id on insert.
    const { error: spoofErr } = await c.client.from('mensagens').insert({
      remetente_id: a.id,
      destinatario_id: b.id,
      conteudo: 'spoof',
    });
    assert(spoofErr !== null, 'sending as another user must be rejected');
  } finally {
    await admin.from('mensagens').delete().or(`remetente_id.eq.${a.id},destinatario_id.eq.${a.id}`);
    await cleanupUser(a.id);
    await cleanupUser(b.id);
    await cleanupUser(c.id);
  }
});


Deno.test('audit_realtime_access: foreign topic is recorded as denied', async () => {
  const a = await makeUser('audit');
  try {
    const foreign = 'platform-subs-00000000-0000-0000-0000-000000000000';
    const { error } = await a.client.rpc('audit_realtime_access', {
      _topic: foreign,
    });
    assertEquals(error, null);

    // Service role can read the audit row and confirm it was flagged denied.
    const { data: rows } = await admin
      .from('security_audit_log')
      .select('event_type, allowed, details')
      .eq('user_id', a.id)
      .eq('event_type', 'realtime_subscribe_denied');
    assert((rows ?? []).length >= 1, 'foreign topic must be logged as denied');
    assertEquals(rows![0].allowed, false);
  } finally {
    await admin.from('security_audit_log').delete().eq('user_id', a.id);
    await cleanupUser(a.id);
  }
});
