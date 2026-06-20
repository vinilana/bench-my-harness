# Initial Roadmap

## Fase 0 - Fundacao

- Definir ADRs e specs iniciais.
- Escolher stack tecnica.
- Criar contratos de dominio.
- Criar fixtures sinteticas para eventos canonicos.
- Criar skeleton de adapters.

## Fase 1 - Ingestao e normalizacao

- Implementar `RawEventStore`.
- Implementar `NormalizedEventStore`.
- Implementar ingestao por stdin.
- Implementar ingestao por arquivo JSON/JSONL.
- Criar adapters iniciais para Claude Code e Codex.
- Implementar `hook-capture` para hooks locais.
- Implementar spool local para falha de ingest.

## Fase 2 - Benchmark runner

- Definir formato `benchmark.yml`.
- Preparar worktree/sandbox por trial.
- Instalar hooks temporarios por trial para Codex e Claude Code.
- Executar prompt em harness configurado.
- Coletar transcript, eventos, diffs e testes.
- Coletar usage/status quando disponivel.
- Classificar falhas.

## Fase 3 - Metricas e avaliacao

- Calcular metricas de tempo, tools, tokens e contexto.
- Integrar tokenizers estimativos.
- Implementar score inicial.
- Implementar comparability policy.
- Gerar relatorio Markdown/JSON.

## Fase 4 - Adapters adicionais

- Webhook ingest com HMAC.
- OpenCode plugin adapter.
- Pi extension adapter.
- Cursor adapter com fallback por log/import.
- Capability matrix por versao.

## Fase 5 - Produto

- UI ou API de consulta.
- Dashboard comparativo.
- Export CSV.
- Gate de CI para suites selecionadas.
- Relatorios por categoria de tarefa.
