export interface PendingRequest<TInput, TOutput> {
  id: string;
  payload: TInput;
  resolve: (value: TOutput) => void;
  reject: (reason: unknown) => void;
}

export class ResilientBatchGateway<TInput, TOutput> {
  private queue: Array<PendingRequest<TInput, TOutput>> = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private executeBulk: (items: TInput[]) => Promise<TOutput[]>,
    private executeSingle: (item: TInput) => Promise<TOutput>,
    private maxBatchSize = 20,
    private maxWaitMs = 40
  ) {}

  public execute(payload: TInput): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      const id = "req_" + Math.random().toString(36).substring(2, 9);
      this.queue.push({ id, payload, resolve, reject });

      if (this.queue.length >= this.maxBatchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const batch = this.queue.splice(0, this.maxBatchSize);
    if (batch.length === 0) return;

    try {
      // Attempt the bulk operation first
      const payloads = batch.map((entry) => entry.payload);
      const results = await this.executeBulk(payloads);

      // De-multiplex results to individual pending agent promises
      batch.forEach((entry, index) => {
        entry.resolve(results[index]);
      });
    } catch (bulkError) {
      console.warn("[BATCH GATEWAY] Bulk request rejected. Initiating dynamic unrolling...");

      // Dynamic Unrolling: isolate the poison pill by executing items individually in parallel
      await Promise.all(
        batch.map(async (entry) => {
          try {
            const singleResult = await this.executeSingle(entry.payload);
            entry.resolve(singleResult);
          } catch (singleError) {
            // Only the invalid record fails; other agents stay unharmed
            entry.reject(singleError);
          }
        })
      );
    }
  }
}
