import { useState, useEffect } from 'react';
import { ArrowLeft, Settings, Shield, Info, FileText, ChevronDown, ChevronUp, Download, SlidersHorizontal, Receipt, Store, ShoppingCart, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import Seo from '@/components/Seo';

export default function MorePage() {
  const navigate = useNavigate();
  const { shopDisplayName, role } = useAuth();
  const isAdmin = role === 'admin';
  const isCeo = role === 'ceo';
  const [showSobre, setShowSobre] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [sobreContent, setSobreContent] = useState('');
  const [sobreLoaded, setSobreLoaded] = useState(false);

  useEffect(() => {
    if (showSobre && !sobreLoaded) {
      supabase.from('sobre').select('conteudo').limit(1).single().then(({ data }) => {
        if (data) setSobreContent(data.conteudo);
        setSobreLoaded(true);
      });
    }
  }, [showSobre]);

  const items = [
    { icon: Store, label: 'Marketplace', path: '/marketplace' },
    { icon: ShoppingCart, label: 'Carrinho', path: '/carrinho' },
    // Painel Administrativo: barbeiros, barbearias e CEO
    ...(isAdmin || isCeo ? [{ icon: Settings, label: 'Painel Administrativo', path: '/admin' }] : []),
    // Fatura: apenas barbeiros e barbearias
    ...(isAdmin ? [{ icon: Receipt, label: 'Fatura', path: '/fatura' }] : []),
    // Gestão CEO: apenas o CEO
    ...(isCeo ? [{ icon: Shield, label: 'Gestão CEO', path: '/ceo' }] : []),
    { icon: SlidersHorizontal, label: 'Configurações', path: '/settings' },
    { icon: ShieldCheck, label: 'Confiança & Segurança', path: '/confianca' },
    { icon: Download, label: 'Instalar App', path: '/install' },
  ];

  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={i} />;
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        return <h3 key={i} className="font-heading text-sm text-foreground mt-3 mb-1">{trimmed.replace(/\*\*/g, '')}</h3>;
      }
      if (trimmed.startsWith('- ')) {
        return <li key={i} className="ml-4 list-disc">{trimmed.slice(2)}</li>;
      }
      return <p key={i}>{trimmed}</p>;
    });
  };

  return (
    <div className="page-shell min-h-screen">
      <Seo path="/more" title="Mais — Sobre, Termos e Configurações" description="Saiba mais sobre a barbearia, leia os termos de uso, perguntas frequentes e acesse as configurações do aplicativo." />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => navigate('/')} className="text-primary" aria-label="Voltar para início"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">Mais</h1>
      </div>
      <div className="px-4 space-y-2">
        {items.map(({ icon: Icon, label, path }) => (
          <button
            key={label}
            onClick={() => path && navigate(path)}
            className="wood-card w-full flex items-center gap-4 px-4 py-4 text-left"
          >
            <Icon size={22} className="text-primary" />
            <span className="text-foreground font-medium">{label}</span>
          </button>
        ))}

        {/* Sobre (editable by ADM) */}
        <button
          onClick={() => setShowSobre(!showSobre)}
          className="wood-card w-full flex items-center justify-between px-4 py-4 text-left"
        >
          <div className="flex items-center gap-4">
            <Info size={22} className="text-primary" />
            <span className="text-foreground font-medium">Sobre</span>
          </div>
          {showSobre ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
        </button>

        {showSobre && (
          <div className="wood-card px-5 py-5 space-y-1 text-sm text-muted-foreground animate-fade-in">
            {!sobreLoaded ? (
              <p className="text-center py-4 animate-pulse">Carregando...</p>
            ) : sobreContent ? (
              renderContent(sobreContent)
            ) : (
              <p className="text-center py-4">Nenhum conteúdo disponível.</p>
            )}
          </div>
        )}

        {/* Termos de Uso (fixed, not editable) */}
        <button
          onClick={() => setShowTerms(!showTerms)}
          className="wood-card w-full flex items-center justify-between px-4 py-4 text-left"
        >
          <div className="flex items-center gap-4">
            <FileText size={22} className="text-primary" />
            <span className="text-foreground font-medium">Termos de Uso e Privacidade</span>
          </div>
          {showTerms ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
        </button>

        {showTerms && (
          <div className="wood-card px-5 py-5 space-y-4 text-sm text-muted-foreground animate-fade-in">
            <h2 className="font-heading text-base text-primary">Termos de Uso e Política de Privacidade</h2>

            <div>
              <h3 className="font-heading text-sm text-foreground mb-1">1. Aceitação dos Termos</h3>
              <p>Ao utilizar este aplicativo, você concorda com os nossos termos. Nosso objetivo é oferecer uma experiência de agendamento ágil e eficiente para o seu cuidado pessoal.</p>
            </div>

            <div>
              <h3 className="font-heading text-sm text-foreground mb-1">2. Política de Agendamento e Cancelamento</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><span className="text-foreground font-medium">Agendamentos:</span> O horário escolhido é reservado exclusivamente para você.</li>
                <li><span className="text-foreground font-medium">Cancelamento:</span> Pedimos que realize o cancelamento com antecedência mínima de 2 horas.</li>
                <li><span className="text-foreground font-medium">Faltas (No-show):</span> O não comparecimento sem aviso prévio poderá limitar o uso do app.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-heading text-sm text-foreground mb-1">3. Privacidade e Proteção de Dados</h3>
              <p>Seus dados (nome, telefone, histórico) são utilizados estritamente para o gerenciamento da sua agenda. Não compartilhamos suas informações com terceiros.</p>
            </div>

            <div>
              <h3 className="font-heading text-sm text-foreground mb-1">4. Segurança e Acesso</h3>
              <p>O acesso aos painéis de gestão é restrito a administradores autorizados. A tentativa de acesso não autorizado é estritamente proibida.</p>
            </div>

            <div>
              <h3 className="font-heading text-sm text-foreground mb-1">5. Alterações nos Termos</h3>
              <p>Reservamo-nos o direito de atualizar estes termos periodicamente. Ao continuar utilizando o app após as mudanças, você concorda com a nova versão.</p>
            </div>
          </div>
        )}
      </div>
      <div className="px-4 mt-8 text-center">
        <p className="text-muted-foreground text-xs">{shopDisplayName} © 2026</p>
      </div>
    </div>
  );
}
