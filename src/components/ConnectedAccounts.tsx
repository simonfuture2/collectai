import { Shield, ExternalLink, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import authentisealCombo from "@/assets/mycollectai-authentiseal-combo.png";

const ConnectedAccounts = () => {
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

        {/* Info blurb */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your CollectAI account is linked to AuthentiSeal for seamless certificate creation. 
          When you create a certificate from a card detail page, your data is securely transferred via a signed token.
        </p>
      </CardContent>
    </Card>
  );
};

export default ConnectedAccounts;
