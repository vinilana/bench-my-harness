# Canonical Event Contract

## Objetivo

Normalizar eventos de harnesses heterogeneos para um envelope estavel. O contrato canonico deve preservar semantica comparavel sem apagar o evento original.

## Envelope v1

```json
{
  "schema_version": "bmh.event.v1",
  "event_id": "evt_...",
  "idempotency_key": "provider:workspace:run:source",
  "provider": "claude_code",
  "provider_event_type": "PreToolUse",
  "event_type": "tool.requested",
  "occurred_at": "2026-06-20T15:04:05.123Z",
  "observed_at": "2026-06-20T15:04:05.456Z",
  "sequence": 42,
  "source": {
    "transport": "stdin",
    "adapter_version": "claude-code-hooks@0.1.0",
    "host": "dev-machine",
    "process_id": 12345
  },
  "workspace": {
    "id": "workspace_...",
    "root": "/repo",
    "repo_url": "git@github.com:org/repo.git",
    "git_sha": "abc123",
    "branch": "main"
  },
  "run": {
    "run_id": "run_...",
    "trial_id": "trial_...",
    "session_id": "provider-session",
    "turn_id": "turn_...",
    "parent_event_id": null
  },
  "actor": {
    "type": "agent",
    "name": "claude-code",
    "user_id": null
  },
  "action": {
    "name": "Bash",
    "category": "tool",
    "status": "requested"
  },
  "payload": {},
  "raw_ref": {
    "raw_event_id": "raw_...",
    "payload_hash": "sha256:..."
  },
  "quality": {
    "identity": "native",
    "timestamp": "native",
    "ordering": "native",
    "payload_completeness": "full"
  },
  "security": {
    "redaction_applied": true,
    "secret_scan_status": "passed"
  }
}
```

## Campos obrigatorios

- `schema_version`
- `event_id`
- `idempotency_key`
- `provider`
- `provider_event_type`
- `event_type`
- `occurred_at`
- `observed_at`
- `source.transport`
- `run.run_id`
- `action.status`
- `payload`
- `quality`

## Taxonomia canonica inicial

- `session.started`
- `session.ended`
- `turn.started`
- `turn.ended`
- `message.input`
- `message.output`
- `tool.requested`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `tool.denied`
- `command.started`
- `command.completed`
- `file.read`
- `file.written`
- `approval.requested`
- `approval.resolved`
- `context.compacted`
- `notification.emitted`
- `metric.recorded`
- `artifact.created`
- `error.raised`

## Idempotencia

Use chave nativa quando existir:

```text
provider + provider_event_id
```

Use chave derivada quando nao existir:

```text
sha256(provider, workspace, run_id, session_id, provider_event_type, occurred_at, sequence, canonical_payload_hash)
```

O storage deve impor unicidade por `provider` e `idempotency_key`.

## Qualidade de dados

Campos incertos devem ser marcados em `quality`, nao inventados silenciosamente:

- `native`: fornecido pelo harness.
- `derived`: calculado pelo adapter.
- `estimated`: inferido por heuristica.
- `observed`: medido no momento de ingestao.
- `unavailable`: nao disponivel.

## Preservacao do bruto

O evento canonico deve referenciar `RawHookEvent` por `raw_ref`. Relatorios podem omitir payload bruto, mas o sistema deve conseguir reprocessar eventos quando schemas de adapters evoluirem.
