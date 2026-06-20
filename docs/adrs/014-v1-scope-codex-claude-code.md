# ADR-014: Escopo v1 Apenas Codex e Claude Code

## Status

Aceita

## Contexto

O objetivo inicial incluia Codex, Claude Code, Cursor, OpenCode e Pi. A analise de observabilidade mostrou que a dificuldade real nao e apenas criar adapters, mas garantir que o harness avaliado reporte eventos, usage e contexto automaticamente durante o benchmark.

Codex e Claude Code tem documentacao oficial de hooks suficiente para validar o desenho principal com duas superficies reais. Cursor, OpenCode e Pi continuam importantes, mas aumentam o espaco de variacao antes de termos o core estabilizado.

## Decisao

Reduzir o escopo da v1 para:

- Codex
- Claude Code

Cursor, OpenCode e Pi passam para fase posterior.

A v1 tambem deve implementar instrumentacao automatica por trial: o Bench My Harness instala hooks temporarios no workspace isolado, executa o harness e recebe eventos automaticamente via `hook-capture`.

## Alternativas Consideradas

- Manter cinco harnesses na v1: rejeitado por ampliar demais os gaps de observabilidade.
- Comecar apenas com um harness: rejeitado porque o produto precisa validar comparacao entre pelo menos dois harnesses.
- Exigir configuracao manual de hooks pelo usuario: rejeitado porque prejudica reproducibilidade e aumenta erro operacional.

## Consequencias

- Menor superficie inicial de adapters.
- Mais foco em runner, ingest, normalizacao, usage capture e comparability.
- Adapters futuros poderao seguir o contrato validado em Codex e Claude Code.
- Documentacao e roadmap devem deixar claro que OpenCode, Pi e Cursor nao sao v1.

## Validacao

- Um benchmark simples deve rodar no Codex e no Claude Code com hooks instalados automaticamente.
- Cada trial deve gerar eventos canonicos de prompt, tool pre/post e stop/end.
- Relatorio deve mostrar coverage efetivo e lacunas de usage/contexto.
- Configuracao global do usuario nao deve ser alterada.
