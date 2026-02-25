import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const HeroBackground = () => {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  useEffect(() => {
    // Check if hero image already exists in storage
    const { data } = supabase.storage
      .from("generated-assets")
      .getPublicUrl("hero-background.png");
    
    // Try loading the image to see if it exists
    const img = new Image();
    img.onload = () => setHeroUrl(data.publicUrl);
    img.onerror = () => setHeroUrl(null); // Will show CSS-only background
    img.src = data.publicUrl;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* AI-generated hero image layer */}
      {heroUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 dark:opacity-15"
          style={{ backgroundImage: `url(${heroUrl})` }}
        />
      )}

      {/* Animated gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 animate-gradient" />

      {/* Floating card silhouettes */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-lg border border-primary/10 bg-primary/5 backdrop-blur-sm"
          style={{
            width: `${60 + i * 15}px`,
            height: `${84 + i * 20}px`,
            left: `${10 + i * 15}%`,
            top: `${20 + (i % 3) * 25}%`,
            animation: `floatCard ${8 + i * 2}s ease-in-out infinite`,
            animationDelay: `${i * -1.5}s`,
            transform: `rotate(${-15 + i * 8}deg)`,
            opacity: 0.3 + (i % 3) * 0.1,
          }}
        >
          <div className="absolute inset-1 rounded border border-primary/10" />
          <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-primary/20" />
        </div>
      ))}

      {/* Sparkle particles */}
      {[...Array(12)].map((_, i) => (
        <div
          key={`sparkle-${i}`}
          className="absolute rounded-full bg-primary/30"
          style={{
            width: `${2 + (i % 3) * 2}px`,
            height: `${2 + (i % 3) * 2}px`,
            left: `${5 + i * 8}%`,
            top: `${10 + (i * 7) % 80}%`,
            animation: `sparkle ${3 + (i % 4)}s ease-in-out infinite`,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
    </div>
  );
};

export default HeroBackground;
