import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { corsHeaders } from '../_shared/cors.ts';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@barbearia.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function getInternalSecret(): Promise<string | null> {
  const { data } = await supabase
    .from('internal_secrets')
    .select('value')
    .eq('name', 'webhook_push')
    .maybeSingle();
  return (data?.value as string) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Autenticação: exige X-Internal-Secret (chamada do banco) ou usuário autenticado pedindo push para si mesmo.
    const internalHeader = req.headers.get('X-Internal-Secret') ?? '';
    const expectedSecret = await getInternalSecret();
    let authorizedBySecret = false;
    let callerUserId: string | null = null;

    if (expectedSecret && internalHeader && internalHeader === expectedSecret) {
      authorizedBySecret = true;
    } else {
      const authHeader = req.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const { data } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (data?.user) {
          callerUserId = data.user.id;
        }
      }
    }

    if (!authorizedBySecret && !callerUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, title, message, url, tag } = body as Record<string, string>;
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Quando autenticado por JWT (não pelo segredo interno), só pode mandar para si mesmo.
    if (!authorizedBySecret && callerUserId !== user_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id);
    if (error) throw error;

    const payload = JSON.stringify({
      title: title || 'Barbearia',
      body: message || '',
      url: url || '/',
      tag: tag || 'barbearia',
    });

    const results = await Promise.all(
      (subs ?? []).map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
          return { ok: true, id: s.id };
        } catch (e: any) {
          console.error('[web-push-send] send failed', s.id, e?.statusCode, e?.message ?? String(e));
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id);
          }
          return { ok: false, id: s.id, err: e?.message ?? String(e) };
        }
      })
    );

    console.log('[web-push-send] user', user_id, 'subs', subs?.length ?? 0, 'ok', results.filter((r) => r.ok).length);


    return new Response(JSON.stringify({ sent: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
