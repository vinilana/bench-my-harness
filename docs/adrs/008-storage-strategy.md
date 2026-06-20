# ADR-008: Storage Inicial

## Status

Aceita

## Contexto

A v1 precisa ser simples para desenvolvimento local, mas nao pode perder auditabilidade.

## Decisao

Usar JSONL append-only para eventos brutos e canonicos inicialmente, SQLite para consultas agregadas locais e filesystem para artefatos. Manter ports para Postgres e object storage no futuro.

## Consequencias

- Desenvolvimento local fica simples.
- Reprocessamento por arquivo e possivel.
- Consultas analiticas grandes exigirao evolucao futura.
