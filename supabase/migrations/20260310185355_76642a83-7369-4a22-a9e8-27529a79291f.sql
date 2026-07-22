-- Drop restrictive policies and recreate as permissive
DROP POLICY "Agendamentos visíveis para todos" ON public.agendamentos;
DROP POLICY "Qualquer um pode agendar" ON public.agendamentos;
DROP POLICY "Update agendamentos" ON public.agendamentos;

DROP POLICY "Serviços visíveis para todos" ON public.servicos;
DROP POLICY "Insert serviços" ON public.servicos;
DROP POLICY "Update serviços" ON public.servicos;
DROP POLICY "Delete serviços" ON public.servicos;

DROP POLICY "Config visível para todos" ON public.configuracoes;
DROP POLICY "Update config" ON public.configuracoes;

DROP POLICY "Bloqueios visíveis para todos" ON public.horarios_bloqueados;
DROP POLICY "Insert bloqueios" ON public.horarios_bloqueados;
DROP POLICY "Delete bloqueios" ON public.horarios_bloqueados;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Agendamentos visíveis para todos" ON public.agendamentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Qualquer um pode agendar" ON public.agendamentos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Update agendamentos" ON public.agendamentos FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "Serviços visíveis para todos" ON public.servicos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Insert serviços" ON public.servicos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Update serviços" ON public.servicos FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Delete serviços" ON public.servicos FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Config visível para todos" ON public.configuracoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Update config" ON public.configuracoes FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "Bloqueios visíveis para todos" ON public.horarios_bloqueados FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Insert bloqueios" ON public.horarios_bloqueados FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Delete bloqueios" ON public.horarios_bloqueados FOR DELETE TO anon, authenticated USING (true);