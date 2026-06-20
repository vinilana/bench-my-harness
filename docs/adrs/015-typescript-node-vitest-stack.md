# ADR-015: TypeScript, Node.js, Vitest, Zod, and Commander Stack

## Status

Aceita

## Contexto

Bench My Harness v1 e um produto CLI-first que precisa processar payloads JSON de hooks, validar contratos versionados, instalar configuracoes temporarias, rodar processos locais e executar uma suite TDD extensa antes da implementacao.

As opcoes consideradas foram:

- TypeScript/Node.js
- Go
- Rust
- Python

Go e Rust oferecem melhor startup e distribuicao em binario unico, mas aumentam o custo de iteracao para schemas, CLIs e testes de contrato no inicio. Python tem alta velocidade de desenvolvimento, mas pior empacotamento para hooks locais e menor alinhamento com futuras extensoes JS/TS.

## Decisao

Usar:

- TypeScript
- Node.js 22+
- Vitest
- Zod
- Commander

## Consequencias

- Desenvolvimento inicial rapido e fortemente tipado.
- Contratos JSON podem ser expressos como Zod schemas e testados diretamente.
- CLI e testes sao simples de evoluir.
- Hook startup pode ser mais lento que Go/Rust, entao `hook-capture` deve ser medido.
- Se latencia de hook virar problema, `hook-capture` pode ser extraido para um binario nativo mantendo o contrato de stdin/stdout.

## Validacao

- A suite TDD deve rodar localmente com `npm test`.
- O comando `hook-capture` deve ter teste de latencia ou, no minimo, teste de timeout/spool fallback.
- Nenhum modulo de dominio deve importar adapters de Codex ou Claude Code.
