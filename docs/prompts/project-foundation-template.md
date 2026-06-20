# Template: Criar Projeto Similar

Use este template para criar outros projetos no mesmo estilo: uma fundacao completa com specs, ADRs e skills antes da implementacao.

Substitua os campos entre colchetes.

```text
Esta pasta sera usada para criar um novo projeto chamado [NOME_DO_PROJETO].

O objetivo do projeto e [DESCREVA_O_PROBLEMA_E_O_RESULTADO_ESPERADO].

O sistema deve atender inicialmente os seguintes usuarios/personas:

- [PERSONA_1]: [OBJETIVO_DA_PERSONA_1]
- [PERSONA_2]: [OBJETIVO_DA_PERSONA_2]
- [PERSONA_3]: [OBJETIVO_DA_PERSONA_3]

Na versao inicial, precisamos dar suporte a:

- [INTEGRACAO_OU_PROVEDOR_1]
- [INTEGRACAO_OU_PROVEDOR_2]
- [INTEGRACAO_OU_PROVEDOR_3]

O sistema deve permitir:

- [CAPACIDADE_1]
- [CAPACIDADE_2]
- [CAPACIDADE_3]
- [CAPACIDADE_4]

Tambem deve analisar, registrar ou comparar:

- [METRICA_OU_EVIDENCIA_1]
- [METRICA_OU_EVIDENCIA_2]
- [METRICA_OU_EVIDENCIA_3]
- [METRICA_OU_EVIDENCIA_4]

Exemplo de uso principal:

[DESCREVA_UM_CENARIO_REAL_DE_USO_COM_ENTRADA_PROCESSAMENTO_E_OUTPUT_ESPERADO]

Use arquitetura hexagonal. O core do dominio nao deve conhecer detalhes de fornecedores, frameworks, bancos, CLIs, APIs externas ou ferramentas especificas. Esses detalhes devem ficar em adapters atras de ports.

Lance agentes/subtarefas em paralelo para propor:

- specs de produto;
- arquitetura e ADRs;
- contratos canonicos de dados/eventos;
- modelo de dominio;
- estrategia de adapters/integracoes;
- metricas, avaliacao e criterios de sucesso;
- seguranca, privacidade e observabilidade;
- roadmap inicial;
- skills necessarias para acelerar trabalho futuro no projeto.

Crie os arquivos Markdown necessarios no repositorio:

- specs em `docs/specs/`;
- ADRs em `docs/adrs/`;
- prompts reutilizaveis em `docs/prompts/`;
- skills em `.agents/skills/`, se fizer sentido para o projeto.

As specs devem cobrir pelo menos:

- charter do projeto;
- requisitos de produto;
- arquitetura;
- modelo de dominio;
- contratos de entrada/saida;
- integracoes/adapters;
- seguranca e privacidade;
- metricas e avaliacao;
- roadmap inicial.

As ADRs devem registrar as decisoes arquiteturais principais, incluindo tradeoffs e consequencias.

As skills devem ser concisas, com:

- `SKILL.md`;
- descricao com gatilhos claros;
- workflow pratico;
- regras de implementacao;
- referencias curtas quando necessario;
- `agents/openai.yaml` opcional, se houver tooling compativel.

Antes de finalizar:

- valide as skills com o validador disponivel, se houver;
- remova placeholders;
- liste os arquivos criados;
- informe qualquer limitacao, premissa ou ponto que precisa ser confirmado em documentacao oficial.
```

## Campos recomendados

- `[NOME_DO_PROJETO]`: nome curto e claro.
- `[DESCREVA_O_PROBLEMA_E_O_RESULTADO_ESPERADO]`: explique por que o projeto existe.
- `[INTEGRACAO_OU_PROVEDOR_X]`: APIs, CLIs, bancos, vendors ou sistemas externos.
- `[CAPACIDADE_X]`: o que o usuario consegue fazer.
- `[METRICA_OU_EVIDENCIA_X]`: dados que provam sucesso, qualidade ou confiabilidade.
- `[DESCREVA_UM_CENARIO_REAL...]`: use um caso concreto; isso melhora muito as specs.
