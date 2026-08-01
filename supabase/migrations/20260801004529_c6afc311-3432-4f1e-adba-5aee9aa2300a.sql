DELETE FROM public.referrals a
USING public.referrals b
WHERE a.referred_id = b.referred_id
  AND a.created_at > b.created_at;

DELETE FROM public.referrals a
USING public.referrals b
WHERE a.referred_id = b.referred_id
  AND a.created_at = b.created_at
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_id_key
  ON public.referrals (referred_id);