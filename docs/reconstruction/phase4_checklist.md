# Fase 4 — Clientes: Checklist de Validação

## Como aplicar (SQL Editor do Supabase)

Rode **um script por vez**, na ordem:

1. **Aplicar schema**
   - Abra `docs/reconstruction/phase4_clients.sql`
   - Cole no SQL Editor e **Run**
   - Esperado: `Success. No rows returned`

2. **Rodar testes de RLS** (opcional, mas recomendado)
   - Abra `docs/reconstruction/phase4_rls_tests.sql`
   - Substitua os UUIDs no topo (`:company_id`, `:owner_uid`, `:barber_uid`, etc.) pelos reais
   - Descomente os blocos que quiser testar e rode um a um

3. **Se algo der errado**
   - Rode `docs/reconstruction/phase4_rollback.sql` para reverter
   - Ajuste e reaplique

---

## Checklist pós-aplicação

Marque cada item após confirmar no SQL Editor.

### Estrutura
- [ ] `select to_regclass('public.clients');` → não nulo
- [ ] `select to_regclass('public.client_addresses');` → não nulo
- [ ] `select to_regclass('public.client_notes');` → não nulo
- [ ] Enums `client_status` e `client_gender` existem
  ```sql
  select typname from pg_type where typname in ('client_status','client_gender');
  ```
- [ ] Extensão `pg_trgm` habilitada (`select extname from pg_extension where extname='pg_trgm';`)

### Índices e unicidade
- [ ] Índices únicos por empresa: email, phone, document
  ```sql
  select indexname from pg_indexes
   where tablename='clients' and indexname like 'uq_clients_%';
  ```
  Esperado: 3 linhas.
- [ ] Índice GIN de trigrama em `full_name` existe (`idx_clients_name_trgm`)

### RLS ativo
- [ ] `clients`, `client_addresses`, `client_notes` com `rowsecurity=true`
  ```sql
  select relname, relrowsecurity
    from pg_class
   where relname in ('clients','client_addresses','client_notes');
  ```

### Policies
- [ ] `clients` tem 7 policies
- [ ] `client_addresses` tem 6 policies
- [ ] `client_notes` tem 5 policies
  ```sql
  select tablename, count(*) from pg_policies
   where schemaname='public'
     and tablename in ('clients','client_addresses','client_notes')
   group by tablename;
  ```

### Triggers
- [ ] `updated_at` automático em `clients` e `client_addresses`
- [ ] `trg_client_addr_coherence` força `company_id` do endereço = do cliente
- [ ] `trg_client_note_coherence` força `company_id` e `author_id` da nota
- [ ] Se Fase 3 aplicada: triggers `audit_clients`, `audit_client_addresses`, `audit_client_notes`
  ```sql
  select tgname, tgrelid::regclass
    from pg_trigger
   where tgname like 'audit_client%' or tgname like 'trg_client%';
  ```

### Grants
- [ ] `authenticated` tem SELECT/INSERT/UPDATE/DELETE em `clients` e `client_addresses`
- [ ] `authenticated` tem SELECT/INSERT/DELETE em `client_notes` (sem UPDATE)
- [ ] `service_role` tem ALL em todas
  ```sql
  select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type)
    from information_schema.role_table_grants
   where table_schema='public'
     and table_name in ('clients','client_addresses','client_notes')
     and grantee in ('authenticated','service_role')
   group by grantee, table_name
   order by table_name, grantee;
  ```

### Comportamento (rode os testes do `phase4_rls_tests.sql`)
- [ ] Proprietário vê clientes **da própria** empresa
- [ ] Proprietário de outra empresa **NÃO** vê nada da empresa alvo
- [ ] Barbeiro **vê** clientes mas **não consegue INSERT** (RLS bloqueia)
- [ ] Cliente final (user_id vinculado) vê **apenas o próprio** registro
- [ ] Cliente final **não vê** `client_notes`
- [ ] Staff de plataforma (`is_platform_staff`) vê tudo
- [ ] INSERT de email duplicado na mesma empresa **falha** com erro de índice único
- [ ] INSERT do mesmo email em empresa diferente **funciona**

### Auditoria (se Fase 3 aplicada)
- [ ] Inserir/alterar/excluir um cliente gera linha em `audit_events` com `table_name='public.clients'` e `company_id` correto
  ```sql
  select action, table_name, record_id, actor_id, created_at
    from public.audit_events
   where table_name='public.clients'
   order by created_at desc limit 5;
  ```

---

## Se algum item falhar

1. Copie a mensagem de erro exata
2. Rode `phase4_rollback.sql`
3. Me envie o erro para eu corrigir a Fase 4 antes de avançar
