# Hexagonal Architecture Spec

## Decisao de arquitetura

Bench My Harness deve usar arquitetura hexagonal. O core conhece conceitos de benchmark, run, evento, metrica e comparacao. Fornecedores, bancos, CLIs, webhooks, arquivos, tokenizers e UIs vivem em adapters.

## Camadas

### Domain

Entidades:

- `Harness`
- `BenchmarkSuite`
- `BenchmarkScenario`
- `BenchmarkRun`
- `Trial`
- `RawHookEvent`
- `NormalizedEvent`
- `ToolInvocation`
- `TokenUsage`
- `ContextWindowObservation`
- `OutputObservation`
- `MetricObservation`
- `Artifact`

Value objects:

- `HarnessName`
- `CanonicalEventType`
- `RunId`
- `TrialId`
- `SessionId`
- `TurnId`
- `ToolCallId`
- `TokenCount`
- `Duration`
- `MeasurementSource`
- `MeasurementConfidence`
- `SchemaVersion`

Servicos de dominio:

- `EventNormalizer`
- `MetricCalculator`
- `BenchmarkComparator`
- `CapabilityResolver`
- `RunCompletenessValidator`
- `SecretRedactionPolicy`

### Application

Use cases:

- `RegisterHarnessUseCase`
- `IngestRawEventUseCase`
- `NormalizeEventUseCase`
- `RunBenchmarkUseCase`
- `InstallHarnessInstrumentationUseCase`
- `CaptureHarnessUsageUseCase`
- `ComputeMetricsUseCase`
- `EvaluateBenchmarkUseCase`
- `CompareBenchmarksUseCase`
- `ExportReportUseCase`
- `ReprocessRawEventsUseCase`

### Ports

Inbound:

- `RawEventIngestPort`
- `BenchmarkCommandPort`
- `ReportQueryPort`
- `AdapterHealthCheckPort`

Outbound:

- `RawEventStore`
- `NormalizedEventStore`
- `MetricStore`
- `ArtifactStore`
- `HarnessRunnerPort`
- `InstallHarnessHooksPort`
- `UsageCapturePort`
- `TokenizerPort`
- `ClockPort`
- `IdGeneratorPort`
- `SecretRedactorPort`
- `SchemaRegistryPort`
- `CostCatalogPort`

### Adapters

Inbound adapters:

- CLI
- HTTP ingest API
- stdin hook command
- file/JSONL importer
- future UI/API

Outbound adapters:

- Claude Code hook adapter
- Codex hook adapter
- Cursor hook adapter
- OpenCode plugin adapter
- Pi extension adapter
- filesystem artifact store
- JSONL raw event store
- SQLite/Postgres metric store
- tokenizer adapters

## Dependency rule

Adapters podem depender de application e domain. Application pode depender de domain e ports. Domain nao depende de framework, fornecedor, banco, CLI ou schema bruto de hook.

## Pacotes conceituais

```text
src/
  domain/
    benchmark/
    event/
    metric/
    comparison/
  application/
    use-cases/
    ports/
  adapters/
    inbound/
      cli/
      http/
      stdin/
      file-import/
    outbound/
      harnesses/
      storage/
      tokenizer/
      redaction/
```

## Regra de implementacao futura

Qualquer codigo com import de SDK, pacote ou formato especifico de Claude Code, Cursor, OpenCode, Codex ou Pi deve ficar em `adapters/`. O core deve ser testavel com fakes.
