# Product Requirements

## Visao

Bench My Harness permite que equipes descubram qual harness de coding agent entrega melhor resultado para sua propria base de codigo, com menor tempo e melhor custo-beneficio, usando benchmarks reproduziveis.

## Personas

- Maintainer: cria benchmarks baseados em tarefas reais do repositorio.
- Avaliador tecnico: executa comparacoes entre harnesses e inspeciona evidencia.
- Gestor tecnico: compara custo, tempo, taxa de sucesso e risco operacional.
- Integrador: cria adapters para novos harnesses.
- QA/Platform engineer: define validacoes, isolamento, artefatos e gates de CI.

## Jobs to be done

- Cadastrar uma tarefa de benchmark com prompt, repo, setup e criterio de sucesso.
- Rodar a mesma tarefa em Codex e Claude Code na v1.
- Ver exatamente quais tools, comandos, arquivos e outputs cada harness usou.
- Comparar sucesso funcional, custo, tempo, tokens e consumo de contexto.
- Exportar evidencia para decisoes de compra, padronizacao ou melhoria de prompts.

## Fluxos principais

### Cadastro de harness

1. O usuario informa tipo: `codex` ou `claude_code` na v1.
2. Configura comando, env vars, modelo, limites, transportes e permissoes.
3. O sistema executa health check.
4. O harness fica disponivel para benchmarks com uma capability matrix.

### Cadastro de benchmark

1. O usuario define nome, categoria, dificuldade e tags.
2. Seleciona repo, commit, branch ou fixture.
3. Define prompt e anexos.
4. Define setup, validacoes e outputs esperados.
5. Define limites de tempo, custo, tokens e permissoes.
6. Salva uma versao imutavel do benchmark.

### Execucao comparativa

1. O usuario escolhe benchmark, harnesses e numero de trials.
2. O sistema prepara worktrees ou sandboxes isolados.
3. Cada harness recebe o mesmo prompt e o mesmo estado inicial.
4. Eventos, logs, diffs, artefatos e metricas sao coletados.
5. O avaliador calcula score e marca comparabilidade.

### Analise

1. O usuario abre um relatorio por benchmark ou suite.
2. Visualiza tabela por harness e trial.
3. Inspeciona transcript, eventos, tools, comandos, diffs e testes.
4. Exporta JSON, CSV ou Markdown.

## Requisitos funcionais

- Cadastrar harnesses com nome, tipo, versao, comando e capabilities.
- Cadastrar benchmarks versionados.
- Rodar benchmarks com multiplos trials por harness.
- Capturar eventos via hooks locais, stdin e arquivo/import.
- Instalar hooks temporarios automaticamente por trial para Codex e Claude Code.
- Persistir evento bruto, evento normalizado, metricas e artefatos.
- Calcular sucesso funcional, tempo, custo, tokens, tools, contexto e output.
- Comparar apenas runs com compatibilidade suficiente.
- Exportar relatorios.

## Requisitos nao funcionais

- Reprocessamento: eventos brutos devem regenerar eventos normalizados e metricas.
- Auditabilidade: toda metrica agregada deve apontar para evidencia.
- Privacidade: secrets devem ser redigidos por padrao antes de relatorios.
- Extensibilidade: novo harness nao deve exigir mudanca no core.
- Resiliencia: hooks locais nao devem depender da rede para nao travar o harness.

## Criterios de sucesso da v1

- Rodar pelo menos um benchmark em Codex e Claude Code.
- Instalar e remover hooks temporarios sem alterar configuracao global do usuario.
- Registrar eventos de sessao, turno e tool quando suportado.
- Gerar relatorio com tempo, tokens, custo estimado, tools, diffs e testes.
- Suportar raw event reprocessing.
- Ter fixtures de contrato para adapters iniciais.
