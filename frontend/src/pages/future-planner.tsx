import { Calculator, Pencil, Plus, Telescope, Trash2, TrendingUp } from "lucide-react";
import * as React from "react";

import { StatCard } from "@/components/shared/stat-card";
import {
  CardSkeleton,
  Disclaimer,
  EmptyState,
  ErrorState,
  InfoNote,
  PageHeader,
} from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/data";
import { Field, Input, MoneyInput, SimpleSelect, Textarea } from "@/components/ui/form";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/overlay";
import { useAuth } from "@/context/auth-context";
import { useApiQuery, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { FUTURE_PLAN_LABELS } from "@/lib/constants";
import { currencySymbol, formatDate, formatMoney, formatPercent } from "@/lib/format";
import type { FuturePlan } from "@/lib/types";

type PlansResponse = {
  plans: FuturePlan[];
  totals: {
    current_cost: number;
    future_cost: number;
    required_monthly: number;
    already_saved: number;
  };
  monthly_capacity: number;
  default_inflation: number;
  default_return: number;
  currency_symbol: string;
  disclaimer: string;
};

type PlanForm = {
  id?: string;
  name: string;
  category: string;
  current_cost: number;
  years_away: number;
  inflation_pct: number;
  expected_return_pct: number;
  already_saved: number;
  notes: string;
};

export default function FuturePlannerPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);

  const { data, loading, error, refetch } = useApiQuery<PlansResponse>("/future-plans");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<PlanForm | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const emptyPlan = React.useCallback(
    (): PlanForm => ({
      name: "",
      category: "OTHER",
      current_cost: 0,
      years_away: 5,
      inflation_pct: data?.default_inflation ?? 6,
      expected_return_pct: data?.default_return ?? 10,
      already_saved: 0,
      notes: "",
    }),
    [data?.default_inflation, data?.default_return],
  );

  const save = useMutation(
    async (payload: PlanForm) => {
      const body = {
        name: payload.name.trim(),
        category: payload.category,
        current_cost: payload.current_cost,
        years_away: payload.years_away,
        inflation_pct: payload.inflation_pct,
        expected_return_pct: payload.expected_return_pct,
        already_saved: payload.already_saved,
        notes: payload.notes.trim() || null,
      };
      return payload.id
        ? api.patch(`/future-plans/${payload.id}`, body)
        : api.post("/future-plans", body);
    },
    {
      successMessage: "Plan saved.",
      onSuccess: () => {
        setDialogOpen(false);
        setForm(null);
        refetch();
      },
    },
  );

  const remove = useMutation(async (id: string) => api.delete(`/future-plans/${id}`), {
    successMessage: "Plan removed.",
    onSuccess: refetch,
  });

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Future Planner" description="Loading your plans..." />
        <CardSkeleton count={3} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Future Planner" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }
  if (!data) return null;

  const valid = (form?.name.trim().length ?? 0) > 0 && (form?.current_cost ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Future Planner"
        description="What your long-term plans are likely to cost once inflation is accounted for."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyPlan());
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add a plan
          </Button>
        }
      />

      <InfoNote>
        Every figure on this page is an <strong>estimate</strong>, built from the inflation and
        return assumptions you set. Real costs and real returns will differ - use these numbers to
        size the problem, not to predict it.
      </InfoNote>

      {data.plans.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Cost today"
            value={formatMoney(data.totals.current_cost, currency)}
            sub="If you bought everything now"
            icon={Telescope}
          />
          <StatCard
            label="Estimated future cost"
            value={formatMoney(data.totals.future_cost, currency)}
            sub={`${formatMoney(data.totals.future_cost - data.totals.current_cost, currency)} of that is inflation`}
            icon={TrendingUp}
            tone="warning"
          />
          <StatCard
            label="Required monthly"
            value={formatMoney(data.totals.required_monthly, currency)}
            sub="Across every plan, assuming your stated return"
            icon={Calculator}
            tone={data.totals.required_monthly <= data.monthly_capacity ? "success" : "warning"}
          />
          <StatCard
            label="Spare capacity"
            value={formatMoney(data.monthly_capacity, currency)}
            sub="Discretionary money available each month"
            icon={TrendingUp}
          />
        </div>
      ) : null}

      {data.plans.length > 0 && data.totals.required_monthly > data.monthly_capacity ? (
        <InfoNote variant="warning">
          These plans together need{" "}
          <strong>{formatMoney(data.totals.required_monthly, currency)}</strong> a month, but only{" "}
          <strong>{formatMoney(data.monthly_capacity, currency)}</strong> is currently spare. Not
          everything can be funded at once - sequencing them, pushing dates out, or reducing scope
          is the honest way through.
        </InfoNote>
      ) : null}

      {data.plans.length === 0 ? (
        <EmptyState
          icon={Telescope}
          title="No future plans yet"
          description="Add something you are planning for - a bike, a degree, a house, retirement - and see what it is likely to cost by the time you get there."
          action={
            <Button
              size="sm"
              onClick={() => {
                setForm(emptyPlan());
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add your first plan
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{plan.name}</CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {FUTURE_PLAN_LABELS[plan.category] ?? plan.category}
                      </Badge>
                      <span>{plan.years_away} year(s) away</span>
                    </CardDescription>
                  </div>
                  <Badge variant={plan.affordable_now ? "success" : "warning"}>
                    {plan.affordable_now ? "Fits your budget" : "Needs more room"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-foreground/[0.035] p-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
                    <p className="tabular text-lg font-semibold">
                      {formatMoney(plan.current_cost, currency)}
                    </p>
                  </div>
                  <span className="text-muted-foreground">&rarr;</span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      In {plan.years_away} years
                    </p>
                    <p className="tabular text-lg font-semibold text-warning">
                      {formatMoney(plan.future_cost, currency)}
                    </p>
                  </div>
                  <Badge variant="outline" className="ml-auto">
                    +{formatMoney(plan.inflation_impact, currency)} inflation
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Required monthly (no growth)</dt>
                    <dd className="tabular mt-0.5 text-sm font-semibold">
                      {formatMoney(plan.required_monthly_flat, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      At {formatPercent(plan.expected_return_pct, 0)} return
                    </dt>
                    <dd className="tabular mt-0.5 text-sm font-semibold text-success">
                      {formatMoney(plan.required_monthly_with_returns, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Already saved</dt>
                    <dd className="tabular mt-0.5 text-sm font-medium">
                      {formatMoney(plan.already_saved, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Estimated completion</dt>
                    <dd className="mt-0.5 text-sm font-medium">{formatDate(plan.target_date)}</dd>
                  </div>
                </dl>

                <p className="text-xs leading-relaxed text-muted-foreground">{plan.explanation}</p>

                {plan.notes ? (
                  <p className="rounded-md bg-foreground/[0.05] p-2 text-xs text-muted-foreground">
                    {plan.notes}
                  </p>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setForm({
                        id: plan.id,
                        name: plan.name,
                        category: plan.category,
                        current_cost: plan.current_cost,
                        years_away: plan.years_away,
                        inflation_pct: plan.inflation_pct,
                        expected_return_pct: plan.expected_return_pct,
                        already_saved: plan.already_saved,
                        notes: plan.notes ?? "",
                      });
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Adjust
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(plan.id)}
                    aria-label="Delete plan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <QuickProjection currency={currency} symbol={symbol} defaults={data} />

      <Disclaimer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Adjust plan" : "New future plan"}</DialogTitle>
            <DialogDescription>
              Enter what it costs today. Inflation and expected return are assumptions you control.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) void save.mutate(form);
              }}
            >
              <Field label="What are you planning for?" required>
                <Input
                  value={form.name}
                  placeholder="e.g. Buy a house"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <SimpleSelect
                    value={form.category}
                    onValueChange={(category) => setForm({ ...form, category })}
                    options={Object.keys(FUTURE_PLAN_LABELS)}
                    labels={FUTURE_PLAN_LABELS}
                  />
                </Field>
                <Field label="Cost today" required>
                  <MoneyInput
                    value={form.current_cost}
                    onValueChange={(current_cost) => setForm({ ...form, current_cost })}
                    symbol={symbol}
                    placeholder="0"
                  />
                </Field>
                <Field label="Years away" required>
                  <Input
                    type="number"
                    step="0.5"
                    min={0.5}
                    max={60}
                    value={form.years_away}
                    onChange={(e) =>
                      setForm({ ...form, years_away: Number(e.target.value) || 1 })
                    }
                  />
                </Field>
                <Field label="Already saved for this">
                  <MoneyInput
                    value={form.already_saved}
                    onValueChange={(already_saved) => setForm({ ...form, already_saved })}
                    symbol={symbol}
                    placeholder="0"
                  />
                </Field>
                <Field label="Inflation assumption (%)" hint="Historical averages sit around 5-7%.">
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    max={30}
                    value={form.inflation_pct}
                    onChange={(e) =>
                      setForm({ ...form, inflation_pct: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field
                  label="Expected return (%)"
                  hint="An assumption, not a guarantee. Lower is safer."
                >
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    max={40}
                    value={form.expected_return_pct}
                    onChange={(e) =>
                      setForm({ ...form, expected_return_pct: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
              </div>

              <Field label="Notes">
                <Textarea
                  rows={2}
                  value={form.notes}
                  placeholder="Any detail worth remembering"
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={save.pending} disabled={!valid}>
                  {form.id ? "Save changes" : "Add plan"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this plan?"
        description="The plan and its projection are removed permanently."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteId) void remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// What-if calculator - projects without saving anything
// ---------------------------------------------------------------------------

function QuickProjection({
  currency,
  symbol,
  defaults,
}: {
  currency: string;
  symbol: string;
  defaults: PlansResponse;
}) {
  const [cost, setCost] = React.useState(100000);
  const [years, setYears] = React.useState(5);
  const [inflation, setInflation] = React.useState(defaults.default_inflation);
  const [returns, setReturns] = React.useState(defaults.default_return);
  const [saved, setSaved] = React.useState(0);
  const [result, setResult] = React.useState<FuturePlan | null>(null);

  const simulate = useMutation(
    async () =>
      api.post<FuturePlan>("/future-plans/simulate", {
        name: "What if",
        category: "OTHER",
        current_cost: cost,
        years_away: years,
        inflation_pct: inflation,
        expected_return_pct: returns,
        already_saved: saved,
      }),
    { onSuccess: setResult },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-primary" />
          What if calculator
        </CardTitle>
        <CardDescription>Project any figure without saving a plan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Cost today">
            <MoneyInput value={cost} onValueChange={setCost} symbol={symbol} />
          </Field>
          <Field label="Years away">
            <Input
              type="number"
              step="0.5"
              min={0.5}
              value={years}
              onChange={(e) => setYears(Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Inflation %">
            <Input
              type="number"
              step="0.5"
              min={0}
              value={inflation}
              onChange={(e) => setInflation(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Return %">
            <Input
              type="number"
              step="0.5"
              min={0}
              value={returns}
              onChange={(e) => setReturns(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Already saved">
            <MoneyInput value={saved} onValueChange={setSaved} symbol={symbol} />
          </Field>
        </div>

        <Button size="sm" onClick={() => void simulate.mutate()} loading={simulate.pending}>
          Calculate
        </Button>

        {result ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-foreground/[0.035] p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Estimated future cost
              </p>
              <p className="tabular mt-1 text-xl font-semibold text-warning">
                {formatMoney(result.future_cost, currency)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMoney(result.inflation_impact, currency)} more than today
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-foreground/[0.035] p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Monthly, no growth
              </p>
              <p className="tabular mt-1 text-xl font-semibold">
                {formatMoney(result.required_monthly_flat, currency)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">The conservative figure</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-foreground/[0.035] p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Monthly at {formatPercent(returns, 0)}
              </p>
              <p className="tabular mt-1 text-xl font-semibold text-success">
                {formatMoney(result.required_monthly_with_returns, currency)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Assumes the return holds</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
