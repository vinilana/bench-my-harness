#!/usr/bin/env node
import { access, chmod, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command, CommanderError } from "commander";
import { z } from "zod";
import { CreateBenchmarkTemplateUseCase } from "../../../application/use-cases/create-benchmark-template.js";
import { BenchmarkRunner } from "../../../application/use-cases/run-benchmark.js";
import type { ArtifactCollectorPort } from "../../../application/ports/artifact-collector-port.js";
import type { HarnessRunnerPort } from "../../../application/ports/harness-runner-port.js";
import type { InstallHarnessHooksPort } from "../../../application/ports/install-harness-hooks-port.js";
import type {
  ProvisionWorkspaceInput,
  ProvisionedWorkspace,
  WorkspaceProvisionerPort
} from "../../../application/ports/workspace-provisioner-port.js";
import { ClaudeCodeHookInstaller } from "../../outbound/harnesses/claude-code/claude-code-hook-installer.js";
import { CodexHookInstaller } from "../../outbound/harnesses/codex/codex-hook-installer.js";
import { FilesystemWorkspaceProvisioner } from "../../outbound/filesystem/filesystem-workspace-provisioner.js";
import { FilesystemGitDiffGenerator } from "../../outbound/filesystem/filesystem-git-diff-generator.js";
import { FilesystemHookEventCounter } from "../../outbound/filesystem/filesystem-hook-event-counter.js";
import { ProcessHarnessRunner } from "../../outbound/harnesses/process-harness-runner.js";
import { ProcessValidationRunner } from "../../outbound/harnesses/process-validation-runner.js";
import { FilesystemBenchmarkTemplateWriter } from "../../outbound/filesystem/filesystem-benchmark-template-writer.js";
import { FilesystemProjectCommandDetector } from "../../outbound/filesystem/filesystem-project-command-detector.js";
import { FilesystemReportStore } from "../../outbound/storage/filesystem-report-store.js";
import { FilesystemSuiteResultStore } from "../../outbound/storage/filesystem-suite-result-store.js";
import { FilesystemHtmlReportStore } from "../../outbound/storage/filesystem-html-report-store.js";
import { FilesystemSpecCatalogStore } from "../../outbound/filesystem/filesystem-spec-catalog-store.js";
import { ProcessGitHistoryInspector } from "../../outbound/git/process-git-history-inspector.js";
import { FilesystemPromptFileReader } from "../../outbound/filesystem/filesystem-prompt-file-reader.js";
import { FilesystemUsageCapture } from "../../outbound/usage/filesystem-usage-capture.js";
import { FilesystemProviderTranscriptResolver } from "../../outbound/filesystem/filesystem-provider-transcript-resolver.js";
import {
  BenchmarkCategorySchema,
  BenchmarkSchema,
  type Benchmark,
  type BenchmarkCategory
} from "../../../domain/benchmark/benchmark-schema.js";
import type { HarnessCommand } from "../../../domain/harnesses/harness-profile.js";
import { ResolveBenchmarkPromptUseCase } from "../../../application/use-cases/resolve-benchmark-prompt.js";
import { GenerateProjectCommandsUseCase } from "../../../application/use-cases/generate-project-commands.js";
import { CreateSpecCatalogUseCase } from "../../../application/use-cases/create-spec-catalog.js";
import { CreateFeatureSpecUseCase } from "../../../application/use-cases/create-feature-spec.js";
import { CreateFeatureSpecFromPromptFileUseCase } from "../../../application/use-cases/create-feature-spec-from-prompt-file.js";
import { CreateGeneratedGitCaseUseCase } from "../../../application/use-cases/create-generated-git-case.js";
import { ConfigureSpecCatalogUseCase } from "../../../application/use-cases/configure-spec-catalog.js";
import { ImportFeatureSpecsUseCase } from "../../../application/use-cases/import-feature-specs.js";
import { LoadSpecCatalogUseCase } from "../../../application/use-cases/load-spec-catalog.js";
import { RunSpecSuiteUseCase } from "../../../application/use-cases/run-spec-suite.js";
import { RunSpecSuiteSmokeUseCase } from "../../../application/use-cases/run-spec-suite-smoke.js";
import { generateDefaultSpecIdentity, type SpecCatalogDefaults } from "../../../domain/benchmark/spec-catalog.js";
import { renderSuiteReportHtml } from "../../../domain/reports/suite-report.js";
import { runHookCapture, type HookCaptureProvider } from "./hook-capture.js";
import {
  InteractiveBenchmarkAuthoring,
  type BenchmarkAuthoringCommand
} from "./interactive-benchmark-authoring.js";

const EX_USAGE = 1;
const EX_CONFIG = 78;

export interface CliRuntime {
  readonly stdin?: string;
  readonly stdout?: (chunk: string) => void;
  readonly stderr?: (chunk: string) => void;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly question?: (label: string) => string | Promise<string>;
}

interface CliContext {
  readonly stdin: string;
  readonly stdout: (chunk: string) => void;
  readonly stderr: (chunk: string) => void;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly question?: (label: string) => string | Promise<string>;
  readonly canPromptInteractively: boolean;
}

class CliExit extends Error {
  public constructor(
    public readonly exitCode: number,
    message: string
  ) {
    super(message);
  }
}

export async function runCli(argv = process.argv, runtime: CliRuntime = {}): Promise<number> {
  const hasInjectedRuntime =
    runtime.stdin !== undefined ||
    runtime.stdout !== undefined ||
    runtime.stderr !== undefined ||
    runtime.cwd !== undefined ||
    runtime.env !== undefined;
  const context: CliContext = {
    stdin: runtime.stdin ?? (hasInjectedRuntime || process.stdin.isTTY ? "" : await readStdin()),
    stdout: runtime.stdout ?? ((chunk) => process.stdout.write(chunk)),
    stderr: runtime.stderr ?? ((chunk) => process.stderr.write(chunk)),
    cwd: runtime.cwd ?? process.cwd(),
    env: runtime.env ?? process.env,
    question: runtime.question,
    canPromptInteractively:
      runtime.stdin === undefined &&
      runtime.stdout === undefined &&
      runtime.question === undefined &&
      process.stdin.isTTY === true &&
      process.stdout.isTTY === true
  };
  const program = buildProgram(context);

  try {
    await program.parseAsync(argv, { from: "node" });
    return 0;
  } catch (error) {
    if (error instanceof CliExit) {
      return error.exitCode;
    }

    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    const message = error instanceof Error ? error.message : String(error);
    context.stderr(`${message}\n`);
    return EX_USAGE;
  }
}

