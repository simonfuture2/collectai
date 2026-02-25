

# Google Play Compliance Audit and Fixes

## Gap Analysis: Current State vs. Requirements

After reviewing all legal pages, disclaimers, and app features against the Google Play compliance template provided, here are the gaps:

### Privacy Policy (src/pages/Privacy.tsx) -- GAPS FOUND

| Required | Current Status |
|----------|---------------|
| Camera/device access disclosure | Missing -- only says "Photos you upload", doesn't mention camera access |
| Blockchain/wallet address data | Missing entirely -- no mention of AuthentiSeal or Solana wallet data |
| Device data collection (OS, model) | Missing entirely |
| Explicit "we do not sell images" statement | Missing |
| Data deletion request process | Vague -- says "request deletion" but no clear mechanism described |
| Encryption in transit disclosure | Present |

### Terms of Service (src/pages/Terms.tsx) -- GAPS FOUND

| Required | Current Status |
|----------|---------------|
| AI "estimated/beta" prominent disclosure | Partially present in Section 4, but lacks "beta" language |
| Blockchain/NFT technology declaration | Missing entirely -- no mention of AuthentiSeal digital certificates |

### AI Disclaimer (src/components/AIDisclaimer.tsx) -- MINOR GAP

| Required | Current Status |
|----------|---------------|
| Disclaimer on scan results | Present |
| "About" section or prominent disclosure that AI grading is estimated | Only appears after scan results and in footer, not in a dedicated About section |

### FAQ (src/pages/FAQ.tsx) -- MINOR GAP

| Required | Current Status |
|----------|---------------|
| AuthentiSeal/blockchain explanation | Present (Q: "What is AuthentiSeal?") but doesn't mention blockchain/Solana |
| Camera usage explanation | Missing |

### Footer Disclaimer -- OK
Already present in Footer.tsx.

---

## Plan

### 1. Update Privacy Policy with Google Play-required disclosures

Add the following new/updated sections to `src/pages/Privacy.tsx`:

- **Section 1 (Information We Collect)**: Add three new bullet points:
  - **Camera Access**: "When you use the scan feature, we access your device camera to capture images of collectibles. These images are processed by our AI to determine identification, grading, and authenticity."
  - **Blockchain Data**: "If you use AuthentiSeal features, we may interact with public blockchain addresses (e.g., Solana) to associate digital certificates of authenticity with your physical items. Only public wallet addresses are collected."
  - **Device Data**: "We collect standard technical information such as OS version and device model to ensure the AI scanner functions correctly on your hardware."
- **Section 2 (How We Use)**: Add explicit statement: "We do not sell your personal images or data to third parties."
- **Section 5 (Data Retention)**: Add explicit deletion process: "You may request deletion of your account and all associated data (including scan history and card images) at any time by emailing support@collectai.app. Deletion requests are processed within 30 days."
- New **Section 6: Blockchain and Digital Certificates**: Dedicated section explaining AuthentiSeal data handling -- certificates are public records on-chain, wallet addresses are not stored by CollectAI, etc.
- Renumber remaining sections accordingly.

### 2. Update Terms of Service with blockchain/AI disclosures

Update `src/pages/Terms.tsx`:

- **Section 4 (AI Disclaimer)**: Add language: "AI grading and valuation features are currently in beta and continuously improving. Results should be considered estimates only."
- New **Section after current 4**: "Blockchain and Digital Certificates" -- Declare that AuthentiSeal certificates use blockchain technology (Solana) for Non-Fungible Tokens / Digital Assets for Authentication purposes. CollectAI is not a cryptocurrency exchange. Certificates are public and immutable once created.

### 3. Update FAQ with camera and blockchain details

Update `src/pages/FAQ.tsx`:

- Update the AuthentiSeal FAQ answer to mention it uses blockchain technology (Solana) for tamper-proof, verifiable certificates.
- Add a new FAQ: "Does CollectAI access my camera?" explaining that the app uses the device camera solely for card scanning and images are encrypted in transit.

### 4. Add an "About" section with prominent AI disclosure

Create a small "About" info card on the Landing page or add an "About" route. The simpler approach: add a dedicated disclaimer block on the Landing page near the features section stating:

> "CollectAI uses artificial intelligence to provide estimated card grades and valuations. These are not professional appraisals. AI features are continuously improving."

This satisfies Google's requirement for a "prominent disclosure" about AI being estimated.

### Technical Details

- All changes are to existing React page components (`.tsx` files)
- No database migrations needed
- No new dependencies required
- Files modified: `Privacy.tsx`, `Terms.tsx`, `FAQ.tsx`, `Landing.tsx`
- Estimated ~4 sections added/updated across the files

