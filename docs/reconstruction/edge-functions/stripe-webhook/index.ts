// Edge Function: stripe-webhook
// Recebe eventos do Stripe e atualiza company_subscriptions (ativar/renovar/encerrar).
// Configure em supabase/config.toml: verify_jwt = false (endpoint público)
// Env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('missing signature', { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch (e: any) {
    return new Response(`bad signature: ${e.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const companyId = s.metadata?.company_id;
        const planId = s.metadata?.plan_id;
        if (!companyId || !planId) break;
        const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
        const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertSubscription(companyId, planId, customerId, sub);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        const companyId = sub.metadata?.company_id;
        const planId = sub.metadata?.plan_id;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        if (companyId && planId) await upsertSubscription(companyId, planId, customerId, sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await admin.from('company_subscriptions').update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          ends_at: new Date().toISOString(),
        }).eq('provider_subscription_id', sub.id);
        break;
      }
      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const sub = await stripe.subscriptions.retrieve(inv.subscription as string);
          await admin.from('company_subscriptions').update({
            status: mapStatus(sub.status),
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }).eq('provider_subscription_id', sub.id);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          await admin.from('company_subscriptions').update({ status: 'past_due' })
            .eq('provider_subscription_id', inv.subscription as string);
        }
        break;
      }
    }
    return new Response('ok', { status: 200 });
  } catch (e: any) {
    console.error('webhook error', e);
    return new Response(`error: ${e.message}`, { status: 500 });
  }
});

function mapStatus(s: Stripe.Subscription.Status): string {
  if (s === 'trialing') return 'trialing';
  if (s === 'active') return 'active';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled';
  return s;
}

async function upsertSubscription(
  companyId: string,
  planId: string,
  customerId: string | undefined,
  sub: Stripe.Subscription,
) {
  const payload = {
    company_id: companyId,
    plan_id: planId,
    provider: 'stripe',
    provider_customer_id: customerId ?? null,
    provider_subscription_id: sub.id,
    status: mapStatus(sub.status),
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    starts_at: new Date(sub.start_date * 1000).toISOString(),
    ends_at: null,
    metadata: sub.metadata ?? {},
  };
  // encerra ativas anteriores da empresa que não sejam esta
  await admin.from('company_subscriptions').update({
    status: 'canceled', canceled_at: new Date().toISOString(), ends_at: new Date().toISOString(),
  })
    .eq('company_id', companyId)
    .in('status', ['trialing', 'active', 'past_due'])
    .neq('provider_subscription_id', sub.id);

  const { data: existing } = await admin.from('company_subscriptions')
    .select('id').eq('provider_subscription_id', sub.id).maybeSingle();
  if (existing) {
    await admin.from('company_subscriptions').update(payload).eq('id', existing.id);
  } else {
    await admin.from('company_subscriptions').insert(payload);
  }
}
