ALTER TABLE public.agent_outreach DROP CONSTRAINT agent_outreach_channel_check;
ALTER TABLE public.agent_outreach ADD CONSTRAINT agent_outreach_channel_check CHECK (channel = ANY (ARRAY['instagram_dm','reddit_reply','discord_reply','email','call_task','dm_task']));
ALTER TABLE public.agent_outreach DROP CONSTRAINT agent_outreach_status_check;
ALTER TABLE public.agent_outreach ADD CONSTRAINT agent_outreach_status_check CHECK (status = ANY (ARRAY['pending','drafting','approved','sending','sent','posted_manually','rejected','failed','skipped','done','bounced']));
ALTER TABLE public.agent_outreach DROP CONSTRAINT agent_outreach_workflow_check;
ALTER TABLE public.agent_outreach ADD CONSTRAINT agent_outreach_workflow_check CHECK (workflow = ANY (ARRAY['ig_comment_dm','community_drafts','email_outreach','sequence_optin','sequence_task']));