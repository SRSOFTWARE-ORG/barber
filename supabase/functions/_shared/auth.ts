// Helpers de autenticação/autorização para edge functions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !data?.user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return { user: data.user, supabase };
}

export async function requireRole(req: Request, roles: ('admin' | 'ceo')[]) {
  const { user, supabase } = await requireUser(req);
  const { data: rows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  const userRoles = (rows ?? []).map((r: any) => r.role);
  const ok = roles.some(r => userRoles.includes(r));
  if (!ok) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  return { user, supabase, userRoles };
}

export function errorResponse(e: unknown, corsHeaders: Record<string, string>) {
  if (e instanceof Response) {
    // Inject CORS into thrown auth response
    const headers = new Headers(e.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
    headers.set('Content-Type', 'application/json');
    return new Response(e.body, { status: e.status, headers });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
