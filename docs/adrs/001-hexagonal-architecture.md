# ADR-001: Arquitetura Hexagonal e Limites do Core

## Status

Aceita

## Contexto

O sistema precisa suportar multiplos harnesses com hooks, plugins, extensoes, webhooks e logs diferentes. Se o core conhecer diretamente Claude Code, Cursor, OpenCode, Codex ou Pi, cada mudanca de fornecedor contaminara regras de benchmark e metricas.

## Decisao

Usar arquitetura hexagonal. O dominio contem benchmarks, runs, eventos, metricas e comparacao. Fornecedores, storage, CLI, HTTP, tokenizers e runners sao adapters atras de ports.

## Consequencias

- Novo harness deve entrar por adapter.
- O core fica testavel com fakes.
- Contratos de ports precisam ser bem definidos desde cedo.
- Pode haver mais boilerplate inicial, compensado por menor acoplamento.
