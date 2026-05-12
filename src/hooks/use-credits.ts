import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CreditState {
  credits: number;
  plan: "free" | "pro";
  subscribed: boolean;
  subscriptionEnd: string | null;
  loading: boolean;
}

export function useCredits() {
  const [state, setState] = useState<CreditState>({
    credits: 0,
    plan: "free",
    subscribed: false,
    subscriptionEnd: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState({ credits: 0, plan: "free", subscribed: false, subscriptionEnd: null, loading: false });
        return;
      }
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setState({
        credits: data.credits ?? 0,
        plan: data.plan ?? "free",
        subscribed: data.subscribed ?? false,
        subscriptionEnd: data.subscription_end ?? null,
        loading: false,
      });
    } catch (err) {
      console.error("Failed to check credits:", err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    const interval = setInterval(refresh, 60000);
    return () => {
      clearInterval(interval);
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const isPro = state.plan === "pro" || state.subscribed;
  const canScan = isPro || state.credits > 0;

  return { ...state, isPro, canScan, refresh };
}
