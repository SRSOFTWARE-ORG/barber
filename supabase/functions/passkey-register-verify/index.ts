// Verifica e salva a passkey (biometria) recém criada pelo aparelho.
import { corsHeaders } from '../_shared/cors.ts';
import { adminClient, getRP, getUserFromReq } from '../_shared/webauthn.ts';
import { verifyRegistrationResponse } from 'https://esm.sh/@simplewebauthn/server@13.1.1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user } = await getUserFromReq(req);
    const admin = adminClient();
    const { rpID, origin } = getRP(req);
    const { response, challengeId } = await req.json();

    if (!response || !challengeId) throw new Error('Dados de registro ausentes.');

    const { data: ch } = await admin
      .from('webauthn_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('user_id', user.id)
      .eq('kind', 'register')
      .maybeSingle();
    if (!ch) throw new Error('Desafio inválido ou expirado. Tente novamente.');
    if (new Date(ch.expires_at).getTime() < Date.now()) {
      throw new Error('Desafio expirado. Tente novamente.');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Não foi possível validar a biometria.');
    }

    const { credential } = verification.registrationInfo;

    const { error: insErr } = await admin.from('webauthn_credentials').insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: btoa(String.fromCharCode(...credential.publicKey)),
      counter: credential.counter,
      transports: credential.transports ?? null,
    });
    if (insErr) throw insErr;

    await admin.from('webauthn_challenges').delete().eq('id', challengeId);
    await admin.from('profiles').update({ passkey_enabled: true }).eq('id', user.id);

    return new Response(JSON.stringify({ verified: true }), {
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
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
