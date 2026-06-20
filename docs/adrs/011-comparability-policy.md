# ADR-011: Politica de Comparabilidade

## Status

Aceita

## Contexto

Benchmarks podem medir harness, modelo, ambiente, prompt interno ou permissoes sem distinguir as causas.

## Decisao

Classificar comparacoes como `comparable`, `limited` ou `not_comparable`. A politica deve considerar modelo, versao do harness, estado inicial, permissoes, rede, testes, fonte de tokens e capabilities.

## Consequencias

- O sistema evita conclusoes indevidas.
- Usuarios precisam aceitar mais metadados.
- Relatorios devem explicar por que uma comparacao foi limitada.
