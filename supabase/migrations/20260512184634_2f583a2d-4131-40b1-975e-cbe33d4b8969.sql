
-- Enums
CREATE TYPE public.blockchain_network AS ENUM ('ethereum', 'solana');
CREATE TYPE public.payment_token AS ENUM ('USDC', 'USDT');
CREATE TYPE public.listing_status AS ENUM ('active', 'pending', 'sold', 'cancelled');
CREATE TYPE public.order_status AS ENUM ('escrowed', 'shipped', 'delivered', 'released', 'refunded', 'disputed');

-- Wallets
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  chain blockchain_network NOT NULL,
  address TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, chain, address)
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wallets" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own wallets" ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own wallets" ON public.wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own wallets" ON public.wallets FOR DELETE USING (auth.uid() = user_id);

-- Listings
CREATE TABLE public.marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  chain blockchain_network NOT NULL,
  payment_token payment_token NOT NULL,
  price NUMERIC(20,6) NOT NULL CHECK (price > 0),
  seller_wallet TEXT NOT NULL,
  status listing_status NOT NULL DEFAULT 'active',
  contract_listing_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views active listings" ON public.marketplace_listings FOR SELECT USING (status = 'active' OR auth.uid() = seller_id);
CREATE POLICY "Sellers create listings" ON public.marketplace_listings FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers update own listings" ON public.marketplace_listings FOR UPDATE USING (auth.uid() = seller_id);
CREATE POLICY "Sellers delete own listings" ON public.marketplace_listings FOR DELETE USING (auth.uid() = seller_id);
CREATE INDEX idx_listings_status ON public.marketplace_listings(status);
CREATE INDEX idx_listings_seller ON public.marketplace_listings(seller_id);

-- Orders
CREATE TABLE public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id),
  buyer_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  chain blockchain_network NOT NULL,
  payment_token payment_token NOT NULL,
  amount NUMERIC(20,6) NOT NULL,
  buyer_wallet TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  escrow_address TEXT,
  escrow_tx_hash TEXT,
  release_tx_hash TEXT,
  status order_status NOT NULL DEFAULT 'escrowed',
  delivery_confirmed_at TIMESTAMPTZ,
  auto_release_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer or seller view orders" ON public.marketplace_orders FOR SELECT USING (auth.uid() IN (buyer_id, seller_id));
CREATE POLICY "Buyer creates order" ON public.marketplace_orders FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Buyer or seller update orders" ON public.marketplace_orders FOR UPDATE USING (auth.uid() IN (buyer_id, seller_id));

-- Shipments
CREATE TABLE public.order_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  ship_address_encrypted TEXT,
  shipped_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  tracking_status TEXT,
  tracking_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer or seller view shipments" ON public.order_shipments FOR SELECT USING (
  EXISTS (SELECT 1 FROM marketplace_orders o WHERE o.id = order_shipments.order_id AND auth.uid() IN (o.buyer_id, o.seller_id))
);
CREATE POLICY "Seller adds shipment" ON public.order_shipments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM marketplace_orders o WHERE o.id = order_shipments.order_id AND auth.uid() = o.seller_id)
);
CREATE POLICY "Seller updates shipment" ON public.order_shipments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM marketplace_orders o WHERE o.id = order_shipments.order_id AND auth.uid() = o.seller_id)
);

-- NFT certificates
CREATE TABLE public.nft_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.marketplace_orders(id),
  card_id UUID NOT NULL,
  owner_wallet TEXT NOT NULL,
  chain blockchain_network NOT NULL,
  contract_address TEXT NOT NULL,
  token_id TEXT NOT NULL,
  mint_tx_hash TEXT NOT NULL,
  authentiseal_serial TEXT,
  metadata_uri TEXT,
  minted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nft_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views NFT certs" ON public.nft_certificates FOR SELECT USING (true);

-- Cards flag
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS is_listed BOOLEAN NOT NULL DEFAULT false;

-- updated_at triggers
CREATE TRIGGER trg_listings_updated BEFORE UPDATE ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.marketplace_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shipments_updated BEFORE UPDATE ON public.order_shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