export function buildProgram(context: CliContext): Command {
  const program = new Command();

  program
    .name("bmh")
    .description("Benchmark and observability harness for comparing agentic coding tools.")
    .exitOverride()
    .configureOutput({
      writeOut: context.stdout,
      writeErr: context.stderr
    });

  const internal = new Command("internal")
    .description("Internal commands used by generated harness instrumentation.")
    .exitOverride()
    .configureOutput({
      writeOut: context.stdout,
      writeErr: context.stderr
    });
  program.addCommand(internal, { hidden: true });

  internal
    .command("hook-capture")
    .description("Capture one harness hook event from stdin.")
    .requiredOption("--provider <provider>", "hook provider: codex or claude_code")
    .requiredOption("--event <event>", "provider hook event name")
    .option("--run-id <runId>", "benchmark run id")
    .option("--trial-id <trialId>", "benchmark trial id")
    .option("--event-source <source>", "hook event source", "stdin")
    .requiredOption("--spool <path>", "fallback JSONL spool path")
    .option("--ingest-url <url>", "optional local ingest endpoint")
    .option("--max-payload-bytes <bytes>", "maximum accepted stdin payload bytes", parsePositiveInt)
    .option("--strict", "fail the hook command when telemetry persistence fails", false)
    .action(async (options: HookCaptureCommandOptions) => {
      const eventSource = options.eventSource ?? "stdin";
      if (eventSource !== "stdin") {
        fail(EX_USAGE, `unsupported event source: ${eventSource}`);
      }

      const provider = parseProvider(options.provider);
      const result = await runHookCapture({
        provider,
        event: options.event,
        runId: requiredOption(options.runId ?? context.env.BMH_RUN_ID, "internal hook-capture", "--run-id"),
        trialId: requiredOption(options.trialId ?? context.env.BMH_TRIAL_ID, "internal hook-capture", "--trial-id"),
        stdin: context.stdin,
        spoolPath: resolvePath(context.cwd, options.spool),
        ingestUrl: options.ingestUrl,
        maxPayloadBytes: options.maxPayloadBytes,
        strict: options.strict ?? false
      });

      if (result.stdout.length > 0) {
        context.stdout(`${result.stdout}\n`);
      }

      if (result.stderr.length > 0) {
        context.stderr(`${result.stderr}\n`);
      }

      if (result.exitCode !== 0) {
        throw new CliExit(result.exitCode, result.stderr);
      }
    });

  const benchmark = program.command("benchmark").description("Advanced standalone benchmark JSON commands.");

  benchmark
    .command("init")
    .description("Create a benchmark JSON file.")
    .requiredOption("--output <path>", "output benchmark JSON path")
    .option("--template", "write a benchmark template from flags", false)
    .option("--id <id>", "benchmark id")
    .option("--name <name>", "benchmark name")
    .option("--category <category>", "benchmark category")
    .option("--repo-url <url>", "source repository URL")
    .option("--repo-path <path>", "local source repository path")
    .option("--fixture-path <path>", "fixture workspace path")
    .option("--detect-commands", "detect setup and validation commands from --repo-path", false)
    .option("--commit <commit>", "repository commit")
    .option("--setup-command <command>", "setup command", collectOptionValue, [])
    .option("--test-command <command>", "test command", collectOptionValue, [])
    .option("--prompt <text>", "inline prompt text")
    .option("--prompt-file <path>", "Markdown prompt file path")
    .option("--constraint <constraint>", "prompt constraint", collectOptionValue, [])
    .option("--timeout-seconds <seconds>", "timeout seconds", parsePositiveInt)
    .option("--max-cost-usd <usd>", "maximum cost in USD", parseNonnegativeNumber)
    .option("--required-file-changed <path>", "required changed file path", collectOptionValue, [])
    .option("--forbidden-file-changed <path>", "forbidden changed file path", collectOptionValue, [])
    .option("--semantic-requirement <requirement>", "semantic requirement", collectOptionValue, [])
    .option("--force", "overwrite existing output", false)
    .action(async (options: InitBenchmarkOptions) => {
      const command =
        options.template || hasNonInteractiveAuthoringOptions(options)
          ? await commandFromTemplateOptions(options, context.cwd)
          : normalizeInteractiveCommand(await collectInteractiveBenchmarkCommand(context), context.cwd);

      const benchmark = new CreateBenchmarkTemplateUseCase().execute(command);
      const outputPath = resolvePath(context.cwd, options.output);

      await new FilesystemBenchmarkTemplateWriter().write({
        benchmark,
        outputPath,
        force: options.force ?? false
      });

      context.stdout(`benchmark template written: ${outputPath}\n`);
    });

  benchmark
    .command("validate")
    .description("Validate a benchmark JSON fixture.")
    .argument("<path>", "benchmark JSON file")
    .action(async (path: string) => {
      try {
        const { benchmark, directory } = await readBenchmarkFile(path, context.cwd);
        await validateBenchmarkPrompt(benchmark, directory);
        context.stdout(`benchmark valid: ${benchmark.id}@${benchmark.version}\n`);
      } catch (error) {
        context.stderr(`benchmark invalid: ${formatError(error)}\n`);
        throw new CliExit(EX_USAGE, "benchmark invalid");
      }
    });

  benchmark
    .command("run")
    .description("Run one benchmark trial.")
    .requiredOption("--benchmark <path>", "benchmark JSON file")
    .requiredOption("--harness <harness>", "harness: codex or claude_code")
    .option("--workspace-root <path>", "root directory for trial workspace", ".bmh/workspaces")
    .option("--run-id <runId>", "run id", defaultRunId())
    .option("--trial-id <trialId>", "trial id", "trial_1")
    .option("--strict-telemetry", "fail trial on telemetry failures", false)
    .option("--dry-run", "use a fake harness runner instead of Codex or Claude Code binaries", false)
    .option("--run-validation", "execute benchmark setup and validation commands after harness execution", false)
    .option("--harness-command-json <json>", "JSON command config for a fake/local harness process")
    .action(async (options: RunCommandOptions) => {
      const harness = parseProvider(options.harness);
      const { benchmark, directory } = await readBenchmarkFile(options.benchmark, context.cwd);

      const configuredCommand = options.harnessCommandJson
        ? parseHarnessCommandJson(options.harnessCommandJson, "benchmark run --harness-command-json")
        : undefined;

      if (!options.dryRun && !configuredCommand) {
        context.stderr(
          "process harness execution is not configured for this CLI build; rerun with --dry-run or configure a real harness runner\n"
        );
        throw new CliExit(EX_CONFIG, "process harness execution is not configured");
      }

      const runner = new BenchmarkRunner({
        hookInstaller: options.dryRun ? new DryRunHookInstaller() : hookInstallerFor(harness),
        harnessRunner: configuredCommand
          ? new ProcessHarnessRunner({
              [harness]: configuredCommand.command
            })
          : new DryRunHarnessRunner(),
        validationRunner: options.runValidation ? new ProcessValidationRunner() : undefined,
        diffGenerator: options.dryRun ? undefined : new FilesystemGitDiffGenerator(),
        usageCapture: options.dryRun ? undefined : new FilesystemUsageCapture(),
        transcriptResolver: options.dryRun ? undefined : new FilesystemProviderTranscriptResolver({ env: context.env }),
        artifactCollector: new DryRunArtifactCollector(),
        workspaceProvisioner: options.dryRun ? new DryRunWorkspaceProvisioner() : new FilesystemWorkspaceProvisioner(),
        promptResolver: new ResolveBenchmarkPromptUseCase(new FilesystemPromptFileReader())
      });
      const result = await runner.runTrial({
        benchmark,
        harness,
        runId: options.runId,
        trialId: options.trialId,
        workspaceRoot: resolvePath(context.cwd, options.workspaceRoot),
        promptRoot: directory,
        strictTelemetry: options.strictTelemetry ?? false
      });

      context.stdout(
        `${JSON.stringify({
          run_id: options.runId,
          trial_id: options.trialId,
          benchmark: `${benchmark.id}@${benchmark.version}`,
          harness,
          mode: configuredCommand ? "process" : "dry-run",
          status: result.status,
          failure_classification: result.failure_classification,
          workspace: result.workspace
        })}\n`
      );

      if (result.status !== "completed") {
        const safeDiagnostic = safeProcessDiagnosticMessage(result.process_diagnostics?.stderr);
        if (safeDiagnostic !== undefined) {
          context.stderr(`${safeDiagnostic}\n`);
        }
        throw new CliExit(EX_USAGE, result.failure_classification ?? "benchmark failed");
      }
    });

  program
    .command("init")
    .description("Create .bmh/specs/suite.json and configure authoring defaults.")
    .option("--catalog-root <path>", "spec catalog root", ".bmh/specs")
    .option("--id <id>", "suite id")
    .option("--name <name>", "suite name")
    .option("--repo-path <path>", "default local repository path")
    .option("--category <category>", "default spec category")
    .option("--setup-command <command>", "default setup command", collectOptionValue)
    .option("--test-command <command>", "default validation command", collectOptionValue)
    .option("--harness <harness>", "default harness", collectOptionValue)
    .option("--trials <count>", "default trial count", parsePositiveInt)
    .option("--workspace-root <path>", "default workspace root")
    .option("--strict-telemetry", "default strict telemetry")
    .option("--no-strict-telemetry", "disable strict telemetry by default")
    .option("--include-in-suite", "add generated specs to suite by default")
    .option("--no-include-in-suite", "do not add generated specs to suite by default")
    .option("--force", "overwrite suite.json when creating a catalog", false)
    .action(async (options: SpecsInitOptions & SpecsConfigureOptions) => {
      const catalogRoot = resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs");
      const store = new FilesystemSpecCatalogStore();
      const configureHarnessOptions = options.harness ?? [];
      const harnesses = hasEntries(configureHarnessOptions) ? configureHarnessOptions.map(parseProvider) : undefined;
      const defaults: SpecCatalogDefaults = {
        repo_path: options.repoPath,
        category: options.category === undefined ? undefined : parseCategory(options.category),
        setup_commands: hasEntries(options.setupCommand) ? [...(options.setupCommand ?? [])] : undefined,
        test_commands: hasEntries(options.testCommand) ? [...(options.testCommand ?? [])] : undefined,
        harnesses,
        trials: options.trials,
        workspace_root: options.workspaceRoot,
        strict_telemetry: options.strictTelemetry,
        include_in_suite: options.includeInSuite
      };

      const hasDefaults = Object.values(defaults).some((value) => value !== undefined);
      let catalog;
      try {
        catalog = await new CreateSpecCatalogUseCase(store).execute({
          catalogRoot,
          id: options.id,
          name: options.name,
          force: options.force ?? false
        });
      } catch (error) {
        if (!hasDefaults || !isAlreadyExistsError(error)) {
          throw error;
        }

        catalog = (await new LoadSpecCatalogUseCase(store).execute({ catalogRoot })).catalog;
      }

      if (hasDefaults) {
        catalog = await new ConfigureSpecCatalogUseCase(store).execute({
          catalogRoot,
          defaults
        });
      }

      context.stdout(`spec catalog initialized: ${resolvePath(catalogRoot, "suite.json")} (${catalog.id}@${catalog.version})\n`);
    });

  program
    .command("add")
    .description("Create a feature spec in .bmh/specs.")
    .argument("[promptFile]", "Markdown prompt/spec file to copy into the catalog")
    .option("--catalog-root <path>", "spec catalog root", ".bmh/specs")
    .option("--id <id>", "spec id")
    .option("--name <name>", "spec name")
    .option("--category <category>", "spec category")
    .option("--difficulty <difficulty>", "spec difficulty")
    .option("--repo-path <path>", "local repository path")
    .option("--base-ref <ref>", "base git ref")
    .option("--golden-ref <ref>", "golden git ref")
    .option("--prompt-file <path>", "Markdown prompt/spec file to copy into the catalog")
    .option("--from-git", "create a generated spec case from git evidence", false)
    .option("--range <range>", "git revision range for multiple generated cases")
    .option("--limit <count>", "maximum generated cases to create", parsePositiveInt)
    .option("--setup-command <command>", "setup command", collectOptionValue, [])
    .option("--test-command <command>", "validation command", collectOptionValue, [])
    .option("--tag <tag>", "spec tag", collectOptionValue, [])
    .option("--include-in-suite", "add the spec to suite.json")
    .option("--force", "overwrite generated spec files", false)
    .action(async (promptFileArg: string | undefined, options: SpecsCreateOptions) => {
      const catalogRoot = resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs");
      if (promptFileArg !== undefined && options.promptFile !== undefined) {
        throw new Error("add accepts either <promptFile> or --prompt-file, not both");
      }

      const promptFile = promptFileArg ?? options.promptFile;
      const defaults = await loadSpecDefaults(catalogRoot);
      const repoPathOption = options.repoPath ?? defaults?.repo_path ?? ".";
      const repoPath = resolvePath(context.cwd, repoPathOption);
      const repoUrl = repoPathToFileUrl(context.cwd, repoPathOption);
      const setupCommands = hasEntries(options.setupCommand) ? options.setupCommand : defaults?.setup_commands ?? [];
      const testCommands = hasEntries(options.testCommand) ? options.testCommand : defaults?.test_commands ?? [];
      const includeInSuite = options.includeInSuite ?? defaults?.include_in_suite ?? false;
      const category = options.category === undefined ? defaults?.category : parseCategory(options.category);

      if (promptFile === undefined && options.fromGit !== true && hasNoManualSpecFields(options)) {
        const command = normalizeInteractiveCommand(await collectInteractiveBenchmarkCommand(context), context.cwd);
        if (command.repoUrl === undefined) {
          throw new Error("add interactive mode requires a repo source");
        }

        const draft = await new CreateFeatureSpecUseCase(new FilesystemSpecCatalogStore()).execute({
          catalogRoot,
          repoUrl: command.repoUrl,
          id: command.id,
          name: command.name,
          category: parseCategory(command.category),
          baseRef: options.baseRef,
          goldenRef: options.goldenRef,
          setupCommands: command.setupCommands,
          testCommands: command.testCommands,
          promptMarkdown: await promptMarkdownFromInteractiveCommand(command, context.cwd),
          constraints: command.constraints,
          timeoutSeconds: command.timeoutSeconds,
          maxCostUsd: command.maxCostUsd,
          requiredFilesChanged: command.requiredFilesChanged,
          forbiddenFilesChanged: command.forbiddenFilesChanged,
          semanticRequirements: command.semanticRequirements,
          metadata: {
            source: "manual_cli",
            source_prompt_file: command.promptFile
          },
          includeInSuite: options.includeInSuite ?? defaults?.include_in_suite ?? true,
          force: options.force ?? false
        });

        context.stdout(`spec created: ${resolvePath(catalogRoot, draft.benchmarkPath)}\n`);
        return;
      }

      if (options.fromGit === true && options.range !== undefined) {
        const drafts = await new CreateGeneratedGitCaseUseCase({
          store: new FilesystemSpecCatalogStore(),
          gitHistory: new ProcessGitHistoryInspector()
        }).createGeneratedGitCases({
          catalogRoot,
          repoPath,
          repoUrl,
          range: options.range,
          limit: options.limit,
          category: category ?? "feature",
          includeInSuite: options.includeInSuite ?? false,
          force: options.force ?? false
        });

        context.stdout(`generated git cases created: ${drafts.length}\n`);
        return;
      }

      if (options.fromGit === true) {
        const draft = await new CreateGeneratedGitCaseUseCase({
          store: new FilesystemSpecCatalogStore(),
          gitHistory: new ProcessGitHistoryInspector()
        }).execute({
          catalogRoot,
          repoPath,
          repoUrl,
          id: options.id,
          name: options.name,
          category: category ?? "feature",
          baseRef: requiredOption(options.baseRef, "add --from-git", "--base-ref"),
          goldenRef: requiredOption(options.goldenRef, "add --from-git", "--golden-ref"),
          setupCommands,
          testCommands,
          includeInSuite: options.includeInSuite ?? false,
          force: options.force ?? false
        });

        context.stdout(`generated git case created: ${resolvePath(catalogRoot, draft.benchmarkPath)}\n`);
        return;
      }

      if (promptFile !== undefined && (options.id === undefined || options.name === undefined || options.category === undefined)) {
        const draft = await new CreateFeatureSpecFromPromptFileUseCase({
          store: new FilesystemSpecCatalogStore(),
          promptReader: new FilesystemPromptFileReader(),
          resolveRepoUrl: (repoPath) => repoPathToFileUrl(context.cwd, repoPath)
        }).execute({
          catalogRoot,
          promptRoot: context.cwd,
          promptPath: promptFile,
          baseRef: options.baseRef,
          goldenRef: options.goldenRef,
          tags: options.tag ?? [],
          difficulty: options.difficulty,
          overrides: {
            id: options.id,
            name: options.name,
            category: options.category === undefined ? undefined : parseCategory(options.category),
            repoPath: repoPathOption,
            setupCommands: hasEntries(options.setupCommand) ? options.setupCommand : undefined,
            testCommands: hasEntries(options.testCommand) ? options.testCommand : undefined,
            includeInSuite: options.includeInSuite
          },
          force: options.force ?? false
        });

        context.stdout(`spec created: ${resolvePath(catalogRoot, draft.benchmarkPath)}\n`);
        return;
      }

      const promptMarkdown = promptFile
        ? await readFile(resolvePath(context.cwd, promptFile), "utf8")
        : "# Task\n\nTODO: Describe the feature behavior to implement.\n";
      const generatedIdentity = generateDefaultSpecIdentity();
      const draft = await new CreateFeatureSpecUseCase(new FilesystemSpecCatalogStore()).execute({
        catalogRoot,
        repoUrl,
        id: options.id ?? generatedIdentity.id,
        name: options.name ?? generatedIdentity.name,
        category: category ?? "feature",
        difficulty: options.difficulty,
        baseRef: options.baseRef,
        goldenRef: options.goldenRef,
        setupCommands,
        testCommands,
        promptMarkdown,
        tags: options.tag ?? [],
        metadata: {
          source: "manual_cli",
          source_prompt_file: promptFile
        },
        includeInSuite,
        force: options.force ?? false
      });

      context.stdout(`spec created: ${resolvePath(catalogRoot, draft.benchmarkPath)}\n`);
    });

  program
    .command("import")
    .description("Create feature specs from Markdown prompt files.")
    .argument("<promptFiles...>", "Markdown prompt/spec files or simple glob patterns")
    .option("--catalog-root <path>", "spec catalog root", ".bmh/specs")
    .option("--repo-path <path>", "local repository path")
    .option("--base-ref <ref>", "base git ref")
    .option("--golden-ref <ref>", "golden git ref")
    .option("--force", "overwrite generated spec files", false)
    .action(async (promptFiles: readonly string[], options: SpecsImportOptions) => {
      const catalogRoot = resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs");
      const defaults = await loadSpecDefaults(catalogRoot);
      const repoPathOption = options.repoPath ?? defaults?.repo_path ?? ".";
      const expanded = await expandPromptFiles(context.cwd, promptFiles);
      const prompts = expanded.map((promptPath) => ({ promptPath }));
      const drafts = await new ImportFeatureSpecsUseCase({
        store: new FilesystemSpecCatalogStore(),
        promptReader: new FilesystemPromptFileReader(),
        resolveRepoUrl: (repoPath) => repoPathToFileUrl(context.cwd, repoPath)
      }).execute({
        catalogRoot,
        promptRoot: context.cwd,
        repoUrl: repoPathToFileUrl(context.cwd, repoPathOption),
        prompts,
        baseRef: options.baseRef,
        goldenRef: options.goldenRef,
        force: options.force ?? false
      });

      context.stdout(`specs imported: ${drafts.length}\n`);
    });

  program
    .command("doctor")
    .description("Check spec catalog and local harness readiness.")
    .option("--catalog-root <path>", "spec catalog root", ".bmh/specs")
    .action(async (options: SpecsCatalogOptions) => {
      try {
        const loaded = await new LoadSpecCatalogUseCase(new FilesystemSpecCatalogStore()).execute({
          catalogRoot: resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs")
        });
        context.stdout(`spec catalog: valid ${loaded.catalog.id}@${loaded.catalog.version} (${loaded.specs.length} specs)\n`);
        const harnesses = loaded.catalog.defaults?.harnesses ?? ["codex", "claude_code"];
        context.stdout(`default harnesses: ${harnesses.join(", ")}\n`);
        for (const harness of harnesses) {
          const command = defaultHarnessCommand(harness);
          const status = await executableStatus(command.executable, context.env);
          context.stdout(`${harness}: ${status}\n`);
        }
      } catch (error) {
        context.stderr(`doctor failed: ${formatError(error)}\n`);
        throw new CliExit(EX_USAGE, "doctor failed");
      }
    });

  program
    .command("run")
    .description("Run a spec catalog suite.")
    .option("--catalog-root <path>", "spec catalog root", ".bmh/specs")
    .option("--store-root <path>", "suite result store root", ".bmh/runs")
    .option("--workspace-root <path>", "root directory for trial workspace")
    .option("--run-id <runId>", "run id", defaultRunId())
    .option("--harness <harness>", "harness: codex or claude_code", collectOptionValue, [])
    .option("--spec <spec>", "spec id", collectOptionValue, [])
    .option("--tag <tag>", "tag", collectOptionValue, [])
    .option("--trials <count>", "trial count", parsePositiveInt)
    .option("--strict-telemetry", "fail trials on telemetry failures")
    .option("--no-strict-telemetry", "do not fail trials on telemetry failures")
    .option("--dry-run", "use a fake harness runner", false)
    .option("--real", "run real harness processes", false)
    .option("--harness-command-json <json>", "JSON command config for suite process harnesses")
    .action(async (options: SpecsRunOptions) => {
      const loaded = await new LoadSpecCatalogUseCase(new FilesystemSpecCatalogStore()).execute({
        catalogRoot: resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs")
      });
      const harnessOptions = options.harness ?? [];
      const harnesses = hasEntries(harnessOptions) ? harnessOptions.map(parseProvider) : undefined;
      const resolvedHarnesses = harnesses ?? loaded.catalog.defaults?.harnesses ?? ["codex", "claude_code"];

      if (options.dryRun === true && options.real === true) {
        context.stderr("run cannot use --real and --dry-run together\n");
        throw new CliExit(EX_USAGE, "spec suite real and dry-run modes are mutually exclusive");
      }

      if (options.dryRun !== true && options.real !== true) {
        context.stderr("run requires --dry-run or --real; real harness execution is not configured by default\n");
        throw new CliExit(EX_CONFIG, "spec suite real harness execution is not configured");
      }

      let suiteCommands: Partial<Record<HookCaptureProvider, HarnessCommand>> | undefined;
      if (options.real === true) {
        try {
          suiteCommands = await resolveSuiteHarnessCommands({
              cwd: context.cwd,
              env: context.env,
              harnesses: resolvedHarnesses,
              overrideJson: options.harnessCommandJson
            });
        } catch (error) {
          context.stderr(`${formatError(error)}\n`);
          throw new CliExit(EX_CONFIG, "real harness command resolution failed");
        }
      }
      const runner = new BenchmarkRunner({
        hookInstaller: options.real === true ? new DelegatingHookInstaller() : new DryRunHookInstaller(),
        harnessRunner: suiteCommands ? new ProcessHarnessRunner(suiteCommands) : new DryRunHarnessRunner(),
        validationRunner: options.real === true ? new ProcessValidationRunner() : undefined,
        diffGenerator: options.real === true ? new FilesystemGitDiffGenerator() : undefined,
        hookEventCounter: options.real === true ? new FilesystemHookEventCounter() : undefined,
        usageCapture: options.real === true ? new FilesystemUsageCapture() : undefined,
        transcriptResolver: options.real === true ? new FilesystemProviderTranscriptResolver({ env: context.env }) : undefined,
        artifactCollector: new DryRunArtifactCollector(),
        workspaceProvisioner: options.real === true ? new FilesystemWorkspaceProvisioner() : new DryRunWorkspaceProvisioner(),
        promptResolver: new ResolveBenchmarkPromptUseCase(new FilesystemPromptFileReader())
      });
      const report = await new RunSpecSuiteUseCase(new FilesystemSuiteResultStore({
        root: resolvePath(context.cwd, options.storeRoot ?? ".bmh/runs")
      })).execute({
        loadedCatalog: loaded,
        runner,
        runId: options.runId,
        harnesses: resolvedHarnesses,
        specIds: options.spec,
        tags: options.tag,
        trials: options.trials,
        workspaceRoot: resolvePath(context.cwd, options.workspaceRoot ?? loaded.catalog.defaults?.workspace_root ?? ".bmh/workspaces"),
        catalogRoot: resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs"),
        strictTelemetry: options.strictTelemetry,
        onProgress: options.real === true ? context.stdout : undefined
      });

      context.stdout(`spec suite run complete: ${report.run_id} (${report.trial_count} trials)\n`);
    });

  program
    .command("smoke")
    .description("Run a dry one-trial spec suite smoke test.")
    .option("--catalog-root <path>", "spec catalog root", ".bmh/specs")
    .option("--store-root <path>", "suite result store root", ".bmh/runs")
    .option("--workspace-root <path>", "root directory for trial workspace")
    .option("--run-id <runId>", "run id", defaultRunId())
    .action(async (options: SpecsSmokeOptions) => {
      const loaded = await new LoadSpecCatalogUseCase(new FilesystemSpecCatalogStore()).execute({
        catalogRoot: resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs")
      });
      const runner = new BenchmarkRunner({
        hookInstaller: new DryRunHookInstaller(),
        harnessRunner: new DryRunHarnessRunner(),
        diffGenerator: undefined,
        artifactCollector: new DryRunArtifactCollector(),
        workspaceProvisioner: new DryRunWorkspaceProvisioner(),
        promptResolver: new ResolveBenchmarkPromptUseCase(new FilesystemPromptFileReader())
      });
      const report = await new RunSpecSuiteSmokeUseCase(new FilesystemSuiteResultStore({
        root: resolvePath(context.cwd, options.storeRoot ?? ".bmh/runs")
      })).execute({
        loadedCatalog: loaded,
        runner,
        runId: options.runId,
        workspaceRoot: resolvePath(context.cwd, options.workspaceRoot ?? loaded.catalog.defaults?.workspace_root ?? ".bmh/workspaces"),
        catalogRoot: resolvePath(context.cwd, options.catalogRoot ?? ".bmh/specs")
      });

      context.stdout(`spec suite smoke complete: ${report.run_id} (${report.trial_count} trials)\n`);
    });

  program
    .command("report")
    .description("Render a benchmark run report.")
    .option("--input <path>", "JSON report input")
    .option("--run-id <runId>", "run id to load from configured storage")
    .option("--store-root <path>", "local report store root", ".bmh/runs")
    .option("--format <format>", "report format: text or html", "text")
    .action(async (options: ReportCommandOptions) => {
      if (options.input) {
        const report = await readJsonFile(options.input, context.cwd);
        context.stdout(options.format === "html" ? renderSuiteReportHtml(report as never) : renderReport(report));
        return;
      }

      if (options.runId) {
        if (options.format === "html") {
          const storeRoot = resolvePath(context.cwd, options.storeRoot ?? ".bmh/runs");
          const suiteReport = await new FilesystemSuiteResultStore({
            root: storeRoot
          }).findByRunId(options.runId);

          if (suiteReport !== undefined) {
            const reportPath = await new FilesystemHtmlReportStore({
              root: storeRoot
            }).save(suiteReport);
            context.stdout(`HTML report written: ${reportPath.path}\n`);
            return;
          }
        }

        const reportStore = new FilesystemReportStore({
          root: resolvePath(context.cwd, options.storeRoot ?? ".bmh/runs")
        });
        const report = await reportStore.findByRunId(options.runId);

        if (report !== undefined) {
          context.stdout(renderReport(report));
          return;
        }

        context.stderr(`run not found: ${options.runId}\n`);
        throw new CliExit(EX_CONFIG, `run not found: ${options.runId}`);
      }

      context.stderr("report requires --input <path> or --run-id <id>\n");
      throw new CliExit(EX_USAGE, "report requires input");
    });

  return program;
}

