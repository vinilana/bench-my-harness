import type {
  AdapterCapabilityMatrix,
  AdapterCapabilityResolverPort
} from "../../../application/ports/adapter-capability-resolver-port.js";
import type { HarnessName } from "../../../application/ports/harness-runner-port.js";
import { claudeCodeCapabilities } from "./claude-code/claude-code-capabilities.js";
import { codexCapabilities } from "./codex/codex-capabilities.js";

export class StaticAdapterCapabilityResolver implements AdapterCapabilityResolverPort {
  public resolve(harness: HarnessName): AdapterCapabilityMatrix {
    return harness === "codex" ? codexCapabilities() : claudeCodeCapabilities();
  }
}
