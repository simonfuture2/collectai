export const ATTENTION_INTENTS = ["interested", "question"];

export const sevenDaysAgo = (now = Date.now()) => new Date(now - 7 * 86400000).toISOString();

export function needsReplyAttention(lead: { reply_intent: string | null; replied_at: string | null }, now = Date.now()) {
  if (!lead.replied_at || !lead.reply_intent) return false;
  return ATTENTION_INTENTS.includes(lead.reply_intent) && Date.parse(lead.replied_at) >= Date.parse(sevenDaysAgo(now));
}

export function newestRepliedLeads<T extends { replied_at: string | null }>(leads: T[]): T[] {
  return leads.filter((lead) => lead.replied_at !== null)
    .sort((a, b) => Date.parse(b.replied_at ?? "") - Date.parse(a.replied_at ?? ""));
}

export function countedRecentReply(reply: { intent: string | null; received_at: string }, now = Date.now()) {
  return reply.intent !== "auto_reply" && Date.parse(reply.received_at) >= Date.parse(sevenDaysAgo(now));
}

export const gmailReplyUrl = (email: string) => `https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(email)}`;