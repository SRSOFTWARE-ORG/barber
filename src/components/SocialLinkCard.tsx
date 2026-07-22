import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { toast } from 'sonner';
import { Link2, Check, Apple } from 'lucide-react';

const PENDING_KEY = 'social_link_pending';

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

interface PendingLink {
  provider: 'google' | 'apple';
  a_id: string;
  a_at: string;
  a_rt: string;
}

/**
 * Vincula a conta JÁ logada (cliente, barbeiro, barbearia ou CEO) ao Google/Apple
 * SEM criar uma conta nova e sem perder dados.
 *
 * Como o "manual linking" do Supabase está desativado e o broker gerenciado só
 * faz login (criando outra conta quando o e-mail não bate), fazemos o vínculo em
 * 2 etapas:
 *  1. Guardamos a sessão atual (conta A) e iniciamos o OAuth do provedor.
 *  2. Ao voltar, o broker criou/entrou numa conta do provedor (conta B). Uma
 *     função de backend move a identidade do provedor da conta B para a conta A
 *     e apaga a conta B. Em seguida restauramos a sessão da conta A.
 * Resultado: a conta A passa a aceitar login por senha E pelo Google/Apple.
 */
export default function SocialLinkCard() {
  const [linked, setLinked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUserIdentities();
    const providers = (data?.identities || []).map((i) => i.provider);
    setLinked(providers);
  }, []);

  // Conclui o vínculo após o retorno do OAuth.
  const completePendingLink = useCallback(async () => {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    let pending: PendingLink;
    try {
      pending = JSON.parse(raw);
    } catch {
      localStorage.removeItem(PENDING_KEY);
      return;
    }

    setCompleting(true);
    try {
      // Sessão atual = conta B (a que o provedor acabou de logar/criar).
      const { data: { session } } = await supabase.auth.getSession();
      const bToken = session?.access_token;
      const bId = session?.user?.id;

      // Já era a mesma conta (e-mail bateu e o backend vinculou sozinho).
      if (bId && bId === pending.a_id) {
        localStorage.removeItem(PENDING_KEY);
        await refresh();
        toast.success(`${pending.provider === 'google' ? 'Google' : 'Apple'} vinculado!`);
        return;
      }

      if (!bToken) {
        localStorage.removeItem(PENDING_KEY);
        return;
      }

      const { data, error } = await supabase.functions.invoke('link-social-identity', {
        body: { a_token: pending.a_at, b_token: bToken, provider: pending.provider },
      });

      if (error || (data && (data as any).error)) {
        const code = (data as any)?.error || '';
        if (code === 'already_linked') {
          toast.error('Esse provedor já está vinculado a uma conta.');
        } else {
          toast.error('Não foi possível concluir o vínculo. Tente novamente.');
        }
        // Restaura a sessão da conta original mesmo em caso de erro.
        await supabase.auth.setSession({ access_token: pending.a_at, refresh_token: pending.a_rt });
        return;
      }

      // Restaura a sessão da conta original (A) — agora com o provedor vinculado.
      await supabase.auth.setSession({ access_token: pending.a_at, refresh_token: pending.a_rt });
      await refresh();
      toast.success(`${pending.provider === 'google' ? 'Google' : 'Apple'} vinculado! Agora você pode entrar pelos dois métodos.`);
    } catch {
      try {
        await supabase.auth.setSession({ access_token: pending.a_at, refresh_token: pending.a_rt });
      } catch { /* noop */ }
      toast.error('Falha ao concluir o vínculo.');
    } finally {
      localStorage.removeItem(PENDING_KEY);
      setCompleting(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    completePendingLink();
  }, [refresh, completePendingLink]);

  const link = async (provider: 'google' | 'apple') => {
    setBusy(provider);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
        toast.error('Faça login novamente para vincular sua conta.');
        setBusy(null);
        return;
      }

      // Guarda a sessão da conta atual para restaurar após o OAuth.
      const pending: PendingLink = {
        provider,
        a_id: session.user.id,
        a_at: session.access_token,
        a_rt: session.refresh_token,
      };
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + '/settings',
        extraParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
      });

      if (result.error) {
        localStorage.removeItem(PENDING_KEY);
        toast.error(`Não foi possível vincular ${provider === 'google' ? 'Google' : 'Apple'}.`);
        setBusy(null);
        return;
      }
      if (result.redirected) {
        // Navegador está redirecionando para o provedor — concluímos no retorno.
        return;
      }
      // Sem redirecionamento (sessão já criada): conclui imediatamente.
      await completePendingLink();
      setBusy(null);
    } catch {
      localStorage.removeItem(PENDING_KEY);
      toast.error('Falha ao vincular conta.');
      setBusy(null);
    }
  };

  const isLinked = (p: string) => linked.includes(p);

  return (
    <div className="wood-card rounded-2xl px-5 py-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
          <Link2 size={20} className="text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading text-base text-foreground">Vincular contas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conecte sua conta atual ao Google ou Apple para entrar mais rápido — sem criar outra conta e sem perder seus dados.
          </p>
        </div>
      </div>

      {completing && (
        <p className="text-[11px] text-primary bg-primary/10 rounded-xl px-3 py-2">
          Concluindo o vínculo da sua conta...
        </p>
      )}

      <button
        onClick={() => link('google')}
        disabled={busy !== null || completing || isLinked('google')}
        className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 bg-secondary/60 border border-border text-foreground hover:bg-secondary disabled:opacity-60 transition-colors"
      >
        <GoogleIcon />
        {isLinked('google') ? (
          <span className="flex items-center gap-1 text-green-500"><Check size={15} /> Google vinculado</span>
        ) : busy === 'google' ? 'Aguarde...' : 'Vincular Google'}
      </button>

      <button
        onClick={() => link('apple')}
        disabled={busy !== null || completing || isLinked('apple')}
        className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 bg-secondary/60 border border-border text-foreground hover:bg-secondary disabled:opacity-60 transition-colors"
      >
        <Apple size={18} />
        {isLinked('apple') ? (
          <span className="flex items-center gap-1 text-green-500"><Check size={15} /> Apple vinculado</span>
        ) : busy === 'apple' ? 'Aguarde...' : 'Vincular Apple'}
      </button>
    </div>
  );
}
