// Callback OAuth do Mercado Pago.
// Recebe ?code & ?state, troca por access_token e salva em mp_credentials.
// Depois REDIRECIONA para a página /mp-callback do app (tela bonita em React).
// Função PÚBLICA (sem JWT) — o MP chama via redirect do navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REDIRECT_URI = "https://ddrwahpcbsbxhflhskuh.supabase.co/functions/v1/mp-oauth-callback";
const APP_URL = "https://barber.srsoftwarestore.com";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return redirectResult(false, `Mercado Pago retornou erro: ${error}`, "/admin");
    if (!code || !stateRaw) return redirectResult(false, "Parâmetros ausentes (code/state)", "/admin");

    let state: { shop_owner_id?: string; barber_id?: string; mode?: string; return_to?: string; cv?: string };
    try {
      // State assinado: "<base64url(payload)>.<hmacHex>"
      const dot = stateRaw.lastIndexOf(".");
      if (dot < 0) throw new Error("formato");
      const payloadB64 = stateRaw.slice(0, dot);
      const sig = stateRaw.slice(dot + 1);
      const payloadStr = new TextDecoder().decode(b64urlDecode(payloadB64));
      const expected = await hmacHex(Deno.env.get("MP_CLIENT_SECRET")!, payloadStr);
      if (sig !== expected) {
        return redirectResult(false, "State inválido (assinatura)", "/admin");
      }
      state = JSON.parse(payloadStr);
    } catch {
      return redirectResult(false, "State inválido", "/admin");
    }
    const barberId = state.barber_id || state.shop_owner_id;
    if (!barberId) return redirectResult(false, "State sem barber_id", "/admin");


    const isTest = state.mode === "test";
    const clientId = isTest ? Deno.env.get("MP_CLIENT_ID_TEST")! : Deno.env.get("MP_CLIENT_ID")!;
    const clientSecret = isTest
      ? Deno.env.get("MP_CLIENT_SECRET_TEST")!
      : Deno.env.get("MP_CLIENT_SECRET")!;
    if (!clientId || !clientSecret) {
      return redirectResult(false, "Credenciais MP não configuradas no servidor", state.return_to || "/admin");
    }

    const tokenBody: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    };
    if (state.cv) tokenBody.code_verifier = state.cv;

    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(tokenBody),
    });

    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson?.access_token) {
      console.error("MP token exchange failed", {
        status: tokenRes.status,
        body: tokenJson,
        used_redirect_uri: REDIRECT_URI,
        is_test: isTest,
        client_id_prefix: clientId?.slice(0, 6),
      });
      const detail = tokenJson?.error_description || tokenJson?.message || tokenJson?.error || `HTTP ${tokenRes.status}`;
      const cause = tokenJson?.cause ? ` (${JSON.stringify(tokenJson.cause)})` : "";
      return redirectResult(
        false,
        `Falha ao trocar code por token: ${detail}${cause}`,
        state.return_to || "/admin"
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = tokenJson.expires_in
      ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
      : null;

    // Resolve shop_owner_id real (caso barbeiro seja membro de time)
    const { data: ownerId } = await admin.rpc("get_shop_owner", { _user_id: barberId });
    const shopOwnerId = (ownerId as string) || barberId;

    const { error: upErr } = await admin
      .from("mp_credentials")
      .upsert(
        {
          barber_id: barberId,
          shop_owner_id: shopOwnerId,
          mp_user_id: String(tokenJson.user_id ?? ""),
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token ?? null,
          public_key: tokenJson.public_key ?? null,
          expires_at: expiresAt,
          scope: tokenJson.scope ?? null,
          is_test: isTest,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "barber_id" }
      );


    if (upErr) return redirectResult(false, `Erro ao salvar token: ${upErr.message}`, state.return_to || "/admin");

    return redirectResult(true, "Mercado Pago conectado com sucesso!", state.return_to || "/admin");
  } catch (e) {
    return redirectResult(false, e instanceof Error ? e.message : String(e), "/admin");
  }
});

function redirectResult(ok: boolean, message: string, returnTo: string) {
  // Allowlist estrita: evita open redirect via caminhos protocol-relative (//evil.com).
  const ALLOWED_RETURN = ["/admin", "/ceo"];
  const safeReturn = ALLOWED_RETURN.includes(returnTo) ? returnTo : "/admin";
  const target = new URL(`${APP_URL}/mp-callback`);
  target.searchParams.set("ok", ok ? "1" : "0");
  target.searchParams.set("msg", message);
  target.searchParams.set("return_to", safeReturn);
  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
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

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
