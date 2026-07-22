import { ArrowLeft, ShieldCheck, Lock, Database, Server, UserCheck, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Seo from '@/components/Seo';

/**
 * Página de Confiança & Segurança — conteúdo mantido pelo responsável do app.
 * Descreve apenas controles visíveis no aplicativo e práticas declaradas pelo
 * responsável. Não é uma certificação independente.
 */
export default function TrustPage() {
  const navigate = useNavigate();
  const { shopDisplayName } = useAuth();

  const sections = [
    {
      icon: UserCheck,
      title: 'Acesso e autenticação',
      items: [
        'O acesso à conta é protegido por senha e, quando disponível no dispositivo, por login biométrico.',
        'Os painéis de gestão (barbeiro e administrador) são restritos a usuários autorizados.',
        'Cada pessoa só enxerga os dados aos quais tem permissão de acesso.',
      ],
    },
    {
      icon: Lock,
      title: 'Proteção dos seus dados',
      items: [
        'Seus dados (nome, telefone e histórico de agendamentos) são usados apenas para gerenciar sua agenda e atendimento.',
        'Regras de segurança no banco de dados garantem que clientes não vejam os dados de outros clientes.',
        'Comprovantes de pagamento são acessados apenas por links temporários e protegidos.',
        'Não compartilhamos suas informações com terceiros para fins de marketing.',
      ],
    },
    {
      icon: Database,
      title: 'Coleta e uso de informações',
      items: [
        'Coletamos somente o necessário para o agendamento, pagamentos e comunicação do atendimento.',
        'Notificações e mensagens são enviadas para apoiar o seu atendimento (lembretes, confirmações e suporte).',
      ],
    },
    {
      icon: Server,
      title: 'Infraestrutura e hospedagem',
      items: [
        'O aplicativo é hospedado em uma infraestrutura de nuvem gerenciada, que fornece autenticação, banco de dados e funções de backend.',
        'Esta seção descreve recursos da plataforma utilizados pelo app e não constitui uma certificação.',
      ],
    },
    {
      icon: ShieldCheck,
      title: 'Pagamentos',
      items: [
        'Pagamentos online são processados por provedores de pagamento integrados; não armazenamos dados completos de cartão.',
        'Valores de sinal e taxas são calculados e validados no servidor.',
      ],
    },
  ];

  return (
    <div className="page-shell min-h-screen">
      <Seo
        path="/confianca"
        title="Confiança e Segurança — Barbearia Classic"
        description="Como protegemos seus dados, sua privacidade e a segurança do aplicativo."
      />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/more'))} className="text-primary" aria-label="Voltar">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading text-xl text-foreground">Confiança & Segurança</h1>
      </div>

      <div className="px-4 space-y-4">
        <div className="wood-card px-5 py-4 text-sm text-muted-foreground">
          <p>
            Esta página é mantida pelo responsável da {shopDisplayName} para responder às
            dúvidas mais comuns sobre segurança e privacidade do aplicativo. Ela descreve
            práticas e controles atuais do app e não é uma verificação independente.
          </p>
        </div>

        {sections.map(({ icon: Icon, title, items }) => (
          <section key={title} className="wood-card px-5 py-5 space-y-3">
            <div className="flex items-center gap-3">
              <Icon size={20} className="text-primary" />
              <h2 className="font-heading text-base text-foreground">{title}</h2>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
              {items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="wood-card px-5 py-5 space-y-3">
          <div className="flex items-center gap-3">
            <Mail size={20} className="text-primary" />
            <h2 className="font-heading text-base text-foreground">Contato e relato de problemas</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Encontrou algo que parece uma falha de segurança ou privacidade? Fale com o
            responsável pela barbearia pelo próprio aplicativo (chat/suporte) para que possamos
            avaliar e corrigir.
          </p>
        </section>
      </div>

      <div className="px-4 mt-8 mb-4 text-center">
        <p className="text-muted-foreground text-xs">{shopDisplayName} © 2026</p>
      </div>
    </div>
  );
}
