import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ClientAuthForm from '@/components/ClientAuthForm';
import SocialAuthButtons from '@/components/SocialAuthButtons';
import Seo from '@/components/Seo';
import logoImg from '@/assets/barber-logo.png';

/**
 * Página pública de autenticação (`/auth`). Tela limpa, responsiva e dedicada
 * ao login/cadastro — pode ser usada como "endereço de autenticação" público
 * (ex.: tela de consentimento / branding do Google).
 */
export default function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Se já estiver logado, leva direto para a Home.
  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="page-shell min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <Seo
        path="/auth"
        title="Entrar ou Cadastrar — Barbearia Classic"
        description="Acesse sua conta para agendar cortes, ver promoções e gerenciar seus horários na barbearia."
      />

      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4">
        <button onClick={() => navigate('/')} className="text-primary flex items-center gap-1 text-sm">
          <ArrowLeft size={20} /> Início
        </button>
      </div>

      <div className="text-center mb-6">
        <img src={logoImg} alt="Logotipo da Barbearia" className="w-20 h-20 mx-auto mb-2 opacity-90" />
        <h1 className="font-display text-2xl text-primary tracking-wider">
          Barbearia Classic
          <span className="sr-only"> — Entre ou Cadastre-se na sua conta</span>
        </h1>
        <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase mt-1">• Tradição e Estilo •</p>
      </div>

      <ClientAuthForm
        title="Acesse sua conta"
        subtitle="Entre ou crie sua conta para agendar"
        onSuccess={() => navigate('/', { replace: true })}
      />

      <div className="w-full max-w-sm mt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-muted-foreground">ou continue com</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <SocialAuthButtons mode="login" onSuccess={() => navigate('/', { replace: true })} />
      </div>

      <p className="text-[11px] text-muted-foreground text-center mt-6 max-w-sm">
        Ao continuar, você concorda com nossos{' '}
        <Link to="/terms-of-service" className="text-primary underline">Termos de Serviço</Link>{' '}
        e a{' '}
        <Link to="/privacy-policy" className="text-primary underline">Política de Privacidade</Link>.
      </p>
    </div>
  );
}
