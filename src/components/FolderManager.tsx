import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderPlus, Folder, MoreHorizontal, Pencil, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface FolderData {
  id: string;
  name: string;
  color: string;
  card_count?: number;
}

interface FolderManagerProps {
  userId: string;
  activeFolder: string | null;
  onFolderChange: (folderId: string | null) => void;
  folders: FolderData[];
  onFoldersChange: () => void;
}

const FOLDER_COLORS = [
  "#6366f1", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6",
];

const FolderManager = ({ userId, activeFolder, onFolderChange, folders, onFoldersChange }: FolderManagerProps) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0]);
  const [editFolder, setEditFolder] = useState<FolderData | null>(null);
  const { toast } = useToast();

  const createFolder = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from("folders").insert({
      user_id: userId,
      name: newName.trim(),
      color: newColor,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewName("");
      setNewColor(FOLDER_COLORS[0]);
      setCreateOpen(false);
      onFoldersChange();
    }
  };

  const updateFolder = async () => {
    if (!editFolder || !newName.trim()) return;
    const { error } = await supabase
      .from("folders")
      .update({ name: newName.trim(), color: newColor })
      .eq("id", editFolder.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEditOpen(false);
      setEditFolder(null);
      if (activeFolder === editFolder.id) onFolderChange(editFolder.id);
      onFoldersChange();
    }
  };

  const deleteFolder = async (id: string) => {
    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (activeFolder === id) onFolderChange(null);
      onFoldersChange();
    }
  };

  const openEdit = (folder: FolderData) => {
    setEditFolder(folder);
    setNewName(folder.name);
    setNewColor(folder.color);
    setEditOpen(true);
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {/* All cards chip */}
      <button
        onClick={() => onFolderChange(null)}
        className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
          activeFolder === null
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-muted-foreground border-border hover:border-primary/40"
        }`}
      >
        All Cards
      </button>

      {/* Folder chips */}
      {folders.map((f) => (
        <div key={f.id} className="shrink-0 flex items-center group">
          <button
            onClick={() => onFolderChange(activeFolder === f.id ? null : f.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeFolder === f.id
                ? "border-primary ring-1 ring-ring"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
            style={{
              backgroundColor: activeFolder === f.id ? f.color + "22" : undefined,
              color: activeFolder === f.id ? f.color : undefined,
              borderColor: activeFolder === f.id ? f.color + "55" : undefined,
            }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
            {f.name}
            {f.card_count !== undefined && (
              <span className="text-[10px] opacity-60">{f.card_count}</span>
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-muted transition-all">
                <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuItem onClick={() => openEdit(f)}>
                <Pencil className="w-3 h-3 mr-2" /> Rename
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                    <Trash2 className="w-3 h-3 mr-2" /> Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{f.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cards in this folder won't be deleted, only the folder itself.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteFolder(f.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}

      {/* Create folder button */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <button className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all flex items-center gap-1.5 whitespace-nowrap">
            <Plus className="w-3 h-3" /> New Folder
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="e.g. Favorites, For Sale..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
              autoFocus
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Color</p>
              <div className="flex gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      newColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createFolder} disabled={!newName.trim()} size="sm">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit folder dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && updateFolder()}
              autoFocus
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Color</p>
              <div className="flex gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      newColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={updateFolder} disabled={!newName.trim()} size="sm">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FolderManager;
