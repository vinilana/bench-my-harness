# ADR-005: Fonte e Confianca para Tokens

## Status

Aceita

## Contexto

Nem todo harness expoe token usage. Estimativas locais podem divergir do provedor.

## Decisao

Toda metrica de token deve declarar `measurement_source`: `native`, `observed`, `estimated`, `derived` ou `unavailable`, alem de uma confianca. Nao misturar valores nativos e estimados sem marcacao.

## Consequencias

- Comparacoes de custo e contexto ficam honestas.
- Dashboards precisam mostrar fonte.
- Alguns relatórios terao dados incompletos.
