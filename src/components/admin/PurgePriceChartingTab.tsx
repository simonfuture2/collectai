import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const PURGE_PHRASE = "PURGE PRICECHARTING";

export default function PurgePriceChartingTab() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const purge = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_purge_pricecharting", { _confirm: text });
    setBusy(false);
    if (error) return toast.error(error.message);
    setText("");
    toast.success(`PriceCharting data purged. ${(data as any)?.cards_cleared ?? 0} cards cleared; price check turned off.`);
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader><CardTitle className="text-destructive">Purge PriceCharting data</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Use this if the PriceCharting subscription ends. It permanently empties the stored PriceCharting price list and lookup cache,
          clears PriceCharting prices saved on every card, and turns free price check off for everyone. This cannot be undone.
        </p>
        <div className="space-y-2">
          <Label htmlFor="purge-confirm">Type <span className="font-mono font-semibold">{PURGE_PHRASE}</span> to confirm</Label>
          <Input id="purge-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        <Button variant="destructive" disabled={text !== PURGE_PHRASE || busy} onClick={purge}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
          Purge PriceCharting data
        </Button>
      </CardContent>
    </Card>
  );
}
