import { describe, expect, test } from "vitest";
import { GenerateProjectCommandsUseCase } from "../../src/application/use-cases/generate-project-commands.js";
import type {
  ProjectCommandDetection,
  ProjectCommandDetectorPort
} from "../../src/application/ports/project-command-detector-port.js";

describe("generate project commands use case", () => {
  test("generates setup and validation commands for npm", async () => {
    const result = await generate({
      packageManager: "npm",
      scripts: ["test", "typecheck"]
    });

    expect(result).toMatchObject({
      ecosystem: "node",
      packageManager: "npm",
      confidence: "high",
      setupCommands: ["npm install"],
      validationCommands: ["npm test", "npm run typecheck"],
      evidence: expect.arrayContaining(["package.json", "scripts.test", "scripts.typecheck"])
    });
  });

  test("generates package-manager-specific command syntax", async () => {
    await expect(generate({ packageManager: "pnpm", scripts: ["test", "typecheck", "lint"] })).resolves.toMatchObject({
      setupCommands: ["pnpm install"],
      validationCommands: ["pnpm test", "pnpm run typecheck", "pnpm run lint"]
    });
    await expect(generate({ packageManager: "yarn", scripts: ["test", "typecheck", "lint"] })).resolves.toMatchObject({
      setupCommands: ["yarn install"],
      validationCommands: ["yarn test", "yarn typecheck", "yarn lint"]
    });
    await expect(generate({ packageManager: "bun", scripts: ["test", "typecheck", "lint"] })).resolves.toMatchObject({
      setupCommands: ["bun install"],
      validationCommands: ["bun test", "bun run typecheck", "bun run lint"]
    });
  });

  test("orders validation commands as test, typecheck, lint", async () => {
    await expect(generate({ packageManager: "npm", scripts: ["lint", "typecheck", "test"] })).resolves.toMatchObject({
      validationCommands: ["npm test", "npm run typecheck", "npm run lint"]
    });
  });

  test("fails when no validation scripts exist", async () => {
    await expect(generate({ packageManager: "npm", scripts: ["build"] })).rejects.toThrow(/validation scripts/i);
  });

  test("fails when the project is unsupported", async () => {
    await expect(
      new GenerateProjectCommandsUseCase(new FakeProjectCommandDetector({
        supported: false,
        reason: "package.json not found"
      })).execute({ root: "/repo" })
    ).rejects.toThrow(/package\.json not found/i);
  });
});

async function generate(input: {
  readonly packageManager: "npm" | "pnpm" | "yarn" | "bun";
  readonly scripts: readonly string[];
}) {
  return new GenerateProjectCommandsUseCase(new FakeProjectCommandDetector({
    supported: true,
    ecosystem: "node",
    packageManager: input.packageManager,
    scripts: input.scripts,
    evidence: ["package.json", ...input.scripts.map((script) => `scripts.${script}`)]
  })).execute({ root: "/repo" });
}

class FakeProjectCommandDetector implements ProjectCommandDetectorPort {
  public constructor(private readonly detection: ProjectCommandDetection) {}

  public async detect(): Promise<ProjectCommandDetection> {
    return this.detection;
  }
}
