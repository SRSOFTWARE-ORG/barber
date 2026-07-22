// Verifica a biometria do login e devolve um OTP de uso único para iniciar a sessão.
import { corsHeaders } from '../_shared/cors.ts';
import { adminClient, getRP } from '../_shared/webauthn.ts';
import { verifyAuthenticationResponse } from 'https://esm.sh/@simplewebauthn/server@13.1.1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = adminClient();
    const { rpID, origin } = getRP(req);
    const { response, challengeId } = await req.json();

    if (!response || !challengeId) throw new Error('Dados de login ausentes.');

    const { data: ch } = await admin
      .from('webauthn_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('kind', 'auth')
      .maybeSingle();
    if (!ch) throw new Error('Desafio inválido ou expirado. Tente novamente.');
    if (new Date(ch.expires_at).getTime() < Date.now()) {
      throw new Error('Desafio expirado. Tente novamente.');
    }

    const { data: cred } = await admin
      .from('webauthn_credentials')
      .select('*')
      .eq('credential_id', response.id)
      .maybeSingle();
    if (!cred) throw new Error('Nenhuma biometria encontrada. Cadastre primeiro em Configurações.');

    const publicKey = Uint8Array.from(atob(cred.public_key), (c) => c.charCodeAt(0));

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey,
        counter: Number(cred.counter),
        transports: cred.transports ?? undefined,
      },
    });

    if (!verification.verified) throw new Error('Biometria não confere.');

    await admin
      .from('webauthn_credentials')
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq('id', cred.id);

    await admin.from('webauthn_challenges').delete().eq('id', challengeId);

    // Recupera o e-mail do usuário e gera um OTP de uso único para a sessão.
    const { data: userData, error: uErr } = await admin.auth.admin.getUserById(cred.user_id);
    if (uErr || !userData?.user?.email) throw new Error('Usuário não encontrado.');

    const email = userData.user.email;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.properties?.email_otp) {
      throw new Error('Não foi possível iniciar a sessão.');
    }

    return new Response(
      JSON.stringify({ verified: true, email, token: linkData.properties.email_otp }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
