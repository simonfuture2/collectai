## Why the dashboard is slow after sign-in

Looking at the network log and code, two things dominate the post-login load:

1. **The Web3 wallet stack runs on every page.** `src/components/Web3Provider.tsx` wraps the entire `<App />`, which pulls in Reown AppKit + Wagmi + the Solana adapter and immediately calls `initAppKit()` on mount. The network log shows several `api.web3modal.org` and `cca-lite.coinbase.com` requests firing right after sign-in even though `/dashboard` never needs a wallet. This is hundreds of KB of JS parsed and executed before the dashboard can render.
2. **Every route is statically imported in `src/App.tsx`.** All 30+ pages (Admin, Marketplace, CreateListing, PackRip, PortfolioAnalytics-heavy Dashboard, etc.) ship in the initial bundle, so the browser parses them all before showing `/dashboard`.

Once those are addressed, the dashboard itself has a few secondary widgets (`PortfolioAnalytics`, `TransactionHistory`, `ConnectedAccounts`, `AchievementsRow`) that can render after the first paint.

## Plan

### 1. Defer the Web3 wallet stack
- Convert `src/components/Web3Provider.tsx` to lazy-load `wagmi` + `@/lib/web3/appkit` only when a wallet-dependent route is mounted.
- Approach: keep `<Web3Provider>` at the root but render children directly until a child opts in. Add a small `useWalletStack()` hook (or a `<RequireWallet>` wrapper) that dynamically imports the adapter on demand and mounts `WagmiProvider` around the subtree.
- Wrap only the routes that actually need it: `/wallets`, `/marketplace`, `/marketplace/:id`, `/marketplace/list/:cardId`, and any component using `useAccount` / `WalletConnectButton`. Dashboard, Auth, Landing, etc. skip it entirely.
- Move `initAppKit()` into the lazy module so AppKit and its network calls don't fire on `/dashboard`.

### 2. Code-split routes
- In `src/App.tsx`, convert page imports to `React.lazy(() => import("./pages/X"))` and wrap `<Routes>` in `<Suspense fallback={<RouteFallback />}>`.
- Keep `Landing`, `Auth`, and `Dashboard` eager (they're the common landing points) or lazy with a lightweight skeleton — leaning toward lazy for everything except `Auth` and `Dashboard` to keep the post-sign-in path fast.

### 3. Defer secondary Dashboard widgets
- In `src/pages/Dashboard.tsx`, lazy-import `PortfolioAnalytics`, `TransactionHistory`, `ConnectedAccounts`, and `ReferralCard` with `React.lazy` + `Suspense`, so the cards grid and CTAs render immediately while these mount in the background.
- `PortfolioAnalytics` is already gated behind a button click — make sure it's only imported on click.

### 4. Verify
- After changes, sign in in the preview and confirm: no `api.web3modal.org` / `coinbase.com` requests on `/dashboard`, dashboard shell paints before secondary widgets, network waterfall is shorter.

## Files to touch

- `src/components/Web3Provider.tsx` — rewrite to lazy-mount wallet stack on demand
- `src/lib/web3/appkit.ts` — keep, but `initAppKit` only called from the lazy wrapper
- `src/App.tsx` — `React.lazy` routes + `<Suspense>`; wrap only wallet routes with the wallet provider
- `src/pages/Dashboard.tsx` — lazy-load Portfolio/Transactions/Connected/Referral widgets
- (Possibly) `src/components/WalletConnectButton.tsx` — ensure it tolerates being rendered outside Wagmi until the lazy stack loads

## Out of scope

- No backend, RLS, or auth logic changes — the sign-in flow itself is already fast (the `token` request returned in ~200ms in the log).
- No visual redesign — only loading-strategy changes.
