# Hook Observability Gap Analysis

## Conclusao

Hooks, plugins e extensions sao suficientes para capturar boa parte do ciclo de vida de agentes: prompts, tools, comandos, permissoes, arquivos, output textual e eventos de compactacao. Eles nao sao suficientes, sozinhos, para garantir captura completa e comparavel de tokens, custo, uso real da janela de contexto e payload exato enviado ao modelo em todos os harnesses.

A v1 deve tratar observabilidade como multi-fonte:

1. Hooks/plugins/extensions para eventos operacionais.
2. Transcripts/export/session files para evidencia complementar.
3. CLI stats/status quando o harness oferecer.
4. SDK/app-server/provider API quando houver acesso programatico.
5. AI gateway/proxy de LLM para token usage e custo mais confiaveis.
6. Estimativas locais por tokenizer somente como fallback marcado.

## Niveis de confianca

- `native`: o harness ou provider reporta a metrica diretamente.
- `observed`: Bench My Harness mede ao redor do processo.
- `derived`: calculado a partir de eventos, transcript ou artefatos.
- `estimated`: estimado por tokenizer, parser ou heuristica.
- `unavailable`: nao capturavel pela fonte configurada.

Nenhuma metrica de token, contexto ou custo deve entrar em comparacao sem `measurement_source`.

## Matriz resumida

| Harness | Tools/comandos | Output | Tokens | Context window | Custo | Veredito |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | Forte via hooks | Forte via MessageDisplay/transcript/tool responses | Parcial: subagent usage em Agent tool; sessao via `/usage`/historico, nao hook geral | Parcial: compaction/context events; uso exato exige `/context`, `/usage` ou estimativa | Parcial: `/usage` estima localmente | Bom para eventos; tokens/contexto exigem fonte extra |
| Codex | Medio: hooks cobrem Bash, apply_patch e MCP; docs avisam lacunas | Parcial via Stop/transcript | Parcial fora de hooks: `/status`, `/usage`, pricing/dashboard/app-server | Parcial fora de hooks: `/status` mostra capacidade restante | Parcial por dashboard/usage/API key/pricing | Hooks nao bastam para cobertura completa |
| Cursor | Incerto: docs oficiais existem, mas detalhes de schema precisam verificacao runtime | Incerto | Provavelmente lacuna em hooks; ha pedido publico por token usage em hook input | Incerto | Incerto | Tratar como adapter experimental ate fixtures reais |
| OpenCode | Forte via plugins para tools, session, file, permission, messages | Forte via eventos/export | Parcial: `opencode stats` e export; plugins nao documentam token usage direto | Parcial: compaction/session events; contexto exato exige export/stats ou instrumentacao | Parcial via `opencode stats` | Bom se combinar plugin + stats/export |
| Pi | Forte via extensions, provider request/response, tool events | Forte via message/tool events | Bom/parcial: `ctx.getContextUsage()` usa usage anterior quando disponivel e estima trailing messages | Bom/parcial: `ctx.getContextUsage()` e compaction events, mas ainda mistura native/estimated | Parcial: depende de provider/headers/session files | Melhor superficie para contexto, mas ainda exige marcar fonte |

## Claude Code

### O que os hooks capturam bem

Claude Code documenta lifecycle amplo: eventos de sessao, prompt, tool use, permissoes, subagentes, output de mensagem, instrucoes carregadas, mudanca de arquivos, worktrees e compactacao. Os hooks recebem JSON por stdin ou HTTP request body. Isso cobre bem:

- `session.started` e `session.ended`;
- `turn` e prompt;
- tool call antes e depois;
- comandos Bash;
- leitura/escrita/edicao/busca;
- permissoes;
- output textual exibido;
- compaction trigger;
- arquivos alterados.

### Lacunas

