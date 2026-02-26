import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const stages = ["idle", "scanning", "graded"] as const;
type Stage = typeof stages[number];

const CARD_PATH = "4ed2a0f8-5913-4257-9433-d4338eb821bb/1766709209222-fleermetal_95-96_jordan.jpeg";

const ScanDemo = () => {
  const [stage, setStage] = useState<Stage>("idle");
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    supabase.storage.from("card-images").createSignedUrl(CARD_PATH, 3600).then(({ data }) => {
      if (data?.signedUrl) setImageUrl(data.signedUrl);
    });
  }, []);

  useEffect(() => {
    const cycle = () => {
      setStage("idle");
      const t1 = setTimeout(() => setStage("scanning"), 800);
      const t2 = setTimeout(() => setStage("graded"), 2400);
      const t3 = setTimeout(cycle, 5500);
      return [t1, t2, t3];
    };
    const timers = cycle();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-[3/4]">
      {/* Card silhouette */}
      <div className="absolute inset-0 rounded-2xl border-2 border-border bg-card overflow-hidden shadow-xl">
        {/* Real card image */}
        <img
          src={imageUrl}
          alt="Michael Jordan 1995-96 Fleer Metal"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Scanning sweep overlay */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            stage === "scanning" ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-primary/0 via-primary/20 to-primary/0 animate-scan-sweep" />
          <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_12px_hsl(var(--primary))] animate-scan-line" />
        </div>

        {/* Grade badge */}
        <div
          className={`absolute top-4 right-4 transition-all duration-500 ${
            stage === "graded"
              ? "opacity-100 scale-100"
              : "opacity-0 scale-50"
          }`}
        >
          <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-lg glow-purple">
            <div className="text-center">
              <p className="text-xs font-bold text-primary-foreground leading-none">EMT</p>
              <p className="text-lg font-display font-bold text-primary-foreground leading-none">6</p>
            </div>
          </div>
        </div>

        {/* Value badge */}
        <div
          className={`absolute bottom-4 left-4 right-4 transition-all duration-500 delay-200 ${
            stage === "graded"
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
        >
          <div className="rounded-xl bg-card/90 backdrop-blur border border-border p-3 shadow-lg">
            <p className="text-xs text-muted-foreground">Estimated Value</p>
            <p className="text-xl font-display font-bold text-gradient-primary">$80 – $200</p>
            <p className="text-xs text-muted-foreground mt-0.5">Michael Jordan · Fleer Metal · 1995-96</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScanDemo;
