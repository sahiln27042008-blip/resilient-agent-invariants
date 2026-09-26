## Why Your AI Agents Keep Crashing the Entire Server

A try/catch block cannot stop an out-of-memory kill or a native segfault. Here is the 20-line child process fix that keeps paying users online when untrusted tools fail.

## Why Your AI Agents Keep Crashing the Entire Server (And the 20-Line Fix)

Your AI agent works fine when you test it alone. Then you put it in staging.
Suddenly, the whole web server freezes. Paying customers get kicked off. Active screen sessions drop. The health checks fail and reboot your machines.
The worst part? There is no clear error trace in your logs. The app just died.
Most teams think the model is acting crazy. They add another try-and-catch block to their code. They cross their fingers.
It fails again anyway.

## Here is why this keeps happening, what it costs your company, and how to fix it in 20 minutes without rebuilding your whole system.

## The Obvious Mistake: Trusting JavaScript to Catch Everything

Most agent tools run directly inside Node.js. Node.js is single-threaded (it only has one brain to do one task at a time).
When you build a tool that runs bash scripts, terminal commands, or file parsers, you usually write it like this:
Wrap the tool in a try-block. If it breaks, catch the error.
This works for simple code errors. But it does not work for the real operating system.
If an AI runs a bad shell command, uses too much memory, or triggers a segfault (a segmentation fault, which happens when broken code touches memory it is not allowed to touch), JavaScript is powerless.
The operating system kills the program immediately.

A try-block cannot stop this. The entire server dies on the spot.

## The Real Damage: Why This Hurts Your Business
When you let untrusted tools run in your main server, you create huge risks:

Blast Radius (How many people get hurt when one thing breaks) Your blast radius becomes one-to-many. If User A gives the agent a weird prompt that crashes a terminal tool, the entire server shuts down. User B, User C, and User D lose their active work too.

Lost Revenue and Broken Trust If your service drops paying users in the middle of their work, they leave. Your SLA (service level agreement, the legal promise of uptime you make to big enterprise clients) gets broken. That leads to refunds and lost deals.

The Event Loop Freeze Even if the tool does not crash, heavy work can freeze Node’s single thread. While the computer is stuck reading a massive file, it stops answering incoming web visits. Your servers look completely dead to the outside world.

Database Starvation Agents take a long time to think. They often wait 20 to 40 seconds for the model to stream words back. If your tool grabs a database connection before the model finishes thinking, that connection sits locked and unused. Ten active users can use up all one hundred connections in your database pool (the shared bucket of open database lines). Then your regular website cannot even load a login page.

# The Non-Obvious Fix: Process Isolation

You do not need to rewrite your entire backend. You do not need to switch languages.
You just need child process isolation (spawning a separate, walled-off helper program for dirty work).
Instead of running tools inside your main app, tell the operating system to create a child worker.
The main app and the child worker talk through an IPC pipe (inter-process communication, a private communication tube between two programs).

=========================================================
              MAIN APP (PARENT PROCESS)
=========================================================
  • Stays alive 100% of the time
  • Keeps user web sessions safe
  • Holds the database connections
=========================================================
                          |
                          | IPC Pipe
                          | (Sends task / Gets clean data)
                          v
=========================================================
            UNTRUSTED WORKER (CHILD PROCESS)
=========================================================
  • Runs the terminal commands and messy tools
  • If it crashes, segfaults, or runs out of RAM:
    ONLY THIS WORKER DIES. Main app stays online.
=========================================================

If the child crashes:

The child dies quietly.

The parent process notices the exit signal.

The parent writes down what happened and starts a brand-new child.

Not a single customer gets kicked off.

The Tactical Code: How to Set It Up in 20 Minutes

You only need two small files.
Step 1: The Worker File (worker.ts) This file runs the dangerous commands in its own sandbox.
===============================================================================================================================================================
import process from "node:process";

// Listen on the private pipe
process.on("message", async (task: { command: string }) => {
  try {
    // If the command is broken or crashes, only this child dies
    if (task.command === "BAD_CRASH") {
      process.abort(); // Simulates a hard crash that bypasses try/catch
    }

    // Normal safe work
    process.send?.({ ok: true, output: "Command completed safely" });
  } catch (err) {
    process.send?.({ ok: false, error: String(err) });
  }
});
===============================================================================================================================================================

Step 2: The Host Supervisor (supervisor.ts) This file runs on your main server. It guards your app and restarts the worker if it breaks.
=========================================================================================
import { fork, ChildProcess } from "node:child_process";
import { resolve } from "node:path";

class ToolSupervisor {
  private worker!: ChildProcess;

  constructor() {
    this.startWorker();
  }

  private startWorker() {
    // Spawn an isolated process
    this.worker = fork(resolve("./worker.ts"));

    // Watch for crashes
    this.worker.on("exit", (code, signal) => {
      console.warn("Worker died. Code:", code, "Signal:", signal);
      console.log("Main server is safe. Booting fresh worker...");
      this.startWorker();
    });
  }

  public runTool(command: string): Promise<any> {
    return new Promise((resolve) => {
      this.worker.once("message", resolve);
      this.worker.send({ command });
    });
  }
}

// How you use it in your app:
const tools = new ToolSupervisor();

// 1. Run a safe task
await tools.runTool("list-files");

// 2. A crashing task runs. 
// The child dies, the parent logs it, restarts the worker, and stays online.
tools.runTool("BAD_CRASH");
public runTool(command: string): Promise { return new Promise((resolve) => { this.worker.once(”message”, resolve); this.worker.send({ command }); }); } }

// How you use it in your app: const tools = new ToolSupervisor();

// 1. Run a safe task await tools.runTool(”list-files”);

// 2. A crashing task runs. 

// The child dies, the parent logs it, restarts the worker, and stays online. tools.runTool(”BAD_CRASH”);
===============================================================================================================================================================

## One Final Rule: Zero-Hold Leases

Never let an AI hold a database connection while waiting for a response.

The wrong way: Open database connection -> Ask AI what to do -> Wait 30 seconds -> Run query -> Close connection. This kills your database.

The right way: Ask AI what to do -> Wait 30 seconds -> Open database connection -> Run query in 5 milliseconds -> Close connection immediately.

Acquire late. Release early. Never hold shared resources while waiting for words to stream.

The Takeaway
Stop letting untrusted model tools touch your main server thread.

Wrap your shell runners in child processes. Trap the exit signals. Drop your database connections before the model starts thinking.

It takes less than an hour to set up, stops random staging crashes, and protects your customer experience from falling apart.
