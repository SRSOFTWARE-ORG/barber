// Helpers compartilhados para o fluxo WebAuthn (Passkeys/Biometria).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const RP_NAME = 'Barbershop';

/** Cliente admin (service role) para operações privilegiadas. */
export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Deriva o Relying Party ID e o Origin esperado a partir do cabeçalho Origin
 * da requisição. Assim funciona em qualquer domínio (preview, published ou
 * o domínio oficial barber.srsoftwarestore.com) sem hardcode.
 */
export function getRP(req: Request): { rpID: string; origin: string } {
  const origin = req.headers.get('origin') ?? '';
  let rpID = 'localhost';
  try {
    rpID = new URL(origin).hostname;
  } catch {
    // mantém localhost como fallback
  }
  return { rpID, origin };
}

/** Valida o token Bearer e retorna o usuário autenticado (ou lança 401). */
export async function getUserFromReq(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401 });
  }
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !data?.user) {
    throw new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401 });
  }
  return { user: data.user, admin };
}
