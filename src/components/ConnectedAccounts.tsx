import { useEffect, useState } from "react";
import { Shield, ExternalLink, Link2, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const ConnectedAccounts = () => {
  const [certCount, setCertCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCount = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }

      const { count } = await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .not("authentiseal_serial", "is", null);

      setCertCount(count || 0);
      setLoading(false);
    };
    fetchCount();
  }, []);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          Connected Accounts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AuthentiSeal Connection */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">AuthentiSeal</p>
            <p className="text-xs text-muted-foreground">
              Certificate of Authenticity platform
            </p>
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Linked via secure token
            </p>
          </div>
          <a
            href="https://authentiseal.xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              Visit
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
        </div>

        {/* Certificate count */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
          <Award className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {loading ? "..." : certCount} Certified Item{certCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Items with AuthentiSeal certificates
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Your MyCollectAI account is linked to AuthentiSeal for seamless certificate creation.
          When you create a certificate from a card detail page, your data is securely transferred via a signed token.
        </p>
      </CardContent>
    </Card>
  );
};

export default ConnectedAccounts;
