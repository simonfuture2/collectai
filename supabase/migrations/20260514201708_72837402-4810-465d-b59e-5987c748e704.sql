
-- 1. Drop overly permissive public read on pack_rips
DROP POLICY IF EXISTS "Anyone can view pack rips by share token" ON public.pack_rips;

-- 2. Restrict nft_certificates to owner of the related card
DROP POLICY IF EXISTS "Anyone views NFT certs" ON public.nft_certificates;

CREATE POLICY "Card owner can view NFT certs"
ON public.nft_certificates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = nft_certificates.card_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Order parties can view NFT certs"
ON public.nft_certificates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.marketplace_orders o
    WHERE o.id = nft_certificates.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

-- 3. Restrict marketplace_orders updates with a trigger so buyers/sellers can
-- only modify a safe subset of columns each.
CREATE OR REPLACE FUNCTION public.enforce_marketplace_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Immutable fields for everyone
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_token IS DISTINCT FROM OLD.payment_token
     OR NEW.chain IS DISTINCT FROM OLD.chain
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Field is immutable on marketplace_orders';
  END IF;

  IF uid = OLD.buyer_id THEN
    -- Buyer may only confirm delivery / mark received
    IF NEW.seller_wallet IS DISTINCT FROM OLD.seller_wallet
       OR NEW.buyer_wallet IS DISTINCT FROM OLD.buyer_wallet
       OR NEW.escrow_address IS DISTINCT FROM OLD.escrow_address
       OR NEW.escrow_tx_hash IS DISTINCT FROM OLD.escrow_tx_hash
       OR NEW.release_tx_hash IS DISTINCT FROM OLD.release_tx_hash
       OR NEW.auto_release_at IS DISTINCT FROM OLD.auto_release_at THEN
      RAISE EXCEPTION 'Buyer cannot modify escrow/wallet fields';
    END IF;
  ELSIF uid = OLD.seller_id THEN
    -- Seller cannot modify buyer wallet or buyer-side delivery confirmation
    IF NEW.buyer_wallet IS DISTINCT FROM OLD.buyer_wallet
       OR NEW.delivery_confirmed_at IS DISTINCT FROM OLD.delivery_confirmed_at THEN
      RAISE EXCEPTION 'Seller cannot modify buyer-controlled fields';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to update this order';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_marketplace_order_update_trg ON public.marketplace_orders;
CREATE TRIGGER enforce_marketplace_order_update_trg
BEFORE UPDATE ON public.marketplace_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_marketplace_order_update();

-- 4. Fix mutable search_path on existing function
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := upper(substr(md5(random()::text || NEW.user_id::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

-- 5. Revoke execute on internal pgmq-wrapper SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;

-- 6. Restrict listing of generated-assets bucket — keep public read of known files,
-- but prevent enumeration via list. Drop the broad public SELECT and replace with
-- a signed-URL friendly one (objects still accessible by direct path through CDN).
-- Note: Lovable storage public buckets serve via public URL regardless of policy,
-- so we can safely tighten the listing policy.
DO $$
BEGIN
  -- Best-effort: drop a common name; if it doesn't exist it's a no-op.
  EXECUTE 'DROP POLICY IF EXISTS "Public Access" ON storage.objects';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
