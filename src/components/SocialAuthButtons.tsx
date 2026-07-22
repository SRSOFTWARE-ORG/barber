import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Apple } from 'lucide-react';


interface Props {
  /** Texto contextual: "entrar" (login) ou "cadastrar" (signup). */
  mode?: 'login' | 'signup';
  onSuccess?: () => void;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

export default function SocialAuthButtons({ mode = 'login', onSuccess }: Props) {
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const verb = mode === 'signup' ? 'Cadastrar' : 'Entrar';

  const handle = async (provider: 'google' | 'apple') => {
    setBusy(provider);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname || '/'}`;
      console.log('[SocialAuth] OAuth request:', { provider, redirectTo });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
        },
      });
      console.log('[SocialAuth] OAuth response:', {
        provider,
        hasUrl: Boolean(data?.url),
        error: error ? { message: error.message, status: error.status } : null,
      });
      if (error) {
        toast.error(`Não foi possível entrar com ${provider === 'google' ? 'Google' : 'Apple'}.`);
        setBusy(null);
        return;
      }
      if (!data?.url) {
        toast.error('O Supabase não retornou a URL de autenticação. Confira o provedor OAuth.');
        setBusy(null);
        return;
      }
      window.location.assign(data.url);
    } catch (err) {
      console.error('[SocialAuth] OAuth exception:', err);
      toast.error('Falha na autenticação. Tente novamente.');
      setBusy(null);
    }
  };


  return (
    <div className="space-y-2 w-full">
      <button
        type="button"
        onClick={() => handle('google')}
        disabled={busy !== null}
        className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 bg-secondary/60 border border-border text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
      >
        <GoogleIcon />
        {busy === 'google' ? 'Aguarde...' : `${verb} com Google`}
      </button>
      <button
        type="button"
        onClick={() => handle('apple')}
        disabled={busy !== null}
        className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 bg-secondary/60 border border-border text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
      >
        <Apple size={18} />
        {busy === 'apple' ? 'Aguarde...' : `${verb} com Apple`}
      </button>
    </div>
  );
}