interface HookCaptureCommandOptions {
  readonly provider: string;
  readonly event: string;
  readonly runId?: string;
  readonly trialId?: string;
  readonly eventSource?: string;
  readonly spool: string;
  readonly ingestUrl?: string;
  readonly maxPayloadBytes?: number;
  readonly strict?: boolean;
}

interface RunCommandOptions {
  readonly benchmark: string;
  readonly harness: string;
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly trialId: string;
  readonly strictTelemetry?: boolean;
  readonly dryRun?: boolean;
  readonly runValidation?: boolean;
  readonly harnessCommandJson?: string;
}

interface ReportCommandOptions {
  readonly input?: string;
  readonly runId?: string;
  readonly storeRoot?: string;
  readonly format?: string;
}

interface SpecsCatalogOptions {
  readonly catalogRoot?: string;
}

interface SpecsInitOptions extends SpecsCatalogOptions {
  readonly id?: string;
  readonly name?: string;
  readonly force?: boolean;
}

interface SpecsConfigureOptions extends SpecsCatalogOptions {
  readonly repoPath?: string;
  readonly category?: string;
  readonly setupCommand?: readonly string[];
  readonly testCommand?: readonly string[];
  readonly harness?: readonly string[];
  readonly trials?: number;
  readonly workspaceRoot?: string;
  readonly strictTelemetry?: boolean;
  readonly includeInSuite?: boolean;
}

