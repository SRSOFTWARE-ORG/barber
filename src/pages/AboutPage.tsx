import { ArrowLeft, CalendarDays, Scissors, Camera, Tag, ShieldCheck, Smartphone } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Seo from '@/components/Seo';

const features = [
  { icon: CalendarDays, title: 'Agendamento online', desc: 'Reserve seu horário de corte e barba em poucos toques, com confirmação e lembretes.' },
  { icon: Scissors, title: 'Serviços e barbeiros', desc: 'Conheça os serviços disponíveis e escolha o profissional da sua preferência.' },
  { icon: Camera, title: 'Galeria de cortes', desc: 'Inspire-se com fotos reais dos trabalhos realizados na barbearia.' },
  { icon: Tag, title: 'Promoções e planos', desc: 'Acompanhe ofertas exclusivas e benefícios para clientes fiéis.' },
  { icon: ShieldCheck, title: 'Acesso seguro', desc: 'Login protegido por senha ou pela sua conta Google, com seus dados sempre resguardados.' },
  { icon: Smartphone, title: 'App instalável (PWA)', desc: 'Use direto do navegador ou instale no celular para uma experiência completa.' },
];

export default function AboutPage() {
  const navigate = useNavigate();
  const { shopDisplayName } = useAuth();
  const appName = shopDisplayName || 'Barbearia';

  return (
    <div className="page-shell min-h-screen">
      <Seo
        path="/about"
        title="Sobre o Aplicativo — Barbearia Classic"
        description="Conheça o propósito do aplicativo: agendamento online de barbearia, serviços, galeria, promoções e atendimento com tradição e estilo."
      />

      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="text-primary" aria-label="Voltar para a página inicial">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading text-xl text-foreground">Sobre o aplicativo</h1>
      </div>

      <div className="px-4 pb-12 max-w-2xl mx-auto space-y-5">
        <section className="wood-card px-5 py-6 text-center space-y-3">
          <img src="/logo.svg" alt={`Logo da ${appName}`} className="w-24 h-24 mx-auto" width={96} height={96} />
          <h2 className="font-display text-2xl text-primary tracking-wider">{appName}</h2>
          <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase">• Tradição e Estilo •</p>
        </section>

        <section className="wood-card px-5 py-5 space-y-2">
          <h3 className="font-heading text-base text-foreground">Nosso propósito</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O {appName} é um aplicativo criado para aproximar clientes e barbearias, tornando o
            agendamento de cortes e serviços simples, rápido e organizado. Em um só lugar, você
            agenda horários, acompanha seu histórico, descobre promoções e se mantém conectado ao
            seu barbeiro de confiança — com a praticidade de um aplicativo moderno e a essência da
            barbearia tradicional.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="font-heading text-base text-foreground px-1">O que você pode fazer</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="wood-card px-4 py-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Icon size={20} className="text-primary shrink-0" />
                  <h4 className="font-heading text-sm text-foreground">{title}</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="wood-card px-5 py-5 space-y-2">
          <h3 className="font-heading text-base text-foreground">Privacidade e termos</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Levamos a sério a proteção dos seus dados. Consulte nossa{' '}
            <Link to="/privacy-policy" className="text-primary underline">Política de Privacidade</Link>{' '}
            e os{' '}
            <Link to="/terms-of-service" className="text-primary underline">Termos de Serviço</Link>{' '}
            para entender como tratamos suas informações.
          </p>
        </section>

        <div className="pt-1 flex flex-wrap gap-3">
          <Link to="/" className="vintage-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm">
            <ArrowLeft size={16} />
            Voltar à página inicial
          </Link>
          <Link to="/booking" className="vintage-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm">
            <CalendarDays size={16} />
            Agendar agora
          </Link>
        </div>
      </div>
    </div>
  );
}
