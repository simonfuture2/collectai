import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Status { paused_inboxes: { email: string; reason: string }[]; broadcasts_paused_at: string | null; broadcasts_paused_reason: string | null }

/** Shown on Overview whenever an inbox or the broadcast lane has been paused automatically. */
export default function DeliverabilityBanner({ go }: { go: (s: string) => void }) {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => { supabase.rpc("deliverability_status").then(({ data }) => setS(data as unknown as Status)); }, []);
  if (!s || (!s.paused_inboxes?.length && !s.broadcasts_paused_at)) return null;
  return (
    <button onClick={() => go("channels")} className="w-full text-left rounded-xl border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="text-sm space-y-1">
        <p className="font-semibold">Sending is paused to protect your inboxes</p>
        {s.paused_inboxes.map((i) => <p key={i.email}>{i.email}: {i.reason.replace(/^Auto-paused: /, "")}</p>)}
        {s.broadcasts_paused_at && <p>Broadcasts: {s.broadcasts_paused_reason}</p>}
        <p className="text-muted-foreground">Open Channels → Email health to review and resume.</p>
      </div>
    </button>
  );
}
