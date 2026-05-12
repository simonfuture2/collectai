
# Blockchain Marketplace Plan

A peer-to-peer marketplace where collectors list cards, buyers pay in USDC/USDT on Ethereum or Solana, funds are held in on-chain escrow, and after the buyer confirms delivery the escrow releases funds to the seller and mints an authenticity NFT tied to the AuthentiSeal serial.

## Scope of this plan

This is a large multi-phase build (smart contracts + indexer + UI + shipping flow). I'll deliver it in **3 shippable phases** so you can review at each stage. This plan covers the architecture and the full Phase 1 build.

---

## Architecture Overview

```text
   Seller                                                   Buyer
     |                                                        |
     | 1. Create listing (card, price, chain, token)          |
     v                                                        v
  +----------------------------------------------------------+
  |  CollectAI Web App  (Reown AppKit: EVM + Solana wallets) |
  +----------------------------------------------------------+
     |                          |                       |
     | listing meta             | escrow tx             | confirm delivery
     v                          v                       v
  Supabase DB         Escrow Contracts            Escrow Contracts
  (listings,          - Ethereum (Solidity)       releaseFunds() ->
   orders,            - Solana (Anchor)           seller paid in USDC
   shipments)         Holds USDC/USDT             mintAuthenticityNFT()
     ^                          |
     |                          v
     +-------- Indexer Edge Function (poll/webhook) <--------+
              writes on-chain state back into Supabase
```

Three layers:
1. **Smart contracts** — escrow + NFT mint on each chain
2. **Indexer** — edge functions that watch chain events and sync to DB
3. **App** — listing UI, buy flow, shipment tracking, dashboard

---

## Phase 1 — Foundation (this build)

Goal: a user can connect a wallet, create a listing, browse listings, and the data model is ready for escrow integration.

### 1.1 Database schema
New tables:
- `wallets` — `user_id, chain ('ethereum'|'solana'), address, is_primary` (RLS: owner-only)
- `marketplace_listings` — `id, card_id, seller_id, chain, payment_token ('USDC'|'USDT'), price, status ('active'|'pending'|'sold'|'cancelled'), created_at, contract_listing_id` (RLS: public read for active, owner write)
- `marketplace_orders` — `id, listing_id, buyer_id, seller_id, chain, escrow_tx_hash, escrow_address, amount, status ('escrowed'|'shipped'|'delivered'|'released'|'refunded'|'disputed'), created_at`
- `order_shipments` — `id, order_id, carrier, tracking_number, ship_address_encrypted, shipped_at, delivered_at, tracking_status, tracking_payload`
- `nft_certificates` — `id, order_id, chain, contract_address, token_id, mint_tx_hash, authentiseal_serial, metadata_uri, minted_at`

Add `cards.is_listed boolean` for fast filtering.

### 1.2 Wallet connection (Reown AppKit)
- Install `@reown/appkit`, `@reown/appkit-adapter-wagmi`, `@reown/appkit-adapter-solana`, `wagmi`, `viem`, `@solana/web3.js`
- New `src/lib/web3/appkit.ts` — configure Ethereum mainnet + Solana mainnet (and testnets in dev), USDC/USDT token addresses per chain
- New `src/components/WalletConnectButton.tsx` — opens AppKit modal
- New `src/hooks/use-wallet.ts` — exposes connected EVM + Solana addresses
- After connect, persist address to `wallets` table via `supabase.from('wallets').upsert(...)`
- Add to header nav next to ThemeToggle

### 1.3 Marketplace pages
- `src/pages/Marketplace.tsx` (`/marketplace`) — grid of active listings, filter by chain/token/category/price, search
- `src/pages/MarketplaceListing.tsx` (`/marketplace/:id`) — card detail, seller info (display_name only), Buy Now button (Phase 2 wires it to escrow)
- `src/pages/CreateListing.tsx` (`/marketplace/list/:cardId`) — pick chain, pick token, set price in USDC/USDT, preview, submit
- "List on Marketplace" action in `CardDetail.tsx` context menu and on the card page

### 1.4 Routing & nav
- Add 4 routes to `App.tsx`
- Add "Marketplace" link to main nav and Dashboard quick actions

### 1.5 Required secrets (set in Phase 1)
- `RPC_ETHEREUM_MAINNET` (Alchemy/Infura URL)
- `RPC_SOLANA_MAINNET` (Helius URL recommended)
- `REOWN_PROJECT_ID` (from cloud.reown.com — public, can also be in `.env`)

---

## Phase 2 — On-chain escrow (next build, separate request)
- Solidity escrow contract (Ethereum) — `createEscrow(seller, token, amount, listingId)`, `markShipped(tracking)`, `confirmDelivery()`, `releaseFunds()`, `refund()`, `dispute()`
- Anchor program (Solana) — equivalent instructions over SPL USDC/USDT
- Frontend buy flow: approve token → call `createEscrow` → store tx hash + escrow address in `marketplace_orders`
- Indexer edge function (`marketplace-indexer`) — polls each chain every minute, updates order status from on-chain events
- Shipping flow: seller submits carrier+tracking → call `markShipped` on contract → backend polls EasyPost/Shippo for delivery confirmation → buyer confirms or auto-confirms after 7 days post-delivery → calls `releaseFunds`

## Phase 3 — Authenticity NFTs & polish
- ERC-721 contract on Ethereum + Metaplex NFT on Solana, minted automatically inside `releaseFunds()` to the buyer
- Metadata pinned to IPFS (web3.storage or Pinata) including AuthentiSeal serial, scan images, grade
- Buyer's CardDetail shows "Verified on-chain" badge with link to block explorer
- Disputes UI + admin resolution panel

---

## Technical Details

**Phase 1 dependencies to add:**
`@reown/appkit @reown/appkit-adapter-wagmi @reown/appkit-adapter-solana wagmi viem @tanstack/react-query @solana/web3.js @solana/spl-token`

**Token addresses** stored in `src/lib/web3/tokens.ts`:
- Ethereum USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- Ethereum USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- Solana USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Solana USDT: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`

**Shipping carrier API** — Phase 2 will use **EasyPost** (single API for USPS/UPS/FedEx/DHL). Will require `EASYPOST_API_KEY`.

**Smart contract deployment** — Phase 2 contracts will be deployed by the user from Remix (Ethereum) and `anchor deploy` (Solana); I'll provide the source and verification scripts. Contract addresses then go into Lovable secrets.

**Auto-release window** — 7 days after carrier marks delivered, funds auto-release to prevent buyer holding seller hostage. Either party can dispute within that window to freeze funds for admin review.

**Custody / regulatory** — escrow is fully on-chain; CollectAI never touches funds, which keeps us out of money-transmitter scope. Marketplace fees (0% for now) will later be deducted on-chain at release.

---

## What I will NOT do without confirmation
- Deploy any smart contracts to mainnet (testnet only by default in Phase 2)
- Spend any real money on RPC/IPFS providers — I'll use free tiers and tell you when limits apply
- Touch existing payment/Stripe flows

Ready to build Phase 1 on approval.
