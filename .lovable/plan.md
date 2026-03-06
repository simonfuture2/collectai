

## 9-Email Drip Campaign for Lead Magnet Downloads

### What We're Building

An automated email drip campaign that sends 9 value-add emails to leads who download the free guide, on days 1, 3, 4, 6, 8, 10, 11, 13, and 15 after download. The admin dashboard will show campaign status and allow management.

### Architecture

1. **New `drip_campaign_queue` table** -- tracks each lead's position in the drip sequence (lead_id, step number, scheduled send date, sent status)
2. **New `drip-campaign` edge function** -- a cron-triggered function that checks the queue for emails due today, sends them via SendGrid, and marks them sent
3. **Update `lead-magnet` edge function** -- after inserting the lead, enqueue all 9 drip emails with their scheduled dates
4. **Update Admin CampaignsTab** -- add a "Drip Campaign" section showing queue status, pending/sent counts, and ability to pause/resume

### Database Migration

```sql
CREATE TABLE public.drip_campaign_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  step integer NOT NULL,        -- 1-9
  subject text NOT NULL,
  body text NOT NULL,
  scheduled_for date NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drip_campaign_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view drip queue" ON public.drip_campaign_queue
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update drip queue" ON public.drip_campaign_queue
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete drip queue" ON public.drip_campaign_queue
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));
```

### 9 Email Content (Subject + Theme)

| Step | Day | Subject | Content Theme |
|------|-----|---------|---------------|
| 1 | 1 | Welcome! Here's How to Spot a PSA 10 | Quick tips on identifying gem mint condition; intro to CollectAI scanner |
| 2 | 3 | The Top 5 Most Expensive Cards Sold This Year | Record-breaking sales: Pokemon, sports legends, vintage finds |
| 3 | 4 | Pokemon Collecting: Why Vintage Japanese Cards Are Exploding | Japanese market trends, 1st edition Base Set values |
| 4 | 6 | Sports Legends: Cards That Made Millionaires | Jordan, Jeter, Brady rookie card price history and what to look for |
| 5 | 8 | 3 Grading Mistakes That Cost Collectors Thousands | Common errors in self-assessment; how AI grading helps |
| 6 | 10 | The Hidden Gem: Low-Pop Cards Worth Hunting | Population reports, why scarcity drives value, how to find under-graded cards |
| 7 | 11 | Is Your Collection Insured? What Every Collector Should Know | Protection tips, documentation best practices, using CollectAI for inventory |
| 8 | 13 | Market Watch: What's Trending in Collectibles Right Now | Current market movers across Pokemon, sports, and trading cards |
| 9 | 15 | Your Collection Deserves More — Upgrade to Pro | Recap of value provided, Pro plan benefits, exclusive pricing CTA |

### Implementation Flow

1. **`lead-magnet` edge function update**: After inserting the lead and sending the cheat sheet, insert 9 rows into `drip_campaign_queue` with `scheduled_for = download_date + day_offset` for each step. Email HTML content is hardcoded in the drip function.

2. **New `drip-campaign` edge function**: Contains all 9 email HTML templates. When invoked, queries `drip_campaign_queue` for rows where `scheduled_for <= today AND sent = false`, fetches the lead email from `leads` table, sends via SendGrid, marks as sent.

3. **Cron job (pg_cron)**: Schedule `drip-campaign` to run daily (e.g., every morning).

4. **Admin UI updates to CampaignsTab**: Add a "Drip Campaign" card showing:
   - Total leads in drip sequence
   - Emails pending vs sent
   - Table of recent drip activity
   - Button to cancel/clear drip for a specific lead

### Files to Create/Modify

| File | Action |
|------|--------|
| DB migration | Create `drip_campaign_queue` table with RLS |
| `supabase/functions/drip-campaign/index.ts` | New -- daily cron handler, sends due emails |
| `supabase/functions/lead-magnet/index.ts` | Modify -- enqueue 9 drip emails after guide delivery |
| `supabase/config.toml` | Add `drip-campaign` function config |
| `src/components/admin/CampaignsTab.tsx` | Add drip campaign monitoring section |
| pg_cron SQL | Schedule daily invocation of drip-campaign function |

