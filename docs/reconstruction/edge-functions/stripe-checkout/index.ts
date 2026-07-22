// Edge Function: stripe-checkout
// Cria uma Checkout Session do Stripe para assinatura da empresa.
// Env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await supa.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const { plan_id, company_id } = await req.json();
    if (!plan_id || !company_id) return json({ error: 'plan_id and company_id required' }, 400);

    // Admin client bypassa RLS para leituras seguras
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Autoriza: o usuário precisa ser ceo/owner da empresa
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('company_id', company_id);
    const isOwner = (roles ?? []).some((r: any) => ['ceo', 'owner'].includes(r.role));
    if (!isOwner) {
      const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
      if (!pa) return json({ error: 'Forbidden' }, 403);
    }

    const { data: plan } = await admin
      .from('platform_plans')
      .select('id, code, stripe_price_id, trial_days')
      .eq('id', plan_id)
      .maybeSingle();
    if (!plan?.stripe_price_id) return json({ error: 'Plan missing stripe_price_id' }, 400);

    const { data: existing } = await admin
      .from('company_subscriptions')
      .select('provider_customer_id')
      .eq('company_id', company_id)
      .not('provider_customer_id', 'is', null)
      .limit(1)
      .maybeSingle();

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:8080';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer: existing?.provider_customer_id ?? undefined,
      subscription_data: {
        trial_period_days: plan.trial_days ?? 14,
        metadata: { company_id, plan_id: plan.id, plan_code: plan.code },
      },
      metadata: { company_id, plan_id: plan.id, user_id: userId },
      success_url: `${appUrl}/subscription?checkout=success`,
      cancel_url: `${appUrl}/subscription?checkout=cancel`,
    });

    return json({ url: session.url });
  } catch (e: any) {
    return json({ error: e?.message ?? 'error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
