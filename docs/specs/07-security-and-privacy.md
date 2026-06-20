# Security and Privacy Spec

## Riscos

Hooks e transcripts podem conter codigo proprietario, prompts, diffs, segredos, tokens de API, cookies, headers, caminhos locais e dados pessoais. Bench My Harness deve operar como ferramenta de observabilidade sensivel.

## Politicas padrao

- Redigir secrets antes de gerar relatorios.
- Nao executar payload recebido como shell.
- Validar JSON e tamanho antes de persistir.
- Preservar payload bruto com acesso restrito ou criptografia quando necessario.
- Usar allowlist de workspaces e providers.
- Assinar webhooks com HMAC.
- Rejeitar replay por timestamp e nonce.
- Normalizar paths para evitar path traversal.
- Separar artefatos grandes de metricas.

## Redaction

Padroes iniciais:

- `Authorization` headers;
- API keys comuns;
- tokens OAuth/JWT;
- chaves SSH privadas;
- cookies;
- arquivos `.env`;
- valores configurados pelo usuario.

O evento deve registrar:

```json
{
  "security": {
    "redaction_applied": true,
    "secret_scan_status": "passed"
  }
}
```

## Hooks locais

Hooks locais nao devem depender de rede para concluir. O adapter deve:

- ter timeout curto;
- gravar spool local quando API estiver indisponivel;
- nunca bloquear o harness por falha de telemetria, exceto em modo enforcement explicito;
- retornar resposta compativel com o protocolo do fornecedor.

## Retencao

Politicas recomendadas:

- eventos normalizados: retencao maior;
- payload bruto: retencao menor ou criptografada;
- artefatos grandes: lifecycle separado;
- relatorios exportados: sem secrets por padrao.

## Auditoria

Toda exportacao deve conter:

- versao do schema;
- versao dos adapters;
- status de redaction;
- hashes de payload e artefatos;
- timestamp de geracao;
- filtros aplicados.
