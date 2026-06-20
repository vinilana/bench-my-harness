# Metrics and Evaluation

## Principio

Metricas agregadas so devem ser calculadas a partir de eventos normalizados, observacoes de metricas e artefatos. Payload bruto serve para auditoria e reprocessamento, nao como fonte direta em dashboards.

## Fontes de medicao

- `native`: reportado pelo harness ou provider.
- `observed`: medido pelo Bench My Harness.
- `estimated`: estimado por tokenizer, parser ou heuristica.
- `derived`: calculado a partir de eventos normalizados.
- `unavailable`: nao disponivel.

Toda metrica deve carregar `measurement_source` e `confidence`.

## Metricas de tools

- total de tool calls;
- tool calls por tipo;
- duracao por tool;
- falhas por tool;
- retries;
- bytes de input e output;
- comandos shell executados;
- aprovacoes solicitadas, aceitas e negadas.

## Metricas de tokens

- input tokens;
- output tokens;
- total tokens;
- cache read/write, quando disponivel;
- tokens estimados no prompt;
- custo estimado separado de uso de tokens.

Valores nativos nao devem ser somados com estimativas sem marcacao explicita.

## Metricas de contexto

- tokens de contexto usados;
- tokens restantes estimados;
- eventos de compactacao;
- tamanho de prompt por turno;
- perda ou retencao de contexto quando observavel;
- diferenca entre contexto fornecido e contexto realmente enviado ao modelo, quando o harness expuser.

## Metricas de output

- arquivos alterados;
- linhas adicionadas/removidas;
- comandos de teste executados;
- resultado de testes;
- tempo ate primeira saida;
- tempo total;
- tamanho do transcript;
- artefatos gerados.

## Score inicial

```text
score_total =
  50% resultado dos testes +
  25% requisitos funcionais/semanticos +
  10% qualidade e minimalidade do diff +
  10% eficiencia de custo e tempo +
   5% conformidade com restricoes
```

O score nao substitui os dados brutos. Ele deve ser apresentado junto com evidencia, variancia e status de comparabilidade.

## Estatistica minima

Relatorios por harness devem mostrar:

- quantidade de trials;
- media;
- mediana;
- minimo e maximo;
- desvio padrao ou intervalo;
- outliers marcados;
- runs inconclusivas separadas.

## Regras de comparabilidade

Uma comparacao deve ser marcada como limitada quando houver diferenca relevante em:

- modelo;
- versao do harness;
- permissao de tools;
- politica de rede;
- estado inicial do repo;
- suite de testes;
- fonte de tokens;
- adapter capabilities.
