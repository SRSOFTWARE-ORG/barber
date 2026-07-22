-- 1) marketplace_pedidos: buyer phone must not be visible to shop team members
DROP POLICY IF EXISTS "Pedidos visiveis a envolvidos" ON public.marketplace_pedidos;
CREATE POLICY "Pedidos visiveis a envolvidos"
  ON public.marketplace_pedidos
  FOR SELECT
  USING (
    comprador_id = auth.uid()
    OR shop_owner_id = auth.uid()
    OR has_role(auth.uid(), 'ceo'::app_role)
  );
REVOKE SELECT (comprador_telefone) ON public.marketplace_pedidos FROM authenticated, anon;

-- 2) whatsapp_queue: recipient phone must never be browser-readable
REVOKE SELECT (destinatario) ON public.whatsapp_queue FROM authenticated, anon;

-- 3) agendamentos: anonymous bookers may only INSERT, never read back client PII
REVOKE ALL ON public.agendamentos FROM anon;
GRANT INSERT ON public.agendamentos TO anon;

-- 5) profiles sensitive fields: re-assert column SELECT revoke (defense in depth)
REVOKE SELECT (chave_pix, qr_code_pix_url, invite_code, taxa_app_valor, taxa_isenta_ate)
  ON public.profiles FROM authenticated, anon;