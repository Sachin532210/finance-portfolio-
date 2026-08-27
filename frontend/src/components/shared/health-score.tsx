import * as React from "react";

import { Progress } from "@/components/ui/data";
import type { HealthScore } from "@/lib/types";
import { cn } from "@/lib/utils";

function scoreTone(score: number) {
  if (score >= 70) return { stroke: "hsl(var(--success))", text: "text-success" };
  if (score >= 55) return { stroke: "hsl(var(--primary))", text: "text-primary" };
  if (score >= 40) return { stroke: "hsl(var(--warning))", text: "text-warning" };
  return { stroke: "hsl(var(--destructive))", text: "text-destructive" };
}

/** Circular 0-100 gauge for the financial health score. */
export function HealthScoreRing({
  score,
  grade,
  size = 148,
  strokeWidth = 12,
  className,
}: {
  score: number;
  grade?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  const tone = scoreTone(clamped);

  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Score ${clamped} out of 100`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("tabular text-3xl font-semibold leading-none", tone.text)}>{clamped}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          out of 100
        </span>
        {grade ? <span className="mt-1 text-xs font-medium">{grade}</span> : null}
      </div>
    </div>
  );
}

/** The six weighted components behind the score, each with its explanation. */
export function HealthScoreBreakdown({ health }: { health: HealthScore }) {
  return (
    <div className="space-y-4">
      {health.breakdown.map((component) => {
        const pct = component.max > 0 ? (component.score / component.max) * 100 : 0;
        return (
          <div key={component.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{component.label}</span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                {component.score.toFixed(1)} / {component.max}
              </span>
            </div>
            <Progress
              value={pct}
              className="h-1.5"
              indicatorClassName={
                pct >= 75 ? "bg-success" : pct >= 45 ? "bg-primary" : pct >= 25 ? "bg-warning" : "bg-destructive"
              }
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{component.detail}</p>
          </div>
        );
      })}
    </div>
  );
}
