
-- Evolution config (singleton)
CREATE TABLE public.evolution_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_url text,
  api_key text,
  instance text,
  paired boolean NOT NULL DEFAULT false,
  last_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CEO manage evolution_config" ON public.evolution_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ceo')) WITH CHECK (public.has_role(auth.uid(),'ceo'));

-- Templates
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL UNIQUE,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CEO manage templates" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ceo')) WITH CHECK (public.has_role(auth.uid(),'ceo'));
CREATE POLICY "Templates visible to staff" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo'));

-- Fila de envios
CREATE TABLE public.whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario text NOT NULL,
  mensagem text NOT NULL,
  tipo text,
  agendamento_id uuid,
  status text NOT NULL DEFAULT 'pending',
  tentativas integer NOT NULL DEFAULT 0,
  max_tentativas integer NOT NULL DEFAULT 3,
  erro text,
  resposta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read queue" ON public.whatsapp_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo'));
CREATE POLICY "Staff insert queue" ON public.whatsapp_queue FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo'));
CREATE POLICY "CEO update queue" ON public.whatsapp_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'ceo') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "CEO delete queue" ON public.whatsapp_queue FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'ceo'));

-- Seed templates default
INSERT INTO public.whatsapp_templates (tipo, titulo, conteudo) VALUES
('agendamento','Novo Agendamento','Olá {cliente}! Seu agendamento foi recebido para {data} às {hora}. Para confirmar, envie o sinal de R$ {valor_sinal} via PIX e mande o comprovante neste WhatsApp.'),
('sinal_pago','Sinal Confirmado','Olá {cliente}! Recebemos seu sinal ✅. Seu horário em {data} às {hora} está confirmado. Até breve!'),
('concluido','Serviço Concluído','Obrigado por nos visitar, {cliente}! Esperamos que tenha gostado. Avalie sua experiência no app 🌟'),
('lembrete','Lembrete de Horário','Oi {cliente}, lembrete: seu corte é amanhã ({data}) às {hora}. Te esperamos!'),
('avaliacao','Pedido de Avaliação','{cliente}, sua opinião vale muito! Deixe sua avaliação do atendimento de hoje no app. 🙏');
