import { Info } from "lucide-react";
import { ANDROID_PLANS_MSG } from "@/lib/platform";

export default function AndroidPlansNotice({ message = ANDROID_PLANS_MSG }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
      <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
      <span>{message}</span>
    </div>
  );
}
