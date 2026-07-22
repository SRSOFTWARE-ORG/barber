import { useEffect, useState } from 'react';
import { Fingerprint, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  registerPasskey,
  signInWithPasskey,
} from '@/lib/passkeys';

interface Props {
  /** 'login' = entrar com biometria; 'register' = cadastrar biometria */
  mode: 'login' | 'register';
  /** Chamado após sucesso (ex.: redirecionar). */
  onSuccess?: () => void;
  className?: string;
}

/**
 * Botão universal de biometria (Passkeys/WebAuthn). Mesmo código funciona em
 * iPhone (Face ID / Touch ID) e Android (digital / rosto / senha do celular).
 */
export default function BiometricButton({ mode, onSuccess, className }: Props) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isWebAuthnSupported()) {
        if (!cancelled) setSupported(false);
        return;
      }
      const available = await isPlatformAuthenticatorAvailable();
      if (!cancelled) setSupported(available);
    })();
    return () => { cancelled = true; };
  }, []);

  // Não suportado → não mostra a opção (tratamento de erro silencioso)
  if (!supported) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      const res = mode === 'register' ? await registerPasskey() : await signInWithPasskey();
      if (!res.ok) {
        toast.error(res.error || 'Não foi possível usar a biometria.');
        return;
      }
      toast.success(
        mode === 'register'
          ? 'Este dispositivo agora está autorizado!'
          : 'Login por biometria realizado!'
      );
      onSuccess?.();
    } finally {
      setBusy(false);
    }
  };

  const label =
    mode === 'register'
      ? 'Cadastrar Impressão Digital ou Rosto'
      : 'Entrar com Biometria / Senha do Celular';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={
        className ??
        'w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm bg-secondary/40 border border-primary/30 text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-50'
      }
    >
      {busy ? (
        <Loader2 size={18} className="animate-spin" />
      ) : mode === 'register' ? (
        <ShieldCheck size={18} className="text-primary" />
      ) : (
        <Fingerprint size={18} className="text-primary" />
      )}
      {busy ? 'Aguarde...' : label}
    </button>
  );
}