interface SpecsCreateOptions extends SpecsCatalogOptions {
  readonly id?: string;
  readonly name?: string;
  readonly category?: string;
  readonly difficulty?: string;
  readonly repoPath?: string;
  readonly baseRef?: string;
  readonly goldenRef?: string;
  readonly promptFile?: string;
  readonly fromGit?: boolean;
  readonly range?: string;
  readonly limit?: number;
  readonly setupCommand?: readonly string[];
  readonly testCommand?: readonly string[];
  readonly tag?: readonly string[];
  readonly includeInSuite?: boolean;
  readonly force?: boolean;
}

interface SpecsRunOptions extends SpecsCatalogOptions {
  readonly storeRoot?: string;
  readonly workspaceRoot?: string;
  readonly runId: string;
  readonly harness?: readonly string[];
  readonly spec?: readonly string[];
  readonly tag?: readonly string[];
  readonly trials?: number;
  readonly strictTelemetry?: boolean;
  readonly dryRun?: boolean;
  readonly real?: boolean;
  readonly harnessCommandJson?: string;
}

interface SpecsImportOptions extends SpecsCatalogOptions {
  readonly repoPath?: string;
  readonly baseRef?: string;
  readonly goldenRef?: string;
  readonly force?: boolean;
}

interface SpecsSmokeOptions extends SpecsCatalogOptions {
  readonly storeRoot?: string;
  readonly workspaceRoot?: string;
  readonly runId: string;
}

