# Fase 12 — Checklist (Fila de envio: workers, retries, observabilidade)

## Aplicar
1. Execute `phase12_dispatch.sql` no SQL Editor.
2. Verifique se não houve erros.

## Estrutura
- [ ] Enums: `dispatch_kind`, `worker_status`, `dispatch_result`.
- [ ] Tabelas: `dispatch_workers`, `dispatch_queue`, `dispatch_attempts`, `dispatch_dead_letter`.
- [ ] Views: `v_dispatch_queue_stats`, `v_dispatch_worker_health`, `v_dispatch_recent_failures`, `v_dispatch_throughput_hourly`.
- [ ] Funções: `dispatch_worker_heartbeat`, `dispatch_enqueue`, `dispatch_claim`, `dispatch_complete`, `dispatch_backoff_seconds`, `dispatch_reap_locks`, `dispatch_requeue_from_dlq`.
- [ ] Triggers: `trg_notifications_dispatch`, `trg_wa_messages_dispatch`, `trg_dispatch_attempts_immutable`.
- [ ] RLS ativada em todas as tabelas.

## Comportamento
- [ ] Inserir `notifications` gera linha em `dispatch_queue`.
- [ ] Inserir `wa_messages` outbound gera linha em `dispatch_queue`.
- [ ] `dispatch_claim` reserva com `FOR UPDATE SKIP LOCKED` e expiração.
- [ ] `dispatch_complete('retryable_error')` reagenda com backoff exponencial + jitter.
- [ ] Ao esgotar `max_attempts` (ou `permanent_error`) a linha vai para DLQ e status vira `failed`.
- [ ] `dispatch_reap_locks` devolve para fila jobs presos.
- [ ] `dispatch_requeue_from_dlq` recoloca o item na fila e remove da DLQ.
- [ ] `dispatch_attempts` é append-only.

## Como um worker (edge function) deve consumir
```ts
// 1. heartbeat
const { data: workerId } = await supabase.rpc('dispatch_worker_heartbeat', {
  _name: 'worker-email', _kind: 'email', _status: 'busy'
});
// 2. claim
const { data: batch } = await supabase.rpc('dispatch_claim', {
  _worker_id: workerId, _kind: 'notification', _batch: 10, _lock_seconds: 60
});
// 3. processar cada item e chamar dispatch_complete(...)
```

## RLS (rode `phase12_rls_tests.sql`)
- [ ] Barbeiro/cliente não vê fila.
- [ ] Owner/manager veem apenas fila da própria empresa.
- [ ] Platform staff vê tudo (workers inclusive).

## Rollback
- Execute `phase12_rollback.sql`.

## Próximo passo
Após validar, avise para iniciar a **Fase 13 (Assinaturas SaaS da plataforma: planos, cobrança e limites por empresa)**.
