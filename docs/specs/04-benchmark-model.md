# Benchmark Model

## Benchmark versionado

Um benchmark representa uma tarefa reproduzivel contra um estado inicial de repositorio ou fixture. Mudancas de prompt, setup, validacao ou output esperado criam nova versao.

## Exemplo

```json
{
  "id": "fix-login-validation-001",
  "name": "Corrigir validacao de login",
  "version": "1.0.0",
  "category": "bugfix",
  "difficulty": "medium",
  "repo": {
    "url": "https://github.com/example/app",
    "commit": "abc123",
    "setup_commands": ["npm install"],
    "test_commands": ["npm test", "npm run typecheck"]
  },
  "prompt": {
    "text": "Corrija o bug em que emails invalidos passam na validacao de login.",
    "attachments": [],
    "constraints": [
      "Nao alterar o schema do banco",
      "Manter compatibilidade com testes existentes"
    ]
  },
  "expected_output": {
    "tests_must_pass": true,
    "required_files_changed": ["src/auth/validation.ts"],
    "forbidden_files_changed": ["package.json"],
    "semantic_requirements": [
      "Emails sem dominio devem ser rejeitados",
      "Mensagens de erro existentes devem ser preservadas"
    ]
  },
  "limits": {
    "timeout_seconds": 900,
    "max_cost_usd": 5.0,
    "max_input_tokens": 200000,
    "max_output_tokens": 50000
  },
  "evaluation": {
    "scoring": {
      "tests": 0.5,
      "semantic_requirements": 0.3,
      "minimality": 0.1,
      "cost_efficiency": 0.1
    }
  },
  "metadata": {
    "created_by": "benchmark-team",
    "tags": ["typescript", "auth", "bugfix"]
  }
}
```

Benchmarks may alternatively use a Markdown prompt/spec file:

```json
{
  "prompt": {
    "file": "fix-login-validation.spec.md",
    "constraints": [
      "Nao alterar o schema do banco",
      "Manter compatibilidade com testes existentes"
    ]
  }
}
```

Exactly one of `prompt.text` or `prompt.file` must be present. `prompt.file` must point to a relative `.md` file. See `docs/specs/14-benchmark-prompt-file.md`.

## Entidades

- `BenchmarkSuite`: colecao de cenarios.
- `BenchmarkScenario`: tarefa isolada.
- `BenchmarkVersion`: versao imutavel do contrato.
- `HarnessProfile`: configuracao do harness para execucao.
- `Run`: execucao de uma suite ou scenario.
- `Trial`: uma repeticao de um scenario em um harness.
- `EvaluationResult`: resultado funcional e score.

## Estado inicial

Cada benchmark deve fixar:

- repo e commit ou fixture local;
- comandos de setup;
- politica de rede;
- permissoes de ferramentas;
- variaveis de ambiente permitidas;
- modelo ou politica de modelo;
- timeout e orcamento;
- timezone, locale e seed quando aplicavel.

## Outputs esperados

Prioridade de confiabilidade:

1. Testes deterministas.
2. Typecheck, lint e validacoes executaveis.
3. Diferenças estruturais de arquivos.
4. Regras semanticas com rubric.
5. Avaliacao por LLM, marcada como subjetiva.

## Classificacao de falha

- `agent_failed`: harness concluiu, mas nao resolveu.
- `environment_failed`: setup, dependencias ou infraestrutura falharam.
- `timeout`: limite de tempo excedido.
- `budget_exceeded`: custo ou tokens excedidos.
- `adapter_failed`: coleta ou normalizacao falhou.
- `inconclusive`: evidencia insuficiente.