interface InitBenchmarkOptions {
  readonly output: string;
  readonly template?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly category?: string;
  readonly repoUrl?: string;
  readonly repoPath?: string;
  readonly fixturePath?: string;
  readonly detectCommands?: boolean;
  readonly commit?: string;
  readonly setupCommand?: readonly string[];
  readonly testCommand?: readonly string[];
  readonly prompt?: string;
  readonly promptFile?: string;
  readonly constraint?: readonly string[];
  readonly timeoutSeconds?: number;
  readonly maxCostUsd?: number;
  readonly requiredFileChanged?: readonly string[];
  readonly forbiddenFileChanged?: readonly string[];
  readonly semanticRequirement?: readonly string[];
  readonly force?: boolean;
}

async function commandFromTemplateOptions(options: InitBenchmarkOptions, cwd: string): Promise<BenchmarkAuthoringCommand> {
  const sourceCount =
    Number(options.repoUrl !== undefined) + Number(options.repoPath !== undefined) + Number(options.fixturePath !== undefined);

  if (sourceCount > 1) {
    throw new Error("benchmark init requires only one of --repo-url, --repo-path, or --fixture-path");
  }

  const generatedCommands = await generatedCommandsFromTemplateOptions(options, cwd);
  const generatedIdentity = generateDefaultSpecIdentity();

  return {
    id: options.id ?? generatedIdentity.id,
    name: options.name ?? generatedIdentity.name,
    category: options.category === undefined ? "feature" : parseCategory(options.category),
    repoUrl: options.repoPath === undefined ? options.repoUrl : repoPathToFileUrl(cwd, options.repoPath),
    fixturePath: options.fixturePath,
    commit: options.commit,
    setupCommands: generatedCommands?.setupCommands ?? options.setupCommand ?? [],
    testCommands: generatedCommands?.testCommands ?? options.testCommand ?? [],
    promptText: options.prompt,
    promptFile: options.promptFile,
    constraints: options.constraint ?? [],
    timeoutSeconds: options.timeoutSeconds,
    maxCostUsd: options.maxCostUsd,
    requiredFilesChanged: options.requiredFileChanged ?? [],
    forbiddenFilesChanged: options.forbiddenFileChanged ?? [],
    semanticRequirements: options.semanticRequirement ?? []
  };
}

