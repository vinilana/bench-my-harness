# ADR-003: Preservacao de Evento Bruto

## Status

Aceita

## Contexto

Schemas de hooks mudam e adapters iniciais podem interpretar eventos de forma incompleta.

## Decisao

Persistir ou referenciar `RawHookEvent` imutavel para todo evento recebido, com hash de payload e status de redaction. Eventos normalizados devem apontar para `raw_ref`.

## Consequencias

- Reprocessamento fica possivel.
- Storage cresce mais rapido.
- Politicas de privacidade e retencao precisam ser explicitas.
