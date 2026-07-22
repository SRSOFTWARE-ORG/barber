# Edge Functions — Deploy no seu Supabase

Como o projeto usa **seu Supabase** (`ddrwahpcbsbxhflhskuh`), o deploy é
manual via CLI. Não copie estes arquivos para `supabase/functions/` do
Lovable — eles rodam apenas no seu projeto.

## Pré-requisitos

```bash
npm i -g supabase
supabase login
supabase link --project-ref ddrwahpcbsbxhflhskuh
```

## Segredos (Project Settings → Edge Functions → Secrets)

Obrigatórios:
- `EVOLUTION_API_URL`  — ex.: `https://evo.suaempresa.com`
- `EVOLUTION_API_KEY`  — apikey global da Evolution

Opcionais:
- `RESEND_API_KEY`               — envio de e-mail (Resend)
- `WEBPUSH_VAPID_PUBLIC/PRIVATE/SUBJECT` — Web Push
- `DISPATCHER_TOKEN`             — protege o dispatcher (header `X-Token`)
- `EVOLUTION_WEBHOOK_TOKEN`      — protege o webhook (header/query `token`)

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetados pelo Supabase.

## Deploy

Copie as pastas para o seu repositório local (dentro de `supabase/functions/`):

```bash
supabase functions deploy messaging-dispatcher --no-verify-jwt
supabase functions deploy evolution-webhook    --no-verify-jwt
```

## Cron (a cada 1 min)

Opção A — `pg_cron` + `pg_net` no próprio Supabase:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'messaging-dispatcher',
  '*/1 * * * *',
  $$ select net.http_post(
       url := 'https://ddrwahpcbsbxhflhskuh.functions.supabase.co/messaging-dispatcher',
       headers := jsonb_build_object('X-Token', current_setting('app.dispatcher_token', true))
     ) $$
);
-- alter database postgres set app.dispatcher_token = 'MESMO_VALOR_DE_DISPATCHER_TOKEN';
```

Opção B — cron externo (GitHub Actions / cron.dev / EasyCron) chamando
a mesma URL com header `X-Token`.

## Webhook na Evolution API

No painel Evolution, por instância, aponte o webhook para:

```
https://ddrwahpcbsbxhflhskuh.functions.supabase.co/evolution-webhook?token=SEU_TOKEN
```

Eventos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`.
