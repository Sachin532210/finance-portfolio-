import { ArrowDownLeft, ArrowUpRight, CalendarDays, Flag, PiggyBank, Receipt } from "lucide-react";
import * as React from "react";

import { MonthPicker } from "@/components/shared/misc";
import { StatCard } from "@/components/shared/stat-card";
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/data";
import { useAuth } from "@/context/auth-context";
import { useApiQuery } from "@/hooks/use-api";
import { formatMoney } from "@/lib/format";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type CalendarResponse = {
  month: number;
  year: number;
  month_label: string;
  days_in_month: number;
  events: CalendarEvent[];
  currency_symbol: string;
  total_in: number;
  total_out: number;
};

const TYPE_META = {
  SALARY: { label: "Salary", icon: ArrowDownLeft, className: "bg-success/15 text-success" },
  EMI: { label: "EMI", icon: Receipt, className: "bg-destructive/15 text-destructive" },
  BILL: { label: "Bill", icon: Receipt, className: "bg-warning/15 text-warning" },
  SAVINGS: { label: "Savings", icon: PiggyBank, className: "bg-primary/15 text-primary" },
  GOAL: { label: "Goal", icon: Flag, className: "bg-secondary text-secondary-foreground" },
} as const;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const now = new Date();

  const [period, setPeriod] = React.useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const params = React.useMemo(() => ({ month: period.month, year: period.year }), [period]);
  const { data, loading, error, refetch } = useApiQuery<CalendarResponse>("/calendar", params);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial Calendar" description="Loading your month..." />
        <CardSkeleton count={3} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial Calendar" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }
  if (!data) return null;

  // Group events by day for the grid.
  const byDay = new Map<number, CalendarEvent[]>();
  for (const event of data.events) {
    const day = Number(event.date.slice(-2));
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  // Monday-first offset for the first cell of the grid.
  const firstWeekday = (new Date(data.year, data.month - 1, 1).getDay() + 6) % 7;
  const today =
    data.year === now.getFullYear() && data.month === now.getMonth() + 1 ? now.getDate() : -1;

  const net = data.total_in - data.total_out;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Calendar"
        description="Salary, EMIs, recurring bills, contributions and goal dates in one view."
        actions={
          <MonthPicker
            month={period.month}
            year={period.year}
            onChange={(month, year) => setPeriod({ month, year })}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Money in"
          value={formatMoney(data.total_in, currency)}
          sub="Scheduled income this month"
          icon={ArrowDownLeft}
          tone="success"
        />
        <StatCard
          label="Money out"
          value={formatMoney(data.total_out, currency)}
          sub="EMIs, bills and contributions"
          icon={ArrowUpRight}
          tone="destructive"
        />
        <StatCard
          label="Net scheduled"
          value={formatMoney(net, currency)}
          sub={net >= 0 ? "Scheduled income covers commitments" : "Commitments exceed scheduled income"}
          icon={CalendarDays}
          tone={net >= 0 ? "success" : "destructive"}
        />
      </div>

      {data.events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled this month"
          description="Add your salary date in Settings, mark a few expenses as recurring, or add a loan - they will all appear here."
        />
      ) : (
        <>
          {/* ---------------- Month grid ---------------- */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle className="text-base">{data.month_label}</CardTitle>
              <CardDescription>Every scheduled money event, day by day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-white/10 bg-foreground/10">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="bg-foreground/[0.06] px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
                  >
                    {day}
                  </div>
                ))}

                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={`pad-${i}`} className="min-h-24 bg-card/40" />
                ))}

                {Array.from({ length: data.days_in_month }).map((_, index) => {
                  const day = index + 1;
                  const events = byDay.get(day) ?? [];
                  const isToday = day === today;

                  return (
                    <div
                      key={day}
                      className={cn(
                        "min-h-24 space-y-1 bg-card/70 p-1.5 backdrop-blur-sm",
                        isToday && "bg-primary/[0.07] ring-1 ring-inset ring-primary/50",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                          isToday
                            ? "bg-primary font-semibold text-primary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {day}
                      </span>
                      {events.slice(0, 3).map((event, i) => {
                        const meta = TYPE_META[event.type];
                        return (
                          <div
                            key={i}
                            className={cn(
                              "truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm",
                              meta.className,
                            )}
                            title={`${event.title} - ${formatMoney(event.amount, currency)}`}
                          >
                            {event.title}
                          </div>
                        );
                      })}
                      {events.length > 3 ? (
                        <p className="px-1 text-[10px] text-muted-foreground">
                          +{events.length - 3} more
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ---------------- List (primary on mobile) ---------------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scheduled events</CardTitle>
              <CardDescription>In date order</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.events.map((event, index) => {
                const meta = TYPE_META[event.type];
                const Icon = meta.icon;
                const day = Number(event.date.slice(-2));
                const isPast = today > 0 && day < today;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-white/10 bg-foreground/[0.035] p-3",
                      isPast && "opacity-60",
                    )}
                  >
                    <div className="flex w-11 shrink-0 flex-col items-center">
                      <span className="text-lg font-semibold leading-none">{day}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {new Date(event.date).toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                    </div>
                    <div className={cn("rounded-md p-2", meta.className)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{event.title}</p>
                      <Badge variant="outline" className="mt-0.5 text-[10px]">
                        {meta.label}
                      </Badge>
                    </div>
                    <span
                      className={cn(
                        "tabular shrink-0 text-sm font-medium",
                        event.direction === "IN"
                          ? "text-success"
                          : event.direction === "OUT"
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {event.direction === "IN" ? "+" : event.direction === "OUT" ? "-" : ""}
                      {formatMoney(event.amount, currency)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
