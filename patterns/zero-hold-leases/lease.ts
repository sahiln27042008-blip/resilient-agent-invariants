import { Pool, PoolClient } from "pg";

/**
 * INVARIANT: Never hold a database connection across an asynchronous network boundary.
 * Acquire late, execute in <5ms, release immediately.
 */
export class ZeroHoldLeaseManager {
  constructor(private pool: Pool) {}

  /**
   * Scoped read: Leases connection, runs query, releases in <5ms.
   * Returns detached, immutable in-memory data before LLM streaming starts.
   */
  public async readDetached<T>(
    queryFn: (client: PoolClient) => Promise<T>
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
    writeFn: (client: PoolClient) => Promise<void>
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