- Token usage geral da sessao nao aparece como campo comum dos hooks.
- A documentacao mostra usage detalhado para subagents chamados pela tool `Agent`, mas isso nao equivale ao total de tokens da sessao principal.
- Context window usage exato nao aparece no contrato dos hooks. Eventos como `PreCompact` e `PostCompact` indicam pressao/contexto, mas nao substituem uma contagem exata.
- `/usage` mostra tokens e custo estimado localmente, mas isso e uma fonte CLI/historico, nao hook.

### Estrategia recomendada

- Usar hooks para eventos operacionais.
- Ler transcript por `transcript_path` para enriquecer output e timeline.
- Rodar/importar `/usage` ou parsear historico local quando permitido.
- Para medicao forte de tokens/custo, usar API key/proxy/gateway quando possivel.

## Codex

### O que os hooks capturam bem

Codex documenta hooks para `SessionStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop` e `Stop`. Campos comuns incluem `session_id`, `transcript_path`, `cwd`, `hook_event_name` e `model`. Eventos de tool incluem `turn_id`, `tool_name`, `tool_use_id`, `tool_input` e, no post, `tool_response`.

### Lacunas

- A propria documentacao afirma que `PreToolUse`/`PostToolUse` nao interceptam todos os caminhos: shell interception e incompleto para mecanismos mais novos, e `WebSearch`/tools nao-shell nao-MCP nao sao interceptados.
- `transcript_path` e conveniente, mas o formato do transcript nao e interface estavel.
- Token usage e remaining context aparecem em `/status` e `/usage`, mas nao como campos documentados nos hook inputs.
- Custo depende de pricing/usage dashboard/API key e nao deve ser inferido apenas de hooks.

### Estrategia recomendada

- Usar hooks para comandos, patches, MCP, permissoes, prompt e stop.
- Complementar com `/status`, `/usage` e session export quando viavel.
- Marcar cobertura de tools como `partial` ate fixtures confirmarem todos os caminhos usados no benchmark.
- Para token/custo confiavel, preferir API key ou gateway.

## Cursor

### O que sabemos

A documentacao oficial de Cursor indica a existencia de hooks, mas a pagina acessivel pelo crawler nao expos schema detalhado. Ha sinais publicos de que hooks sao usados para observar/controlar o agent loop, mas os campos exatos, estabilidade e token usage precisam ser verificados em runtime.

### Lacunas

- Sem schema oficial acessivel para confirmar campos de token, contexto, tool input/output e IDs.
- Token usage em hook input deve ser tratado como nao confirmado.
- E provavel que algumas informacoes estejam em UI interna, logs, DB local ou APIs nao documentadas, o que nao deve virar contrato de v1 sem fixtures reais.

### Estrategia recomendada

- Classificar Cursor como adapter experimental ate termos fixtures reais.
- Comecar por prompts, stop/session, comandos e arquivo/diff se os hooks expuserem.
- Usar import/export/logs como fallback.
- Nao prometer tokens/contexto nativos para Cursor na v1.

## OpenCode

### O que plugins capturam bem

OpenCode documenta plugins JavaScript/TypeScript com hooks/eventos de comando, arquivo, mensagens, permissoes, sessao, tools e TUI. Eventos documentados incluem `tool.execute.before`, `tool.execute.after`, `session.compacted`, `session.idle`, `session.diff`, `file.edited`, `permission.asked` e `permission.replied`.

### Lacunas

- A documentacao de plugins nao mostra token usage direto no evento de tool ou sessao.
- OpenCode possui `opencode stats` para token usage e custo, e `opencode export` para dados de sessao, mas isso e fonte complementar, nao necessariamente hook event.
- Contexto exato enviado ao modelo pode exigir instrumentacao mais profunda, export ou gateway.

### Estrategia recomendada

- Usar plugin para eventos operacionais.
- Rodar `opencode stats` e `opencode export --sanitize` como etapa pos-run.
- Integrar provider/gateway para token/custo forte quando necessario.

## Pi

### O que extensions capturam bem

