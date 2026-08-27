import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/overlay";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  tone = "default",
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  /** Percentage change; sign drives the arrow and colour. */
  trend?: { value: number; label: string; goodWhenUp?: boolean } | null;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  hint?: string;
  className?: string;
}) {
  const toneStyles = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];

  const iconBg = {
    default: "bg-foreground/[0.07] text-muted-foreground",
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  }[tone];

  const goodWhenUp = trend?.goodWhenUp ?? true;
  const isUp = (trend?.value ?? 0) > 0;
  const isFlat = (trend?.value ?? 0) === 0;
  const trendGood = isFlat ? null : isUp === goodWhenUp;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {label}
            </p>
            {hint ? (
              <InfoTooltip label={hint}>
                <button
                  type="button"
                  className="text-muted-foreground/70 transition-colors hover:text-foreground"
                  aria-label={`About ${label}`}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </InfoTooltip>
            ) : null}
          </div>
          {Icon ? (
            <div className={cn("icon-chip h-9 w-9", iconBg)}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
          ) : null}
        </div>

        <p className={cn("text-numeric text-title-2 mt-2", toneStyles)}>
          {value}
        </p>

        {trend ? (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                trendGood === null
                  ? "text-muted-foreground"
                  : trendGood
                    ? "text-success"
                    : "text-destructive",
              )}
            >
              {isFlat ? (
                <Minus className="h-3 w-3" />
              ) : isUp ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend.value).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        ) : sub ? (
          <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
