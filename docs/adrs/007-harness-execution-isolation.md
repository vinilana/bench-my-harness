# ADR-007: Isolamento de Execucao por Trial

## Status

Aceita

## Contexto

Harnesses alteram arquivos, caches e estado local. Trials sem isolamento contaminam resultados.

## Decisao

Cada trial deve rodar em worktree, diretorio temporario, container ou sandbox isolado. A v1 deve suportar processo local isolado por diretorio, com caminho de evolucao para container.

## Consequencias

- Resultados ficam mais reproduziveis.
- Setup fica mais caro.
- Artefatos por trial devem ser coletados antes do cleanup.
