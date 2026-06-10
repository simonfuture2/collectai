import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, Camera, Trash2, Search, X, SlidersHorizontal, ChevronDown, LayoutGrid, List, Download, CheckSquare, FolderPlus, Check, Shield, RefreshCw } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import EcosystemBadge from "@/components/EcosystemBadge";
import Footer from "@/components/Footer";
import FolderManager, { type FolderData } from "@/components/FolderManager";
import AddToFolderMenu from "@/components/AddToFolderMenu";
import type { User } from "@supabase/supabase-js";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";

interface Card {
  id: string;
  image_url: string;
  card_name: string | null;
  card_set: string | null;
  card_year: string | null;
  rarity: string | null;
  category: string | null;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  authentiseal_serial: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Trading Card": "bg-primary/15 text-primary border-primary/30",
  "Sports Card": "bg-secondary/15 text-secondary border-secondary/30",
  "Pokémon": "bg-collectai-yellow/15 text-accent border-accent/30",
  "Magic: The Gathering": "bg-collectai-blue/15 text-secondary border-secondary/30",
  "Yu-Gi-Oh!": "bg-collectai-orange/15 text-collectai-orange border-collectai-orange/30",
  "Comic Book": "bg-collectai-pink/15 text-collectai-pink border-collectai-pink/30",
  "Coin": "bg-collectai-green/15 text-collectai-green border-collectai-green/30",
  "Other": "bg-muted text-muted-foreground border-border",
};

const getCategoryStyle = (cat: string | null) =>
  CATEGORY_COLORS[cat || ""] || CATEGORY_COLORS["Other"];

type SortOption = "newest" | "oldest" | "value-high" | "value-low" | "name" | "grade-high" | "grade-low";

const PAGE_SIZE = 20;

const GRADE_ORDER: Record<string, number> = {
  "PSA 10": 1000, "BGS 10": 995, "SGC 10": 990, "CGC 10": 985,
  "PSA 9": 900, "BGS 9.5": 950, "BGS 9": 900, "SGC 9": 890, "CGC 9": 880,
  "PSA 8": 800, "BGS 8.5": 825, "BGS 8": 800, "SGC 8": 790, "CGC 8": 780,
  "PSA 7": 700, "BGS 7": 700, "SGC 7": 690, "CGC 7": 680,
  "PSA 6": 600, "BGS 6": 600, "SGC 6": 590, "CGC 6": 580,
  "PSA 5": 500, "BGS 5": 500, "SGC 5": 490, "CGC 5": 480,
  "PSA 4": 400, "BGS 4": 400, "SGC 4": 390, "CGC 4": 380,
  "PSA 3": 300, "BGS 3": 300, "SGC 3": 290, "CGC 3": 280,
  "PSA 2": 200, "BGS 2": 200, "SGC 2": 190, "CGC 2": 180,
  "PSA 1": 100, "BGS 1": 100, "SGC 1": 90, "CGC 1": 80,
  "Mint": 700, "Near Mint": 650, "Excellent": 550, "Very Good": 400,
  "Good": 300, "Fair": 200, "Poor": 100,
  "Raw": 0, "Ungraded": 0, "": -1,
};

const gradeRank = (g: string | null) => {
  if (!g) return -1;
  // exact match
  if (GRADE_ORDER[g] !== undefined) return GRADE_ORDER[g];
  // normalize: uppercase, remove extra spaces
  const normalized = g.toUpperCase().replace(/\s+/g, " ").trim();
  if (GRADE_ORDER[normalized] !== undefined) return GRADE_ORDER[normalized];
  // fuzzy prefix match (e.g. "PSA10" -> "PSA 10")
  for (const [key, val] of Object.entries(GRADE_ORDER)) {
    if (normalized.includes(key.toUpperCase().replace(/\s/g, ""))) return val;
  }
  return -1;
};

