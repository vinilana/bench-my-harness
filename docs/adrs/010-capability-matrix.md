# ADR-010: Capability Matrix por Harness

## Status

Aceita

## Contexto

Harnesses nao expõem os mesmos eventos nem metricas. Comparar como se fossem equivalentes gera erro.

## Decisao

Cada adapter deve declarar capabilities para lifecycle, tool events, file events, command events, approvals, tokens, contexto, IDs estaveis e transportes.

## Consequencias

- Comparador consegue marcar runs como limitadas ou nao comparaveis.
- Relatorios mostram lacunas por fornecedor.
- Adapters devem atualizar capabilities quando versoes mudarem.
