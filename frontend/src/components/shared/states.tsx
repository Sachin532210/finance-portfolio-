import { AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/data";
import { DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-title-1 sm:text-large-title">{title}</h1>
        {description ? (
          <p className="text-subhead mt-1.5 max-w-2xl text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function CardSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="icon-chip h-14 w-14 bg-destructive/15">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <p className="font-medium">{title}</p>
          {message ? (
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
          ) : null}
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-foreground/15 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="icon-chip h-14 w-14 bg-foreground/[0.06]">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : null}
      <div>
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes & disclaimers
// ---------------------------------------------------------------------------

export function InfoNote({
  children,
  className,
  variant = "info",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "info" | "warning" | "success";
}) {
  const styles = {
    info: "border-primary/25 bg-primary/5 text-foreground",
    warning: "border-warning/30 bg-warning/10 text-foreground",
    success: "border-success/30 bg-success/10 text-foreground",
  }[variant];

  return (
    <div className={cn("flex gap-3 rounded-lg border p-4 text-sm leading-relaxed", styles, className)}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Disclaimer({ className, text }: { className?: string; text?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {text ?? DISCLAIMER}
    </p>
  );
}
