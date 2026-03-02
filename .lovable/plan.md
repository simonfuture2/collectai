

## Admin CRM & Campaign Management — Implementation Plan

This adds a full lead management, outreach, and campaign system to your admin dashboard, powered by Twilio for email and SMS delivery.

---

### What You Will Get

- **Leads CRM tab** in the admin dashboard with a pipeline view (New → Contacted → Interested → Converted → Lost)
- **Public partner signup form** at `/partners` that feeds leads into the CRM
- **Campaign templates** — save and reuse email/SMS message templates with variable placeholders
- **Send email and SMS** directly from the admin dashboard to individual leads or in bulk
- **Activity log** per lead tracking every touchpoint (email sent, SMS sent, status change, notes)
- **Referral/partner code generation** for onboarding tracking

---

### Prerequisites: Twilio API Keys

You will need a Twilio account with:
- **Account SID** and **Auth Token** (for SMS)
- A **Twilio phone number** for sending SMS
- A **verified sender email** or Twilio SendGrid API key for email

I will prompt you to securely add these as backend secrets before sending anything.

---

### Database Tables (4 new tables)

1. **`leads`** — id, name, email, phone, company, source (form/manual/csv), status (new/contacted/interested/converted/lost), partner_code, notes, assigned_to, created_at, updated_at
2. **`campaign_templates`** — id, name, channel (email/sms), subject, body, created_by, created_at, updated_at
3. **`lead_activities`** — id, lead_id, type (email_sent/sms_sent/status_change/note/call), content, metadata (jsonb), created_by, created_at
4. **`outreach_campaigns`** — id, template_id, name, status (draft/sending/sent), target_filter (jsonb), sent_count, created_by, created_at

All tables get RLS policies restricted to admin users only.

### Edge Functions (2 new)

1. **`campaign-outreach`** — Admin-only function handling:
   - Send individual email/SMS to a lead via Twilio
   - Bulk send to filtered lead lists
   - Log each send as a lead activity
   - Generate unique partner referral codes

2. **`partner-signup`** — Public endpoint (no JWT) for the partner interest form. Inserts into `leads` table with source="form", status="new".

### Frontend Changes

1. **`src/pages/Admin.tsx`** — Add 2 new tabs: "Leads" and "Campaigns"
   - **Leads tab**: Table with status badges, search, status filter, click-to-expand detail with activity timeline, inline actions (send email/SMS, change status, add note, generate partner code)
   - **Campaigns tab**: Template manager (create/edit/delete templates), bulk send interface with lead filtering

2. **`src/pages/PartnerSignup.tsx`** — Public form page at `/partners` with name, email, phone, company, message fields. Calls `partner-signup` edge function.

3. **Router** — Add `/partners` route.

### Implementation Order

1. Create database tables and RLS policies (migration)
2. Add Twilio secrets (will prompt you)
3. Build `partner-signup` edge function + public form page
4. Build `campaign-outreach` edge function
5. Build Leads tab UI in admin dashboard
6. Build Campaigns tab UI (templates + bulk send)

