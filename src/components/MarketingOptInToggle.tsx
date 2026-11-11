import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/** Account setting: "Send me tips and updates". Account emails (receipts, sign-in) are sent either way. */
export default function MarketingOptInToggle({ userId }: { userId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.from("profiles").select("marketing_opt_in").eq("id", userId).maybeSingle().then(({ data }) => setOn(!!data?.marketing_opt_in));
  }, [userId]);
  const change = async (v: boolean) => {
    setOn(v);
    const { error } = await supabase.from("profiles").update({ marketing_opt_in: v, marketing_opt_in_at: v ? new Date().toISOString() : null }).eq("id", userId);
    if (error) { setOn(!v); toast.error("Couldn't save that"); } else toast.success(v ? "You'll get tips and updates" : "No more tips and updates");
  };
  if (on === null) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <Label htmlFor="mkt-opt" className="font-medium">Send me tips and updates</Label>
        <p className="text-xs text-muted-foreground">Occasional emails about new features. Account emails are always sent.</p>
      </div>
      <Switch id="mkt-opt" checked={on} onCheckedChange={change} />
    </div>
  );
}
