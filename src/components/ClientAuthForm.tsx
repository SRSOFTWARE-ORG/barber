import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { activeSupabaseConfig, supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import BiometricButton from '@/components/BiometricButton';
import SocialAuthButtons from '@/components/SocialAuthButtons';
import { getPasswordResetRedirectUrl } from '@/lib/auth-redirects';
import { buildLoginCandidates, nameToClientEmail } from '@/lib/login-candidates';

interface Props {
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameToEmail = nameToClientEmail;

const maskPhone = (raw: string) => {
  let v = raw.replace(/\D/g, '').slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  return v;
};

export default function ClientAuthForm({ title, subtitle, onSuccess }: Props) {
  const { signIn } = useAuth();
  const [nome, setNome] = useState(() => localStorage.getItem('remembered_client_name') || '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('remembered_client_name'));
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Forgot password
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);

  /**
   * Decide o e-mail a usar:
   * - Contém "@": é um e-mail real → usa exatamente como digitado (após validar formato).
   *   NUNCA transformamos ou concatenamos domínio interno.
   * - Sem "@": tratamos como "nome de usuário" e derivamos o e-mail interno de cliente.
   */
  const resolvedEmail = useMemo(() => {
    const raw = nome.trim().toLowerCase().replace(/\s+/g, '');
    if (!raw) return '';
    if (raw.includes('@')) return raw; // e-mail real, sem transformação
    return nameToEmail(raw);
  }, [nome]);

  const looksLikeEmail = nome.includes('@');
  const emailFormatOk = !looksLikeEmail || EMAIL_RE.test(resolvedEmail);

  const handleSubmit = async () => {
    setFieldError(null);
    if (!nome || !password) return;

    if (looksLikeEmail && !emailFormatOk) {
      const msg = `Formato de e-mail inválido: "${resolvedEmail}"`;
      setFieldError(msg);
      toast.error(msg);
      return;
    }
    if (password.length < 4) {
      const msg = 'A senha precisa ter ao menos 4 caracteres';
      setFieldError(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    if (rememberMe) localStorage.setItem('remembered_client_name', nome);
    else localStorage.removeItem('remembered_client_name');
    localStorage.removeItem('remembered_client_pass');
    localStorage.removeItem('remembered_admin_pass');

    if (isSignUp) {
      // No cadastro exigimos e-mail real OU um nome sem "@" (converte para cliente).
      const signupEmail = resolvedEmail;
      console.log('[ClientAuth] signUp payload:', { email: signupEmail, hasPhone: !!phone });

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: signupEmail,
        password,
        options: { data: { full_name: nome.trim(), telefone: phone || null } },
      });
      console.log('[ClientAuth] signUp response:', { userId: signUpData?.user?.id, error });

      if (error) {
        const msg = /already registered|already exists/i.test(error.message)
          ? 'Esse e-mail/nome já está cadastrado. Tente entrar.'
          : error.message;
        setFieldError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }
      const uid = signUpData?.user?.id;
      if (uid) {
        await supabase.from('profiles').upsert({
          id: uid,
          full_name: nome.trim(),
          telefone: phone || null,
        } as any);
      }
      toast.success('Conta criada! Bem-vindo 💈');
      await signIn(signupEmail, password);
      onSuccess?.();
    } else {
      // Login: tenta cliente / admin / e-mail real conforme padrão
      const candidates = buildLoginCandidates(nome);
      console.log('[ClientAuth] login candidates:', candidates);

      let ok = false;
      let lastErr: string | null = null;
      for (const email of candidates) {
        const { error } = await signIn(email, password);
        console.log('[ClientAuth] signIn attempt:', { email, error });
        if (!error) { ok = true; break; }
        lastErr = error;
      }
      if (!ok) {
        const msg = /invalid.*credentials/i.test(lastErr || '')
          ? `E-mail/usuário ou senha incorretos no projeto Supabase ${activeSupabaseConfig.projectRef ?? 'atual'}. Use "Esqueci minha senha" se precisar.`
          : (lastErr || 'Não foi possível entrar.');
        setFieldError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }
      onSuccess?.();
    }
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = forgotEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(raw)) {
      toast.error('Informe um e-mail válido.');
      return;
    }
    setForgotSending(true);
    const redirectTo = getPasswordResetRedirectUrl();
    console.log('[ClientAuth] resetPasswordForEmail:', { email: raw, redirectTo });
    const { data, error } = await supabase.auth.resetPasswordForEmail(raw, {
      redirectTo,
    });
    console.log('[ClientAuth] reset response:', { data, error });
    setForgotSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Enviamos um e-mail com o link de redefinição.');
    setForgotOpen(false);
    setForgotEmail('');
  };

  if (forgotOpen) {
    return (
      <div className="wood-card px-4 py-6 space-y-3 w-full max-w-sm">
        <h2 className="font-heading text-lg text-foreground text-center">Redefinir senha</h2>
        <p className="text-xs text-muted-foreground text-center -mt-2">
          Digite seu e-mail e enviaremos um link.
        </p>
        <form onSubmit={handleForgot} className="space-y-3">
          <input
            type="email"
            placeholder="seu@email.com"
            value={forgotEmail}
            onChange={e => setForgotEmail(e.target.value)}
            className="vintage-input w-full px-3 py-2 rounded-lg"
            required
            autoFocus
          />
          <button
            type="submit"
            disabled={forgotSending}
            className="vintage-btn w-full py-2 rounded-lg text-sm disabled:opacity-40"
          >
            {forgotSending ? 'Enviando...' : 'Enviar link'}
          </button>
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="text-xs text-primary text-center w-full"
          >
            ← Voltar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="wood-card px-4 py-6 space-y-3 w-full max-w-sm">
      {title && <h2 className="font-heading text-lg text-foreground text-center">{title}</h2>}
      {subtitle && <p className="text-xs text-muted-foreground text-center -mt-2">{subtitle}</p>}

      <div className="space-y-1">
        <input
          placeholder={isSignUp ? 'Nome ou e-mail' : 'Nome, usuário ou e-mail'}
          type="text"
          value={nome}
          onChange={e => { setNome(e.target.value); setFieldError(null); }}
          className="vintage-input w-full px-3 py-2 rounded-lg"
          autoComplete="username"
        />
        {looksLikeEmail && !emailFormatOk && (
          <p className="text-[11px] text-destructive">Formato de e-mail inválido.</p>
        )}
        {looksLikeEmail && emailFormatOk && (
          <p className="text-[11px] text-muted-foreground">
            Usando e-mail real: <span className="text-foreground">{resolvedEmail}</span>
          </p>
        )}
      </div>

      {isSignUp && (
        <input
          placeholder="Celular com DDD — (11) 99999-9999"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={e => setPhone(maskPhone(e.target.value))}
          className="vintage-input w-full px-3 py-2 rounded-lg"
        />
      )}

      <div className="relative">
        <input
          placeholder="Senha"
          type={showPwd ? 'text' : 'password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="vintage-input w-full px-3 py-2 pr-10 rounded-lg"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
        />
        <button
          type="button"
          onClick={() => setShowPwd(s => !s)}
          aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary p-1"
        >
          {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {fieldError && (
        <p className="text-xs text-destructive text-center">{fieldError}</p>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Supabase ativo: {activeSupabaseConfig.projectRef ?? 'não configurado'} ({activeSupabaseConfig.source})
      </p>

      {!isSignUp && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="accent-primary w-4 h-4"
          />
          <span className="text-sm text-muted-foreground">Lembrar meu login</span>
        </label>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !nome || !password || (looksLikeEmail && !emailFormatOk)}
        className="vintage-btn w-full py-2 rounded-lg text-sm disabled:opacity-40"
      >
        {loading ? 'Aguarde...' : isSignUp ? 'Criar Conta' : 'Entrar'}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary">
          {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Criar'}
        </button>
        {!isSignUp && (
          <button
            onClick={() => {
              setForgotEmail(looksLikeEmail && emailFormatOk ? resolvedEmail : '');
              setForgotOpen(true);
            }}
            className="text-primary"
          >
            Esqueci minha senha
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 py-1">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <SocialAuthButtons mode={isSignUp ? 'signup' : 'login'} onSuccess={onSuccess} />
      {!isSignUp && <BiometricButton mode="login" onSuccess={onSuccess} />}
    </div>
  );
}
