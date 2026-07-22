
CREATE TABLE public.sobre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteudo text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sobre ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Sobre visível para todos" ON public.sobre FOR SELECT TO anon, authenticated USING (true);

-- Only admins/CEO can update
CREATE POLICY "Admins atualizam sobre" ON public.sobre FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ceo'::app_role));

-- Insert initial row
INSERT INTO public.sobre (conteudo) VALUES ('**Termos de Uso e Política de Privacidade**

1. **Aceitação dos Termos**
Ao utilizar este aplicativo, você concorda com os nossos termos. Nosso objetivo é oferecer uma experiência de agendamento ágil e eficiente para o seu cuidado pessoal.

2. **Política de Agendamento e Cancelamento**
- Agendamentos: O horário escolhido é reservado exclusivamente para você.
- Cancelamento: Pedimos que realize o cancelamento com antecedência mínima de 2 horas.
- Faltas (No-show): O não comparecimento sem aviso prévio poderá limitar o uso do app.

3. **Privacidade e Proteção de Dados**
Seus dados (nome, telefone, histórico) são utilizados estritamente para o gerenciamento da sua agenda. Não compartilhamos suas informações com terceiros.

4. **Segurança e Acesso**
O acesso aos painéis de gestão é restrito a administradores autorizados.

5. **Alterações nos Termos**
Reservamo-nos o direito de atualizar estes termos periodicamente.');
