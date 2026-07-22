# Fase 5 — Barbeiros, Disponibilidades e Vínculos: Checklist

## Como aplicar (SQL Editor Supabase)

1. **Aplicar schema**
   - Abrir `docs/reconstruction/phase5_barbers.sql` → colar tudo → **Run**
   - Esperado: `Success. No rows returned`

2. **Rodar testes de RLS** (opcional)
   - Abrir `docs/reconstruction/phase5_rls_tests.sql`
   - Substituir UUIDs (`:company_id`, `:owner_uid`, `:barber_uid`, …)
   - Rodar bloco a bloco

3. **Se der problema**
   - Rodar `docs/reconstruction/phase5_rollback.sql`
   - Me enviar o erro

---

## Checklist pós-aplicação

### Estrutura
- [ ] `to_regclass('public.barbers')` não nulo
- [ ] `to_regclass('public.barber_units')` não nulo
- [ ] `to_regclass('public.barber_availability')` não nulo
- [ ] `to_regclass('public.barber_time_off')` não nulo
- [ ] Enums `barber_status` e `time_off_reason` criados

### RLS + Policies
- [ ] RLS ativo nas 4 tabelas
- [ ] `barbers` = 7 policies
- [ ] `barber_units` = 5 policies
- [ ] `barber_availability` = 8 policies
- [ ] `barber_time_off` = 6 policies

### Triggers
- [ ] `trg_barber_unit_coherence` força company match unit/barbeiro
- [ ] `trg_avail_coherence` bloqueia sobreposição no mesmo dia/unidade
- [ ] `trg_time_off_coherence` sincroniza company_id
- [ ] Se Fase 3 aplicada: `audit_barbers`, `audit_barber_units`, `audit_barber_availability`, `audit_barber_time_off`

### Comportamento
- [ ] Proprietário vê e escreve na própria empresa
- [ ] Proprietário de outra empresa não vê nada
- [ ] Barbeiro vê o próprio registro e edita a própria disponibilidade
- [ ] Barbeiro NÃO cria outro barbeiro
- [ ] Cliente autenticado vê apenas barbeiros `active + is_bookable`
- [ ] Staff de plataforma vê tudo
- [ ] Vínculo `barber_units` com unidade de OUTRA empresa falha com erro
- [ ] Disponibilidade sobreposta no mesmo weekday/unit falha
- [ ] `barber_time_off` com `ends_at <= starts_at` falha (check constraint)

### Frontend disponível após aplicar
- `/clients` — CRUD de clientes (Fase 4)
- `/barbers` — barbeiros + disponibilidades (Fase 5)

---

## Se algum item falhar
1. Copie a mensagem de erro
2. Rode `phase5_rollback.sql`
3. Me envie o erro para eu corrigir antes da Fase 6
