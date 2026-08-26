import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_card_notes",
  title: "Update card notes",
  description: "Set the personal notes on one card in the signed-in collector's collection.",
  inputSchema: {
    card_id: z.string().uuid().describe("The card's id."),
    notes: z.string().max(2000).describe("New notes text. Pass an empty string to clear the notes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ card_id, notes }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("cards")
      .update({ notes: notes.length ? notes : null })
      .eq("id", card_id)
      .eq("user_id", ctx.getUserId())
      .select("id, card_name, notes")
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return { content: [{ type: "text", text: "No card found with that id." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { card: data },
    };
  },
});
