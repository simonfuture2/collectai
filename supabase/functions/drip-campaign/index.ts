import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const emailTemplates: Record<number, (name: string) => string> = {
  1: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Welcome! Here's How to Spot a PSA 10 🏆</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">Thanks for downloading the Collector's Cheat Sheet! Let's kick off your journey with the <strong>fastest way to identify a potential PSA 10</strong> — the holy grail of card grading.</p>

<h2 style="color:#7c3aed;font-size:18px;margin:24px 0 12px;">🔍 The 60-Second PSA 10 Check</h2>
<ol style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li><strong>Centering:</strong> Hold the card at eye level. Are the borders even on all sides? PSA 10 needs 60/40 front, 75/25 back.</li>
<li><strong>Corners:</strong> Use a loupe or phone macro. All 4 corners must be razor-sharp — no rounding at all.</li>
<li><strong>Surface:</strong> Tilt under light at multiple angles. Any scratches, print lines, or whitening? That's a downgrade.</li>
<li><strong>Edges:</strong> Run your fingertip along each edge. Feel for nicks, chips, or rough cuts.</li>
</ol>

<p style="font-size:15px;color:#374151;line-height:1.7;">💡 <strong>Pro tip:</strong> CollectAI's scanner uses AI to check all 4 factors in seconds — <a href="https://mycollectai.com" style="color:#7c3aed;">try it free</a>.</p>

<p style="font-size:13px;color:#9ca3af;margin-top:32px;">More tips coming in your next email!</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  2: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">The Top 5 Most Expensive Cards Sold This Year 💰</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">The card market continues to break records. Here are this year's most jaw-dropping sales:</p>

<table width="100%" cellpadding="8" cellspacing="0" style="font-size:13px;border-collapse:collapse;margin:20px 0;">
<tr style="background:#f9fafb;"><td style="border:1px solid #e5e7eb;font-weight:bold;">Card</td><td style="border:1px solid #e5e7eb;font-weight:bold;">Sale Price</td></tr>
<tr><td style="border:1px solid #e5e7eb;">1952 Topps Mickey Mantle PSA 9</td><td style="border:1px solid #e5e7eb;">$12.6M</td></tr>
<tr style="background:#f9fafb;"><td style="border:1px solid #e5e7eb;">Pokémon Illustrator PSA 10</td><td style="border:1px solid #e5e7eb;">$5.3M</td></tr>
<tr><td style="border:1px solid #e5e7eb;">2003 LeBron James Logoman 1/1</td><td style="border:1px solid #e5e7eb;">$2.4M</td></tr>
<tr style="background:#f9fafb;"><td style="border:1px solid #e5e7eb;">1st Edition Base Set Charizard PSA 10</td><td style="border:1px solid #e5e7eb;">$420K</td></tr>
<tr><td style="border:1px solid #e5e7eb;">1986 Fleer Michael Jordan PSA 10</td><td style="border:1px solid #e5e7eb;">$738K</td></tr>
</table>

<p style="font-size:15px;color:#374151;line-height:1.7;">🔑 <strong>The pattern?</strong> Every single card was professionally graded. Grading multiplied these cards' raw values by 5–50x. Know what your cards could be worth — <a href="https://mycollectai.com" style="color:#7c3aed;">scan yours now</a>.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  3: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Pokémon: Why Vintage Japanese Cards Are Exploding 🇯🇵</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">Japanese Pokémon cards have become one of the hottest segments in collecting. Here's why:</p>

<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li><strong>Original prints:</strong> Japanese Base Set cards predate English releases by months, making them the true "first editions"</li>
<li><strong>Lower print runs:</strong> Many Japanese exclusive sets had far fewer cards produced</li>
<li><strong>Art exclusives:</strong> Some of the best Pokémon card art only exists in Japanese releases</li>
<li><strong>Price gap closing:</strong> Japanese 1st Ed Base Set Charizards have jumped 300% in 2 years</li>
</ul>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">Cards to Watch:</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li>1996 Japanese Base Set Charizard (No Rarity Symbol)</li>
<li>Vending Series exclusives</li>
<li>Web Series cards — extremely low population</li>
<li>Masaki promo set (trade-only release)</li>
</ul>

<p style="font-size:15px;color:#374151;line-height:1.7;">Have Japanese cards? <a href="https://mycollectai.com" style="color:#7c3aed;">Scan them with CollectAI</a> to get instant grade estimates and value ranges.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  4: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Sports Legends: Cards That Made Millionaires 🏀⚾🏈</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">Some sports cards have turned attic finds into life-changing money. Here's the hall of fame:</p>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">🏀 Michael Jordan — 1986 Fleer #57</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">PSA 10: <strong>$738,000</strong>. Raw NM: ~$15,000. That's a 49x multiplier from grading alone. Only 316 PSA 10s exist out of 14,000+ submitted.</p>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">⚾ Derek Jeter — 1993 SP #279</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">The "Foil" rookie. PSA 10: <strong>$99,000</strong>. Known for being nearly impossible to find well-centered due to the foil stock.</p>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">🏈 Tom Brady — 2000 Playoff Contenders Auto</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">BGS 9.5: <strong>$3.1M</strong> (2021 sale). Only 100 made. The GOAT card for modern sports collecting.</p>

<p style="font-size:15px;color:#374151;line-height:1.7;margin-top:24px;">💡 The takeaway: <strong>condition is everything</strong>. A half-grade difference can mean tens of thousands of dollars. <a href="https://mycollectai.com" style="color:#7c3aed;">Check your cards' condition with AI</a>.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  5: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">3 Grading Mistakes That Cost Collectors Thousands 😱</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">We've seen collectors make these costly errors over and over. Don't be one of them:</p>

<h3 style="color:#dc2626;font-size:16px;margin:20px 0 8px;">❌ Mistake #1: Submitting cards that aren't ready</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">Sending a card for professional grading costs $20–150+. If it comes back a PSA 6, you just paid to <em>decrease</em> its perceived value. Pre-screen with AI first.</p>

<h3 style="color:#dc2626;font-size:16px;margin:20px 0 8px;">❌ Mistake #2: Ignoring centering</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">Centering alone can drop a card from a 10 to an 8. Many collectors focus only on corners and surface, missing obvious centering issues that a quick measurement would catch.</p>

<h3 style="color:#dc2626;font-size:16px;margin:20px 0 8px;">❌ Mistake #3: Improper handling and storage</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">Touching the surface with bare fingers, using old penny sleeves that scratch, stacking without toploaders — these silently destroy card value every day.</p>

<h3 style="color:#16a34a;font-size:16px;margin:20px 0 8px;">✅ The Fix: Pre-Grade Before You Send</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">CollectAI's AI scanner analyzes centering, corners, edges, and surface in seconds — so you only submit cards with real PSA 9–10 potential. <a href="https://mycollectai.com" style="color:#7c3aed;">Try it now →</a></p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  6: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">The Hidden Gem: Low-Pop Cards Worth Hunting 🔎</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">"Population" (pop) refers to how many copies of a card exist at each grade in PSA/BGS registries. Low-pop cards are the hidden treasures of collecting.</p>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">Why Population Matters</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li><strong>Supply & demand:</strong> A card with only 5 PSA 10s will always command a premium over one with 5,000</li>
<li><strong>Price volatility:</strong> Low-pop cards can spike overnight when a collector or investor targets them</li>
<li><strong>Discovery potential:</strong> Many cards haven't been submitted yet — you could own one of the first PSA 10s</li>
</ul>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">How to Find Low-Pop Gems</h3>
<ol style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li>Check PSA's Pop Report or BGS Population Database</li>
<li>Look for cards with < 50 total graded and < 10 at PSA 9+</li>
<li>Focus on regional exclusives, error cards, and promotional releases</li>
<li>Use CollectAI to pre-grade and identify submission-worthy cards</li>
</ol>

<p style="font-size:15px;color:#374151;line-height:1.7;margin-top:16px;"><a href="https://mycollectai.com" style="color:#7c3aed;">Scan your collection</a> — you might be sitting on a low-pop goldmine.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  7: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Is Your Collection Insured? 🛡️</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">Most collectors don't think about insurance until it's too late. Here's what every serious collector should know:</p>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">📋 Documentation Best Practices</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li>Photograph every card (front and back) with timestamps</li>
<li>Keep receipts, auction records, and grading certificates</li>
<li>Maintain a digital inventory with current market values</li>
<li>Update valuations quarterly — card markets move fast</li>
</ul>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">🏠 Insurance Options</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li><strong>Homeowner's/renter's policy:</strong> Usually covers up to $1,500 for collectibles — not enough for serious collections</li>
<li><strong>Scheduled personal property:</strong> Add specific high-value cards to your existing policy</li>
<li><strong>Specialty collectors insurance:</strong> Companies like Collectibles Insurance Services specialize in this</li>
</ul>

<p style="font-size:15px;color:#374151;line-height:1.7;margin-top:16px;">💡 <strong>Pro tip:</strong> Use <a href="https://mycollectai.com" style="color:#7c3aed;">CollectAI's collection manager</a> to keep a digital inventory with AI-verified grades and real-time valuations — perfect for insurance documentation.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  8: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Market Watch: What's Trending Right Now 📈</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">Here's what's moving in the collectibles market right now:</p>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">🔥 Hot Right Now</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li><strong>Pokémon Scarlet & Violet era:</strong> Special art rares are commanding premiums, especially Japanese exclusives</li>
<li><strong>NBA rookie cards:</strong> Victor Wembanyama and Chet Holmgren cards are seeing massive demand</li>
<li><strong>Vintage baseball:</strong> Pre-war cards (T206, Goudey) continue their steady climb</li>
<li><strong>Soccer/Football:</strong> International cards gaining traction with US collectors</li>
</ul>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">📉 Cooling Off</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li>Modern overproduced base cards (2020–2023 mass prints)</li>
<li>Non-rookie parallels without meaningful scarcity</li>
</ul>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">💡 Smart Move</h3>
<p style="font-size:14px;color:#374151;line-height:1.7;">Grade and list your hot cards while demand is high. Know exactly what you have — <a href="https://mycollectai.com" style="color:#7c3aed;">scan your collection with CollectAI</a>.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,

  9: (name) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Your Collection Deserves More — Upgrade to Pro 🚀</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
<p style="font-size:15px;color:#374151;line-height:1.7;">Over the past two weeks, we've shared expert tips on grading, market trends, and collection management. Now it's time to put that knowledge to work.</p>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">What You've Learned</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li>✅ How to spot PSA 10 potential</li>
<li>✅ Record-breaking sales and what drives value</li>
<li>✅ Market trends across Pokémon, sports, and vintage</li>
<li>✅ Common mistakes to avoid when grading</li>
<li>✅ How to find hidden gems and low-pop cards</li>
<li>✅ Collection insurance and documentation</li>
</ul>

<h3 style="color:#7c3aed;font-size:16px;margin:20px 0 8px;">Why Go Pro?</h3>
<ul style="font-size:14px;color:#374151;line-height:1.8;padding-left:20px;">
<li><strong>Unlimited AI scans</strong> — grade and value every card in your collection</li>
<li><strong>AuthentiSeal™ verification</strong> — blockchain-backed authenticity certificates</li>
<li><strong>Portfolio analytics</strong> — track your collection's total value over time</li>
<li><strong>Priority support</strong> — get expert help when you need it</li>
</ul>

<div style="text-align:center;margin:32px 0;">
<a href="https://mycollectai.com/pricing" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:bold;font-size:16px;">Upgrade to Pro →</a>
</div>

<p style="font-size:13px;color:#9ca3af;text-align:center;">Thanks for being part of the CollectAI community. Happy collecting! 🎉</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>
</table></td></tr></table></body></html>`,
};

const DRIP_SUBJECTS: Record<number, string> = {
  1: "Welcome! Here's How to Spot a PSA 10 🏆",
  2: "The Top 5 Most Expensive Cards Sold This Year 💰",
  3: "Pokémon: Why Vintage Japanese Cards Are Exploding 🇯🇵",
  4: "Sports Legends: Cards That Made Millionaires 🏀⚾🏈",
  5: "3 Grading Mistakes That Cost Collectors Thousands 😱",
  6: "The Hidden Gem: Low-Pop Cards Worth Hunting 🔎",
  7: "Is Your Collection Insured? 🛡️",
  8: "Market Watch: What's Trending Right Now 📈",
  9: "Your Collection Deserves More — Upgrade to Pro 🚀",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard: only allow service-role calls (e.g. cron) via internal key header
    const internalKey = req.headers.get("x-internal-key");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey || internalKey !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const apiKey = Deno.env.get("SENDGRID_API_KEY")?.trim();
    const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL")?.trim();

    if (!apiKey || !fromEmail) {
      throw new Error("Email configuration missing");
    }

    // Get all due, unsent drip emails
    const today = new Date().toISOString().split("T")[0];
    const { data: queue, error: qErr } = await supabase
      .from("drip_campaign_queue")
      .select("id, lead_id, step, subject")
      .eq("sent", false)
      .lte("scheduled_for", today)
      .order("step")
      .limit(100);

    if (qErr) throw qErr;
    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ message: "No emails due", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get lead emails
    const leadIds = [...new Set(queue.map((q: any) => q.lead_id))];
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, email, name")
      .in("id", leadIds);

    const leadMap = new Map((leadsData || []).map((l: any) => [l.id, l]));

    let sentCount = 0;
    const errors: string[] = [];

    for (const item of queue) {
      const lead = leadMap.get(item.lead_id);
      if (!lead?.email) {
        errors.push(`No email for lead ${item.lead_id}`);
        continue;
      }

      const templateFn = emailTemplates[item.step as number];
      if (!templateFn) {
        errors.push(`No template for step ${item.step}`);
        continue;
      }

      const html = templateFn(lead.name || "Collector");

      // Send via SendGrid
      let sent = false;
      for (const baseUrl of ["https://api.sendgrid.com", "https://api.eu.sendgrid.com"]) {
        const sgRes = await fetch(`${baseUrl}/v3/mail/send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: lead.email }] }],
            from: { email: fromEmail, name: "CollectAI" },
            subject: item.subject || DRIP_SUBJECTS[item.step as number] || "CollectAI Tips",
            content: [{ type: "text/html", value: html }],
          }),
        });

        if (sgRes.ok || sgRes.status === 202) {
          sent = true;
          break;
        }
      }

      if (sent) {
        await supabase
          .from("drip_campaign_queue")
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq("id", item.id);
        sentCount++;
      } else {
        errors.push(`Failed to send step ${item.step} to ${lead.email}`);
      }
    }

    console.log(`Drip campaign: sent ${sentCount}, errors: ${errors.length}`);

    return new Response(JSON.stringify({ sent: sentCount, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("drip-campaign error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
