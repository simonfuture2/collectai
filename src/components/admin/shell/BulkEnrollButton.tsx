import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import BulkEnrollDialog from "./BulkEnrollDialog";

export default function BulkEnrollButton() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" className="gap-1" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" />Enroll in a sequence</Button>
    <BulkEnrollDialog open={open} onOpenChange={setOpen} />
  </>;
}
