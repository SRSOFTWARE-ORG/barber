// Edge Function: stripe-portal
// Cria um link do Billing Portal do Stripe para a empresa gerenciar assinatura.
// Env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await supa.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (!claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const { company_id } = await req.json();
    if (!company_id) return json({ error: 'company_id required' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: roles } = await admin
      .from('user_roles').select('role').eq('user_id', userId).eq('company_id', company_id);
    const isOwner = (roles ?? []).some((r: any) => ['ceo', 'owner'].includes(r.role));
    if (!isOwner) return json({ error: 'Forbidden' }, 403);

    const { data: sub } = await admin
      .from('company_subscriptions')
      .select('provider_customer_id')
      .eq('company_id', company_id)
      .not('provider_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (!sub?.provider_customer_id) return json({ error: 'No Stripe customer for this company yet' }, 400);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:8080';

    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.provider_customer_id,
      return_url: `${appUrl}/subscription`,
    });
    return json({ url: portal.url });
  } catch (e: any) {
    return json({ error: e?.message ?? 'error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
