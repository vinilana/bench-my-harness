import type {
  GeneratedProjectCommands,
  NodePackageManager
} from "../../domain/benchmark/project-command-generation.js";
import type { ProjectCommandDetectorPort } from "../ports/project-command-detector-port.js";

const VALIDATION_SCRIPT_ORDER = ["test", "typecheck", "lint"] as const;

export class GenerateProjectCommandsUseCase {
  public constructor(private readonly detector: ProjectCommandDetectorPort) {}

  public async execute(input: { readonly root: string }): Promise<GeneratedProjectCommands> {
    const detection = await this.detector.detect({ root: input.root });

    if (!detection.supported) {
      throw new Error(`project command detection failed: ${detection.reason}`);
    }

    const validationCommands = VALIDATION_SCRIPT_ORDER
      .filter((script) => detection.scripts.includes(script))
      .map((script) => validationCommand(detection.packageManager, script));

    if (validationCommands.length === 0) {
      throw new Error("project command generation requires at least one validation scripts entry");
    }

    return {
      ecosystem: detection.ecosystem,
      packageManager: detection.packageManager,
      confidence: "high",
      setupCommands: [setupCommand(detection.packageManager)],
      validationCommands,
      evidence: detection.evidence
    };
  }
}

function setupCommand(packageManager: NodePackageManager): string {
  return `${packageManager} install`;
}

function validationCommand(packageManager: NodePackageManager, script: string): string {
  if (script === "test") {
    return `${packageManager} test`;
  }

  if (packageManager === "yarn") {
    return `yarn ${script}`;
  }

  return `${packageManager} run ${script}`;
}
