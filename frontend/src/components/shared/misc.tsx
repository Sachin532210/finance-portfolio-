import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/data";
import { Button } from "@/components/ui/button";
import { GOAL_STATUS_LABELS, MONTHS, VERDICT_LABELS } from "@/lib/constants";
import type { GoalStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Budget traffic light: green safe, amber approaching, red over. */
export function BudgetStatusBadge({ status }: { status: "SAFE" | "WARNING" | "OVER" }) {
  const map = {
    SAFE: { variant: "success" as const, label: "Safe" },
    WARNING: { variant: "warning" as const, label: "Approaching limit" },
    OVER: { variant: "destructive" as const, label: "Over budget" },
  }[status];

  return (
    <Badge variant={map.variant}>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "SAFE" ? "bg-success" : status === "WARNING" ? "bg-warning" : "bg-destructive",
        )}
      />
      {map.label}
    </Badge>
  );
}

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const variant =
    status === "ON_TRACK" || status === "COMPLETE"
      ? ("success" as const)
      : status === "SLIGHTLY_BEHIND"
        ? ("warning" as const)
        : ("destructive" as const);
  return <Badge variant={variant}>{GOAL_STATUS_LABELS[status] ?? status}</Badge>;
}

export function VerdictBadge({ verdict, className }: { verdict: string; className?: string }) {
  const variant =
    verdict === "BUY_NOW"
      ? ("success" as const)
      : verdict === "PLAN_AND_BUY"
        ? ("default" as const)
        : verdict === "WAIT" || verdict === "SAVE_FIRST"
          ? ("warning" as const)
          : ("destructive" as const);
  return (
    <Badge variant={variant} className={className}>
      {VERDICT_LABELS[verdict] ?? verdict}
    </Badge>
  );
}

/** Marks which engine produced an answer, so the user is never guessing. */
export function GeneratedByBadge({ by }: { by: string }) {
  return (
    <Badge variant="outline" className="gap-1 text-[10px]">
      <Sparkles className="h-3 w-3" />
      {by === "AI" ? "AI generated" : "Built-in engine"}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge variant="outline" className="text-[10px]">
      Demo
    </Badge>
  );
}

/** Month/year stepper used by every period-scoped page. */
export function MonthPicker({
  month,
  year,
  onChange,
  className,
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
  className?: string;
}) {
  const now = new Date();
  const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear();

  const step = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    // Never navigate into the future - there is no data there.
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) return;
    onChange(m, y);
  };

  return (
    <div className={cn("flex items-center gap-1 rounded-full border border-white/12 bg-foreground/[0.04] p-1", className)}>
      <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[7.5rem] text-center text-sm font-medium">
        {MONTHS[month - 1]?.slice(0, 3)} {year}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => step(1)}
        disabled={isCurrent}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** A labelled row of value + progress used across savings, goals and budgets. */
export function LabelledValue({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("tabular text-sm font-medium", valueClassName)}>{value}</span>
    </div>
  );
}

export function PriceSourceBadge({ source }: { source: "USER_ENTERED" | "LIVE_MARKET" }) {
  return source === "LIVE_MARKET" ? (
    <Badge variant="success" className="text-[10px]">
      Live market
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px]">
      You entered
    </Badge>
  );
}
