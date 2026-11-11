// Admin area sections. Every section has a #hash so it can be bookmarked.
export type AdminAccess = "admin" | "agent" | "either";

export interface AdminSection {
  id: string;
  label: string;
  group: "Overview" | "Outreach" | "Users" | "Growth" | "Data";
  access: AdminAccess;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: "overview", label: "Overview", group: "Overview", access: "either" },
  { id: "inbox", label: "Inbox", group: "Outreach", access: "agent" },
  { id: "leads", label: "Leads", group: "Outreach", access: "agent" },
  { id: "sequences", label: "Sequences & drips", group: "Outreach", access: "either" },
  { id: "broadcasts", label: "Broadcasts", group: "Outreach", access: "either" },
  { id: "templates", label: "Templates", group: "Outreach", access: "either" },
  { id: "channels", label: "Channels", group: "Outreach", access: "agent" },
  { id: "users", label: "Users", group: "Users", access: "admin" },
  { id: "transactions", label: "Transactions", group: "Users", access: "admin" },
  { id: "beta", label: "Beta", group: "Users", access: "admin" },
  { id: "beta-audit", label: "Beta audit", group: "Users", access: "admin" },
  { id: "admins", label: "Admins", group: "Users", access: "admin" },
  { id: "funnel", label: "Funnel", group: "Growth", access: "agent" },
  { id: "results", label: "Results", group: "Growth", access: "agent" },
  { id: "partners", label: "Partners", group: "Growth", access: "agent" },
  { id: "videos", label: "Videos", group: "Growth", access: "agent" },
  { id: "push", label: "Push", group: "Growth", access: "admin" },
  { id: "accuracy", label: "Match accuracy", group: "Data", access: "admin" },
  { id: "lab", label: "Price Check Lab", group: "Data", access: "admin" },
  { id: "pc-data", label: "PriceCharting data", group: "Data", access: "admin" },
  { id: "bakeoff", label: "ID bake-off", group: "Data", access: "admin" },
];

export const ADMIN_GROUPS = ["Overview", "Outreach", "Users", "Growth", "Data"] as const;

// Old tab names and bookmarks that should still land somewhere sensible.
const ALIASES: Record<string, string> = {
  queue: "inbox", campaigns: "broadcasts", drips: "sequences", "pc-purge": "pc-data",
  "price-check-lab": "lab", "id-bakeoff": "bakeoff", agent: "inbox",
};

export function canSee(section: AdminSection, a: { isAdmin: boolean; isAgentAdmin: boolean }): boolean {
  if (section.access === "admin") return a.isAdmin;
  if (section.access === "agent") return a.isAgentAdmin;
  return a.isAdmin || a.isAgentAdmin;
}

export function visibleSections(a: { isAdmin: boolean; isAgentAdmin: boolean }): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => canSee(s, a));
}

/** Turn a URL hash into a section the user may open; falls back to the first visible one. */
export function sectionFromHash(hash: string, a: { isAdmin: boolean; isAgentAdmin: boolean }): string {
  const raw = decodeURIComponent(String(hash || "").replace(/^#/, "")).trim().toLowerCase();
  const id = ALIASES[raw] ?? raw;
  const visible = visibleSections(a);
  return visible.find((s) => s.id === id)?.id ?? visible[0]?.id ?? "overview";
}

/** Old admin paths now open inside the shell. */
export const LEGACY_ADMIN_PATHS: Record<string, string> = {
  "/admin/agent": "/admin#inbox",
  "/admin/price-check-lab": "/admin#lab",
  "/admin/id-bakeoff": "/admin#bakeoff",
};

export const LEAD_STAGES = [
  "new", "researched", "in_sequence", "replied", "meeting_booked", "partner_onboarding",
  "active_partner", "signed_up", "not_interested", "do_not_contact",
] as const;
