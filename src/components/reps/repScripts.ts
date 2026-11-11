// Call scripts and voicemails for reps. Voicemails stay under 25 seconds (checked in salesReps tests via voicemailFits).
export function callScript(o: { leadType?: string | null; business?: string | null; first?: string | null; rep: string }) {
  const who = o.first || "there";
  const shop = o.business || "your shop";
  if (o.leadType === "card_shop") return [
    `Hi ${who}, this is ${o.rep} with MyCollectAI in Baltimore. Do you have a quick minute?`,
    `We built a free app that prices a card from a photo. Shops use it at the counter when someone walks in with a binder.`,
    `Do you buy cards at ${shop}? (If yes) How do you price them today?`,
    `Would it help if I showed you in 15 minutes? I can send a time that works.`,
  ];
  return [
    `Hi ${who}, this is ${o.rep} with MyCollectAI. Do you have a quick minute?`,
    `We make a free app that prices trading and sports cards from a photo.`,
    `How do you check what your cards are worth today?`,
    `Could I show you in 15 minutes? I can send a time that works.`,
  ];
}

export function voicemailScript(o: { first?: string | null; rep: string; phone?: string | null }) {
  return `Hi ${o.first || "there"}, it's ${o.rep} from MyCollectAI. We have a free app that prices cards from a photo, and I think it could help you. Call me back at ${o.phone || "this number"}. Thanks!`;
}
