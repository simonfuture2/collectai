import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Provider = "PSA" | "BGS" | "CGC" | "SGC" | "TAG" | "AuthentiSeal";

function verifyUrl(company: Provider, cert: string): string | null {
  const c = encodeURIComponent(cert.trim());
  switch (company) {
    case "PSA":
      return `https://www.psacard.com/cert/${c}`;
    case "BGS":
      return `https://www.beckett.com/grading/card-lookup?certNumber=${c}`;
    case "CGC":
      return `https://www.cgccards.com/certlookup/${c}/`;
    case "SGC":
      return `https://gosgc.com/cert/${c}`;
    case "TAG":
      return `https://my.taggrading.com/card/${c}`;
    case "AuthentiSeal":
      return `https://authentiseal.lovable.app/verify/${c}`;
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { company, cert_number } = await req.json();
    if (!company || !cert_number) {
      return new Response(JSON.stringify({ error: "company and cert_number required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = verifyUrl(company as Provider, String(cert_number));
    if (!url) {
      return new Response(JSON.stringify({ error: "Unsupported grading company" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Attempt a lightweight fetch to check the cert page resolves (link-out verification).
    let reachable = false;
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      reachable = res.ok;
    } catch {
      reachable = false;
    }

    return new Response(
      JSON.stringify({ verify_url: url, reachable, company, cert_number }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
