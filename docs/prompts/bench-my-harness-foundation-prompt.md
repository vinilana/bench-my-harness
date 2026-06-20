# Prompt: Criar Fundacao do Bench My Harness

Esta pasta sera usada para criar um novo projeto chamado Bench My Harness.

O objetivo e criar um sistema que consiga ouvir eventos de qualquer ferramenta de codificacao agentica que possua integracao com hooks, plugins, extensoes, webhooks, arquivos de log ou transcripts.

Na versao inicial, daremos suporte a:

- Claude Code hooks
- Cursor hooks
- OpenCode hooks/plugins
- Codex hooks
- eventos/extensoes do Pi

O sistema deve permitir que o usuario conecte seu harness/coding agent e use a ferramenta para analisar:

- uso de tools;
- consumo de tokens;
- consumo de janela de contexto;
- custo;
- tempo de execucao;
- comandos executados;
- arquivos lidos e alterados;
- output produzido;
- resultado de testes unitarios, integracao, lint e typecheck.

A ideia e que quem estiver usando a ferramenta possa adicionar prompts de benchmark com outputs esperados. Exemplo: quero usar o Codex para desenvolver uma nova feature em um sistema preexistente, executar o mesmo prompt em outros harnesses como Cursor, Claude Code, OpenCode e Pi, e garantir que o output dos testes unitarios e de integracao seja comparavel.

O objetivo final e ajudar empresas a avaliar qual harness entrega melhor resultado para sua propria base de codigo, considerando qualidade, velocidade, custo-beneficio, confiabilidade e uso de contexto.

Use arquitetura hexagonal. O core do dominio nao deve conhecer detalhes de Claude Code, Cursor, OpenCode, Codex ou Pi. Fornecedores devem entrar por adapters.

Lance agentes/subtarefas em paralelo para propor:

- specs de produto;
- arquitetura e ADRs;
- contrato canonico de eventos;
- modelo de benchmark;
- estrategia de adapters de hooks;
- metricas e politica de comparabilidade;
- seguranca, privacidade e redaction;
- skills necessarias para trabalho futuro no projeto.

Crie os arquivos Markdown necessarios no repositorio:

- specs em `docs/specs/`;
- ADRs em `docs/adrs/`;
- skills em `.agents/skills/`.

As ADRs e specs devem ser registradas em arquivos `.md`. As skills devem conter `SKILL.md`, referencias minimas quando necessario e metadados opcionais em `agents/openai.yaml`.

Antes de finalizar:

- valide as skills com o validador disponivel, se houver;
- remova placeholders;
- liste os arquivos criados;
- informe qualquer limitacao ou ponto que precisa ser confirmado em documentacao oficial.
