import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function usePushNotifications() {
  const registered = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || registered.current) return;

    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== "granted") return;

      await PushNotifications.register();

      PushNotifications.addListener("registration", async (token) => {
        registered.current = true;
        const platform = Capacitor.getPlatform(); // 'android' | 'ios'

        // Upsert token
        await (supabase as any)
          .from("push_tokens")
          .upsert(
            { user_id: session.user.id, token: token.value, platform },
            { onConflict: "user_id,token" }
          );
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration error:", err);
      });

      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        toast({
          title: notification.title || "CollectAI",
          description: notification.body || "",
        });
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const data = action.notification.data;
        if (data?.route) {
          window.location.href = data.route;
        }
      });
    };

    setup();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [toast]);
}
