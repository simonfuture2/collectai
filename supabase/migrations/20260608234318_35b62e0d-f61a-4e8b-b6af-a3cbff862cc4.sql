
REVOKE SELECT ON public.cards FROM anon;
GRANT SELECT (
  id, user_id, card_name, card_set, card_year,
  condition_grade, estimated_value_low, estimated_value_high,
  rarity, category, image_url, is_public, created_at
) ON public.cards TO anon;

CREATE OR REPLACE FUNCTION public.enforce_marketplace_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
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
    IF NEW.seller_wallet IS DISTINCT FROM OLD.seller_wallet
       OR NEW.buyer_wallet IS DISTINCT FROM OLD.buyer_wallet
       OR NEW.escrow_address IS DISTINCT FROM OLD.escrow_address
       OR NEW.escrow_tx_hash IS DISTINCT FROM OLD.escrow_tx_hash
       OR NEW.release_tx_hash IS DISTINCT FROM OLD.release_tx_hash
       OR NEW.auto_release_at IS DISTINCT FROM OLD.auto_release_at THEN
      RAISE EXCEPTION 'Buyer cannot modify escrow/wallet fields';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'shipped'::order_status
              AND NEW.status = 'delivered'::order_status) THEN
        RAISE EXCEPTION 'Buyer cannot perform this status transition (% -> %)',
          OLD.status, NEW.status;
      END IF;
    END IF;
  ELSIF uid = OLD.seller_id THEN
    IF NEW.buyer_wallet IS DISTINCT FROM OLD.buyer_wallet
       OR NEW.delivery_confirmed_at IS DISTINCT FROM OLD.delivery_confirmed_at THEN
      RAISE EXCEPTION 'Seller cannot modify buyer-controlled fields';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'escrowed'::order_status
              AND NEW.status = 'shipped'::order_status) THEN
        RAISE EXCEPTION 'Seller cannot perform this status transition (% -> %)',
          OLD.status, NEW.status;
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to update this order';
  END IF;

  RETURN NEW;
END;
$function$;
