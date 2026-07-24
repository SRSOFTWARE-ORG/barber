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
 * Retorna o Relying Party ID e Origin esperados para o WebAuthn.
 *
 * Segurança: o Origin/RP ID **não** pode ser derivado do cabeçalho `Origin`
 * da requisição — isso anula a proteção anti-phishing do WebAuthn, pois um
 * atacante em um domínio clonado poderia mandar seu próprio Origin e ser
 * aceito. Em vez disso mantemos uma allowlist fixa (com override opcional
 * via env `WEBAUTHN_ALLOWED_ORIGINS`, lista separada por vírgulas de
 * origens https válidas) e só aceitamos o Origin da requisição se ele
 * estiver nessa allowlist. Caso contrário, lançamos e o handler responde
 * com erro (nunca falamos "confie no cliente").
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://barber.srsoftwarestore.com',
];

function getAllowedOrigins(): string[] {
  const extra = (Deno.env.get('WEBAUTHN_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]));
}

export function getRP(req: Request): { rpID: string; origin: string } {
  const requestOrigin = req.headers.get('origin') ?? '';
  const allowed = getAllowedOrigins();

  if (!requestOrigin || !allowed.includes(requestOrigin)) {
    throw new Error(
      `Origin não autorizado para WebAuthn: "${requestOrigin || '(vazio)'}". ` +
      `Configure WEBAUTHN_ALLOWED_ORIGINS para habilitar domínios adicionais.`,
    );
  }

  let rpID: string;
  try {
    rpID = new URL(requestOrigin).hostname;
  } catch {
    throw new Error(`Origin inválido para WebAuthn: "${requestOrigin}"`);
  }

  return { rpID, origin: requestOrigin };
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
