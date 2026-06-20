# Automatic Harness Instrumentation

## Problema

Durante um benchmark, o usuario nao deve precisar configurar manualmente hooks em cada harness. O Bench My Harness deve preparar a execucao, instalar uma configuracao temporaria e fazer o harness avaliado reportar eventos automaticamente para o proprio sistema.

## Escopo v1

A v1 suporta apenas:

- Codex
- Claude Code

Cursor, OpenCode e Pi ficam fora do escopo inicial ate termos a primeira arquitetura validada com duas superficies de hooks reais.

## Ideia central

Cada trial roda em um `InstrumentedHarnessRun`.

O runner:

1. cria um diretorio isolado para o trial;
2. inicia um ingest local ou prepara um spool local;
3. gera hooks temporarios especificos para o harness;
4. injeta variaveis de ambiente com `run_id`, `trial_id`, endpoint/spool e segredo efemero;
5. executa o harness com o prompt do benchmark;
6. recebe eventos automaticamente enquanto o harness roda;
7. coleta transcripts/status/usage ao final;
8. remove hooks temporarios e fecha o trial.

## Componentes

### Benchmark runner

Orquestra o trial e conhece o `HarnessProfile`.

Responsabilidades:

- preparar workspace;
- iniciar ingest;
- instalar hooks temporarios;
- executar comando do harness;
- coletar exit status;
- executar validacoes;
- finalizar e limpar.

### Hook installer

Porta:

```text
InstallHarnessHooksPort
```

Metodos conceituais:

```text
install(profile, run_context) -> HookInstallation
uninstall(installation) -> void
```

Cada implementacao sabe onde o harness procura configuracao e como evitar tocar configuracao global do usuario.

### Local ingest endpoint

Modos suportados:

- `stdio_once`: hook chama `bench-my-harness ingest-hook` e envia um evento por stdin.
- `local_http`: hook faz `POST http://127.0.0.1:<port>/v1/events/:provider`.
- `spool_file`: hook escreve JSONL em arquivo local quando o servidor nao esta disponivel.

Recomendacao v1: usar `stdio_once` + `spool_file` como caminho principal. HTTP local pode vir em seguida.

### Hook command shim

Script ou binario chamado pelo hook do harness:

```bash
bench-my-harness hook-capture \
  --provider codex \
  --run-id "$BMH_RUN_ID" \
  --trial-id "$BMH_TRIAL_ID" \
  --event-source stdin \
  --spool "$BMH_SPOOL_PATH"
```

O shim:

- le JSON do stdin;
- adiciona metadados do trial;
- valida tamanho;
- aplica redaction basica;
- grava no spool ou envia ao ingest;
- retorna resposta compativel com o protocolo do harness;
- nunca quebra o benchmark por falha de telemetria, exceto em modo strict.

## Fluxo de execucao

```text
BenchmarkRun
  -> TrialPlanner
  -> WorkspaceProvisioner
  -> LocalIngest.start()
  -> HookInstaller.install()
  -> HarnessRunner.execute()
      -> harness chama hooks
      -> hook-capture envia eventos para Bench My Harness
  -> UsageCapture.collect()
  -> ValidationRunner.execute()
  -> HookInstaller.uninstall()
  -> ArtifactCollector.finalize()
```

## Variaveis de ambiente do trial

```text
BMH_RUN_ID
BMH_TRIAL_ID
BMH_HARNESS
BMH_PROVIDER
BMH_INGEST_MODE
BMH_INGEST_URL
BMH_SPOOL_PATH
BMH_HMAC_SECRET
BMH_STRICT_TELEMETRY=false
BMH_BENCHMARK_ID
BMH_BENCHMARK_VERSION
```

## Codex instrumentation

### Configuracao temporaria

Codex pode carregar hooks em `.codex/hooks.json` ou `.codex/config.toml` no projeto, desde que a camada do projeto esteja trusted. Para benchmark automatizado, a v1 deve preferir um diretorio de execucao controlado pelo runner, onde a configuracao e gerada pelo proprio Bench My Harness.

Arquivo gerado conceitual:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "bench-my-harness hook-capture --provider codex --event SessionStart",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bench-my-harness hook-capture --provider codex --event UserPromptSubmit",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "bench-my-harness hook-capture --provider codex --event PreToolUse",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "bench-my-harness hook-capture --provider codex --event PostToolUse",
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bench-my-harness hook-capture --provider codex --event PreCompact",
            "timeout": 5
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bench-my-harness hook-capture --provider codex --event PostCompact",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bench-my-harness hook-capture --provider codex --event Stop",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Coleta complementar

Ao final do trial:

- importar `transcript_path` visto nos eventos;
- coletar `/status` quando possivel em modo interativo ou equivalente de automacao;
- coletar `/usage`/usage source quando possivel;
- marcar tokens/contexto como `unavailable` se nao houver fonte confiavel.

### Riscos

- Hooks project-local exigem trust.
- Alguns caminhos de tool nao sao interceptados por `PreToolUse`/`PostToolUse`.
- `transcript_path` nao deve ser tratado como contrato estavel.

## Claude Code instrumentation

### Configuracao temporaria

Claude Code tambem suporta hooks locais por configuracao de projeto. O runner deve gerar `.claude/settings.local.json` ou arquivo equivalente dentro do workspace isolado do trial, evitando alterar configuracao global.

Eventos recomendados:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `PostToolUseFailure`
- `PostToolBatch`
- `PreCompact`
- `PostCompact`
- `Stop`
- `SessionEnd`

### Hook command

Mesmo shim:

```bash
bench-my-harness hook-capture --provider claude_code --event PreToolUse
```

### Coleta complementar

Ao final do trial:

- importar transcript por `transcript_path`;
- coletar `/usage` ou historico local quando permitido;
- coletar diffs e resultado dos testes pelo runner;
- marcar tokens/contexto conforme fonte.

### Riscos

- `/usage` e custo local sao estimativas.
- Token usage da sessao principal nao e campo comum do hook.
- Hooks devem ser rapidos para nao degradar a execucao do harness.

## Modelo de evento de instalacao

O proprio sistema deve registrar quando instrumenta um harness:

```json
{
  "event_type": "instrumentation.installed",
  "provider": "codex",
  "run_id": "run_123",
  "trial_id": "trial_456",
  "hook_events": [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PreCompact",
    "PostCompact",
    "Stop"
  ],
  "ingest_mode": "stdio_once",
  "spool_path": ".bmh/runs/run_123/trials/trial_456/events.spool.jsonl"
}
```

Tambem registrar:

- `instrumentation.failed`;
- `instrumentation.uninstalled`;
- `instrumentation.partial`;
- `usage_capture.started`;
- `usage_capture.completed`;
- `usage_capture.unavailable`.

## Modo strict vs best effort

### Best effort

Padrao v1. Falha de telemetria nao falha o benchmark. O trial recebe `observability_status = partial`.

### Strict

Usado para desenvolver adapters. Se hook capture falhar, o trial falha com `adapter_failed`.

## Criterios de aceite v1

- Runner cria hooks temporarios para Codex e Claude Code sem editar configuracao global.
- Hook capture recebe pelo menos eventos de prompt, tool pre/post e stop.
- Eventos carregam `run_id`, `trial_id`, provider e adapter version.
- Falha de ingest nao trava o harness em modo best effort.
- Ao final, o sistema coleta transcript quando `transcript_path` existir.
- Usage capture registra fonte e confianca, mesmo quando a metrica estiver indisponivel.
- Relatorio mostra coverage efetivo por trial.
