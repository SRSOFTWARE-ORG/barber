# Fase 6 — Serviços, Vínculos e Reservas: Checklist

## Aplicar (SQL Editor Supabase)

1. Abrir `docs/reconstruction/phase6_services_bookings.sql` → colar tudo → **Run**.
   Esperado: `Success. No rows returned`.
2. (Opcional) `phase6_rls_tests.sql` — substituir UUIDs, rodar bloco a bloco.
3. Rollback (se necessário): `phase6_rollback.sql`.

## Extensões requeridas (o script instala; confirme)
- [ ] `btree_gist` habilitada (`select extname from pg_extension where extname='btree_gist';`)
- [ ] `pg_trgm` habilitada

## Estrutura
- [ ] Tabelas: `service_categories`, `services`, `barber_services`, `bookings`, `booking_services`
- [ ] Enum `booking_status` criado
- [ ] Exclusion constraint `bookings_no_overlap_excl` presente
  ```sql
  select conname from pg_constraint where conname='bookings_no_overlap_excl';
  ```

## RLS + Policies
- [ ] RLS ativo em todas as 5 tabelas
- [ ] `services` = 5 policies
- [ ] `service_categories` = 4 policies
- [ ] `barber_services` = 5 policies
- [ ] `bookings` = 11 policies
- [ ] `booking_services` = 3 policies

## Triggers
- [ ] `trg_service_cat_coherence` bloqueia categoria de outra empresa
- [ ] `trg_bs_coherence` bloqueia vínculo entre empresas
- [ ] `trg_booking_coherence` normaliza `company_id` e `created_by`
- [ ] `trg_bsv_coherence` bloqueia serviço de outra empresa
- [ ] `trg_recalc_total` atualiza `bookings.total_amount` ao mudar itens

## Comportamento (testes)
- [ ] Owner cria serviço, vincula barbeiro, cria booking → OK
- [ ] Booking sobreposto para o mesmo barbeiro → erro de exclusion
- [ ] Barbeiro vê o próprio booking; **não** cria serviço
- [ ] Cliente final vê **só os próprios** bookings; consegue cancelar
- [ ] Owner de outra empresa não vê nada
- [ ] Platform staff vê tudo
- [ ] Item de serviço de outra empresa em booking → erro

## Frontend
- `/services-manage` — CRUD de serviços + vinculação com barbeiros
- `/bookings` — agenda semanal do barbeiro; criar/editar/cancelar reservas
- Exportar ICS (arquivo `.ics`) e imprimir (PDF via navegador) direto da tela

## Se algo falhar
1. Copie o erro
2. Rode `phase6_rollback.sql`
3. Me envie o erro
