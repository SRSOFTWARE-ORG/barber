import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react';

/**
 * Página pública `/reset-password`
 *
 * Fluxo:
 *  1. O usuário chega aqui a partir do link enviado por e-mail
 *     (`resetPasswordForEmail(..., { redirectTo: /reset-password })`).
 *  2. O Supabase coloca `type=recovery` + tokens no hash da URL — o cliente
 *     JS restaura a sessão automaticamente.
 *  3. Chamamos `supabase.auth.updateUser({ password })` para efetivar a troca.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isRecovery = /type=recovery/.test(hash);
    const authError = search?.get('error_description') || search?.get('error_code') || null;

    if (authError) {
      const decoded = authError.replace(/\+/g, ' ');
      setError(
        /expired|invalid|otp_expired/i.test(decoded)
          ? 'Link inválido ou expirado. Solicite um novo e-mail de redefinição e use o link mais recente.'
          : `Não foi possível validar o link: ${decoded}`,
      );
      return;
    }

    if (!isRecovery) {
      // Ainda assim vale conferir se há sessão ativa (o Supabase pode já ter
      // limpado o hash). Sem sessão de recovery, o usuário caiu aqui por engano.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setReady(true);
        } else {
          setError('Link inválido ou expirado. Solicite um novo e-mail de redefinição.');
        }
      });
      return;
    }
    setReady(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('A nova senha precisa ter ao menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    console.log('[ResetPassword] Enviando nova senha ao Supabase...');
    const { data, error } = await supabase.auth.updateUser({ password });
    console.log('[ResetPassword] Resposta:', { data, error });
    if (error) {
      toast.error(error.message || 'Não foi possível atualizar a senha.');
      setSaving(false);
      return;
    }
    toast.success('Senha redefinida! Você já está logado.');
    setTimeout(() => navigate('/admin', { replace: true }), 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="wood-card w-full max-w-sm px-6 py-8 space-y-5">
        <div className="text-center space-y-2">
          <KeyRound size={40} className="text-primary mx-auto" />
          <h1 className="font-heading text-2xl text-foreground">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground">
            Escolha uma nova senha para sua conta.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-muted-foreground">Validando link...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                placeholder="Nova senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="vintage-input w-full px-4 py-3 pr-12 rounded-lg text-base"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary"
                aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <input
              type={show ? 'text' : 'password'}
              placeholder="Confirme a nova senha"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="vintage-input w-full px-4 py-3 rounded-lg text-base"
              minLength={6}
              required
            />
            <button
              type="submit"
              disabled={saving}
              className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
            >
              {saving ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        <button
          onClick={() => navigate('/admin')}
          className="text-primary text-sm w-full text-center flex items-center justify-center gap-1"
        >
          <ArrowLeft size={14} /> Voltar ao login
        </button>
      </div>
    </div>
  );
}
