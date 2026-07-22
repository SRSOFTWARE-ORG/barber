import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Validates a bearer token and returns the authenticated user id (or null). */
async function userIdFromToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const { a_token, b_token, provider } = await req.json().catch(() => ({}));
    if (!a_token || !b_token || !provider) {
      return json({ error: 'missing_params' }, 400);
    }
    if (provider !== 'google' && provider !== 'apple') {
      return json({ error: 'invalid_provider' }, 400);
    }

    // a_token = the account the user wants to keep (was logged in)
    // b_token = the freshly created OAuth session for the chosen provider
    const [aId, bId] = await Promise.all([
      userIdFromToken(a_token),
      userIdFromToken(b_token),
    ]);
    if (!aId || !bId) return json({ error: 'unauthorized' }, 401);

    // Same account already (provider email matched the real account → auto-linked).
    if (aId === bId) return json({ linked: true, merged: false });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Confirm the throwaway account (B) actually owns this provider identity.
    const { data: bUser, error: bErr } = await admin.auth.admin.getUserById(bId);
    if (bErr || !bUser?.user) return json({ error: 'b_not_found' }, 400);
    const bHasProvider = (bUser.user.identities || []).some((i) => i.provider === provider);
    if (!bHasProvider) return json({ error: 'provider_not_on_b' }, 400);

    // The real account (A) must not already have this provider linked.
    const { data: aUser, error: aErr } = await admin.auth.admin.getUserById(aId);
    if (aErr || !aUser?.user) return json({ error: 'a_not_found' }, 400);
    const aHasProvider = (aUser.user.identities || []).some((i) => i.provider === provider);
    if (aHasProvider) return json({ error: 'already_linked' }, 409);

    // Re-parent the identity from B onto A, then delete the throwaway account.
    const { data: moved, error: mvErr } = await admin.rpc('admin_reparent_identity', {
      _provider: provider,
      _from: bId,
      _to: aId,
    });
    if (mvErr) return json({ error: 'reparent_failed', detail: mvErr.message }, 500);
    if (!moved || Number(moved) < 1) return json({ error: 'nothing_moved' }, 500);

    // Remove the now-empty throwaway account (cascades its profile).
    await admin.auth.admin.deleteUser(bId).catch(() => {});

    return json({ linked: true, merged: true });
  } catch (e) {
    return json({ error: 'internal', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
