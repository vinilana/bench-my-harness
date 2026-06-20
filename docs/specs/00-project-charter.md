# Bench My Harness - Project Charter

## Problema

Empresas estao adotando coding agents e harnesses como Codex, Claude Code, Cursor, OpenCode e Pi, mas ainda comparam resultados de forma anedotica. O mesmo prompt pode produzir custos, tempos, uso de ferramentas, consumo de contexto e qualidade de entrega muito diferentes dependendo do harness, do modelo, das permissoes e da forma como o ambiente e preparado.

Bench My Harness existe para transformar essa comparacao em um processo auditavel, reproduzivel e orientado por dados.

## Objetivo

Criar uma plataforma que permita:

- conectar harnesses de codificacao agentica por hooks, plugins, extensoes, webhooks, arquivos ou wrappers;
- capturar eventos brutos e normaliza-los para um contrato canonico;
- cadastrar benchmarks com prompt, ambiente, outputs esperados e validacoes;
- executar o mesmo benchmark em multiplos harnesses;
- comparar custo, tempo, uso de tools, tokens, janela de contexto, output e resultado de testes;
- preservar artefatos para auditoria e reprocessamento.

## Harnesses da v1

- Codex
- Claude Code

## Harnesses futuros

- Cursor
- OpenCode
- Pi

## Principios

- O dominio nao conhece fornecedores especificos.
- Todo evento bruto relevante deve ser preservado ou referenciado antes da normalizacao.
- Toda metrica comparavel precisa declarar fonte e confianca.
- Benchmark sem estado inicial, ambiente e output esperado versionados nao e reproduzivel.
- Comparacoes devem separar diferencas de harness, modelo, permissoes, ambiente e benchmark.
- O sistema deve marcar execucoes como nao comparaveis quando os dados ou capacidades nao sustentarem a conclusao.

## Fora do escopo da versao inicial

- Treinamento ou fine-tuning de modelos.
- Ranking publico global.
- Execucao distribuida em larga escala.
- Avaliacao subjetiva como criterio primario sem rubric declarada.
- Dependencia obrigatoria de um unico harness ou provedor.
- Adapters de Cursor, OpenCode e Pi.

## Referencias verificadas em 2026-06-20

- Claude Code Hooks: https://code.claude.com/docs/en/hooks
- Codex Hooks: https://developers.openai.com/codex/hooks
- Cursor Hooks: https://cursor.com/docs/hooks
- OpenCode Plugins: https://opencode.ai/docs/plugins/
- Pi Extensions: https://pi.dev/docs/latest/extensions
- Pi SDK: https://pi.dev/docs/latest/sdk
