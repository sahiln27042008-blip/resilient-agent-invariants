import { fork, ChildProcess } from "node:child_process";
import { resolve } from "node:path";

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutTimer: NodeJS.Timeout;
}

export class ToolSupervisor {
  private worker!: ChildProcess;
  private pendingTasks = new Map<string, PendingTask>();
  private workerScriptPath: string;

  constructor(workerScriptPath = resolve(__dirname, "./worker.ts")) {
    this.workerScriptPath = workerScriptPath;
    this.spawnWorker();
  }

  private spawnWorker(): void {
    // Spawn an isolated Node runtime communicating over native IPC
    this.worker = fork(this.workerScriptPath, {
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      execArgv: ["-r", "ts-node/register"], // Direct TypeScript execution support
    });

    // Handle messages returned from child
    this.worker.on("message", (msg: { id: string; ok: boolean; result?: unknown; error?: string }) => {
      const task = this.pendingTasks.get(msg.id);
      if (!task) return;

      clearTimeout(task.timeoutTimer);
      this.pendingTasks.delete(msg.id);

      if (msg.ok) {
        task.resolve(msg.result);
      } else {
        task.reject(new Error(msg.error));
      }
    });

    // Trap hard OS crashes (SIGSEGV, SIGABRT, SIGKILL)
    this.worker.on("exit", (code, signal) => {
      console.warn(`[SUPERVISOR] Worker died! PID=${this.worker.pid} ExitCode=${code} Signal=${signal}`);

      // Reject all pending tasks in the dying worker
      for (const [id, task] of this.pendingTasks.entries()) {
        clearTimeout(task.timeoutTimer);
        task.reject(
          new Error(`WorkerProcessTerminated: Task ${id} failed due to process crash (${signal || code})`)
        );
      }
      this.pendingTasks.clear();

      // Immediately respawn fresh worker
      console.log("[SUPERVISOR] Parent server intact. Booting fresh worker sandbox...");
      this.spawnWorker();
    });
  }

  public runTool(command: string, timeoutMs = 5000): Promise<unknown> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.pendingTasks.delete(id);
        // If a task hangs the thread indefinitely, kill the child process
        this.worker.kill("SIGKILL");
        reject(new Error(`TimeoutError: Task ${command} exceeded ${timeoutMs}ms limit.`));
      }, timeoutMs);

      this.pendingTasks.set(id, { resolve, reject, timeoutTimer });
      this.worker.send({ id, command });
    });
  }

  public destroy(): void {
    this.worker.kill("SIGTERM");
  }
}
