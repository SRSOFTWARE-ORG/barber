// Gera as opções de LOGIN por biometria (passkey discoverable — sem digitar nada).
import { corsHeaders } from '../_shared/cors.ts';
import { adminClient, getRP } from '../_shared/webauthn.ts';
import { generateAuthenticationOptions } from 'https://esm.sh/@simplewebauthn/server@13.1.1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = adminClient();
    const { rpID } = getRP(req);

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      // Login discoverable: o aparelho oferece as passkeys cadastradas.
      allowCredentials: [],
    });

    const { data: challengeRow, error: chErr } = await admin
      .from('webauthn_challenges')
      .insert({ challenge: options.challenge, user_id: null, kind: 'auth' })
      .select('id')
      .single();
    if (chErr) throw chErr;

    return new Response(JSON.stringify({ options, challengeId: challengeRow.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
