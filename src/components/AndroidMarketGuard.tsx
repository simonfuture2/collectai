import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isAndroidApp, isMarketplacePath, ANDROID_NO_MARKET_MSG } from "@/lib/platform";

/** In the Android app, marketplace/wallet links bounce to the collection. */
export default function AndroidMarketGuard() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (isAndroidApp() && isMarketplacePath(pathname)) {
      toast(ANDROID_NO_MARKET_MSG);
      navigate("/collection", { replace: true });
    }
  }, [pathname, navigate]);
  return null;
}
