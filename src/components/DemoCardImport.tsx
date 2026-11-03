import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { trackAgentEvent } from "@/lib/agentRef";
import { deleteDemoCard, isFresh, loadDemoCard } from "@/lib/demoCard";

let running = false; // one import at a time across re-mounts

/** Imports the card a visitor scanned on the home page before signing up. */
export default function DemoCardImport({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (running) return;
    const entry = await loadDemoCard();
    if (!entry) return;
    if (!isFresh(entry.at)) { await deleteDemoCard(); return; }
    running = true; setBusy(true); setFailed(false);
    try {
      const path = `${userId}/demo-${entry.at}.jpg`;
      const up = await supabase.storage.from("card-images").upload(path, entry.photo, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      const check = await supabase.functions.invoke("price-check", { body: { imagePath: path } });
      const priceCheckId = check.data?.priceCheckId;
      if (check.error || !priceCheckId) throw new Error("price check failed");
      const save = await supabase.functions.invoke("price-check-save", { body: { priceCheckId } });
      const cardId = save.data?.cardId;
      if (!cardId) throw new Error("save failed");
      await deleteDemoCard();
      void trackAgentEvent("demo_card_imported");
      toast({ title: "Your demo card is in your collection." });
      navigate(`/card/${cardId}`);
    } catch (e) {
      console.warn("[demo-import]", e);
      setFailed(true);
    } finally { running = false; setBusy(false); }
  }, [userId, navigate, toast]);

  useEffect(() => { void run(); }, [run]);

  if (!failed && !busy) return null;
  if (busy && !failed) {
    return <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"><Loader2 className="h-4 w-4 animate-spin text-primary" />Saving your demo card…</div>;
  }
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
      <p className="text-sm font-medium">Finish saving your demo card</p>
      <Button size="sm" onClick={run} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}Retry</Button>
    </div>
  );
}
