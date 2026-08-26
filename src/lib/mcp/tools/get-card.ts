import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_card",
  title: "Get card details",
  description:
    "Fetch full details for one card in the signed-in collector's collection, including AI analysis, grading info and market comps.",
  inputSchema: {
    card_id: z.string().uuid().describe("The card's id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ card_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("cards")
      .select(
        "id, card_name, card_set, card_year, edition, category, rarity, special_features, condition_grade, grading_company, grade_numeric, grading_cert_number, is_authenticated, authenticated_at, estimated_value_low, estimated_value_high, ebay_recent_sales, tcgplayer_price, ai_analysis, analysis_status, notes, paired_raw_card_id, created_at, updated_at",
      )
      .eq("id", card_id)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return { content: [{ type: "text", text: "No card found with that id." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { card: data },
    };
  },
});