const Collection = () => {
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeRarity, setActiveRarity] = useState<string | null>(null);
  const [activeGrade, setActiveGrade] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [cardFolderMap, setCardFolderMap] = useState<Record<string, string[]>>({});
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
  }, [navigate]);

  useEffect(() => {
    if (user) {
      supabase
        .from("cards")
        .select("id, image_url, card_name, card_set, card_year, rarity, category, condition_grade, estimated_value_low, estimated_value_high, authentiseal_serial")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .then(async ({ data }) => {
          if (!data) { setCards([]); setLoading(false); return; }

          const cardsWithUrls = await Promise.all(
            data.map(async (card) => {
              const isFilePath = !card.image_url.startsWith("http");
              if (isFilePath) {
                const { data: signedData } = await supabase.storage
                  .from("card-images")
                  .createSignedUrl(card.image_url, 3600);
                return { ...card, image_url: signedData?.signedUrl || card.image_url };
              }
              const match = card.image_url.match(/card-images\/(.+?)(\?|$)/);
              if (match) {
                const { data: signedData } = await supabase.storage
                  .from("card-images")
                  .createSignedUrl(match[1], 3600);
                return { ...card, image_url: signedData?.signedUrl || card.image_url };
              }
              return card;
            })
          );

          setCards(cardsWithUrls);
          setLoading(false);
        });
    }
  }, [user]);

  // Fetch folders and card-folder mappings
  const fetchFolders = useCallback(async () => {
    if (!user) return;
    const { data: foldersData } = await supabase
      .from("folders")
      .select("id, name, color")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const { data: cfData } = await supabase
      .from("card_folders")
      .select("card_id, folder_id");

    if (foldersData) {
      const countMap: Record<string, number> = {};
      (cfData || []).forEach((cf) => {
        countMap[cf.folder_id] = (countMap[cf.folder_id] || 0) + 1;
      });
      setFolders(
        foldersData.map((f) => ({ ...f, card_count: countMap[f.id] || 0 }))
      );
    }

    // Build card -> folder[] map
    const map: Record<string, string[]> = {};
    (cfData || []).forEach((cf) => {
      if (!map[cf.card_id]) map[cf.card_id] = [];
      map[cf.card_id].push(cf.folder_id);
    });
    setCardFolderMap(map);
  }, [user]);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const deleteCard = async (id: string) => {
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setCards(cards.filter((c) => c.id !== id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("cards").delete().in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setCards(cards.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setBulkMode(false);
      toast({ title: "Deleted", description: `${ids.length} item(s) removed.` });
    }
  };

  const exportCSV = () => {
    const rows = filtered.filter((c) => selectedIds.size === 0 || selectedIds.has(c.id));
    const header = "Name,Set,Year,Category,Rarity,Grade,Est. Value\n";
    const csv = header + rows.map((c) =>
      `"${c.card_name || ""}","${c.card_set || ""}","${c.card_year || ""}","${c.category || ""}","${c.rarity || ""}","${c.condition_grade || ""}","$${(((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2).toFixed(0)}"`
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "collection.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((c) => c.id)));
  };

  // Derive unique categories and rarities for filter chips
  const categories = useMemo(() => {
    const cats = new Set(cards.map((c) => c.category || "Trading Card"));
    return Array.from(cats).sort();
  }, [cards]);

  const rarities = useMemo(() => {
    const rars = new Set(cards.filter((c) => c.rarity).map((c) => c.rarity!));
    return Array.from(rars).sort();
  }, [cards]);

  const grades = useMemo(() => {
    const grs = new Set(cards.filter((c) => c.condition_grade).map((c) => c.condition_grade!));
    return Array.from(grs).sort((a, b) => gradeRank(b) - gradeRank(a));
  }, [cards]);

  // Filter and sort
  const filtered = useMemo(() => {
    let list = [...cards];

    // Folder filter
    if (activeFolder) {
      const folderCardIds = new Set(
        Object.entries(cardFolderMap)
          .filter(([, fIds]) => fIds.includes(activeFolder))
          .map(([cardId]) => cardId)
      );
      list = list.filter((c) => folderCardIds.has(c.id));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.card_name || "").toLowerCase().includes(q) ||
          (c.card_set || "").toLowerCase().includes(q) ||
          (c.card_year || "").toLowerCase().includes(q) ||
          (c.rarity || "").toLowerCase().includes(q) ||
          (c.category || "").toLowerCase().includes(q)
      );
    }

    if (activeCategory) {
      list = list.filter((c) => (c.category || "Trading Card") === activeCategory);
    }

    if (activeRarity) {
      list = list.filter((c) => c.rarity === activeRarity);
    }

    if (activeGrade) {
      list = list.filter((c) => c.condition_grade === activeGrade);
    }

    switch (sortBy) {
      case "oldest":
        list.reverse();
        break;
      case "value-high":
        list.sort((a, b) => ((b.estimated_value_high || 0) - (a.estimated_value_high || 0)));
        break;
      case "value-low":
        list.sort((a, b) => ((a.estimated_value_low || 0) - (b.estimated_value_low || 0)));
        break;
      case "name":
        list.sort((a, b) => (a.card_name || "").localeCompare(b.card_name || ""));
        break;
      case "grade-high":
        list.sort((a, b) => gradeRank(b.condition_grade) - gradeRank(a.condition_grade));
        break;
      case "grade-low":
        list.sort((a, b) => gradeRank(a.condition_grade) - gradeRank(b.condition_grade));
        break;
    }

    return list;
  }, [cards, search, activeCategory, activeRarity, activeGrade, sortBy, activeFolder, cardFolderMap]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, activeCategory, activeRarity, activeGrade, sortBy, activeFolder]);

  const paginatedCards = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const totalValue = filtered.reduce(
    (sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2,
    0
  );

  // Stats
  const avgValue = filtered.length > 0 ? totalValue / filtered.length : 0;
  const gradesCount = filtered.filter((c) => c.condition_grade).length;
  const topCategory = useMemo(() => {
    if (filtered.length === 0) return null;
    const counts: Record<string, number> = {};
    filtered.forEach((c) => { const cat = c.category || "Trading Card"; counts[cat] = (counts[cat] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setActiveCategory(null);
    setActiveRarity(null);
    setActiveGrade(null);
    setSortBy("newest");
    setActiveFolder(null);
  };

  const hasActiveFilters = search || activeCategory || activeRarity || activeGrade || sortBy !== "newest" || activeFolder;

  const toggleCardFolder = async (cardId: string, folderId: string) => {
    const isInFolder = (cardFolderMap[cardId] || []).includes(folderId);
    if (isInFolder) {
      await supabase.from("card_folders").delete().eq("card_id", cardId).eq("folder_id", folderId);
    } else {
      await supabase.from("card_folders").upsert({ card_id: cardId, folder_id: folderId }, { onConflict: "card_id,folder_id" });
    }
    fetchFolders();
  };

  const cardValue = (c: Card) => ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2;

  const rescanCard = async (card: Card, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (rescanningId) return;
    setRescanningId(card.id);
    try {
      // Get the storage path from the image URL
      const match = card.image_url.match(/card-images\/([^?]+)/);
      const imagePath = match ? match[1] : card.image_url;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // analyze-card requires a signed URL from the card-images bucket
      const { data: signed, error: signErr } = await supabase
        .storage.from("card-images").createSignedUrl(imagePath, 3600);
      if (signErr || !signed?.signedUrl) throw signErr || new Error("Could not sign image URL");

      const response = await supabase.functions.invoke("analyze-card", {
        body: {
          images: [{ label: "Front", url: signed.signedUrl }],
          cardId: card.id,
        },
      });

      if (response.error) throw response.error;

      const result = response.data;
      // Update local state with new values
      setCards(prev => prev.map(c => c.id === card.id ? {
        ...c,
        card_name: result.card_name || c.card_name,
        card_set: result.card_set || c.card_set,
        card_year: result.card_year || c.card_year,
        rarity: result.rarity || c.rarity,
        category: result.category || c.category,
        condition_grade: result.condition_grade || c.condition_grade,
        estimated_value_low: result.estimated_value_low ?? c.estimated_value_low,
        estimated_value_high: result.estimated_value_high ?? c.estimated_value_high,
      } : c));

      toast({ title: "Re-Scan Complete", description: `${result.card_name || card.card_name || "Card"} has been updated.` });
    } catch (err: any) {
      toast({ title: "Re-Scan Failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setRescanningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="My Collection – Cards, Grades & Values | MyCollectAI"
        description="Browse your scanned cards, organize folders, and track total estimated value across your collection."
        path="/collection"
        noIndex
      />
      <header className="border-b border-border sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <h1 className="text-base sm:text-xl font-display font-bold truncate">My Collection</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[11px] sm:text-sm text-muted-foreground leading-tight">
                {filtered.length}{filtered.length !== cards.length ? `/${cards.length}` : ""} items
              </p>
              <p className="text-sm sm:text-lg font-display font-bold text-gradient-primary leading-tight">~${totalValue.toFixed(0)}</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Search & filter bar */}
        {cards.length > 0 && (
          <div className="container mx-auto px-4 pb-3 space-y-3">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, set, year, rarity..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-10 bg-card border-border"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter toggle, sort, view toggle, bulk */}
            <div className="flex items-center gap-2">
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">!</span>
                )}
              </Button>

              <Button
                variant={bulkMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => { setBulkMode(!bulkMode); if (bulkMode) setSelectedIds(new Set()); }}
                className="gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Select</span>
              </Button>

              {/* View toggle */}
              <div className="flex border border-border rounded-lg overflow-hidden ml-auto">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sort dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="appearance-none bg-card border border-border rounded-lg text-sm px-3 py-1.5 pr-8 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="value-high">Value: High → Low</option>
                  <option value="value-low">Value: Low → High</option>
                  <option value="name">Name A–Z</option>
                  <option value="grade-high">Grade: High → Low</option>
                  <option value="grade-low">Grade: Low → High</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Filter chips */}
            {showFilters && (
              <div className="space-y-2 animate-fade-in">
                {categories.length > 1 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">Category</p>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all ${
                            activeCategory === cat
                              ? getCategoryStyle(cat) + " ring-1 ring-ring"
                              : "bg-card text-muted-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {rarities.length > 1 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">Rarity</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rarities.map((r) => (
                        <button
                          key={r}
                          onClick={() => setActiveRarity(activeRarity === r ? null : r)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all ${
                            activeRarity === r
                              ? "bg-primary/15 text-primary border-primary/30 ring-1 ring-ring"
                              : "bg-card text-muted-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {grades.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">Grade</p>
                    <div className="flex flex-wrap gap-1.5">
                      {grades.map((g) => (
                        <button
                          key={g}
                          onClick={() => setActiveGrade(activeGrade === g ? null : g)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all ${
                            activeGrade === g
                              ? "bg-amber-500/15 text-amber-600 border-amber-500/30 ring-1 ring-ring"
                              : "bg-card text-muted-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Folder bar */}
        {!loading && cards.length > 0 && user && (
          <div className="mb-4">
            <FolderManager
              userId={user.id}
              activeFolder={activeFolder}
              onFolderChange={setActiveFolder}
              folders={folders}
              onFoldersChange={fetchFolders}
            />
          </div>
        )}

        {/* Stats summary bar */}
        {!loading && cards.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <div className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">Cards:</span>{" "}
              <span className="font-semibold">{filtered.length}</span>
            </div>
            <div className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">Total Value:</span>{" "}
              <span className="font-semibold">${totalValue.toFixed(0)}</span>
            </div>
            <div className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">Avg Value:</span>{" "}
              <span className="font-semibold">${avgValue.toFixed(0)}</span>
            </div>
            {gradesCount > 0 && (
              <div className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">Graded:</span>{" "}
                <span className="font-semibold">{gradesCount}</span>
              </div>
            )}
            {topCategory && (
              <div className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">Top:</span>{" "}
                <span className="font-semibold">{topCategory}</span>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
                <Skeleton className="aspect-[3/4] w-full" />
                <div className="p-2.5 sm:p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-6">No items in your collection yet</p>
            <Link to="/scan"><Button className="gradient-primary">Scan Your First Item</Button></Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No items match your search</p>
            <p className="text-xs text-muted-foreground mb-3">Try a broader term or different spelling</p>
            <button onClick={clearFilters} className="text-primary text-sm hover:underline">
              Clear filters
            </button>
          </div>
        ) : viewMode === "list" ? (
          /* ---- LIST / TABLE VIEW ---- */
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {bulkMode && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Set</TableHead>
                  <TableHead className="hidden md:table-cell">Year</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCards.map((card) => (
                  <TableRow
                    key={card.id}
                    className="cursor-pointer"
                    onClick={() => bulkMode ? toggleSelect(card.id) : navigate(`/card/${card.id}`)}
                  >
                    {bulkMode && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(card.id)}
                          onCheckedChange={() => toggleSelect(card.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {card.card_name || "Unknown"}
                        {card.authentiseal_serial && (
                          <span title="AuthentiSeal Certified"><Shield className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /></span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{card.card_set || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{card.card_year || "—"}</TableCell>
                    <TableCell>
                      {card.condition_grade ? (
                        <Badge variant="secondary" className="text-[10px]">{card.condition_grade}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">${cardValue(card).toFixed(0)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => rescanCard(card, e)} disabled={rescanningId === card.id} title="Re-Scan" aria-label="Re-scan card">
                          <RefreshCw className={`w-3.5 h-3.5 text-primary ${rescanningId === card.id ? "animate-spin" : ""}`} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()} aria-label="Delete card">
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {card.card_name || "this item"}?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteCard(card.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* ---- GRID VIEW ---- */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {paginatedCards.map((card) => (
              <ContextMenu key={card.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className="bg-card border border-border rounded-xl overflow-hidden hover-lift group cursor-pointer relative"
                    onClick={() => bulkMode ? toggleSelect(card.id) : navigate(`/card/${card.id}`)}
                  >
                    {bulkMode && (
                      <div className="absolute top-1.5 right-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(card.id)}
                          onCheckedChange={() => toggleSelect(card.id)}
                          className="bg-background/80 backdrop-blur-sm"
                        />
                      </div>
                    )}
                    <div className="aspect-[3/4] bg-muted relative">
                      <img
                        src={card.image_url}
                        alt={card.card_name ? `${card.card_name} trading card` : "Collectible item"}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                      />
                      <span
                        className={`absolute top-1.5 left-1.5 text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${getCategoryStyle(card.category)}`}
                      >
                        {card.category || "Trading Card"}
                      </span>
                      {card.condition_grade && (
                        <span className="absolute bottom-1.5 right-1.5 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-background/85 backdrop-blur-sm text-foreground border border-border">
                          {card.condition_grade}
                        </span>
                      )}
                      {card.authentiseal_serial && (
                        <span className="absolute top-1.5 right-1.5 bg-emerald-500/90 backdrop-blur-sm text-white p-1 rounded-md" title="AuthentiSeal Certified">
                          <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 sm:p-3">
                      <h3 className="font-display font-semibold text-sm truncate">{card.card_name || "Unknown"}</h3>
                      <p className="text-xs text-muted-foreground truncate">{card.card_set}</p>
                      <div className="flex justify-between items-center mt-1.5">
                        <span className="text-xs sm:text-sm font-medium text-gradient-primary">
                          ${cardValue(card).toFixed(0)}
                        </span>
                        {!bulkMode && (
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                              onClick={(e) => rescanCard(card, e)}
                              disabled={rescanningId === card.id}
                              title="Re-Scan"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 text-primary ${rescanningId === card.id ? "animate-spin" : ""}`} />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {card.card_name || "this item"}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently remove this item from your collection.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteCard(card.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                {folders.length > 0 && (
                  <ContextMenuContent>
                    <ContextMenuLabel className="flex items-center gap-1.5">
                      <FolderPlus className="w-3.5 h-3.5" /> Add to Folder
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    {folders.map((f) => {
                      const isIn = (cardFolderMap[card.id] || []).includes(f.id);
                      return (
                        <ContextMenuItem
                          key={f.id}
                          onClick={() => toggleCardFolder(card.id, f.id)}
                          className="flex items-center gap-2"
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                          <span className="flex-1 truncate">{f.name}</span>
                          {isIn && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                        </ContextMenuItem>
                      );
                    })}
                  </ContextMenuContent>
                )}
              </ContextMenu>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
              Load More ({filtered.length - visibleCount} remaining)
            </Button>
          </div>
        )}

        {/* Bulk action floating bar */}
        {bulkMode && selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-card border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 animate-fade-in">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <AddToFolderMenu
              cardIds={Array.from(selectedIds)}
              folders={folders}
              onDone={fetchFolders}
            />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} item(s)?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <div className="flex justify-center pt-8">
          <EcosystemBadge type="authentiseal" variant="inline" />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Collection;
