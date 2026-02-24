import { useState } from "react";
import { Shield, ExternalLink, CheckCircle, XCircle, Loader2, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AUTHENTISEAL_API = "https://vfttlgqsexcdpxihtwzl.supabase.co/functions/v1/verify-public";

interface CertificateData {
  serial_number?: string;
  item_name?: string;
  item_category?: string;
  status?: string;
  issued_at?: string;
  issuer_name?: string;
  [key: string]: unknown;
}

interface CardData {
  name?: string;
  category?: string;
  set?: string;
  year?: string;
  condition?: string;
  valueLow?: number;
  valueHigh?: number;
}

interface AuthentiSealVerifyProps {
  className?: string;
  defaultSerial?: string;
  cardData?: CardData;
}

const AuthentiSealVerify = ({ className = "", defaultSerial = "", cardData }: AuthentiSealVerifyProps) => {
  const [serial, setSerial] = useState(defaultSerial);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ verified: boolean; certificate: CertificateData } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    if (!serial.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${AUTHENTISEAL_API}?serial=${encodeURIComponent(serial.trim())}`);
      if (!res.ok) {
        throw new Error(`Verification failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-emerald-500" />
        <h3 className="font-display font-bold text-base">AuthentiSeal Verification</h3>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Enter certificate serial (e.g., COA-XXXX-XXXX)"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && verify()}
          className="text-sm"
        />
        <Button
          onClick={verify}
          disabled={loading || !serial.trim()}
          className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
          <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-xl ${
            result.verified
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : "bg-destructive/10 border border-destructive/20"
          }`}>
            {result.verified ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            )}
            <div>
              <p className={`font-medium text-sm ${result.verified ? "text-emerald-400" : "text-destructive"}`}>
                {result.verified ? "Certificate Verified ✓" : "Not Verified"}
              </p>
              {result.certificate?.item_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{result.certificate.item_name}</p>
              )}
            </div>
          </div>

          {result.verified && result.certificate && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {result.certificate.serial_number && (
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Serial</p>
                  <p className="font-mono font-medium text-foreground">{result.certificate.serial_number}</p>
                </div>
              )}
              {result.certificate.item_category && (
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">{result.certificate.item_category}</p>
                </div>
              )}
              {result.certificate.issuer_name && (
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Issuer</p>
                  <p className="font-medium text-foreground">{result.certificate.issuer_name}</p>
                </div>
              )}
              {result.certificate.status && (
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium text-foreground capitalize">{result.certificate.status}</p>
                </div>
              )}
            </div>
          )}

          <a
            href={`https://authentiseal.lovable.app/verify/${serial}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span>View full certificate on AuthentiSeal</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Create Certificate Section */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <FilePlus2 className="w-5 h-5 text-emerald-500" />
          <h3 className="font-display font-bold text-base">Create Authentication Certificate</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Get an official Certificate of Authenticity for this item via AuthentiSeal.xyz
        </p>
        <a
          href={buildAuthentiSealCreateUrl(cardData)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Shield className="w-4 h-4" />
            Create Certificate on AuthentiSeal
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </a>
      </div>
    </div>
  );
};

function buildAuthentiSealCreateUrl(cardData?: CardData): string {
  const base = "https://authentiseal.xyz/create";
  if (!cardData) return base;

  const params = new URLSearchParams();
  if (cardData.name) params.set("item_name", cardData.name);
  if (cardData.category) params.set("item_category", cardData.category);
  if (cardData.set) params.set("item_set", cardData.set);
  if (cardData.year) params.set("item_year", cardData.year);
  if (cardData.condition) params.set("condition", cardData.condition);
  if (cardData.valueLow) params.set("value_low", String(cardData.valueLow));
  if (cardData.valueHigh) params.set("value_high", String(cardData.valueHigh));
  params.set("source", "collectai");

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default AuthentiSealVerify;
