# Switch shop search to Lovable's Google Maps

## What changes
Shop search will use Lovable's managed Google Maps connection, so you no longer need your own Google key. Your daily cap of 40 searches stays the same, and so does the per-run limit of 50 shops to enrich. Each search is billed through Lovable. The workspace limit is 6,000 Google requests a day.

## Steps
1. You'll see a connection card. Choose "Managed by Lovable".
2. I'll change shop search to go through that connection. If you ever save your own key again, the app will use it only when the managed connection isn't linked.
3. I'll keep the plain-English messages that explain when Google refuses a request.
4. I'll update the shop search, lead enrichment and daily lead run, then run one test search (e.g. "card shop" near Bel Air, MD) and confirm shops come back.

## Technical details
- Link the google_maps connector, which gives GOOGLE_MAPS_API_KEY.
- In supabase/functions/_shared/leadgen.ts, change the Places helper to call https://connector-gateway.lovable.dev/google_maps/places/v1/... with the Authorization: Bearer LOVABLE_API_KEY and X-Connection-Api-Key headers. Keep the field masks and the 403 handling.
- Redeploy places-search, enrich-lead, lead-run and lead-import if they import the helper, then test once from the admin session.
