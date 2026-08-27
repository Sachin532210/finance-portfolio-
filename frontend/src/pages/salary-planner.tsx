import {
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  Save,
  Sparkles,
  Wallet,
} from "lucide-react";
import * as React from "react";

import { DonutChart } from "@/components/charts";
import { MonthPicker } from "@/components/shared/misc";
import { StatCard } from "@/components/shared/stat-card";
import {
  CardSkeleton,
  Disclaimer,
  ErrorState,
  InfoNote,
  PageHeader,
} from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/data";
import { Field, MoneyInput } from "@/components/ui/form";
import { useAuth } from "@/context/auth-context";
import { useApiQuery, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { currencySymbol, formatMoney, formatPercent } from "@/lib/format";
import type { Allocation, SavedAllocation } from "@/lib/types";
import { cn } from "@/lib/utils";

type PlannerResponse = {
  month: number;
  year: number;
  month_label: string;
  currency: string;
  currency_symbol: string;
  generated: Allocation;
  saved: SavedAllocation | null;
  context: {
    monthly_income: number;
    salary: number;
    other_income: number;
    salary_day: number;
    actual_spend: number;
    essentials_spent: number;
    lifestyle_spent: number;
    emi_total: number;
    emergency_current: number;
    emergency_target: number;
    target_savings_rate: number;
    risk_tolerance: string;
  };
};

const BUCKETS = [
  { key: "essentials", label: "Essential expenses", color: "hsl(var(--chart-1))", hint: "Rent, bills, groceries - the costs you cannot skip." },
  { key: "family", label: "Family contribution", color: "hsl(var(--chart-2))", hint: "Money sent to family each month." },
  { key: "debt_payments", label: "Debt / EMIs", color: "hsl(var(--chart-3))", hint: "Every active loan payment." },
  { key: "emergency", label: "Emergency savings", color: "hsl(var(--chart-5))", hint: "Top-up towards your emergency-fund target." },
  { key: "savings", label: "Savings goals", color: "hsl(var(--chart-2))", hint: "Contributions to your active goals." },
  { key: "investments", label: "Investments", color: "hsl(var(--chart-4))", hint: "Sized to your risk preference, after the safety net." },
  { key: "lifestyle", label: "Lifestyle", color: "hsl(var(--chart-6))", hint: "Discretionary spending - eating out, shopping, entertainment." },
  { key: "buffer", label: "Buffer", color: "hsl(var(--muted-foreground))", hint: "Unallocated cushion for irregular costs." },
] as const;

type BucketKey = (typeof BUCKETS)[number]["key"];

export default function SalaryPlannerPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);
  const now = new Date();

  const [period, setPeriod] = React.useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const params = React.useMemo(() => ({ month: period.month, year: period.year }), [period]);
  const { data, loading, error, refetch } = useApiQuery<PlannerResponse>("/salary-planner", params);

  const [edited, setEdited] = React.useState<Record<BucketKey, number> | null>(null);
  const [salaryOverride, setSalaryOverride] = React.useState<number | null>(null);

  // Reset local edits whenever the loaded plan changes.
  React.useEffect(() => {
    setEdited(null);
    setSalaryOverride(null);
  }, [data?.month, data?.year]);

  const save = useMutation(
    async (payload: Record<string, number>) => api.put("/salary-planner", payload, params),
    { successMessage: "Plan saved.", onSuccess: () => refetch() },
  );

  const reset = useMutation(async () => api.delete("/salary-planner", params), {
    successMessage: "Reverted to the generated plan.",
    onSuccess: () => {
      setEdited(null);
      refetch();
    },
  });

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Salary Planner" description="Working out your monthly plan..." />
        <CardSkeleton count={3} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Salary Planner" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }
  if (!data) return null;

  const base: Record<BucketKey, number> = {
    essentials: data.saved?.essentials ?? data.generated.essentials,
    family: data.saved?.family ?? data.generated.family,
    debt_payments: data.saved?.debt_payments ?? data.generated.debt_payments,
    emergency: data.saved?.emergency ?? data.generated.emergency,
    savings: data.saved?.savings ?? data.generated.savings,
    investments: data.saved?.investments ?? data.generated.investments,
    lifestyle: data.saved?.lifestyle ?? data.generated.lifestyle,
    buffer: data.saved?.buffer ?? data.generated.buffer,
  };

  const current = edited ?? base;
  const income = salaryOverride ?? data.saved?.salary ?? data.generated.income;
  const allocated = Object.values(current).reduce((sum, value) => sum + value, 0);
  const unallocated = income - allocated;
  const savingsSide = current.emergency + current.savings + current.investments;
  const savingsRate = income > 0 ? (savingsSide / income) * 100 : 0;
  const dirty = edited !== null || salaryOverride !== null;
  const overAllocated = unallocated < -0.01;

  const chartData = BUCKETS.map((bucket) => ({
    name: bucket.label,
    value: current[bucket.key],
    color: bucket.color,
  })).filter((slice) => slice.value > 0);

  const setBucket = (key: BucketKey, value: number) =>
    setEdited({ ...(edited ?? base), [key]: Math.max(0, value) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Planner"
        description={`A plan for ${data.month_label}, built from your real commitments rather than a fixed percentage rule.`}
        actions={
          <>
            <MonthPicker
              month={period.month}
              year={period.year}
              onChange={(month, year) => setPeriod({ month, year })}
            />
            {data.saved ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reset.mutate()}
                loading={reset.pending}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!dirty || overAllocated}
              loading={save.pending}
              onClick={() => void save.mutate({ ...current, salary: income })}
            >
              <Save className="h-4 w-4" />
              Save plan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly income"
          value={formatMoney(income, currency)}
          sub={`Salary lands on day ${data.context.salary_day}`}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Allocated"
          value={formatMoney(allocated, currency)}
          sub={`${formatPercent(income > 0 ? (allocated / income) * 100 : 0, 0)} of income`}
        />
        <StatCard
          label={overAllocated ? "Over-allocated" : "Unallocated"}
          value={formatMoney(Math.abs(unallocated), currency)}
          sub={overAllocated ? "The plan spends more than you earn" : "Still free to assign"}
          tone={overAllocated ? "destructive" : "default"}
        />
        <StatCard
          label="Savings rate in this plan"
          value={formatPercent(savingsRate)}
          sub={`Target is ${formatPercent(data.context.target_savings_rate, 0)}`}
          tone={savingsRate >= data.context.target_savings_rate ? "success" : "warning"}
        />
      </div>

      {overAllocated ? (
        <InfoNote variant="warning">
          <strong>This plan allocates more than your income.</strong> Reduce a bucket by{" "}
          {formatMoney(Math.abs(unallocated), currency)} before saving - otherwise the plan cannot
          actually be followed.
        </InfoNote>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Adjust your allocation</CardTitle>
            <CardDescription>
              Start from the generated plan and change anything. Nothing is locked.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Plan against a different salary"
              hint="Useful for testing a raise or a lower month. Does not change your profile."
            >
              <MoneyInput
                value={income}
                onValueChange={setSalaryOverride}
                symbol={symbol}
                placeholder="0"
              />
            </Field>

            <div className="space-y-3 border-t border-border pt-4">
              {BUCKETS.map((bucket) => {
                const value = current[bucket.key];
                const share = income > 0 ? (value / income) * 100 : 0;
                const generated = data.generated[bucket.key];
                const changed = Math.abs(value - generated) > 0.01;

                return (
                  <div key={bucket.key} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: bucket.color }}
                        />
                        <span className="text-sm font-medium">{bucket.label}</span>
                        {changed ? (
                          <Badge variant="outline" className="text-[10px]">
                            edited
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 pl-4.5 text-xs text-muted-foreground">{bucket.hint}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <MoneyInput
                        value={value}
                        onValueChange={(next) => setBucket(bucket.key, next)}
                        symbol={symbol}
                        className="w-32 sm:w-36"
                      />
                      <span className="tabular w-12 shrink-0 text-right text-xs text-muted-foreground">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm font-medium">Total allocated</span>
              <span
                className={cn(
                  "tabular text-sm font-semibold",
                  overAllocated ? "text-destructive" : "text-foreground",
                )}
              >
                {formatMoney(allocated, currency)} of {formatMoney(income, currency)}
              </span>
            </div>

            {edited ? (
              <Button variant="ghost" size="sm" onClick={() => setEdited(null)}>
                <RotateCcw className="h-4 w-4" />
                Discard my changes
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The split</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={chartData}
                currency={currency}
                centerValue={formatMoney(income, currency, { compact: true })}
                centerLabel="income"
                emptyMessage="Add income to build a plan"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Why this plan
              </CardTitle>
              <CardDescription>
                Built from your commitments, in the order they have to be paid
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {data.generated.rationale.map((line, index) => (
                  <li key={index} className="flex gap-3 text-sm leading-relaxed">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {data.generated.warnings.length > 0 ? (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Worth knowing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.generated.warnings.map((warning, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this month is actually going</CardTitle>
          <CardDescription>The plan above against what has already happened</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Spent so far", value: data.context.actual_spend },
            { label: "On essentials", value: data.context.essentials_spent },
            { label: "On lifestyle", value: data.context.lifestyle_spent },
            { label: "EMIs due", value: data.context.emi_total },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-foreground/[0.035] p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="tabular mt-1 text-lg font-semibold">
                {formatMoney(item.value, currency)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Disclaimer />
    </div>
  );
}
