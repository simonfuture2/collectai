import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FolderPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FolderData } from "./FolderManager";

interface AddToFolderMenuProps {
  cardIds: string[];
  folders: FolderData[];
  onDone: () => void;
}

const AddToFolderMenu = ({ cardIds, folders, onDone }: AddToFolderMenuProps) => {
  const [open, setOpen] = useState(false);
  const [activeFolderIds, setActiveFolderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load current folder assignments for first card (as reference)
  useEffect(() => {
    if (!open || cardIds.length === 0) return;
    supabase
      .from("card_folders")
      .select("folder_id")
      .eq("card_id", cardIds[0])
      .then(({ data }) => {
        if (data) setActiveFolderIds(new Set(data.map((r) => r.folder_id)));
      });
  }, [open, cardIds]);

  const toggleFolder = async (folderId: string) => {
    setLoading(true);
    const isActive = activeFolderIds.has(folderId);

    if (isActive) {
      // Remove cards from folder
      const { error } = await supabase
        .from("card_folders")
        .delete()
        .in("card_id", cardIds)
        .eq("folder_id", folderId);
      if (!error) {
        setActiveFolderIds((prev) => { const s = new Set(prev); s.delete(folderId); return s; });
      }
    } else {
      // Add cards to folder
      const rows = cardIds.map((card_id) => ({ card_id, folder_id: folderId }));
      const { error } = await supabase.from("card_folders").upsert(rows, { onConflict: "card_id,folder_id" });
      if (!error) {
        setActiveFolderIds((prev) => new Set(prev).add(folderId));
      }
    }
    setLoading(false);
    onDone();
  };

  if (folders.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FolderPlus className="w-3.5 h-3.5" /> Folder
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="center">
        <p className="text-xs text-muted-foreground mb-2 px-1">Add to folder</p>
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => toggleFolder(f.id)}
            disabled={loading}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-left"
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
            <span className="truncate flex-1">{f.name}</span>
            {activeFolderIds.has(f.id) && (
              <span className="text-primary text-xs">✓</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

export default AddToFolderMenu;