function hasNonInteractiveAuthoringOptions(options: InitBenchmarkOptions): boolean {
  return (
    options.id !== undefined ||
    options.name !== undefined ||
    options.category !== undefined ||
    options.repoUrl !== undefined ||
    options.repoPath !== undefined ||
    options.fixturePath !== undefined ||
    options.commit !== undefined ||
    options.detectCommands === true ||
    hasEntries(options.setupCommand) ||
    hasEntries(options.testCommand) ||
    options.prompt !== undefined ||
    options.promptFile !== undefined ||
    hasEntries(options.constraint) ||
    options.timeoutSeconds !== undefined ||
    options.maxCostUsd !== undefined ||
    hasEntries(options.requiredFileChanged) ||
    hasEntries(options.forbiddenFileChanged) ||
    hasEntries(options.semanticRequirement)
  );
}

function hasNoManualSpecFields(options: SpecsCreateOptions): boolean {
  return (
    options.id === undefined &&
    options.name === undefined &&
    options.category === undefined &&
    options.difficulty === undefined &&
    options.repoPath === undefined &&
    options.range === undefined &&
    options.limit === undefined &&
    !hasEntries(options.setupCommand) &&
    !hasEntries(options.testCommand) &&
    !hasEntries(options.tag)
  );
}

async function promptMarkdownFromInteractiveCommand(command: BenchmarkAuthoringCommand, cwd: string): Promise<string> {
  if (command.promptFile !== undefined) {
    return readFile(resolvePath(cwd, command.promptFile), "utf8");
  }

  return `# ${command.name}\n\n${command.promptText ?? "TODO: Describe the feature behavior to implement."}\n`;
}

async function generatedCommandsFromTemplateOptions(
  options: InitBenchmarkOptions,
  cwd: string
): Promise<{ readonly setupCommands: readonly string[]; readonly testCommands: readonly string[] } | undefined> {
  if (options.detectCommands !== true) {
    return undefined;
  }

  if (options.repoPath === undefined || options.repoUrl !== undefined || options.fixturePath !== undefined) {
    throw new Error("benchmark init --detect-commands requires --repo-path and does not support --repo-url or --fixture-path");
  }

  if (hasEntries(options.setupCommand) || hasEntries(options.testCommand)) {
    throw new Error("benchmark init --detect-commands cannot be used with manual setup or test commands");
  }

  return generateProjectCommands(cwd, options.repoPath);
}

function normalizeInteractiveCommand(command: BenchmarkAuthoringCommand, cwd: string): BenchmarkAuthoringCommand {
  if (command.repoUrl === undefined || !isLocalRepoPath(command.repoUrl)) {
    return command;
  }

  return {
    ...command,
    repoUrl: repoPathToFileUrl(cwd, command.repoUrl)
  };
}

function isLocalRepoPath(value: string): boolean {
  return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../") || isAbsolute(value);
}

function repoPathToFileUrl(cwd: string, path: string): string {
  return pathToFileURL(resolvePath(cwd, path)).href;
}

function collectOptionValue(value: string, previous: readonly string[] | undefined): readonly string[] {
  return [...(previous ?? []), value];
}

function requiredOption(value: string | undefined, command: string, option: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${command} requires ${option}`);
  }

  return value;
}

function hasEntries(values: readonly unknown[] | undefined): boolean {
  return values !== undefined && values.length > 0;
}

async function loadSpecDefaults(catalogRoot: string): Promise<SpecCatalogDefaults | undefined> {
  try {
    const loaded = await new LoadSpecCatalogUseCase(new FilesystemSpecCatalogStore()).execute({
      catalogRoot
    });

    return loaded.catalog.defaults;
  } catch (error) {
    if (isNotFoundError(error) || (error instanceof Error && /no such file|ENOENT/i.test(error.message))) {
      return undefined;
    }

    throw error;
  }
}

async function expandPromptFiles(cwd: string, promptFiles: readonly string[]): Promise<readonly string[]> {
  const expanded: string[] = [];

  for (const promptFile of promptFiles) {
    if (!hasGlobPattern(promptFile)) {
      expanded.push(promptFile);
      continue;
    }

    const matches = await expandGlobPattern(cwd, promptFile);
    if (matches.length === 0) {
      throw new Error(`import prompt file pattern matched no files: ${promptFile}`);
    }

    expanded.push(...matches);
  }

  return expanded;
}

function hasGlobPattern(path: string): boolean {
  return /[*?]/.test(path);
}

async function expandGlobPattern(cwd: string, pattern: string): Promise<readonly string[]> {
  const absolutePattern = resolvePath(cwd, pattern);
  const segments = absolutePattern.split(/[\\/]/);
  const startsAtRoot = segments[0] === "";
  let candidates = [startsAtRoot ? "/" : segments[0] ?? ""];
  const remainingSegments = startsAtRoot ? segments.slice(1) : segments.slice(1);

  for (const segment of remainingSegments) {
    if (!hasGlobPattern(segment)) {
      candidates = candidates.map((candidate) => join(candidate, segment));
      continue;
    }

    const matcher = globSegmentMatcher(segment);
    const nextCandidates: string[] = [];

    for (const candidate of candidates) {
      let entries: string[];

      try {
        entries = await readdir(candidate);
      } catch (error) {
        if (isNotFoundError(error)) {
          continue;
        }

        throw error;
      }

      nextCandidates.push(
        ...entries
          .filter((entry) => matcher.test(entry))
          .map((entry) => join(candidate, entry))
      );
    }

    candidates = nextCandidates;
  }

  const files: string[] = [];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        const relativeCandidate = relative(cwd, candidate);
        files.push(relativeCandidate.length > 0 && !relativeCandidate.startsWith("..") ? relativeCandidate : candidate);
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return files.sort();
}

function globSegmentMatcher(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`);
}

