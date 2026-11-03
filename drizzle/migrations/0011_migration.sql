create or replace function public.agent_funnel(_days integer)
returns table(ref_code text, event_type text, events bigint, people bigint)
language sql stable security definer set search_path = public as $$
  select a.ref_code, a.event_type, count(*)::bigint,
         count(distinct coalesce(a.user_id::text, a.anon_id))::bigint
  from public.agent_attribution a
  where public.is_agent_admin()
    and a.created_at >= now() - make_interval(days => greatest(1, least(_days, 365)))
  group by a.ref_code, a.event_type
$$;
revoke all on function public.agent_funnel(integer) from public, anon;
grant execute on function public.agent_funnel(integer) to authenticated;