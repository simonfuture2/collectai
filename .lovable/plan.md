# Fix the "Google refused the search" error in shop search

## What's happening
Shop search (Admin → Lead finding → Places) uses your own Google key, saved as GOOGLE_PLACES_API_KEY. Google is turning that key away because "Places API (New)" isn't switched on for it. Nothing in the app is broken. This is a setting in your Google Cloud account.

## Option A: fix your key (about 5 minutes, done by you)
1. Go to console.cloud.google.com and pick the project that owns the key.
2. Open APIs & Services → Library. Search for **"Places API (New)"** and click **Enable**. The older "Places API" is a different product and won't work.
3. Make sure billing is turned on for that project. Google requires it, even for free-tier use.
4. Open APIs & Services → Credentials and click the key. Then:
   - Under **API restrictions**, either pick "Don't restrict key" or add "Places API (New)" to the allowed list.
   - Under **Application restrictions**, choose "None" or "IP addresses". "Websites" blocks every request coming from our backend.
5. Save and wait 2 to 5 minutes. Then tell me, and I'll run a test search and confirm results come back.

## Option B: use Lovable's managed Google Maps connection instead
- You don't need a Google account or key. Lovable supplies the key.
- I'd change shop search to go through that connection. Your daily cap of 40 searches stays, and the workspace limit is 6,000 Google requests a day.
- Google charges per search, and that usage would bill through Lovable.

## Technical details (Option B only)
- Link the google_maps connector, then change the Places helper in supabase/functions/_shared/leadgen.ts to call https://connector-gateway.lovable.dev/google_maps/places/v1/... with the LOVABLE_API_KEY and GOOGLE_MAPS_API_KEY headers. Fall back to GOOGLE_PLACES_API_KEY when it's set.
- Keep the 403 error messages and the existing caps. Redeploy places-search, enrich-lead and lead-run, then run one test search.
