# ADR-012: Versionamento de Adapters

## Status

Aceita

## Contexto

Fornecedores mudam schemas, eventos e comportamento. Sem versao de adapter, metricas antigas podem parecer equivalentes a novas.

## Decisao

Todo adapter deve declarar `adapter_version`, provider, versoes suportadas e capability matrix. Mudancas de normalizacao devem ser rastreaveis e reprocessaveis.

## Consequencias

- Runs antigas continuam auditaveis.
- Reprocessamento pode comparar resultados por versao.
- Fixtures de contrato devem acompanhar versoes.
