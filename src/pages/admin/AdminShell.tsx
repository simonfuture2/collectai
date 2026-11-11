import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Inbox, Users, ListOrdered, Megaphone, FileText, Radio, UserRound, Receipt, FlaskConical,
  ClipboardList, ShieldCheck, Filter, BarChart3, Handshake, Film, Bell, Target, Microscope, Database, Swords, ArrowLeft, Loader2, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { ADMIN_GROUPS, ADMIN_SECTIONS, sectionFromHash, visibleSections, type AdminSection } from "@/lib/adminSections";

const AdminPage = lazy(() => import("@/pages/Admin"));
const AgentHQ = lazy(() => import("@/pages/admin/AgentHQ"));
const PriceCheckLab = lazy(() => import("@/pages/admin/PriceCheckLab"));
const IdBakeoff = lazy(() => import("@/pages/admin/IdBakeoff"));
const OverviewSection = lazy(() => import("@/components/admin/shell/OverviewSection"));
const PartnersSection = lazy(() => import("@/components/admin/shell/PartnersSection"));
const BroadcastsSection = lazy(() => import("@/components/admin/shell/BroadcastsSection"));
const TemplatesSection = lazy(() => import("@/components/admin/shell/TemplatesSection"));
const SendingAccountsSection = lazy(() => import("@/components/admin/shell/SendingAccountsSection"));

const ICONS: Record<string, typeof Inbox> = {
  overview: LayoutDashboard, inbox: Inbox, leads: Users, sequences: ListOrdered, broadcasts: Megaphone, templates: FileText,
  channels: Radio, users: UserRound, transactions: Receipt, beta: FlaskConical, "beta-audit": ClipboardList, admins: ShieldCheck,
  funnel: Filter, results: BarChart3, partners: Handshake, videos: Film, push: Bell, accuracy: Target, lab: Microscope,
  "pc-data": Database, bakeoff: Swords,
};
const AGENT_IDS = new Set(["inbox", "leads", "channels", "results", "funnel", "videos"]);
const ADMIN_PAGE_IDS: Record<string, string> = {
  sequences: "sequences", broadcasts: "broadcasts", templates: "templates", users: "users", transactions: "transactions",
  beta: "beta", "beta-audit": "beta-audit", admins: "admins", push: "push", accuracy: "accuracy", "pc-data": "pc-purge",
};

function AdminNav({ sections, active }: { sections: AdminSection[]; active: string }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {ADMIN_GROUPS.map((g) => {
          const items = sections.filter((s) => s.group === g);
          if (!items.length) return null;
          return (
            <SidebarGroup key={g}>
              {g !== "Overview" && <SidebarGroupLabel>{g}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((s) => {
                    const Icon = ICONS[s.id] ?? LayoutDashboard;
                    return (
                      <SidebarMenuItem key={s.id}>
                        <SidebarMenuButton asChild isActive={active === s.id} tooltip={s.label}>
                          <Link to={`/admin#${s.id}`} onClick={() => setOpenMobile(false)}>
                            <Icon className="h-4 w-4" />{!collapsed && <span>{s.label}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}

export default function AdminShell() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [isAgentAdmin, setIsAgentAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate(`/auth?next=${encodeURIComponent("/admin")}`); return; }
      const { data } = await supabase.from("agent_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      setIsAgentAdmin(!!data);
    })();
  }, [navigate]);

  const access = { isAdmin, isAgentAdmin: !!isAgentAdmin };
  const sections = useMemo(() => visibleSections(access), [isAdmin, isAgentAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = sectionFromHash(hash, access);
  const label = ADMIN_SECTIONS.find((s) => s.id === active)?.label ?? "Admin";
  const go = (id: string) => navigate(`/admin#${id}`);

  if (adminLoading || isAgentAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!sections.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to app</Button>
      </div>
    );
  }

  let body: JSX.Element;
  if (active === "overview") body = <OverviewSection go={go} />;
  else if (active === "partners") body = <PartnersSection />;
  else if (active === "broadcasts") body = <BroadcastsSection />;
  else if (active === "templates") body = <TemplatesSection />;
  else if (active === "channels") body = <div className="space-y-6"><SendingAccountsSection /><AgentHQ key="channels" section="channels" /></div>;
  else if (active === "lab") body = <PriceCheckLab />;
  else if (active === "bakeoff") body = <IdBakeoff />;
  else if (AGENT_IDS.has(active)) body = <AgentHQ key={active} section={active as "inbox"} />;
  else body = <AdminPage section={ADMIN_PAGE_IDS[active] ?? active} />;

  return (
    <SidebarProvider>
      <SEO title={`${label} · Admin`} description="MyCollectAI admin" path="/admin" noIndex />
      <div className="min-h-screen flex w-full bg-background">
        <AdminNav sections={sections} active={active} />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 h-14 flex items-center gap-2 border-b border-border bg-background/90 backdrop-blur px-3">
            <SidebarTrigger />
            <h1 className="font-semibold truncate flex-1">{label}</h1>
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" />App</Link></Button>
            <ThemeToggle />
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
            <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}>{body}</Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
