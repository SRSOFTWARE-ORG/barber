import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { activeSupabaseConfig, supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Scissors, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import BiometricButton from '@/components/BiometricButton';
import SocialAuthButtons from '@/components/SocialAuthButtons';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'ceo';
}

// Regex simples e amplamente aceito para validar formato de e-mail.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Painel de diagnóstico exibido no topo da tela de login do /admin.
 * Mostra o estado atual da sessão para o operador identificar rapidamente
 * por que o acesso está sendo bloqueado (sem sessão, sem role, role errado…).
 */
function SessionDiagnostics({
  user,
  role,
  requiredRole,
  shopBlocked,
  lastError,
}: {
  user: any;
  role: string | null;
  requiredRole?: 'admin' | 'ceo';
  shopBlocked: boolean;
  lastError: string | null;
}) {
  const items: { label: string; value: string; ok: boolean }[] = [
    { label: 'Sessão Supabase', value: user ? `logado (${user.email})` : 'sem sessão', ok: !!user },
    { label: 'Projeto Supabase', value: `${activeSupabaseConfig.projectRef ?? 'não configurado'} (${activeSupabaseConfig.source})`, ok: activeSupabaseConfig.source !== 'missing' },
    { label: 'Role atual', value: role ?? 'nenhum', ok: !!role },
    { label: 'Role exigido', value: requiredRole ?? 'qualquer', ok: true },
    { label: 'Loja bloqueada?', value: shopBlocked ? 'sim (inadimplência)' : 'não', ok: !shopBlocked },
  ];

  let reason = 'Aguardando login.';
  if (user && !role) reason = 'Você está logado, mas seu usuário não tem role atribuído no banco (user_roles / platform_admins).';
  else if (user && requiredRole === 'ceo' && role !== 'ceo') reason = 'Sua conta não é CEO — acesso negado ao /ceo.';
  else if (user && requiredRole === 'admin' && role !== 'admin' && role !== 'ceo') reason = 'Sua conta não é admin — acesso negado ao /admin.';
  else if (shopBlocked && role !== 'ceo') reason = 'Loja bloqueada por inadimplência — redirecionando para /fatura.';

  return (
    <details open className="rounded-lg border border-border bg-secondary/40 text-xs">
      <summary className="cursor-pointer flex items-center gap-2 px-3 py-2 font-medium">
        <Info size={14} className="text-primary" />
        Diagnóstico de sessão
      </summary>
      <div className="px-3 pb-3 space-y-1">
        {items.map(it => (
          <div key={it.label} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{it.label}:</span>
            <span className={`flex items-center gap-1 ${it.ok ? 'text-foreground' : 'text-destructive'}`}>
              {it.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              <span className="truncate max-w-[180px]">{it.value}</span>
            </span>
          </div>
        ))}
        <div className="pt-2 border-t border-border/60 text-muted-foreground">
          <strong className="text-foreground">Motivo:</strong> {reason}
        </div>
        {lastError && (
          <div className="pt-1 text-destructive">
            <strong>Último erro:</strong> {lastError}
          </div>
        )}
      </div>
    </details>
  );
}

function InlineLogin({
  requiredRole,
  currentUser,
  currentRole,
  shopBlocked,
}: {
  requiredRole?: 'admin' | 'ceo';
  currentUser: any;
  currentRole: string | null;
  shopBlocked: boolean;
}) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem('remembered_admin_user') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('remembered_admin_user'));
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // "Esqueci senha" state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [magicSending, setMagicSending] = useState(false);

  const sanitizeLocal = (s: string) => s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '');

  // Regra simples e previsível:
  // - Se contém "@" → usa EXATAMENTE como digitado (validado como e-mail)
  // - Senão → adiciona "@barbershop.app"
  const normalizedEmail = useMemo(() => {
    const raw = username.trim().toLowerCase().replace(/\s+/g, '');
    if (!raw) return '';
    if (raw.includes('@')) return raw;
    const sanitized = sanitizeLocal(raw);
    return sanitized ? `${sanitized}@barbershop.app` : '';
  }, [username]);

  const emailFormatOk = !normalizedEmail || EMAIL_RE.test(normalizedEmail);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLastError(null);

    if (!normalizedEmail) {
      const msg = 'Informe um usuário ou e-mail válido.';
      setLastError(msg);
      toast.error(msg);
      return;
    }
    if (!emailFormatOk) {
      const msg = `Formato de e-mail inválido: ${normalizedEmail}`;
      setLastError(msg);
      toast.error(msg);
      return;
    }
    if (password.length < 4) {
      const msg = 'A senha precisa ter ao menos 4 caracteres.';
      setLastError(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    if (rememberMe) {
      localStorage.setItem('remembered_admin_user', username);
    } else {
      localStorage.removeItem('remembered_admin_user');
    }
    localStorage.removeItem('remembered_admin_pass');

    console.log('[AdminLogin] Payload:', { email: normalizedEmail, passwordLength: password.length });

    const { error } = await signIn(normalizedEmail, password);
    console.log('[AdminLogin] Resposta signIn:', { error });

    if (error) {
      setSubmitting(false);
      const friendly = /invalid.*credentials|nome ou senha/i.test(error)
        ? `E-mail ou senha incorretos no projeto Supabase ${activeSupabaseConfig.projectRef ?? 'atual'}. Se esqueceu, use "Esqueci minha senha".`
        : error;
      setLastError(friendly);
      toast.error(friendly);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    console.log('[AdminLogin] Usuário autenticado:', user?.id, user?.email);

    if (user) {
      const { data: roles, error: rolesErr } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      console.log('[AdminLogin] Roles:', { roles, rolesErr });
      const isCeo = roles?.some(r => r.role === 'ceo');
      toast.success('Login realizado!');
      navigate(isCeo ? '/ceo' : '/admin', { replace: true });
    }
    setSubmitting(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = forgotEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(raw)) {
      toast.error('Informe um e-mail válido.');
      return;
    }
    setForgotSending(true);
    console.log('[AdminLogin] Enviando reset para:', raw);
    const { data, error } = await supabase.auth.resetPasswordForEmail(raw, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    console.log('[AdminLogin] Resposta reset:', { data, error });
    setForgotSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Enviamos um e-mail com o link de redefinição.');
    setForgotOpen(false);
    setForgotEmail('');
  };

  const handleMagicLink = async () => {
    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      toast.error('Informe um e-mail válido antes de pedir o link de acesso.');
      return;
    }

    setMagicSending(true);
    const redirectTo = `${window.location.origin}${requiredRole === 'ceo' ? '/ceo' : '/admin'}`;
    console.log('[AdminLogin] Enviando magic link:', { email: normalizedEmail, redirectTo });
    const { data, error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });
    console.log('[AdminLogin] Resposta magic link:', {
      data,
      error: error ? { message: error.message, status: error.status, code: error.code } : null,
    });
    setMagicSending(false);

    if (error) {
      const msg = /signup.*disabled|user.*not.*found|invalid.*login/i.test(error.message)
        ? `Não encontrei essa conta no projeto Supabase ${activeSupabaseConfig.projectRef ?? 'atual'}. Confirme que ela foi criada neste projeto.`
        : error.message;
      setLastError(msg);
      toast.error(msg);
      return;
    }

    toast.success('Enviamos um link de acesso para seu e-mail. Abra o link neste mesmo domínio.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="wood-card w-full max-w-sm px-6 py-8 space-y-5">
        <div className="text-center space-y-2">
          <Scissors size={40} className="text-primary mx-auto" />
          <h1 className="font-heading text-2xl text-foreground">Área Restrita</h1>
          <p className="text-sm text-muted-foreground">Acesso para administradores</p>
        </div>

        <SessionDiagnostics
          user={currentUser}
          role={currentRole}
          requiredRole={requiredRole}
          shopBlocked={shopBlocked}
          lastError={lastError}
        />

        {!forgotOpen ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Usuário ou e-mail"
                value={username}
                onChange={e => { setUsername(e.target.value); setLastError(null); }}
                className="vintage-input w-full px-4 py-3 rounded-lg text-base"
                required
                autoComplete="username"
              />
              <div className="space-y-1">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Senha"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="vintage-input w-full px-4 py-3 pr-12 rounded-lg text-base"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {normalizedEmail && !username.includes('@') && (
                  <p className="text-[11px] text-muted-foreground">
                    Login salvo como <span className="text-foreground">{normalizedEmail}</span>
                  </p>
                )}
                {normalizedEmail && !emailFormatOk && (
                  <p className="text-[11px] text-destructive">Formato de e-mail inválido.</p>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-sm text-muted-foreground">Lembrar meu login</span>
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
              >
                {submitting ? 'Entrando...' : 'Entrar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(normalizedEmail && emailFormatOk ? normalizedEmail : '');
                  setForgotOpen(true);
                }}
                className="text-xs text-primary w-full text-center"
              >
                Esqueci minha senha
              </button>
              {lastError && /senha|credenciais|incorretos|credentials/i.test(lastError) && (
                <button
                  type="button"
                  onClick={handleMagicLink}
                  disabled={magicSending || !normalizedEmail || !emailFormatOk}
                  className="w-full rounded-lg border border-primary/40 px-3 py-2 text-xs text-primary disabled:opacity-40"
                >
                  {magicSending ? 'Enviando link...' : 'Enviar link de acesso por e-mail'}
                </button>
              )}
            </form>

            <div className="flex items-center gap-2">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground">ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <SocialAuthButtons mode="login" />
            <BiometricButton mode="login" />
          </>
        ) : (
          <form onSubmit={handleForgot} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Digite seu e-mail e enviaremos um link para você criar uma nova senha.
            </p>
            <input
              type="email"
              placeholder="seu@email.com"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              className="vintage-input w-full px-4 py-3 rounded-lg text-base"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={forgotSending}
              className="vintage-btn w-full py-3 rounded-lg text-base disabled:opacity-40"
            >
              {forgotSending ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
            <button
              type="button"
              onClick={() => setForgotOpen(false)}
              className="text-xs text-primary w-full text-center"
            >
              ← Voltar ao login
            </button>
          </form>
        )}

        <button onClick={() => navigate('/')} className="text-primary text-sm w-full text-center">
          ← Voltar ao início
        </button>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, role, loading, shopBlocked } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-primary font-heading text-lg animate-pulse">Carregando...</div>
      </div>
    );
  }

  if (!user || !role) {
    return (
      <InlineLogin
        requiredRole={requiredRole}
        currentUser={user}
        currentRole={role}
        shopBlocked={shopBlocked}
      />
    );
  }

  // Bloqueio por inadimplência (>30 dias). CEO nunca é bloqueado.
  if (shopBlocked && role !== 'ceo' && typeof window !== 'undefined' && window.location.pathname !== '/fatura') {
    return <Navigate to="/fatura" replace />;
  }

  if (requiredRole === 'ceo' && role !== 'ceo') {
    return <Navigate to="/" replace />;
  }

  if (requiredRole === 'admin' && role !== 'admin' && role !== 'ceo') {
    return (
      <InlineLogin
        requiredRole={requiredRole}
        currentUser={user}
        currentRole={role}
        shopBlocked={shopBlocked}
      />
    );
  }

  return <>{children}</>;
}
