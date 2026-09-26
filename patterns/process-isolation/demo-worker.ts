import process from "node:process";

export interface TaskMessage {
  id: string;
  command: string;
  payload?: Record<string, unknown>;
}

// Listen on the isolated IPC channel
process.on("message", async (task: TaskMessage) => {
  try {
    // 1. Simulate a catastrophic failure that bypasses JavaScript try/catch
    if (task.command === "HARD_CRASH") {
      // process.abort() raises SIGABRT at the C++ runtime level
      process.abort();
    }

    // 2. Simulate CPU-heavy blocking work
    if (task.command === "HEAVY_COMPUTE") {
      let count = 0;
      for (let i = 0; i < 1e7; i++) count += i;
      process.send?.({ id: task.id, ok: true, result: `Computed: ${count}` });
      return;
    }

    // 3. Normal safe execution
    process.send?.({ id: task.id, ok: true, result: `Executed: ${task.command}` });
  } catch (err) {
    process.send?.({ id: task.id, ok: false, error: String(err) });
  }
});  
