# ADR-004: Taxonomia Canonica de Eventos

## Status

Aceita

## Contexto

Metricas dependem de eventos comparaveis. Uma taxonomia grande demais aumenta custo de adapters; pequena demais perde semantica.

## Decisao

Comecar com taxonomia curta: sessao, turno, mensagens, tools, comandos, arquivos, aprovacoes, contexto, metricas, artefatos e erros.

## Consequencias

- Adapters ficam simples.
- Eventos especificos de fornecedor permanecem em `provider_event_type` e `payload`.
- Novos tipos canonicos devem passar por ADR ou revisao de schema.