async function collectInteractiveBenchmarkCommand(context: CliContext): Promise<BenchmarkAuthoringCommand> {
  if (context.question) {
    return new InteractiveBenchmarkAuthoring({
      question: context.question,
      generateCommands: (repoPath) => generateProjectCommands(context.cwd, repoPath),
      isLocalRepoPath
    }).collect();
  }

  if (context.canPromptInteractively) {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      return await new InteractiveBenchmarkAuthoring({
        question: (label) => readline.question(`${label}: `),
        generateCommands: (repoPath) => generateProjectCommands(context.cwd, repoPath),
        isLocalRepoPath
      }).collect();
    } finally {
      readline.close();
    }
  }

  return new InteractiveBenchmarkAuthoring({
    stdin: context.stdin,
    stdout: context.stdout,
    generateCommands: (repoPath) => generateProjectCommands(context.cwd, repoPath),
    isLocalRepoPath
  }).collect();
}

async function generateProjectCommands(
  cwd: string,
  repoPath: string
): Promise<{ readonly setupCommands: readonly string[]; readonly testCommands: readonly string[] }> {
  const commands = await new GenerateProjectCommandsUseCase(new FilesystemProjectCommandDetector()).execute({
    root: resolvePath(cwd, repoPath)
  });

  return {
    setupCommands: commands.setupCommands,
    testCommands: commands.validationCommands
  };
}

async function readBenchmarkFile(path: string, cwd: string): Promise<{ benchmark: Benchmark; directory: string }> {
  const benchmarkPath = resolvePath(cwd, path);

  return {
    benchmark: BenchmarkSchema.parse(await readJsonFile(path, cwd)),
    directory: dirname(benchmarkPath)
  };
}

async function validateBenchmarkPrompt(benchmark: Benchmark, directory: string): Promise<void> {
  await new ResolveBenchmarkPromptUseCase(new FilesystemPromptFileReader()).execute({
    benchmark,
    root: directory
  });
}

async function readJsonFile(path: string, cwd: string): Promise<unknown> {
  if (path.endsWith(".yml") || path.endsWith(".yaml")) {
    throw new Error("YAML benchmarks are not supported by this build; provide JSON");
  }

  return JSON.parse(await readFile(resolvePath(cwd, path), "utf8")) as unknown;
}

function parseProvider(provider: string): HookCaptureProvider {
  if (provider === "codex" || provider === "claude_code") {
    return provider;
  }

  fail(EX_USAGE, `unsupported provider: ${provider}`);
}

function parseCategory(category: string): BenchmarkCategory {
  const parsed = BenchmarkCategorySchema.safeParse(category);
  if (parsed.success) {
    return parsed.data;
  }

  fail(EX_USAGE, `unsupported category: ${category}`);
}