Pi tem a melhor superficie documentada para contexto. Extensions podem observar `before_agent_start`, `agent_start/end`, `turn_start/end`, mensagens, tools, provider payload, provider response, compactacao e input. `before_provider_request` permite inspecionar/substituir payload provider-level antes do request. `after_provider_response` permite ver status e headers antes de consumir stream.

Pi tambem expoe `ctx.getContextUsage()`, que retorna uso atual de contexto do modelo ativo, usando last assistant usage quando disponivel e estimando trailing messages.

### Lacunas

- `ctx.getContextUsage()` pode misturar usage nativo e estimativa; isso e excelente para operacao, mas deve ser marcado no nosso schema.
- Headers de provider dependem de provider e transporte.
- Custo continua dependente de provider, API key, quota APIs ou historico local.

### Estrategia recomendada

- Usar Pi extension como adapter nativo de alta fidelidade.
- Capturar `before_provider_request` com redaction forte, ou armazenar apenas hash/contagem quando o payload for sensivel.
- Registrar se `ctx.getContextUsage()` veio de usage nativo ou estimativa quando possivel; se Pi nao expuser essa distincao, marcar como `estimated_or_native_mixed`.

## Implicacoes para o produto

### Nao prometer "captura completa" por hooks

O produto deve prometer captura por capacidade declarada. Cada run deve gerar uma capability matrix efetiva:

```json
{
  "provider": "codex",
  "adapter_version": "0.1.0",
  "effective_observability": {
    "tool_calls": "partial",
    "tool_results": "partial",
    "assistant_output": "derived",
    "token_usage": "unavailable_from_hooks",
    "context_usage": "unavailable_from_hooks",
    "cost": "estimated_from_external_source"
  }
}
```

### Separar metricas por fonte

Exemplo:

```json
{
  "metric": "input_tokens",
  "value": 125000,
  "unit": "tokens",
  "measurement_source": "native",
  "capture_source": "provider_gateway",
  "confidence": "high"
}
```

```json
{
  "metric": "context_tokens",
  "value": 98000,
  "unit": "tokens",
  "measurement_source": "estimated",
  "capture_source": "local_tokenizer",
  "confidence": "medium"
}
```

### Adapters precisam de dois modos

- `event_adapter`: captura eventos do harness.
- `usage_adapter`: captura tokens, custo e contexto por fonte complementar.

Isso evita forcar hooks a resolverem um problema que alguns fornecedores nao expoem por hook.

## Escopo v1 revisado

A v1 deve suportar apenas Codex e Claude Code. OpenCode, Pi e Cursor permanecem na analise como referencia para evolucao, mas nao fazem parte da primeira implementacao.

## Recomendacao para v1

1. Implementar eventos operacionais primeiro.
2. Implementar `MetricObservation` com fonte/confianca obrigatoria.
3. Criar `UsageCapturePort` separado de `HookIngestPort`.
4. Para Claude Code: hooks + transcript + `/usage` import.
5. Para Codex: hooks + transcript + `/status`/`/usage` import, com cobertura parcial de tools.
6. Adiar OpenCode, Pi e Cursor ate o contrato de instrumentacao automatica estar validado.

## Fontes consultadas em 2026-06-20

- Claude Code Hooks: https://code.claude.com/docs/en/hooks
- Claude Code Costs and Usage: https://code.claude.com/docs/en/costs
- Codex Hooks: https://developers.openai.com/codex/hooks
- Codex Slash Commands: https://developers.openai.com/codex/cli/slash-commands
- Codex Pricing: https://developers.openai.com/codex/pricing
- OpenCode Plugins: https://opencode.ai/docs/plugins/
- OpenCode CLI: https://opencode.ai/docs/cli/
- Pi Extensions: https://pi.dev/docs/latest/extensions
- Pi SDK: https://pi.dev/docs/latest/sdk
- Cursor Hooks: https://cursor.com/docs/hooks
