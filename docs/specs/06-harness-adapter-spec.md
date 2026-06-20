# Harness Adapter Spec

## Objetivo

Adapters traduzem eventos, logs e execucoes de harnesses especificos para portas do Bench My Harness. Eles devem ser pequenos, versionados e testados por contrato.

## Responsabilidades

- capturar eventos brutos;
- validar tamanho e estrutura minima;
- redigir secrets antes de persistencia analitica;
- gerar `RawHookEvent`;
- normalizar para `NormalizedEvent`;
- declarar capabilities;
- preservar gaps em `quality`;
- responder ao protocolo do hook quando necessario.

## Escopo v1

A v1 suporta apenas:

- Claude Code
- Codex

Cursor, OpenCode e Pi ficam documentados como adapters futuros, fora da primeira implementacao.

## Transportes suportados na v1

### stdin

Para hooks locais que executam comando e passam JSON por stdin.

```bash
bench-my-harness ingest --provider claude_code --transport stdin
```

### webhook

Fora do caminho principal da v1. Mantido no contrato para evolucao futura, mas Codex e Claude Code devem comecar por hooks locais via comando/stdin.

```text
POST /v1/events/:provider
```

Requisitos: HMAC, timestamp assinado, limite de tamanho e protecao anti-replay.

### arquivo

Para transcripts, logs e JSONL usados como fonte complementar.

```bash
bench-my-harness ingest-file --provider codex --path ./events.jsonl
```

### wrapper

Para harnesses em que a execucao inteira precisa ser observada pelo processo pai. Na v1, o wrapper e o `BenchmarkRunner` que instala hooks temporarios antes de executar Codex ou Claude Code.

```bash
bench-my-harness run --harness codex -- benchmark.yml
```

## Capability matrix

Cada adapter deve declarar:

```json
{
  "provider": "claude_code",
  "adapter_version": "0.1.0",
  "capabilities": {
    "session_lifecycle": "native",
    "turn_lifecycle": "native",
    "tool_lifecycle": "native",
    "file_events": "derived",
    "command_events": "native",
    "approval_events": "partial",
    "token_usage": "unavailable",
    "context_usage": "partial",
    "stable_event_ids": "unknown",
    "stdin": true,
    "webhook": false,
    "file_import": false
  }
}
```

## Adapters v1

### Claude Code

Fonte primaria: hooks instalados automaticamente no workspace isolado do trial. A documentacao oficial descreve eventos de ciclo de vida e passagem de JSON para hooks por stdin ou HTTP. Eventos como `PreToolUse` e `PostToolUse` devem mapear para `tool.requested` e `tool.completed` ou `tool.failed`.

O runner deve gerar configuracao temporaria de hooks e apontar todos os eventos para `bench-my-harness hook-capture --provider claude_code`.

### Codex

Fonte primaria: hooks instalados automaticamente no workspace isolado do trial. A documentacao oficial descreve hooks em `hooks.json` ou `config.toml`, eventos como `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop` e `SessionStart`. O adapter deve tambem suportar import de transcript/log como fonte complementar.

O runner deve gerar configuracao temporaria de hooks e apontar todos os eventos para `bench-my-harness hook-capture --provider codex`.

## Adapters futuros

### Cursor

Fora da v1. Fonte primaria futura: hooks quando habilitados no ambiente do usuario. O adapter deve tratar Cursor como compatibilidade progressiva, pois granularidade e disponibilidade podem variar por plano, versao e superficie.

### OpenCode

Fora da v1. Fonte primaria futura: plugins JavaScript/TypeScript e SDK/event stream quando aplicavel. Plugins podem interceptar eventos e customizar comportamento; o adapter deve preferir plugin fino que envie eventos JSONL ou HTTP para o core.

### Pi

Fora da v1. Fonte primaria futura: extensions e SDK. Extensions podem assinar eventos e registrar tools; o adapter deve mapear eventos de tool, sessao, modelo e input para o contrato canonico.

## Testes de contrato

Cada adapter deve ter:

- fixtures brutas;
- golden canonical events;
- teste de idempotencia;
- teste de redaction;
- teste de capability matrix;
- teste de evento incompleto com `quality` correto.
