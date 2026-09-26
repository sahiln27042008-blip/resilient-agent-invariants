export interface WorkflowContext {
  executionId: string;
  workflow: string;
  currentState: string;
}

export interface CapabilityLease {
  capability: string;
  allowedResourceIds: string[];
  expiresAt: number;
}

export interface LeaseRequest {
  capability: string;
  reason: string;
  targetResourceId: string;
}

export class ActionPermissionBoundary {
  // 1. Static Workflow Capability Matrix
  private workflowMatrix: Record<string, Record<string, string[]>> = {
    CHURN_RECOVERY: {
      FIND_CUSTOMERS: ["crm.read"],
      VERIFY_BUG: ["crm.read", "bugtracker.read"],
      CHECK_BILLING: [], // Requires dynamic lease
      DRAFT_EMAIL: ["email.draft"],
      WAITING_FOR_APPROVAL: [], // Locked: zero execution permitted
      SEND_EMAIL: ["email.send"],
      CREATE_REPORT: ["github.create_issue"],
    },
  };

  // Active temporary leases: Map<"executionId:capability", Lease>
  private activeLeases = new Map<string, CapabilityLease>();

  // 2. The Core Authorization Bouncer (Runs BEFORE every tool call)
  public authorize(
    context: WorkflowContext,
    capability: string,
    targetResourceId?: string
  ): boolean {
    const allowedStatic =
      this.workflowMatrix[context.workflow]?.[context.currentState] || [];

    // Check static workflow state permissions
    if (allowedStatic.includes(capability)) {
      return true;
    }

    // Check dynamic ephemeral leases
    const leaseKey = `${context.executionId}:${capability}`;
    const lease = this.activeLeases.get(leaseKey);

    if (lease) {
      if (Date.now() > lease.expiresAt) {
        this.activeLeases.delete(leaseKey);
        throw new Error(`SecurityException: Lease for '${capability}' has expired.`);
      }

      if (targetResourceId && !lease.allowedResourceIds.includes(targetResourceId)) {
        throw new Error(
          `SecurityException: Lease for '${capability}' does not cover resource '${targetResourceId}'.`
        );
      }

      return true;
    }

    throw new Error(
      `PermissionDenied: Capability '${capability}' is forbidden in workflow state '${context.workflow}:${context.currentState}'.`
    );
  }

  // 3. Just-In-Time Capability Lease Request
  public requestLease(
    context: WorkflowContext,
    req: LeaseRequest,
    ttlMs = 300000 // 5 minutes default
  ): { status: "GRANTED" | "REQUIRES_APPROVAL" | "DENIED"; message: string } {
    // Hard security policies
    const forbiddenCapabilities = ["database.delete", "production.deploy", "admin.grant"];
    if (forbiddenCapabilities.includes(req.capability)) {
      console.warn(`[SECURITY ALERT] Agent attempted to request forbidden capability: ${req.capability}`);
      return { status: "DENIED", message: "Capability is permanently blocked by organization policy." };
    }

    // Safe read capabilities can be granted automatically within current scope
    if (req.capability === "billing.read" && context.currentState === "CHECK_BILLING") {
      const leaseKey = `${context.executionId}:${req.capability}`;
      this.activeLeases.set(leaseKey, {
        capability: req.capability,
        allowedResourceIds: [req.targetResourceId],
        expiresAt: Date.now() + ttlMs,
      });

      console.log(`[LEASE GRANTED] Scoped lease issued for '${req.capability}' on resource '${req.targetResourceId}'.`);
      return { status: "GRANTED", message: "Ephemeral scoped lease issued." };
    }

    return { status: "REQUIRES_APPROVAL", message: "Escalated to human supervisor." };
  }

  // 4. Human Approval as a Strict State Transition
  public approveTransition(
    context: WorkflowContext,
    fromState: string,
    toState: string
  ): void {
    if (context.currentState !== fromState) {
      throw new Error(
        `InvalidTransition: Cannot transition from '${context.currentState}'. Expected '${fromState}'.`
      );
    }

    context.currentState = toState;
    console.log(`[STATE TRANSITION] Workflow moved to '${toState}'. Capabilities updated.`);
  }

  // Revoke all temporary leases when moving between major workflow stages
  public revokeAllLeases(executionId: string): void {
    for (const key of this.activeLeases.keys()) {
      if (key.startsWith(`${executionId}:`)) {
        this.activeLeases.delete(key);
      }
    }
    console.log(`[LEASES REVOKED] All ephemeral capabilities wiped for execution: ${executionId}`);
  }
}
