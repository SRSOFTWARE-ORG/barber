// Inicia o fluxo OAuth do Mercado Pago para o ADM dono.
// Retorna a URL de autorização. O state codifica { shop_owner_id, mode }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const REDIRECT_URI = "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-oauth-callback";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claims.claims.sub as string;

    // Qualquer admin pode tentar, mas precisa de permissão (dono ou contratado liberado)
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r) => r.role === "admin" || r.role === "ceo")) {
      return json({ error: "Apenas barbeiros admin podem conectar o Mercado Pago" }, 403);
    }
    const { data: canOwn } = await supabase.rpc("can_barber_own_mp", { _barber_id: userId });
    if (!canOwn) {
      return json({ error: "O dono da barbearia não liberou conexão de conta MP própria para você. Peça para ele ativar em Equipe." }, 403);
    }


    const body = await req.json().catch(() => ({}));
    const mode = "live"; // sempre produção
    // Allowlist de destinos internos para evitar open redirect (inclui // protocol-relative).
    const ALLOWED_RETURN = ["/admin", "/ceo"];
    const returnTo = ALLOWED_RETURN.includes(body?.return_to) ? body.return_to : "/admin";

    const clientId = Deno.env.get("MP_CLIENT_ID")!;
    if (!clientId) return json({ error: "MP_CLIENT_ID não configurado" }, 500);

    // PKCE: gera code_verifier e code_challenge (S256)
    const verifierBytes = new Uint8Array(32);
    crypto.getRandomValues(verifierBytes);
    const codeVerifier = b64url(verifierBytes);
    const challengeDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const codeChallenge = b64url(new Uint8Array(challengeDigest));

    // Estado assinado (HMAC) para impedir adulteração do barber_id no callback.
    const payloadStr = JSON.stringify({
      barber_id: userId,
      shop_owner_id: userId,
      mode,
      return_to: returnTo,
      t: Date.now(),
      cv: codeVerifier,
    });
    const sig = await hmacHex(Deno.env.get("MP_CLIENT_SECRET")!, payloadStr);
    const state = b64url(new TextEncoder().encode(payloadStr)) + "." + sig;


    const url = new URL("https://auth.mercadopago.com.br/authorization");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return json({ url: url.toString() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function b64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
