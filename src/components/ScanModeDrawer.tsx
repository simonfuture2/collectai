import { useNavigate } from "react-router-dom";
import { Layers, ScanSearch, ChevronRight } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useInsightCount } from "@/hooks/use-insight-count";
import { cn } from "@/lib/utils";

export function ScanModeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const recent = useInsightCount(7, open);
  const go = (to: string) => { onOpenChange(false); navigate(to); };

  const options = [
    { to: "/scan?mode=collection", icon: Layers, title: "Add to my collection", sub: "A card you own. Saved, priced and tracked in your portfolio.", tone: "primary" as const },
    { to: "/scan?mode=insight", icon: ScanSearch, title: "Insights only", sub: "At a show or shop? Price-check a raw or graded card without adding it.", tone: "secondary" as const },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md px-4 pb-8">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="font-display text-xl">What are you scanning?</DrawerTitle>
            <DrawerDescription className="sr-only">Choose a scan mode</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3">
            {options.map((o) => (
              <button
                key={o.to}
                type="button"
                onClick={() => go(o.to)}
                className={cn(
                  "w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors active:scale-[0.99]",
                  o.tone === "primary" ? "border-primary/40 bg-primary/5 hover:bg-primary/10" : "border-secondary/40 bg-secondary/5 hover:bg-secondary/10",
                )}
              >
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", o.tone === "primary" ? "bg-primary/15 text-primary" : "bg-secondary/15 text-secondary")}>
                  <o.icon className="h-6 w-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-foreground">{o.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{o.sub}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go("/insights")} className="mt-5 w-full text-center text-sm font-medium text-secondary hover:underline">
            View recent insights{recent > 0 ? ` (${recent})` : ""}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default ScanModeDrawer;
