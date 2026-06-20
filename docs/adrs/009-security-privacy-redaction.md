# ADR-009: Seguranca, Privacidade e Redaction

## Status

Aceita

## Contexto

Eventos podem conter codigo proprietario, prompts sensiveis e secrets.

## Decisao

Redigir secrets por padrao antes de relatorios e metricas. Payload bruto deve ter acesso restrito, retencao menor e opcao de criptografia. Webhooks devem usar HMAC e protecao anti-replay.

## Consequencias

- Dados exportados ficam mais seguros.
- Alguns payloads podem perder detalhe para debug.
- Ambientes confiaveis podem habilitar retencao bruta controlada.
