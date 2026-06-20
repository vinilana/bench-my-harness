# ADR-002: Evento Canonico Versionado

## Status

Aceita

## Contexto

Cada harness usa nomes, payloads e granularidade de eventos diferentes. Relatorios e metricas precisam de uma linguagem comum.

## Decisao

Definir `bmh.event.v1` como envelope canonico com `event_id`, `idempotency_key`, `provider`, `provider_event_type`, `event_type`, timestamps, source, workspace, run, actor, action, payload, raw_ref, quality e security.

## Consequencias

- Relatorios dependem do schema canonico, nao do bruto.
- Mudancas incompatíveis exigem nova versao.
- Campos ausentes devem ser marcados em `quality`.
