import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import SupportChat from '@/components/SupportChat';
import ClientAuthForm from '@/components/ClientAuthForm';
import Seo from '@/components/Seo';

export default function SuportePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="min-h-screen pb-20">
      <Seo path="/suporte" title="Suporte — Barbearia" description="Fale com o suporte, tire dúvidas e acompanhe suas respostas com segurança." />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/more'))} className="text-primary" aria-label="Voltar"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">Suporte</h1>
      </div>
      <div className="px-4">
        {user ? (
          <SupportChat />
        ) : (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-muted-foreground text-center">Entre na sua conta para falar com o suporte.</p>
            <ClientAuthForm title="Entrar" />
          </div>
        )}
      </div>
    </div>
  );
}
