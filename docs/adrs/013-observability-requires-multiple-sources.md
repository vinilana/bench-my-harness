# ADR-013: Observabilidade Requer Multiplas Fontes

## Status

Aceita

## Contexto

Bench My Harness precisa comparar tools, tokens, custo, contexto e output entre harnesses. A analise das superficies de hooks mostra que hooks capturam bem eventos operacionais, mas nao garantem token usage, custo e contexto com a mesma fidelidade em todos os harnesses.

Exemplos:

- Claude Code hooks expoem muitos eventos e tool payloads, mas token usage geral da sessao aparece melhor via `/usage`/historico; hooks mostram usage detalhado apenas em casos como subagents chamados pela tool `Agent`.
- Codex hooks expoem prompt, tool input/output e compaction, mas a documentacao indica lacunas de interceptacao para alguns caminhos de tool e nao documenta tokens como hook input.
- OpenCode plugins expoem muitos eventos, enquanto token/custo aparecem melhor em `opencode stats` e exports.
- Pi expoe `ctx.getContextUsage()`, mas essa API pode combinar usage nativo com estimativa.
- Cursor precisa de validacao por fixtures reais antes de prometer tokens/contexto.

## Decisao

Separar captura operacional de captura de uso:

- `HookIngestPort`: eventos de hooks/plugins/extensions/transcripts.
- `UsageCapturePort`: tokens, custo, contexto, limites e usage por CLI, SDK, provider API, app server, gateway ou tokenizer local.

Toda metrica deve declarar `measurement_source`, `capture_source` e `confidence`.

## Alternativas Consideradas

- Usar apenas hooks: rejeitado porque tokens/contexto/custo nao sao garantidos em todos os harnesses.
- Usar apenas provider gateway: rejeitado porque perde eventos internos do harness como permissoes, diffs, tools locais e compactacao.
- Parsear transcripts como fonte primaria: rejeitado porque formatos podem nao ser estaveis e variam por fornecedor.

## Consequencias

- O produto deve mostrar coverage/capability por run.
- Comparacoes podem ser `limited` quando tokens ou contexto vierem de estimativa.
- Adapters ficam divididos em eventos e usage, reduzindo acoplamento.
- A v1 precisa de fixtures para provar quais campos cada harness realmente fornece.

## Validacao

- Cada adapter deve ter fixture de evento operacional.
- Cada usage adapter deve provar fonte, unidade e confianca da metrica.
- O comparador deve recusar comparacao forte quando uma metrica critica estiver `unavailable` ou com fonte incompativel.
