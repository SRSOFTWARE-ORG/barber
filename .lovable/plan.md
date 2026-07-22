## Plano

Quatro blocos independentes. Posso entregar todos em sequência nesta mesma resposta após aprovação.

---

### 1) Pagamento por barbeiro — MP do **barbeiro que atende** (não mais do dono)

Hoje o MP é vinculado por dono (`mp_credentials.shop_owner_id`). Vou tornar opcional vincular por barbeiro individual.

**Banco**
- Nova coluna `mp_credentials.barber_id uuid NULL UNIQUE` (preserva o registro do dono).
- `mp-create-preference` passa a buscar credencial pela ordem: `barber_id == agendamento.barbeiro_id` → fallback para `shop_owner_id`.
- Se barbeiro não tem MP vinculado **e** o modo do agendamento é "MP", o checkout retorna erro amigável instruindo a vincular.

**UI**
- `MercadoPagoPanel` passa a vincular a conta do **usuário logado** (barbeiro), não do dono. Cada barbeiro abre Pagamentos e conecta a sua.

---

### 2) Modo de pagamento do sinal + Taxa do app (configurável por barbeiro)

**Banco — `profiles` (já tem `taxa_app_valor` numeric default 3.00)**
- Adicionar `sinal_modo text default 'pix'` com check `in ('pix','mp')`.
- Adicionar `sinal_percentual int default 50` com check `between 10 and 100`.
- Trigger/CHECK: `taxa_app_valor` ∈ `[0, 3]` (cliente pode zerar mas nunca passar de 3).

**UI Admin → Pagamentos**
- Campo "Taxa do app (R$)" slider 0–3 (passo 0,50).
- Campo "Sinal exigido (%)" slider 10–100.
- Toggle "Modo de pagamento": **PIX (comprovante)** ou **Mercado Pago**.
- Se escolher MP e não tiver conta vinculada → CTA "Vincular Mercado Pago".

**Cobrança**
- Sinal cobrado = `total_servicos * sinal_percentual/100`.
- Taxa do app = `taxa_app_valor` fixa por agendamento (não por serviço).
- Total cobrado do cliente no ato = sinal + taxa.

---

### 3) Bloqueio total por inadimplência (1 mês após vencimento)

**Banco**
- View / RPC `is_shop_blocked(_shop_owner_id uuid)` → `true` se existe `platform_subscriptions` com `status in ('pendente','atrasado')` e `due_date < now() - 30 days`.
- `barbershop_team` herda bloqueio do dono (mesma RPC, passando o `shop_owner_id` do barbeiro).
- Webhook `mp-webhook` / handler de pagamento da fatura: ao marcar `pago`, nada mais a fazer (a RPC já desbloqueia automaticamente).

**App**
- Novo guard `useShopBlocked()` no `AuthContext`.
- Em `AdminPage` / `CeoPage` (exceto CEO global): se bloqueado, **redireciona forçado para `/fatura`** e a página fica travada até pagar.
- Cliente continua agendando normalmente — apenas staff é bloqueado (essa é a definição de "bloqueio total" do staff; clientes não devem ser punidos pelo atraso do dono). *(Se quiser bloquear novos agendamentos também, me avise — adiciono a checagem em `BookingPage` e na policy de INSERT de `agendamentos`.)*
- Toast no `Index` ao logar bloqueado: "Sua barbearia está bloqueada. Pague a fatura para liberar."

---

### 4) Calendário de agendamentos no painel Admin

Aba "Agendamentos" do `AdminPage` ganha um **calendário mensal** (componente `react-day-picker` já instalado).

- Dias com agendamentos do barbeiro logado ficam **marcados com bolinha dourada**.
- Clicar no dia abre uma lista abaixo: hora • cliente • serviço(s) • status. Vazio → "Nenhum agendamento neste dia".
- Filtro por `barbeiro_id = auth.uid()` (cada um vê só o seu, como pediu).
- Já existe a listagem atual de agendamentos — vou mantê-la em outra aba ("Lista") para não perder nada.

---

### Migrações (SQL resumido)
```sql
ALTER TABLE mp_credentials ADD COLUMN barber_id uuid UNIQUE;
ALTER TABLE profiles 
  ADD COLUMN sinal_modo text NOT NULL DEFAULT 'pix' CHECK (sinal_modo IN ('pix','mp')),
  ADD COLUMN sinal_percentual int NOT NULL DEFAULT 50 CHECK (sinal_percentual BETWEEN 10 AND 100);
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS taxa_app_valor_check;
ALTER TABLE profiles ADD CONSTRAINT taxa_app_valor_check CHECK (taxa_app_valor BETWEEN 0 AND 3);

CREATE OR REPLACE FUNCTION is_shop_blocked(_shop_owner_id uuid) RETURNS boolean ...;
```

### Arquivos a tocar
- `supabase/functions/mp-create-preference/index.ts` — lookup por barbeiro
- `supabase/functions/mp-oauth-start/index.ts` + `mp-oauth-callback/index.ts` — salvar com `barber_id` quando não-dono
- `src/components/MercadoPagoPanel.tsx` — escopo por barbeiro logado
- `src/pages/AdminPage.tsx` — nova aba Calendário + controles de taxa/sinal
- `src/contexts/AuthContext.tsx` — flag `shopBlocked`
- `src/components/ProtectedRoute.tsx` — redirect forçado se bloqueado
- `src/pages/FaturaPage.tsx` — banner "bloqueado" + após pagamento aprovado, força refetch e libera

Aprovo e sigo?
