import { createHash } from "node:crypto";

export type OperationStatus = "PROCESSING" | "COMPLETED" | "FAILED" | "UNKNOWN";

export interface IdempotencyRecord<T = unknown> {
  key: string;
  fingerprint: string;
  status: OperationStatus;
  response?: T;
  error?: string;
  lockedUntil: number;
  createdAt: number;
}

export interface GuardrailOptions {
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  lockTtlMs?: number;
}

export interface ExternalError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

// ---------------------------------------------------------------------------
// 1. CANONICAL JSON NORMALIZER
// ---------------------------------------------------------------------------
// Ensures that { a: 1, b: 2 } and { b: 2, a: 1 } produce the EXACT same hash.
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJson).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJson((obj as Record<string, unknown>)[key])}`
  );
  return "{" + pairs.join(",") + "}";
}

// ---------------------------------------------------------------------------
// 2. INDUSTRIAL CIRCUIT BREAKER
// ---------------------------------------------------------------------------
export class CircuitBreaker {
  private failureThreshold = 5;
  private recoveryTimeMs = 30000;
  private failureCount = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private lastStateChange = Date.now();

  public canExecute(): boolean {
    const now = Date.now();
    if (this.state === "OPEN") {
      if (now - this.lastStateChange > this.recoveryTimeMs) {
        this.state = "HALF_OPEN";
        this.lastStateChange = now;
        return true;
      }
      return false;
    }
    return true;
  }

  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  public recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.lastStateChange = Date.now();
      console.warn(`[CIRCUIT BREAKER] Threshold breached. Circuit flipped to OPEN.`);
    }
  }

  public getState(): string {
    return this.state;
  }
}

// ---------------------------------------------------------------------------
// 3. PERSISTENT LEDGER STORE (Simulates Redis / PostgreSQL Atomic Operations)
// ---------------------------------------------------------------------------
export class DistributedLedgerStore {
  private records = new Map<string, IdempotencyRecord>();

  // Atomic test-and-set primitive (Maps to Redis: SET key val NX PX ttl)
  public async acquireLock(
    key: string,
    fingerprint: string,
    lockTtlMs: number
  ): Promise<{ acquired: boolean; existingRecord?: IdempotencyRecord }> {
    const now = Date.now();
    const existing = this.records.get(key);

    if (existing) {
      // Check if locked and valid
      if (existing.status === "PROCESSING" && existing.lockedUntil > now) {
        return { acquired: false, existingRecord: existing };
      }
      // If completed or failed cleanly, lock cannot be stolen
      if (existing.status === "COMPLETED") {
        return { acquired: false, existingRecord: existing };
      }
    }

    // Acquire or take over expired lock
    const record: IdempotencyRecord = {
      key,
      fingerprint,
      status: "PROCESSING",
      lockedUntil: now + lockTtlMs,
      createdAt: now,
    };
    this.records.set(key, record);
    return { acquired: true, existingRecord: record };
  }

  public async commit(key: string, response: unknown): Promise<void> {
    const existing = this.records.get(key);
    if (!existing) throw new Error(`Invariant Error: Record ${key} disappeared during commit.`);

    existing.status = "COMPLETED";
    existing.response = response;
    existing.lockedUntil = 0;
    this.records.set(key, existing);
  }

  public async markFailed(key: string, errorMessage: string): Promise<void> {
    const existing = this.records.get(key);
    if (existing) {
      existing.status = "FAILED";
      existing.error = errorMessage;
      existing.lockedUntil = 0;
      this.records.set(key, existing);
    }
  }

  public async markUnknown(key: string): Promise<void> {
    const existing = this.records.get(key);
    if (existing) {
      existing.status = "UNKNOWN";
      existing.lockedUntil = 0;
      this.records.set(key, existing);
    }
  }

  public async get(key: string): Promise<IdempotencyRecord | undefined> {
    return this.records.get(key);
  }
}

// ---------------------------------------------------------------------------
// 4. CORE IDEMPOTENT NETWORK GATEWAY
// ---------------------------------------------------------------------------
export class ResilientNetworkGateway {
  private circuitBreaker = new CircuitBreaker();

  constructor(
    private store: DistributedLedgerStore,
    private reconciliationQueue: Array<{ key: string; runId: string; stepId: string }> = []
  ) {}

  // Error Classification Matrix
  private classifyError(err: ExternalError): { retryable: boolean; isTransient: boolean } {
    const status = err.status || err.statusCode;
    
    // Explicit Permanent Failures: Must Fail-Fast
    if (status && status >= 400 && status < 500 && status !== 429) {
      return { retryable: false, isTransient: false };
    }

    // Explicit Transient Failures
    if (status === 429 || status === 502 || status === 503 || status === 504) {
      return { retryable: true, isTransient: true };
    }

    // Socket Level Transient Errors
    if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.code === "EAI_AGAIN") {
      return { retryable: true, isTransient: true };
    }

    // Unknown errors default to non-retryable for safety
    return { retryable: false, isTransient: false };
  }

  // Full Jitter Backoff Algorithm (Prevents Thundering Herd)
  // formula: sleep = rand(0, min(maxBackoff, baseBackoff * 2 ^ attempt))
  private calculateJitterBackoff(attempt: number, baseMs: number, maxMs: number): number {
    const exponential = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    return Math.floor(Math.random() * exponential);
  }

  public async executeMutation<TInput extends Record<string, unknown>, TOutput>(
    executionId: string,
    stepId: string,
    payload: TInput,
    action: (idempotencyHeader: string) => Promise<TOutput>,
    options: GuardrailOptions = {}
  ): Promise<TOutput> {
    const maxRetries = options.maxRetries ?? 3;
    const baseBackoffMs = options.baseBackoffMs ?? 100;
    const maxBackoffMs = options.maxBackoffMs ?? 2000;
    const lockTtlMs = options.lockTtlMs ?? 30000;

    // 1. Calculate deterministic composite key & canonical payload hash
    const canonicalPayload = canonicalizeJson(payload);
    const fingerprint = createHash("sha256").update(canonicalPayload).digest("hex");
    const stableKey = `idem:${executionId}:${stepId}`;

    // 2. Probe Ledger & Acquire Distributed Mutex
    const { acquired, existingRecord } = await this.store.acquireLock(stableKey, fingerprint, lockTtlMs);

    if (!acquired && existingRecord) {
      if (existingRecord.status === "COMPLETED") {
        console.log(`[IDEMPOTENCY CACHE HIT] Step '${stepId}' already finalized. Returning cached receipt.`);
        return existingRecord.response as TOutput;
      }

      if (existingRecord.status === "PROCESSING") {
        throw new Error(
          `ConcurrencyLockError: Step '${stepId}' is currently being executed by another worker node.`
        );
      }
    }

    // 3. Inspect Upstream Health via Circuit Breaker
    if (!this.circuitBreaker.canExecute()) {
      throw new Error(`CircuitBreakerOpenError: Downstream dependency is degraded. Call halted.`);
    }

    // 4. Bounded Forward Execution Loop
    let attempt = 0;
    let lastError: ExternalError | null = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[GATEWAY EXECUTE] Attempt ${attempt}/${maxRetries} for '${stepId}' (Key: ${stableKey})`);

        // Forward request with deterministic idempotency header
        const response = await action(stableKey);

        // Success Path: Commit record to ledger & notify circuit breaker
        await this.store.commit(stableKey, response);
        this.circuitBreaker.recordSuccess();
        return response;

      } catch (err: any) {
        lastError = err;
        this.circuitBreaker.recordFailure();

        const { retryable, isTransient } = this.classifyError(err);

        console.warn(`[GATEWAY ERROR] Attempt ${attempt} failed: ${err.message} (Retryable: ${retryable})`);

        // Fail-Fast: Do not burn compute or retries on permanent errors
        if (!retryable) {
          await this.store.markFailed(stableKey, err.message);
          throw new Error(`FatalPermanentException: Action rejected with status ${err.status}: ${err.message}`);
        }

        if (attempt >= maxRetries) {
          break;
        }

        // Apply Full Jitter Backoff
        const backoff = this.calculateJitterBackoff(attempt, baseBackoffMs, maxBackoffMs);
        console.log(`[BACKOFF] Sleeping for ${backoff}ms to prevent network storms...`);
        await new Promise((res) => setTimeout(res, backoff));
      }
    }

    // 5. UNKNOWN STATE ESCALATION: Retries exhausted under transient dropped sockets
    console.error(`[CRITICAL] Retries exhausted for step '${stepId}'. Escalating to background reconciliation.`);
    await this.store.markUnknown(stableKey);
    
    // Push to asynchronous reconciliation queue
    this.reconciliationQueue.push({ key: stableKey, runId: executionId, stepId });

    throw new Error(
      `AmbiguousExecutionState: Step '${stepId}' dropped connection. Enqueued for active background reconciliation.`
    );
  }

  // -------------------------------------------------------------------------
  // 5. BACKGROUND TWO-PHASE RECONCILIATION WORKER
  // -------------------------------------------------------------------------
  // Checks external system truth when an execution outcome is marked UNKNOWN
  public async runReconciliationWorker(
    statusCheckFn: (key: string) => Promise<{ exists: boolean; receipt?: unknown }>
  ): Promise<void> {
    while (this.reconciliationQueue.length > 0) {
      const task = this.reconciliationQueue.shift()!;
      console.log(`\n[RECONCILIATION WORKER] Reconciling ambiguous state for: ${task.key}`);

      try {
        const check = await statusCheckFn(task.key);
        if (check.exists) {
          console.log(`[RECONCILIATION SUCCESS] Remote operation confirmed committed. Resolving ledger.`);
          await this.store.commit(task.key, check.receipt);
        } else {
          console.log(`[RECONCILIATION NOTICE] Remote operation confirmed nonexistent. Marking failed for safe retry.`);
          await this.store.markFailed(task.key, "Reconciliation verified operation did not commit.");
        }
      } catch (err: any) {
        console.error(`[RECONCILIATION RETRY] Failed to check status on remote endpoint: ${err.message}`);
        this.reconciliationQueue.push(task); // Re-queue
        break;
      }
    }
  }
}
