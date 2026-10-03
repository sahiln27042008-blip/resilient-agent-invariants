// Demonstrates how the lease manager keeps pool utilization at 0% while an LLM streams.
// Self-contained: uses an in-memory pool (2ms simulated query latency). No PostgreSQL needed.
// Run: npx ts-node patterns/zero-hold-leases/repro-test.ts
import { ZeroHoldLeaseManager, LeasePool, LeasedClient } from "./lease";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const POOL_SIZE = 10;
const QUERY_LATENCY_MS = 2;

class InMemoryPool implements LeasePool {
  public active = 0;
  public peak = 0;

  async connect(): Promise<LeasedClient> {
    this.active++;
    this.peak = Math.max(this.peak, this.active);
    console.log(`[DB POOL] Connection borrowed. Active: ${this.active}/${POOL_SIZE}`);
    return {
      query: async (sql: string) => {
        await sleep(QUERY_LATENCY_MS);
        return { sql, rows: [{ id: 1, plan: "enterprise" }] };
      },
      release: () => {
        this.active--;
        console.log(`[DB POOL] Connection released! Active: ${this.active}/${POOL_SIZE}`);
      },
    };
  }
}

async function main() {
  const pool = new InMemoryPool();
  const leases = new ZeroHoldLeaseManager(pool);

  console.log("=== STEP 1: READ DETACHED (simulated 2ms query) ===");
  const t0 = Date.now();
  const user = await leases.readDetached(async (c) => c.query("SELECT * FROM users WHERE id = 1"));
  console.log(`Read finished in ${Date.now() - t0}ms; detached rows:`, JSON.stringify((user as any).rows));

  console.log("\n=== STEP 2: STREAMING TOKENS (simulated, 300ms) ===");
  await sleep(300);
  const activeDuringStream = pool.active;
  console.log(`[DB POOL STATUS] Active connections while LLM streams: ${activeDuringStream}/${POOL_SIZE}`);
  console.log("...streaming tokens to client over HTTP...");

  console.log("\n=== STEP 3: ATOMIC WRITE (After stream finishes) ===");
  await leases.writeAtomic(async (c) => {
    await c.query("INSERT INTO generations (user_id) VALUES (1)");
  });

  if (activeDuringStream !== 0 || pool.active !== 0 || pool.peak !== 1) {
    console.error(`[FAILED] Invariant broken: active=${activeDuringStream}, peak=${pool.peak}`);
    process.exit(1);
  }
  console.log(`\n[VERIFIED] Core SaaS logins were never blocked during AI generation (peak connections held: ${pool.peak}, held during stream: 0).`);
}

main().catch((err) => {
  console.error("[DEMO FAILED]", err);
  process.exit(1);
});
