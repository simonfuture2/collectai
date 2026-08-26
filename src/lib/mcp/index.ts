import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCards from "./tools/list-cards";
import getCard from "./tools/get-card";
import collectionSummary from "./tools/collection-summary";
import updateCardNotes from "./tools/update-card-notes";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "collector-s-insight",
  title: "Collector's Insight",
  version: "0.1.0",
  instructions:
    "Tools for MyCollectAI, a trading card scanning, grading and valuation app. Use `collection_summary` for portfolio totals, `list_cards` to browse or search the collection, `get_card` for full details including AI grading and market comps, and `update_card_notes` to edit a card's notes. All tools act as the signed-in collector.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [collectionSummary, listCards, getCard, updateCardNotes],
});
