import { createHash } from "node:crypto";

export interface StepOptions {
  idempotencyKey?: string;
  maxRetries?: number;
}

export interface CheckpointRecord {
  status: "COMPLETED" | "FAILED";
  result: unknown;
  isArtifact: boolean;
  completedAt: string;
}

export class DurableStepEngine {
  // In-memory or file-backed key-value state store
  private stateStore = new Map<string, CheckpointRecord>();
  private artifactStore = new Map<string, string>(); // Simulates S3

  constructor(private executionId: string) {}

  /**
   * Wraps an execution boundary. If the step completed in a previous attempt,
   * it returns the saved output instantly with ZERO compute or model calls.
   */
  public async step<T>(
    stepName: string,
    action: (idempotencyKey: string) => Promise<T>,
    options: StepOptions = {}
  ): Promise<T> {
    const stepKey = `${this.executionId}:${stepName}`;
    const idKey = options.idempotencyKey || `${stepKey}:default_idempotency`;

    // 1. RECOVERY CHECK: Did this step already succeed?
    const existing = this.stateStore.get(stepKey);
    if (existing && existing.status === "COMPLETED") {
      console.log(`[CACHE HIT] Step '${stepName}' already verified. Skipping execution.`);
      
      if (existing.isArtifact) {
        const raw = this.artifactStore.get(existing.result as string)!;
        return JSON.parse(raw) as T;
      }
      return existing.result as T;
    }

    // 2. FORWARD EXECUTION
    console.log(`[EXECUTE] Running step '${stepName}' (IdempotencyKey: ${idKey.slice(0, 16)}...)...`);
    
    let attempts = 0;
    const maxRetries = options.maxRetries ?? 1;

    while (attempts < maxRetries) {
      try {
        attempts++;
        const result = await action(idKey);

        // 3. PERSISTENCE BOUNDARY: Offload artifacts > 250 bytes
        const serialized = JSON.stringify(result);
        if (serialized.length > 250) {
          const artifactSha = createHash("sha256").update(serialized).digest("hex");
          this.artifactStore.set(artifactSha, serialized);

          this.stateStore.set(stepKey, {
            status: "COMPLETED",
            result: artifactSha,
            isArtifact: true,
            completedAt: new Date().toISOString(),
          });
        } else {
          this.stateStore.set(stepKey, {
            status: "COMPLETED",
            result,
            isArtifact: false,
            completedAt: new Date().toISOString(),
          });
        }

        return result;
      } catch (err: any) {
        console.warn(`[RETRY] Step '${stepName}' failed attempt ${attempts}/${maxRetries}: ${err.message}`);
        if (attempts >= maxRetries) {
          this.stateStore.set(stepKey, {
            status: "FAILED",
            result: err.message,
            isArtifact: false,
            completedAt: new Date().toISOString(),
          });
          throw err;
        }
      }
    }

    throw new Error(`Step '${stepName}' exhausted retry budget.`);
  }

  // Exports internal state ledger for cold disk / database persistence
  public dumpState(): string {
    return JSON.stringify({
      states: Array.from(this.stateStore.entries()),
      artifacts: Array.from(this.artifactStore.entries()),
    });
  }

  // Hydrates runtime state on worker restart
  public loadState(rawJson: string): void {
    const parsed = JSON.parse(rawJson);
    this.stateStore = new Map(parsed.states);
    this.artifactStore = new Map(parsed.artifacts);
  }
}
