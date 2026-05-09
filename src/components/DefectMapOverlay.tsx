import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface Defect {
  type: string;
  side?: "front" | "back";
  x: number;
  y: number;
  severity?: "minor" | "moderate" | "severe";
  note?: string;
}

interface Props {
  imageUrl: string;
  alt: string;
  defects: Defect[];
}

const SEVERITY_COLOR: Record<string, string> = {
  minor: "bg-yellow-400 border-yellow-600",
  moderate: "bg-orange-500 border-orange-700",
  severe: "bg-red-500 border-red-700",
};

const TYPE_LABEL: Record<string, string> = {
  corner_wear: "Corner wear",
  edge_ding: "Edge ding",
  scratch: "Scratch",
  print_line: "Print line",
  whitening: "Whitening",
  centering_offset: "Centering",
  crease: "Crease",
  stain: "Stain",
};

const DefectMapOverlay = ({ imageUrl, alt, defects }: Props) => {
  const [show, setShow] = useState(true);
  const frontDefects = defects.filter((d) => !d.side || d.side === "front");
  const validDefects = frontDefects.filter(
    (d) => typeof d.x === "number" && typeof d.y === "number" && d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1
  );

  const counts = validDefects.reduce<Record<string, number>>((acc, d) => {
    const k = d.severity || "moderate";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-muted">
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-contain"
        />
        {show &&
          validDefects.map((d, i) => {
            const cls = SEVERITY_COLOR[d.severity || "moderate"];
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Defect: ${TYPE_LABEL[d.type] || d.type}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 ${cls} shadow-lg animate-pulse cursor-help`}
                    style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="font-semibold">{TYPE_LABEL[d.type] || d.type}</p>
                  {d.severity && (
                    <p className="text-xs capitalize text-muted-foreground">
                      {d.severity}
                    </p>
                  )}
                  {d.note && <p className="text-xs mt-1 max-w-[200px]">{d.note}</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
      </div>

      {validDefects.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs">
            {counts.severe ? (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> {counts.severe} severe
              </span>
            ) : null}
            {counts.moderate ? (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> {counts.moderate} moderate
              </span>
            ) : null}
            {counts.minor ? (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> {counts.minor} minor
              </span>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShow((s) => !s)}
            className="gap-1"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {show ? "Hide defect map" : "Show defect map"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default DefectMapOverlay;
