import { createHash } from "node:crypto";

export interface ExecutionEvent {
  turn: number;
  type: "THOUGHT" | "TOOL_CALL" | "TOOL_RESULT" | "TERMINAL_OUTPUT";
  data: string;
}

export interface CompactedState {
  taskId: string;
  initialPrompt: string;
  committedMutations: Array<{ tool: string; params: string }>;
  finalOutput: string;
  totalTurns: number;
  bytesSavedEstimate: number;
}

export class CompactingCheckpointEngine {
  private hotEventLog: ExecutionEvent[] = [];
  private blobStorage: Map<string, string> = new Map(); // Simulates S3 object storage
  private mutations: Array<{ tool: string; params: string }> = [];

  constructor(private taskId: string, private initialPrompt: string) {}

  // Step 1: Offload payloads larger than 250 bytes using a Claim-Check pointer
  public recordPayload(turn: number, rawData: string): string {
    if (rawData.length > 250) {
      const hashTicket = createHash("sha256").update(rawData).digest("hex");
      
      // Store the large payload in cheap storage, not the database row
      this.blobStorage.set(hashTicket, rawData);
      
      const pointer = JSON.stringify({ claim_check: hashTicket, size_bytes: rawData.length });
      this.hotEventLog.push({ turn, type: "TOOL_RESULT", data: pointer });
      return pointer;
    }

    this.hotEventLog.push({ turn, type: "TOOL_RESULT", data: rawData });
    return rawData;
  }

  public recordThought(turn: number, thought: string): void {
    this.hotEventLog.push({ turn, type: "THOUGHT", data: thought });
  }

  public recordMutation(turn: number, tool: string, params: string): void {
    this.mutations.push({ tool, params });
    this.hotEventLog.push({
      turn,
      type: "TOOL_CALL",
      data: JSON.stringify({ tool, params }),
    });
  }

  // Step 2: Squash all intermediate thoughts down to an ultra-lean delta
  public finalizeAndCompact(finalOutput: string): CompactedState {
    const rawTotalBytes = this.hotEventLog.reduce((acc, ev) => acc + ev.data.length, 0);

    const compactedRecord: CompactedState = {
      taskId: this.taskId,
      initialPrompt: this.initialPrompt,
      committedMutations: this.mutations,
      finalOutput,
      totalTurns: this.hotEventLog.length,
      bytesSavedEstimate: Math.max(0, rawTotalBytes - JSON.stringify(this.mutations).length),
    };

    // Release intermediate hot memory completely
    this.hotEventLog = [];

    return compactedRecord;
  }

  // Fetch raw payload only when an audit specifically requests it
  public resolveClaimCheck(ticket: string): string | undefined {
    return this.blobStorage.get(ticket);
  }
}
