import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

function midpoint(low: number | null, high: number | null): number {
  const l = typeof low === "number" ? low : null;
  const h = typeof high === "number" ? high : null;
  if (l !== null && h !== null) return (l + h) / 2;
  return l ?? h ?? 0;
}

export default defineTool({
  name: "collection_summary",
  title: "Collection summary",
  description:
    "Summarize the signed-in collector's MyCollectAI portfolio: card count, estimated total value, graded/authenticated counts and a category breakdown.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input: Record<string, never>, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("cards")
      .select("category, estimated_value_low, estimated_value_high, is_authenticated, grade_numeric");

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const byCategory: Record<string, { count: number; value: number }> = {};
    let totalValue = 0;
    let authenticated = 0;
    let graded = 0;

    for (const row of rows) {
      const value = midpoint(row.estimated_value_low, row.estimated_value_high);
      totalValue += value;
      if (row.is_authenticated) authenticated += 1;
      if (typeof row.grade_numeric === "number") graded += 1;
      const key = row.category ?? "Uncategorized";
      byCategory[key] ??= { count: 0, value: 0 };
      byCategory[key].count += 1;
      byCategory[key].value += value;
    }

    const summary = {
      totalCards: rows.length,
      estimatedTotalValueUsd: Math.round(totalValue * 100) / 100,
      authenticatedCards: authenticated,
      gradedCards: graded,
      byCategory,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
