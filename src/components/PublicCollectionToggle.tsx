import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Globe, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PublicCollectionToggleProps {
  userId: string;
}

const PublicCollectionToggle = ({ userId }: PublicCollectionToggleProps) => {
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("public_collection_enabled, public_collection_slug")
        .eq("id", userId)
        .maybeSingle();

      if (data) {
        setEnabled(data.public_collection_enabled || false);
        setSlug(data.public_collection_slug);
      }
      setLoading(false);
    };
    fetch();
  }, [userId]);

  const toggle = async () => {
    setToggling(true);
    const newEnabled = !enabled;
    let newSlug = slug;

    // Generate slug if enabling for the first time
    if (newEnabled && !slug) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const base = (profile?.display_name || "collector").toLowerCase().replace(/[^a-z0-9]/g, "");
      newSlug = `${base}-${Math.random().toString(36).substring(2, 6)}`;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        public_collection_enabled: newEnabled,
        public_collection_slug: newSlug,
      })
      .eq("id", userId);

    if (error) {
      toast.error("Failed to update settings");
    } else {
      setEnabled(newEnabled);
      setSlug(newSlug);
      toast.success(newEnabled ? "Collection is now public!" : "Collection is now private");
    }
    setToggling(false);
  };

  const copyLink = () => {
    if (slug) {
      navigator.clipboard.writeText(`${window.location.origin}/u/${slug}`);
      toast.success("Collection link copied!");
    }
  };

  if (loading) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-bold">Public Collection</h3>
            <p className="text-xs text-muted-foreground">Share your portfolio with anyone</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={toggling} />
      </div>

      {enabled && slug && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground truncate">
            {window.location.origin}/u/{slug}
          </div>
          <Button variant="outline" size="icon" onClick={copyLink}>
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default PublicCollectionToggle;
