// Biometria / Passkeys (WebAuthn) — implementação própria e auto-suficiente.
//
// Não depende de nenhuma flag experimental do servidor de auth. O fluxo usa:
//   - @simplewebauthn/browser no cliente (chama navigator.credentials)
//   - 4 edge functions (passkey-*) que geram desafios, validam e iniciam a sessão
//
// Funciona igual em iOS e Android: ambos respondem ao mesmo `navigator.credentials`
// padrão do WebAuthn — não há código específico de plataforma.

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { supabase } from '@/integrations/supabase/client';

/** Verifica se o navegador suporta WebAuthn / Passkeys. */
export function isWebAuthnSupported(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.credentials &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Verifica se há um autenticador de plataforma (Face ID / Touch ID / biometria
 * do Android) disponível. Usado para decidir mostrar o botão de cadastro.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!isWebAuthnSupported()) return false;
    if (typeof window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return true;
    }
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Traduz erros do WebAuthn / Supabase para mensagens amigáveis em PT-BR. */
function friendlyError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  const message = String((err as { message?: string })?.message || err || '');

  if (name === 'NotAllowedError' || /not allowed|cancel|timed out|timeout/i.test(message)) {
    return 'Escaneamento cancelado ou expirado. Tente novamente quando estiver pronto.';
  }
  if (name === 'InvalidStateError' || /already registered|already exists/i.test(message)) {
    return 'Este dispositivo já possui uma biometria cadastrada para esta conta.';
  }
  if (name === 'SecurityError' || /insecure|origin|relying party|rp id|domain/i.test(message)) {
    return 'Domínio não autorizado para biometria. Acesse pelo domínio oficial publicado.';
  }
  if (name === 'AbortError') {
    return 'Operação interrompida. Tente novamente.';
  }
  if (/no passkey|no credential|not found|nenhuma/i.test(message)) {
    return 'Nenhuma biometria encontrada neste dispositivo. Cadastre primeiro em Configurações.';
  }
  if (/network|fetch|failed to fetch/i.test(message)) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }
  return message || 'Não foi possível concluir a biometria. Tente novamente.';
}

export interface PasskeyResult {
  ok: boolean;
  error?: string;
}

/**
 * Cadastra a biometria (Face ID / Touch ID / digital) do dispositivo atual.
 * Requer um usuário já autenticado.
 */
export async function registerPasskey(): Promise<PasskeyResult> {
  if (!isWebAuthnSupported()) {
    return { ok: false, error: 'Seu navegador não suporta biometria (WebAuthn).' };
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, error: 'Faça login antes de cadastrar a biometria.' };
    }

    const { data: opts, error: optErr } = await supabase.functions.invoke('passkey-register-options');
    if (optErr || !opts?.options) {
      return { ok: false, error: friendlyError(optErr || 'Falha ao iniciar o cadastro.') };
    }

    const attResp = await startRegistration({ optionsJSON: opts.options });

    const { data: verify, error: verErr } = await supabase.functions.invoke('passkey-register-verify', {
      body: { response: attResp, challengeId: opts.challengeId },
    });
    if (verErr || !verify?.verified) {
      return { ok: false, error: friendlyError(verErr || verify?.error || 'Falha ao validar a biometria.') };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/**
 * Login sem senha usando a biometria do dispositivo. Ao concluir, inicia a
 * sessão no client principal (dispara SIGNED_IN no AuthContext).
 */
export async function signInWithPasskey(): Promise<PasskeyResult> {
  if (!isWebAuthnSupported()) {
    return { ok: false, error: 'Seu navegador não suporta biometria (WebAuthn).' };
  }
  try {
    const { data: opts, error: optErr } = await supabase.functions.invoke('passkey-auth-options');
    if (optErr || !opts?.options) {
      return { ok: false, error: friendlyError(optErr || 'Falha ao iniciar o login.') };
    }

    const authResp = await startAuthentication({ optionsJSON: opts.options });

    const { data: verify, error: verErr } = await supabase.functions.invoke('passkey-auth-verify', {
      body: { response: authResp, challengeId: opts.challengeId },
    });
    if (verErr || !verify?.verified || !verify?.email || !verify?.token) {
      return { ok: false, error: friendlyError(verErr || verify?.error || 'Falha ao validar a biometria.') };
    }

    // Inicia a sessão com o OTP de uso único devolvido pelo servidor.
    const { error: otpErr } = await supabase.auth.verifyOtp({
      email: verify.email,
      token: verify.token,
      type: 'magiclink',
    });
    if (otpErr) return { ok: false, error: friendlyError(otpErr) };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/** Está rodando dentro de um iframe? (preview do Lovable bloqueia biometria) */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Contexto seguro (HTTPS / localhost) — requisito do WebAuthn. */
export function isSecureContextOk(): boolean {
  try {
    return typeof window !== 'undefined' && window.isSecureContext === true;
  } catch {
    return false;
  }
}

/** Suporte básico do navegador a WebAuthn (PublicKeyCredential). */
export function hasPublicKeyCredential(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
  } catch {
    return false;
  }
}
