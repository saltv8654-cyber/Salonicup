// Who may do what, and when the agent needs a human. Pure functions, no I/O.

export type MemberRole = "owner" | "admin" | "editor" | "viewer";
export type AutonomyMode = "manual" | "semi" | "full";
export type Trigger = "chat" | "schedule" | "job";

const RANK: Record<MemberRole, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 };
export const hasRole = (role: MemberRole | null | undefined, min: MemberRole) =>
  !!role && RANK[role] >= RANK[min];

/**
 * internal  – only touches our own database (drafts, memory, plans).
 * external  – does something visible on a social platform.
 * sensitive – external and risky (crisis replies, deletions) or changes brand rules.
 */
export type ActionKind =
  | "create_draft"
  | "save_memory"
  | "plan_campaign"
  | "update_brand"
  | "schedule_post"
  | "publish_post"
  | "reply_comment"
  | "reply_sensitive"
  | "delete_content";

export type Decision = "allow" | "needs_approval" | "blocked";

const INTERNAL: ActionKind[] = ["create_draft", "save_memory", "plan_campaign"];

export interface PolicyInput {
  action: ActionKind;
  mode: AutonomyMode;
  /** business-level emergency stop */
  paused: boolean;
  /** organization kill switch (billing, abuse, owner decision) */
  orgEnabled: boolean;
  trigger: Trigger;
  /** role of the human who started this run (chat), null for scheduled runs */
  userRole: MemberRole | null;
}

export function decide(p: PolicyInput): Decision {
  if (!p.orgEnabled) return "blocked";
  if (p.trigger === "chat" && !hasRole(p.userRole, "editor")) return "blocked";

  if (INTERNAL.includes(p.action)) {
    // Even internal work stops while paused if nobody is at the keyboard.
    return p.paused && p.trigger !== "chat" ? "blocked" : "allow";
  }

  // A human asking in chat authorizes brand edits directly; the agent alone never does.
  if (p.action === "update_brand") return p.trigger === "chat" ? "allow" : "needs_approval";

  // Anything that reaches a platform while paused waits for a person.
  if (p.paused) return p.trigger === "chat" ? "needs_approval" : "blocked";

  // Sensitive actions always need a person, in every mode.
  if (p.action === "reply_sensitive" || p.action === "delete_content") return "needs_approval";

  switch (p.mode) {
    case "manual":
      return "needs_approval";
    case "semi":
      // Scheduling and ordinary replies run; the actual publish of anything not yet approved waits.
      return p.action === "publish_post" ? "needs_approval" : "allow";
    case "full":
      return "allow";
  }
}

/** Can autonomous (scheduled) work start at all for this business right now? */
export function canRunAutonomously(opts: { orgEnabled: boolean; paused: boolean }): boolean {
  return opts.orgEnabled && !opts.paused;
}

export interface UsageState {
  costUsd: number;
  runs: number;
  budgetUsd: number;
  maxRuns: number;
}
export function usageBlockReason(u: UsageState): string | null {
  if (u.costUsd >= u.budgetUsd) return `Εξαντλήθηκε ο μηνιαίος προϋπολογισμός AI ($${u.budgetUsd}).`;
  if (u.runs >= u.maxRuns) return `Εξαντλήθηκαν οι μηνιαίες εκτελέσεις του agent (${u.maxRuns}).`;
  return null;
}