function parseHarnessCommandJson(
  json: string,
  label = "harness command JSON"
): { command: HarnessCommand; env: Record<string, string> } {
  const parsed = JSON.parse(json) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be an object`);
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.executable !== "string" || record.executable.length === 0) {
    throw new Error(`${label} requires executable`);
  }

  const args = record.args === undefined
    ? []
    : Array.isArray(record.args) && record.args.every((arg) => typeof arg === "string")
      ? record.args
      : undefined;
  if (!args) {
    throw new Error(`${label} args must be an array of strings`);
  }

  const env = record.env === undefined ? {} : parseStringRecord(record.env, label, "env");

  return {
    command: {
      executable: record.executable,
      args,
      env,
      promptDelivery: "stdin"
    },
    env
  };
}

async function resolveSuiteHarnessCommands(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  harnesses: readonly HookCaptureProvider[];
  overrideJson?: string;
}): Promise<Partial<Record<HookCaptureProvider, HarnessCommand>>> {
  const hookBinDir = await ensureLocalHookCommandShim(input.cwd);
  const overrides = input.overrideJson === undefined
    ? {}
    : parseSuiteHarnessCommandJson(input.overrideJson, input.harnesses);
  const commands: Partial<Record<HookCaptureProvider, HarnessCommand>> = {};

  for (const harness of input.harnesses) {
    const command = overrides[harness] ?? defaultHarnessCommand(harness);
    await assertExecutableAvailable(harness, command.executable, input.env);
    commands[harness] = {
      ...command,
      env: {
        ...(command.env ?? {}),
        PATH: prependPath(hookBinDir, command.env?.PATH ?? input.env.PATH ?? "")
      }
    };
  }

  return commands;
}

function parseSuiteHarnessCommandJson(
  json: string,
  harnesses: readonly HookCaptureProvider[]
): Partial<Record<HookCaptureProvider, HarnessCommand>> {
  const parsed = JSON.parse(json) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("run --harness-command-json must be an object");
  }

  const record = parsed as Record<string, unknown>;
  if ("executable" in record) {
    if (harnesses.length !== 1) {
      throw new Error("run --harness-command-json with a single command requires exactly one selected harness");
    }

    return { [harnesses[0]]: parseHarnessCommandJson(json, "run --harness-command-json").command };
  }

  return Object.fromEntries(
    Object.entries(record).map(([provider, value]) => {
      const harness = parseProvider(provider);
      return [harness, parseHarnessCommandJson(JSON.stringify(value), `run --harness-command-json ${provider}`).command];
    })
  ) as Partial<Record<HookCaptureProvider, HarnessCommand>>;
}

function defaultHarnessCommand(harness: HookCaptureProvider): HarnessCommand {
  if (harness === "codex") {
    return {
      executable: "codex",
      args: ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--dangerously-bypass-hook-trust", "-"],
      promptDelivery: "stdin"
    };
  }

  return {
    executable: "claude",
    args: ["-p"],
    promptDelivery: "stdin"
  };
}

async function ensureLocalHookCommandShim(cwd: string): Promise<string> {
  const binDir = resolvePath(cwd, ".bmh/bin");
  const primaryShimPath = join(binDir, "bmh");
  const cliPath = fileURLToPath(import.meta.url);
  const script = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "if [ \"${1:-}\" = \"internal\" ] && [ \"${2:-}\" = \"hook-capture\" ]; then",
    `  exec node -e ${shellQuote(hookCaptureShimJavaScript())} "$@"`,
    "fi",
    `exec node ${shellQuote(cliPath)} "$@"`,
    ""
  ].join("\n");

  await mkdir(binDir, { recursive: true });
  await writeFile(primaryShimPath, script, "utf8");
  await chmod(primaryShimPath, 0o755);

  return binDir;
}

async function assertExecutableAvailable(harness: HookCaptureProvider, executable: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (executable.includes("/") || isAbsolute(executable)) {
    try {
      await access(executable);
    } catch {
      throw new Error(`${harness} environment_failed: harness executable not found: ${executable}`);
    }
    return;
  }

  const pathEntries = (env.PATH ?? "").split(":").filter((entry) => entry.length > 0);
  for (const entry of pathEntries) {
    try {
      await access(join(entry, executable));
      return;
    } catch {
      // keep searching PATH
    }
  }

  throw new Error(`${harness} environment_failed: harness executable not found on PATH: ${executable}`);
}

async function executableStatus(executable: string, env: NodeJS.ProcessEnv): Promise<"found" | "missing"> {
  try {
    await assertExecutableAvailable("codex", executable, env);
    return "found";
  } catch {
    return "missing";
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function prependPath(entry: string, path: string): string {
  return path.length === 0 ? entry : `${entry}:${path}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function hookCaptureShimJavaScript(): string {
  return `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(1);
const opt = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const spool = opt("--spool");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  if (!spool) {
    process.exitCode = 64;
    return;
  }
  let payload;
  try {
    payload = input.trim().length === 0 ? {} : JSON.parse(input);
  } catch {
    payload = { raw: input };
  }
  fs.mkdirSync(path.dirname(spool), { recursive: true });
  fs.appendFileSync(spool, JSON.stringify({
    schema_version: "bmh.hook_capture.v1",
    provider: opt("--provider"),
    event: opt("--event"),
    run_id: opt("--run-id"),
    trial_id: opt("--trial-id"),
    captured_at: new Date().toISOString(),
    payload
  }) + "\\n");
});
`;
}

function parseStringRecord(value: unknown, commandLabel: string, label: string): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${commandLabel} ${label} must be an object`);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (typeof entry !== "string") {
        throw new Error(`${commandLabel} ${label}.${key} must be a string`);
      }
      return [key, entry];
    })
  );
}

function hookInstallerFor(provider: HookCaptureProvider): InstallHarnessHooksPort {
  return provider === "codex" ? new CodexHookInstaller() : new ClaudeCodeHookInstaller();
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`expected a positive integer, got: ${value}`);
  }

  return parsed;
}

function parseNonnegativeNumber(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`expected a nonnegative number, got: ${value}`);
  }

  return parsed;
}

function resolvePath(cwd: string, path: string): string {
  return resolve(cwd, path);
}

function defaultRunId(): string {
  return `run_${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
}

function fail(exitCode: number, message: string): never {
  if (exitCode === EX_USAGE) {
    throw new Error(message);
  }

  throw new CliExit(exitCode, message);
}

function formatError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function renderReport(report: unknown): string {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("report input must be a JSON object");
  }

  const record = report as Record<string, unknown>;
  const runId = stringField(record.run_id) ?? stringField(record.runId) ?? "unknown";
  const status = stringField(record.status) ?? "unknown";
  const lines = [`Run ${runId}`];

  if (hasBenchmarkReportFields(record)) {
    lines.push(
      `Provider: ${stringField(record.provider) ?? "unknown"}`,
      `Benchmark: ${formatBenchmark(record.benchmark)}`,
      `Score: ${formatScore(record.evaluation)}`,
      `Comparability: ${formatComparability(record.comparability)}`
    );
  } else {
    lines.push(`Status: ${status}`);
  }

  const trials = Array.isArray(record.trials) ? record.trials : [];

  for (const trial of trials) {
    if (trial === null || typeof trial !== "object" || Array.isArray(trial)) {
      continue;
    }

    const trialRecord = trial as Record<string, unknown>;
    const harness = stringField(trialRecord.harness) ?? stringField(trialRecord.provider) ?? "unknown";
    const trialStatus = stringField(trialRecord.status) ?? "unknown";
    lines.push(`${harness}: ${trialStatus}`);
  }

  return `${lines.join("\n")}\n`;
}

function hasBenchmarkReportFields(record: Record<string, unknown>): boolean {
  return record.benchmark !== undefined && record.evaluation !== undefined && record.comparability !== undefined;
}

function formatBenchmark(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "unknown";
  }

  const record = value as Record<string, unknown>;
  return `${stringField(record.id) ?? "unknown"}@${stringField(record.version) ?? "unknown"}`;
}

function formatScore(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "unknown";
  }

  const score = (value as Record<string, unknown>).score_total;
  return typeof score === "number" ? String(score) : "unknown";
}

function formatComparability(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "unknown";
  }

  return stringField((value as Record<string, unknown>).status) ?? "unknown";
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeProcessDiagnosticMessage(stderr: string | undefined): string | undefined {
  if (stderr === undefined) {
    return undefined;
  }

  const trimmed = stderr.trim();
  if (
    /^harness executable not found(?: on PATH)?: [^\n\r]+$/.test(trimmed) ||
    /^No process command configured for harness: [a-z_]+$/.test(trimmed)
  ) {
    return trimmed;
  }

  return undefined;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

class DryRunHookInstaller implements InstallHarnessHooksPort {
  public async install() {
    return { id: "dry-run-hooks", files: [] };
  }

  public async uninstall(): Promise<void> {}
}

class DelegatingHookInstaller implements InstallHarnessHooksPort {
  public async install(input: Parameters<InstallHarnessHooksPort["install"]>[0]) {
    return hookInstallerFor(input.harness ?? "codex").install(input);
  }

  public async uninstall(installation: Parameters<InstallHarnessHooksPort["uninstall"]>[0]): Promise<void> {
    if (installation.provider === undefined) {
      return;
    }

    await hookInstallerFor(installation.provider).uninstall(installation);
  }
}

class DryRunHarnessRunner implements HarnessRunnerPort {
  public async execute(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return { exitCode: 0, stdout: "dry-run", stderr: "" };
  }
}

class DryRunWorkspaceProvisioner implements WorkspaceProvisionerPort {
  public async provision(input: ProvisionWorkspaceInput): Promise<ProvisionedWorkspace> {
    const workspace = join(input.workspaceRoot, input.trialId);
    const spoolPath = join(workspace, ".bmh", "hooks.jsonl");

    await mkdir(dirname(spoolPath), { recursive: true });

    return {
      workspace,
      spoolPath,
      workspaceSource: input.source?.type === "git"
        ? {
            type: "git",
            repo_url: input.source.repoUrl,
            base_ref: input.source.baseRef,
            resolved_base_sha: input.source.baseRef,
            golden_ref: input.source.goldenRef,
            resolved_golden_sha: input.source.goldenRef
          }
        : undefined
    };
  }
}

class DryRunArtifactCollector implements ArtifactCollectorPort {
  public async collect() {
    return [];
  }
}

if (await isCliEntrypoint(import.meta.url, process.argv[1])) {
  const exitCode = await runCli();
  process.exitCode = exitCode;
}

export async function isCliEntrypoint(moduleUrl: string, argvPath: string | undefined): Promise<boolean> {
  if (argvPath === undefined) {
    return false;
  }

  const modulePath = fileURLToPath(moduleUrl);
  const invocationPath = resolve(argvPath);
  if (modulePath === invocationPath) {
    return true;
  }

  try {
    return await realpath(modulePath) === await realpath(invocationPath);
  } catch {
    return false;
  }
}
