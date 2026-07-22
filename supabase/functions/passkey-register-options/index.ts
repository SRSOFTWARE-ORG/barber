// Gera as opções de REGISTRO de uma passkey (biometria) para o usuário logado.
import { corsHeaders } from '../_shared/cors.ts';
import { adminClient, getRP, getUserFromReq, RP_NAME } from '../_shared/webauthn.ts';
import { generateRegistrationOptions } from 'https://esm.sh/@simplewebauthn/server@13.1.1';
import { isoUint8Array } from 'https://esm.sh/@simplewebauthn/server@13.1.1/helpers';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user } = await getUserFromReq(req);
    const admin = adminClient();
    const { rpID } = getRP(req);

    // Credenciais já cadastradas — evita registro duplicado no mesmo aparelho.
    const { data: existing } = await admin
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: isoUint8Array.fromUTF8String(user.id),
      userName: user.email ?? user.id,
      userDisplayName: (user.user_metadata as any)?.nome ?? user.email ?? 'Usuário',
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((c: any) => ({
        id: c.credential_id,
        transports: c.transports ?? undefined,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
    });

    // Guarda o desafio para validar na etapa de verificação.
    await admin
      .from('webauthn_challenges')
      .delete()
      .eq('user_id', user.id)
      .eq('kind', 'register');

    const { data: challengeRow, error: chErr } = await admin
      .from('webauthn_challenges')
      .insert({ challenge: options.challenge, user_id: user.id, kind: 'register' })
      .select('id')
      .single();
    if (chErr) throw chErr;

    return new Response(JSON.stringify({ options, challengeId: challengeRow.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e instanceof Response) {
      const h = new Headers(e.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => h.set(k, v));
      h.set('Content-Type', 'application/json');
      return new Response(e.body, { status: e.status, headers: h });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
