import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in user's referral code and share link (to /price-check, the free entry point). */
export function useReferralCode() {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: row } = await supabase.from("referral_codes").select("code").eq("user_id", data.user.id).maybeSingle();
      if (live) setCode(row?.code ?? null);
    });
    return () => { live = false; };
  }, []);
  const link = code ? `${window.location.origin}/price-check?ref=${code}` : `${window.location.origin}/price-check`;
  return { code, link };
}
