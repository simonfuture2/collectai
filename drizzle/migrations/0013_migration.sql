alter table public.agent_attribution drop constraint agent_attribution_event_type_check;
alter table public.agent_attribution add constraint agent_attribution_event_type_check check (event_type = any (array[
  'visit','demo_scan','signup','first_scan','paid',
  'landing_view','demo_cta_click','demo_upload_started','demo_result','demo_error',
  'demo_sample_tap','demo_limit_hit','save_card_click','demo_card_imported'
]::text[]));
create unique index if not exists agent_attr_import_once on public.agent_attribution (user_id) where user_id is not null and event_type = 'demo_card_imported';