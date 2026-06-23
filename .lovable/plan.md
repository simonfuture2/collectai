## Premium Design System Foundation

Establish a cohesive dark-premium token layer and three reusable presentation primitives. No screen redesigns, no business logic touched.

### 1. Tokens (`src/index.css` + `tailwind.config.ts`)

Add new CSS variables on `:root` (and mirror in `.dark`) — these become the new global defaults since the overhaul targets the whole app:

```css
--bg-base: 0 0% 4%;            /* #0a0a0a */
--bg-surface: 240 5% 9%;       /* #141416 */
--glass-surface: 20 20 22 / 0.55;  /* rgba for backdrop-blur panels */
--border-subtle: 255 255 255 / 0.08;
--text-primary: 240 17% 97%;   /* #f5f5f7 */
--text-muted: 240 4% 56%;       /* #8a8a90 */
--gold-from: 46 65% 52%;        /* #d4af37 */
--gold-to: 45 80% 80%;          /* #f4e4a6 */
--gain: 142 71% 45%;            /* #22c55e */
--loss: 0 84% 60%;              /* #ef4444 */
--gradient-gold: linear-gradient(135deg, #d4af37, #f4e4a6);
--shadow-glass: 0 8px 32px rgba(0,0,0,0.45);
```

Tailwind `extend.colors`: add `base`, `surface`, `glass`, `border-subtle`, `text-primary`, `text-muted`, `gold`, `gain`, `loss`. Add `backgroundImage: { 'gradient-gold': 'var(--gradient-gold)' }`. Add `boxShadow.glass`. Add `fontFamily.numeric` (system tabular stack: `ui-monospace, 'SF Mono', 'JetBrains Mono', monospace` with `font-variant-numeric: tabular-nums` + `letter-spacing: -0.02em` via utility class `.font-numeric`).

Apply globally by repointing `--background` → bg-base and `--foreground` → text-primary so the entire app shifts to the premium dark surface in one go. Keep all existing token names (primary, card, muted, etc.) functioning — just retuned values where they collide. Existing `gradient-primary` / collectai-* tokens left alone.

### 2. `<Value>` component (`src/components/ui/value.tsx`)

Props: `amount: number`, `currency?: 'USD'` (default), `size?: 'sm'|'md'|'lg'|'xl'` (xl = hero), `tone?: 'default'|'gain'|'loss'|'gold'`, `animate?: boolean` (default true), `decimals?: number`, `prefix?`, `suffix?`.

- Uses `.font-numeric` (tabular-nums, tight tracking).
- Formats with `Intl.NumberFormat`.
- When `animate`, renders the count-up primitive.
- `tone='gold'` applies `bg-gradient-gold bg-clip-text text-transparent`.
- `tone='gain'|'loss'` maps to the new gain/loss tokens.

### 3. Motion primitives (`src/components/ui/motion.tsx`)

Uses already-installed `framer-motion` (^12.35).

- `<FadeUp delay?>` — opacity 0→1, y 12→0, 400ms ease-out, runs once on mount via `whileInView` or `initial/animate`.
- `<PressScale>` — wraps children/button: `whileTap={{ scale: 0.97 }}`, `whileHover={{ scale: 1.02 }}`, spring transition. Polymorphic via `asChild`-style (renders a `motion.div` by default; optional `as="button"`).
- `useCountUp(target, { duration=900, decimals=2 })` hook — uses `useMotionValue` + `useTransform` + `animate()` from framer-motion; returns a formatted string. `<CountUp value decimals prefix suffix />` is the component wrapper used internally by `<Value>`.

### 4. `<GlassCard>` (`src/components/ui/glass-card.tsx`)

- `bg-glass` (rgba 20,20,22,0.55) + `backdrop-blur-xl` + `border border-border-subtle` + `shadow-glass` + `rounded-2xl`.
- Variants via `cva`: `padding: 'sm'|'md'|'lg'`, `hover: 'none'|'lift'` (lift = subtle translate-y + shadow on hover).
- Forwards ref, spreads className via `cn()`.

### 5. Demo route (`src/pages/DesignDemo.tsx` + route in `src/App.tsx`)

New route `/design-demo`. Single centered column on bg-base:
- A `<FadeUp>` heading "Design System Preview".
- Three `<GlassCard>`s side-by-side:
  1. **Portfolio Value** — `<Value amount={12480.55} size="xl" tone="gold" animate />` with a "+$214.30 today" `<Value tone="gain" size="sm" />` underneath.
  2. **Best Card** — `<Value amount={1842} tone="default" size="lg" />` + label.
  3. **Daily Change** — `<Value amount={-58.20} tone="loss" size="lg" animate />`.
- A `<PressScale>` button "Replay animation" that re-mounts the cards via a `key` bump so count-up replays.

### Files

Create:
- `src/components/ui/value.tsx`
- `src/components/ui/motion.tsx`
- `src/components/ui/glass-card.tsx`
- `src/pages/DesignDemo.tsx`

Edit:
- `src/index.css` — add tokens, `.font-numeric` utility, repoint `--background`/`--foreground`.
- `tailwind.config.ts` — extend colors, fontFamily, boxShadow, backgroundImage.
- `src/App.tsx` — add `/design-demo` route.

### Out of scope (explicit)

No edits to: scan pipeline, `analysisEngine.ts`, pricing logic, Supabase queries/edge functions, Stripe, or any existing page layout. Existing pages will visually shift only because `--background`/`--foreground` tokens change — no per-screen redesign in this pass.
