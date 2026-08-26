import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const COLUMNS =
  "id, card_name, card_set, card_year, category, rarity, condition_grade, grading_company, grade_numeric, is_authenticated, estimated_value_low, estimated_value_high, analysis_status, created_at";

export default defineTool({
  name: "list_cards",
  title: "List collection cards",
  description:
    "List cards in the signed-in collector's MyCollectAI collection, optionally filtered by name/set text or category.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Text to match against card name or set."),
    category: z.string().trim().min(1).optional().describe("Category filter, e.g. Pokémon or Sports."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum number of cards to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("cards")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    if (category) query = query.ilike("category", `%${category}%`);
    if (search) query = query.or(`card_name.ilike.%${search}%,card_set.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { cards: data ?? [], count: data?.length ?? 0 },
    };
  },
});
