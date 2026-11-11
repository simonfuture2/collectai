CREATE OR REPLACE FUNCTION public.referral_friend_reward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.referrals; n integer;
BEGIN
  BEGIN
    SELECT * INTO r FROM public.referrals
     WHERE referred_id = NEW.user_id AND friend_reward_eligible AND friend_credited_at IS NULL FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT count(*) INTO n FROM public.price_checks WHERE user_id = NEW.user_id;
    IF n < 5 THEN RETURN NEW; END IF;
    UPDATE public.referrals SET friend_credited_at = now() WHERE id = r.id;
    PERFORM public.add_credits(NEW.user_id, 3);
    INSERT INTO public.credit_transactions(user_id, amount, type, description)
    VALUES (NEW.user_id, 3, 'referral_friend_bonus', 'Welcome bonus for joining with a friend''s link');
  EXCEPTION WHEN OTHERS THEN
    -- A reward problem must never block a price check.
    RAISE WARNING 'referral_friend_reward failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;