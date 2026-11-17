// When the agent may act on its own and when it needs a person. Pure functions, no I/O.

export type AutonomyMode = "manual" | "semi" | "full";
/** chat = an admin is giving the command; schedule/job = the agent is working alone */
export type Trigger = "chat" | "schedule" | "job";

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
  /** emergency stop */
  paused: boolean;
  trigger: Trigger;
}

export function decide(p: PolicyInput): Decision {
  const alone = p.trigger !== "chat";

  if (INTERNAL.includes(p.action)) return p.paused && alone ? "blocked" : "allow";

  // An admin asking in chat authorizes brand edits directly; the agent alone never does.
  if (p.action === "update_brand") return alone ? "needs_approval" : "allow";

  // While stopped, nothing reaches a platform on its own; from chat it waits for approval.
  if (p.paused) return alone ? "blocked" : "needs_approval";

  // Sensitive actions always need a person, in every mode.
  if (p.action === "reply_sensitive" || p.action === "delete_content") return "needs_approval";

  switch (p.mode) {
    case "manual":
      return "needs_approval";
    case "semi":
      // Scheduling and ordinary replies run; publishing anything not yet approved waits.
      return p.action === "publish_post" ? "needs_approval" : "allow";
    case "full":
      return "allow";
  }
}

export function budgetBlockReason(costUsd: number, budgetUsd: number): string | null {
  return costUsd >= budgetUsd
    ? `Εξαντλήθηκε το μηνιαίο όριο κόστους AI ($${budgetUsd}). Αύξησέ το στις Ρυθμίσεις αν χρειάζεται.`
    : null;
}
