import { createHash } from "node:crypto";

export interface CompensationStep {
  name: string;
  undo: () => Promise<void>;
}

export class SagaCoordinator {
  private stack: CompensationStep[] = [];
  private isCompensating = false;

  constructor(private runId: string) {}

  // Rule 3: Deterministic Idempotency Key Generation
  public generateIdempotencyKey(stepName: string, payload: Record<string, unknown>): string {
    const raw = `${this.runId}:${stepName}:${JSON.stringify(payload)}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  // Rule 1 & 2: Pair action with inverse and push to LIFO stack
  public async runStep<T>(
    name: string,
    action: () => Promise<T>,
    undo: () => Promise<void>
  ): Promise<T> {
    if (this.isCompensating) {
      throw new Error(`SagaAbortedError: Cannot execute '${name}'. Saga is rolling back.`);
    }

    try {
      const result = await action();
      // Push compensation to stack only after forward action succeeds
      this.stack.push({ name, undo });
      return result;
    } catch (err) {
      console.error(`\n[!] Forward step failed: '${name}'. Triggering LIFO rollback...`);
      await this.rollback();
      throw err;
    }
  }

  // Rule 2: Execute rollbacks in strict reverse (LIFO) order
  private async rollback(): Promise<void> {
    this.isCompensating = true;

    while (this.stack.length > 0) {
      const step = this.stack.pop()!;
      try {
        console.log(`[-] Executing compensation: '${step.name}'`);
        await step.undo();
      } catch (undoErr) {
        // Critical: Log to dead-letter queue / alerting service
        console.error(`[FATAL] Compensation failed for step '${step.name}':`, undoErr);
      }
    }

    console.log("[+] Rollback complete. Distributed state sanitized.");
  }
}
