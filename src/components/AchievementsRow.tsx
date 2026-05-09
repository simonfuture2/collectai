import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { computeAchievements, type AchievementCard } from "@/lib/achievements";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  cards: AchievementCard[];
}

const AchievementsRow = ({ cards }: Props) => {
  const achievements = useMemo(() => computeAchievements(cards), [cards]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <section className="bg-card border border-border rounded-2xl p-6 mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-lg">Achievements</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {unlockedCount}/{achievements.length} unlocked
        </p>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-3">
        {achievements.map((a) => {
          const Icon = a.icon;
          const pct = a.progress
            ? Math.round((a.progress.current / a.progress.target) * 100)
            : a.unlocked
            ? 100
            : 0;
          return (
            <Tooltip key={a.id}>
              <TooltipTrigger asChild>
                <div
                  className={`group relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all hover-scale ${
                    a.unlocked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-muted/30 opacity-60"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      a.unlocked
                        ? "gradient-primary glow-purple"
                        : "bg-muted"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        a.unlocked
                          ? "text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <p className="text-[10px] font-medium text-center leading-tight line-clamp-1">
                    {a.title}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.description}</p>
                {a.progress && !a.unlocked && (
                  <p className="text-xs mt-1">
                    Progress: {Math.floor(a.progress.current)}/{a.progress.target} ({pct}%)
                  </p>
                )}
                {a.unlocked && (
                  <p className="text-xs text-primary mt-1">✓ Unlocked</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
};

export default AchievementsRow;
