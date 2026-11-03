import { Maximize, SunDim, Shield, Square } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

const TIPS = [
  { icon: Maximize, text: "Fill most of the screen with the card." },
  { icon: SunDim, text: "Tilt away from lights to avoid glare." },
  { icon: Shield, text: "Sleeves, toploaders and slabs are fine." },
  { icon: Square, text: "One card at a time, on a plain surface." },
];

export default function HelpSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md px-4 pb-8">
          <DrawerTitle className="py-3 font-display text-lg">Scanning tips</DrawerTitle>
          <div className="grid grid-cols-2 gap-3">
            {TIPS.map(({ icon: Icon, text }) => (
              <div key={text} className="rounded-2xl bg-muted p-3 text-center">
                <div className="mx-auto mb-2 flex aspect-[63/88] w-16 items-center justify-center rounded-lg border-2 border-primary/60 bg-background">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <p className="text-xs leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
