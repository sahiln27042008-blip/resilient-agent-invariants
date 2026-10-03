/**
 * INVARIANT: Never hold a database connection across an asynchronous network boundary.
 * Acquire late, execute in <5ms, release immediately.
 *
 * Zero-dependency: the manager only needs an object with `connect()` returning a client
 * with `query()` and `release()`. A real `pg.Pool` satisfies this shape, so production code
 * can pass `new Pool()` directly; demos and tests can pass an in-memory pool.
 */
export interface LeasedClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
  release(): void;
}

export interface LeasePool {
  connect(): Promise<LeasedClient>;
}

export class ZeroHoldLeaseManager {
  constructor(private pool: LeasePool) {}

  /**
   * Scoped read: Leases connection, runs query, releases in <5ms.
   * Returns detached, immutable in-memory data before LLM streaming starts.
   */
  public async readDetached<T>(
    queryFn: (client: LeasedClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      // Fast in-and-out execution (1-3ms)
      const data = await queryFn(client);
      return data;
    } finally {
      // Connection returned to pool immediately
      client.release();
    }
  }

  /**
   * Scoped atomic write: Leases connection only AFTER streaming has completed.
   */
  public async writeAtomic(
    writeFn: (client: LeasedClient) => Promise<void>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await writeFn(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
