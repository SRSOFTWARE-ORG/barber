import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Seo from '@/components/Seo';

const UPDATED = '26 de junho de 2026';

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  const { shopDisplayName } = useAuth();
  const appName = shopDisplayName || 'Barbearia';

  return (
    <div className="page-shell min-h-screen">
      <Seo
        path="/privacy-policy"
        title="Política de Privacidade — Barbearia Classic"
        description="Saiba como coletamos, usamos e protegemos seus dados, incluindo o login com Google, e quais são os seus direitos."
      />

      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="text-primary" aria-label="Voltar para a página inicial">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading text-xl text-foreground">Política de Privacidade</h1>
      </div>

      <div className="px-4 pb-12 max-w-2xl mx-auto space-y-5">
        <p className="text-xs text-muted-foreground">Última atualização: {UPDATED}</p>

        <section className="wood-card px-5 py-5 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Esta Política de Privacidade descreve como o aplicativo {appName} ("nós", "nosso" ou
            "aplicativo") coleta, utiliza, armazena e protege as informações dos usuários ("você").
            Ao utilizar o aplicativo, você concorda com as práticas descritas neste documento.
          </p>
        </section>

        <Section title="1. Informações que coletamos">
          <p>Coletamos apenas as informações necessárias para o funcionamento do serviço:</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong className="text-foreground">Dados de cadastro:</strong> nome, telefone e credenciais de acesso.</li>
            <li><strong className="text-foreground">Dados de login social (Google):</strong> ao optar por entrar com sua conta Google, recebemos seu nome, endereço de e-mail e foto de perfil pública fornecidos pelo Google, exclusivamente para identificar e autenticar sua conta.</li>
            <li><strong className="text-foreground">Dados de uso:</strong> agendamentos, histórico de atendimentos e preferências.</li>
            <li><strong className="text-foreground">Dados técnicos:</strong> informações do dispositivo e registros necessários à segurança e ao bom funcionamento do app.</li>
          </ul>
        </Section>

        <Section title="2. Login com Google">
          <p>
            Utilizamos o login do Google (OAuth) apenas para autenticação. Não acessamos seus
            contatos, e-mails, agenda ou quaisquer dados além das informações básicas de perfil
            (nome, e-mail e foto) que você autoriza expressamente na tela de consentimento do
            Google. Não solicitamos permissões sensíveis e não usamos esses dados para fins de
            publicidade.
          </p>
        </Section>

        <Section title="3. Como usamos suas informações">
          <ul className="list-disc list-inside space-y-1">
            <li>Criar e gerenciar sua conta e autenticação.</li>
            <li>Realizar e organizar seus agendamentos e atendimentos.</li>
            <li>Enviar notificações relacionadas ao serviço (confirmações, lembretes e suporte).</li>
            <li>Garantir a segurança, prevenir fraudes e cumprir obrigações legais.</li>
          </ul>
        </Section>

        <Section title="4. Compartilhamento de dados">
          <p>
            Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins de
            marketing. As informações podem ser tratadas por provedores de infraestrutura,
            autenticação e pagamento estritamente necessários à operação do aplicativo, sempre
            sob obrigações de confidencialidade.
          </p>
        </Section>

        <Section title="5. Proteção e armazenamento">
          <p>
            Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo
            controle de acesso, regras de segurança no banco de dados e transmissão criptografada.
            Os dados são mantidos apenas pelo período necessário às finalidades descritas ou
            conforme exigido por lei.
          </p>
        </Section>

        <Section title="6. Seus direitos">
          <p>De acordo com a legislação aplicável (incluindo a LGPD), você pode:</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Acessar, corrigir ou atualizar seus dados pessoais.</li>
            <li>Solicitar a exclusão da sua conta e dos dados associados.</li>
            <li>Revogar o consentimento e desconectar o login do Google a qualquer momento.</li>
            <li>Solicitar informações sobre o tratamento dos seus dados.</li>
          </ul>
        </Section>

        <Section title="7. Retenção e exclusão">
          <p>
            Você pode solicitar a exclusão dos seus dados entrando em contato pelos canais de
            suporte do aplicativo. Após a exclusão, removemos suas informações pessoais, exceto
            quando a retenção for necessária para cumprimento de obrigações legais.
          </p>
        </Section>

        <Section title="8. Alterações nesta política">
          <p>
            Podemos atualizar esta Política de Privacidade periodicamente. A data da última
            revisão será sempre indicada no topo deste documento.
          </p>
        </Section>

        <Section title="9. Contato">
          <p>
            Em caso de dúvidas sobre privacidade ou para exercer seus direitos, entre em contato
            pelo próprio aplicativo (chat/suporte) ou pelo site{' '}
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
