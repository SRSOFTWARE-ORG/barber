import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Seo from '@/components/Seo';

const UPDATED = '26 de junho de 2026';

export default function TermsOfServicePage() {
  const navigate = useNavigate();
  const { shopDisplayName } = useAuth();
  const appName = shopDisplayName || 'Barbearia';

  return (
    <div className="page-shell min-h-screen">
      <Seo
        path="/terms-of-service"
        title="Termos de Serviço — Barbearia Classic"
        description="Termos e condições de uso do aplicativo: responsabilidades, regras de utilização e propriedade intelectual."
      />

      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="text-primary" aria-label="Voltar para a página inicial">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading text-xl text-foreground">Termos de Serviço</h1>
      </div>

      <div className="px-4 pb-12 max-w-2xl mx-auto space-y-5">
        <p className="text-xs text-muted-foreground">Última atualização: {UPDATED}</p>

        <section className="wood-card px-5 py-5 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Estes Termos de Serviço ("Termos") regem o uso do aplicativo {appName} ("aplicativo",
            "serviço"). Ao acessar ou utilizar o aplicativo, você declara que leu, compreendeu e
            concorda com estes Termos. Caso não concorde, não utilize o serviço.
          </p>
        </section>

        <Section title="1. Descrição do serviço">
          <p>
            O aplicativo oferece uma plataforma para agendamento de serviços de barbearia,
            visualização de serviços e galeria, gestão de atendimentos, comunicação com o
            estabelecimento e recursos relacionados. Os serviços presenciais são prestados pelo
            estabelecimento responsável.
          </p>
        </Section>

        <Section title="2. Cadastro e conta">
          <ul className="list-disc list-inside space-y-1">
            <li>Você é responsável pela veracidade das informações fornecidas no cadastro.</li>
            <li>O acesso pode ser feito por credenciais próprias ou login com Google.</li>
            <li>Você é responsável por manter a confidencialidade das suas credenciais e por todas as atividades realizadas em sua conta.</li>
            <li>É proibido criar contas falsas ou se passar por terceiros.</li>
          </ul>
        </Section>

        <Section title="3. Uso aceitável">
          <p>Ao utilizar o aplicativo, você concorda em não:</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Violar leis aplicáveis ou direitos de terceiros.</li>
            <li>Tentar acessar áreas ou dados sem autorização.</li>
            <li>Comprometer a segurança, integridade ou disponibilidade do serviço.</li>
            <li>Utilizar o aplicativo para fins fraudulentos ou abusivos.</li>
          </ul>
        </Section>

        <Section title="4. Agendamentos e pagamentos">
          <p>
            Os horários estão sujeitos à disponibilidade. Eventuais sinais, taxas ou pagamentos
            online são processados por provedores de pagamento integrados. Políticas de
            cancelamento e reagendamento podem ser definidas pelo estabelecimento responsável.
          </p>
        </Section>

        <Section title="5. Responsabilidades">
          <p>
            O aplicativo é fornecido "no estado em que se encontra". Empenhamo-nos para mantê-lo
            disponível e seguro, mas não garantimos funcionamento ininterrupto ou livre de erros.
            Na máxima extensão permitida por lei, não nos responsabilizamos por danos indiretos
            decorrentes do uso ou da indisponibilidade do serviço.
          </p>
        </Section>

        <Section title="6. Propriedade intelectual">
          <p>
            Todo o conteúdo do aplicativo — incluindo nome, logotipo, marca, textos, layout,
            design, código e demais elementos — é de propriedade do seu titular e protegido por
            leis de propriedade intelectual. É vedada a reprodução, distribuição ou modificação
            sem autorização prévia e expressa.
          </p>
        </Section>

        <Section title="7. Suspensão e encerramento">
          <p>
            Podemos suspender ou encerrar o acesso de contas que violem estes Termos ou que
            apresentem risco à segurança do serviço ou de outros usuários. Você pode encerrar sua
            conta a qualquer momento.
          </p>
        </Section>

        <Section title="8. Alterações dos termos">
          <p>
            Estes Termos podem ser atualizados periodicamente. O uso continuado do aplicativo após
            mudanças constitui aceitação dos novos Termos. A data da última revisão é indicada no
            topo deste documento.
          </p>
        </Section>

        <Section title="9. Contato">
          <p>
            Dúvidas sobre estes Termos podem ser enviadas pelo próprio aplicativo (chat/suporte)
            ou pelo site{' '}
            <a href="https://barber.srsoftwarestore.com" className="text-primary underline">
              barber.srsoftwarestore.com
            </a>.
          </p>
        </Section>

        <div className="pt-2">
          <Link
            to="/"
            className="vintage-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm"
          >
            <ArrowLeft size={16} />
            Voltar à página inicial
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="wood-card px-5 py-5 space-y-2">
      <h2 className="font-heading text-base text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}
