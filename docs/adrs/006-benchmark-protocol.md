# ADR-006: Protocolo de Benchmark

## Status

Aceita

## Contexto

Comparacoes sem mesmo prompt, estado inicial e validacao produzem conclusoes fracas.

## Decisao

Cada benchmark deve versionar prompt, repo/fixture, commit, setup, validacoes, outputs esperados, limites, permissoes, politica de rede, modelo ou politica de modelo e ambiente relevante.

## Consequencias

- Benchmarks ficam reproduziveis.
- Cadastro exige mais disciplina.
- Mudancas relevantes criam nova versao.
