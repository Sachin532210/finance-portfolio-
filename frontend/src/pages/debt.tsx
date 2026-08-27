import {
  AlertTriangle,
  Calculator,
  CreditCard,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
} from "lucide-react";
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
import { Badge, Progress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/data";
import { Field, Input, MoneyInput, SimpleSelect } from "@/components/ui/form";
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
import { DEBT_LABELS } from "@/lib/constants";
import { currencySymbol, formatMoney, formatPercent } from "@/lib/format";
import type { DebtItem, PayoffPlan } from "@/lib/types";
import { cn } from "@/lib/utils";

type DebtResponse = {
  items: DebtItem[];
  summary: {
    total_outstanding: number;
    total_principal: number;
    monthly_emi: number;
    weighted_interest_rate: number;
    debt_to_income_ratio: number;
    estimated_interest_remaining: number;
    monthly_income: number;
    health: "NONE" | "HEALTHY" | "MANAGEABLE" | "STRESSED";
    health_note: string;
    has_high_interest: boolean;
  };
  currency_symbol: string;
  guidance: string;
};

type StrategiesResponse = {
  has_debt: boolean;
  avalanche: PayoffPlan | null;
  snowball: PayoffPlan | null;
  comparison?: string;
  interest_difference?: number;
  extra_payment?: number;
  extra_payment_impact: {
    extra_payment: number;
    months_saved: number;
    interest_saved: number;
    baseline_months: number;
    new_months: number;
    baseline_interest: number;
    new_interest: number;
  } | null;
  spare_capacity?: number;
  note?: string;
};

type DebtForm = {
  id?: string;
  name: string;
  type: string;
  principal: number;
  outstanding: number;
  emi: number;
  interest_rate: number;
  remaining_months: number;
  due_day: number;
};

const emptyDebt = (): DebtForm => ({
  name: "",
  type: "PERSONAL_LOAN",
  principal: 0,
  outstanding: 0,
  emi: 0,
  interest_rate: 0,
  remaining_months: 0,
  due_day: 5,
});

export default function DebtPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);

  const debts = useApiQuery<DebtResponse>("/debts");
  const [extra, setExtra] = React.useState(0);
  const strategyParams = React.useMemo(() => ({ extra_payment: extra }), [extra]);
  const strategies = useApiQuery<StrategiesResponse>("/debts/strategies", strategyParams);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<DebtForm>(emptyDebt);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [payFor, setPayFor] = React.useState<DebtItem | null>(null);
  const [payAmount, setPayAmount] = React.useState(0);

  const refreshAll = () => {
    debts.refetch();
    strategies.refetch();
  };

  const save = useMutation(
    async (payload: DebtForm) => {
      const body = {
        name: payload.name.trim(),
        type: payload.type,
        principal: payload.principal || payload.outstanding,
        outstanding: payload.outstanding,
        emi: payload.emi,
        interest_rate: payload.interest_rate,
        remaining_months: payload.remaining_months,
        due_day: payload.due_day,
      };
      return payload.id ? api.patch(`/debts/${payload.id}`, body) : api.post("/debts", body);
    },
    {
      successMessage: "Debt saved.",
      onSuccess: () => {
        setDialogOpen(false);
        refreshAll();
      },
    },
  );

  const recordPayment = useMutation(
    async ({ id, amount }: { id: string; amount: number }) =>
      api.post<{ message: string }>(`/debts/${id}/payment`, undefined, { amount }),
    {
      successMessage: (result) => result.message,
      onSuccess: () => {
        setPayFor(null);
        refreshAll();
      },
    },
  );

  const remove = useMutation(async (id: string) => api.delete(`/debts/${id}`), {
    successMessage: "Debt removed.",
    onSuccess: refreshAll,
  });

  const openEdit = (debt: DebtItem) => {
    setForm({
      id: debt.id,
      name: debt.name,
      type: debt.type,
      principal: debt.principal,
      outstanding: debt.outstanding,
      emi: debt.emi,
      interest_rate: debt.interest_rate,
      remaining_months: debt.remaining_months,
      due_day: debt.due_day,
    });
    setDialogOpen(true);
  };

  if (debts.loading && !debts.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Debt" description="Loading your loans..." />
        <CardSkeleton />
      </div>
    );
  }
  if (debts.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Debt" />
        <ErrorState message={debts.error} onRetry={debts.refetch} />
      </div>
    );
  }
  if (!debts.data) return null;

  const { items, summary, guidance } = debts.data;
  const valid = form.name.trim().length > 0 && form.outstanding > 0;

  const healthTone =
    summary.health === "STRESSED"
      ? "destructive"
      : summary.health === "MANAGEABLE"
        ? "warning"
        : "success";

  const renderPlan = (plan: PayoffPlan | null) => {
    if (!plan) return null;
    return (
      <div className="space-y-4">
        <InfoNote>{plan.explanation}</InfoNote>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Debt free in</p>
            <p className="tabular mt-1 text-xl font-semibold">
              {plan.total_months} month{plan.total_months === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              About {(plan.total_months / 12).toFixed(1)} years
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total interest</p>
            <p className="tabular mt-1 text-xl font-semibold">
              {formatMoney(plan.total_interest, currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Estimated across every loan</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Payoff order</p>
          {plan.steps.map((step) => (
            <div
              key={step.debt_id}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {step.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{step.name}</p>
                <p className="text-xs text-muted-foreground">
                  Cleared in {step.months_to_clear} month(s)
                </p>
              </div>
              <span className="tabular shrink-0 text-sm text-muted-foreground">
                {formatMoney(step.interest_paid, currency)} interest
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debt"
        description="Balances, EMIs and two payoff strategies compared against your real numbers."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyDebt());
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add debt
          </Button>
        }
      />

      {items.length === 0 ? (
        <>
          <EmptyState
            icon={CreditCard}
            title="No active debt"
            description="Nothing recorded here - which is one of the strongest financial positions to be in. If you do have a loan or card balance, add it so the planner accounts for the EMI."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setForm(emptyDebt());
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add a debt
              </Button>
            }
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4 text-primary" />
                EMI calculator
              </CardTitle>
              <CardDescription>Work out a payment before committing to a loan</CardDescription>
            </CardHeader>
            <CardContent>
              <EmiCalculator currency={currency} symbol={symbol} />
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total outstanding"
              value={formatMoney(summary.total_outstanding, currency)}
              sub={`of ${formatMoney(summary.total_principal, currency)} originally borrowed`}
              icon={CreditCard}
              tone="destructive"
            />
            <StatCard
              label="Monthly EMIs"
              value={formatMoney(summary.monthly_emi, currency)}
              sub={`${formatPercent(summary.debt_to_income_ratio)} of your income`}
              icon={Receipt}
              tone={healthTone}
            />
            <StatCard
              label="Average interest rate"
              value={formatPercent(summary.weighted_interest_rate)}
              sub="Weighted by outstanding balance"
              icon={TrendingDown}
              tone={summary.has_high_interest ? "destructive" : "default"}
            />
            <StatCard
              label="Interest still to pay"
              value={formatMoney(summary.estimated_interest_remaining, currency)}
              sub="Estimated if you keep paying the current EMIs"
              icon={AlertTriangle}
              tone="warning"
            />
          </div>

          <InfoNote variant={summary.health === "STRESSED" ? "warning" : "info"}>
            <p>{guidance}</p>
            <p className="mt-2">{summary.health_note}</p>
          </InfoNote>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((debt) => (
              <Card key={debt.id} className={cn(debt.interest_rate >= 15 && "border-destructive/40")}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{debt.name}</CardTitle>
                      <CardDescription className="mt-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {DEBT_LABELS[debt.type] ?? debt.type}
                        </Badge>
                      </CardDescription>
                    </div>
                    <Badge variant={debt.interest_rate >= 15 ? "destructive" : "outline"}>
                      {formatPercent(debt.interest_rate)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="tabular flex items-baseline justify-between text-sm">
                      <span className="font-semibold">{formatMoney(debt.outstanding, currency)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(debt.progress_pct ?? 0, 0)} repaid
                      </span>
                    </div>
                    <Progress
                      value={debt.progress_pct ?? 0}
                      className="mt-2"
                      indicatorClassName="bg-success"
                    />
                  </div>

                  <dl className="space-y-1.5 border-t border-border pt-3 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Monthly EMI</dt>
                      <dd className="tabular font-medium">{formatMoney(debt.emi, currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Interest this month</dt>
                      <dd className="tabular font-medium">
                        {formatMoney(debt.monthly_interest ?? 0, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Payoff in</dt>
                      <dd className="font-medium">
                        {debt.payoff_never
                          ? "Never at this EMI"
                          : `${debt.payoff_months ?? debt.remaining_months} month(s)`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Interest remaining</dt>
                      <dd className="tabular font-medium">
                        {formatMoney(debt.estimated_interest, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Due day</dt>
                      <dd className="font-medium">{debt.due_day} of the month</dd>
                    </div>
                  </dl>

                  {debt.payoff_never ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-relaxed">
                      The EMI does not cover the monthly interest, so this balance grows rather than
                      shrinks. It needs a larger payment.
                    </p>
                  ) : null}

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setPayFor(debt);
                        setPayAmount(debt.emi);
                      }}
                    >
                      Record payment
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(debt)}
                      aria-label="Edit debt"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(debt.id)}
                      aria-label="Delete debt"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ---------------- Payoff strategies ---------------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payoff strategies</CardTitle>
              <CardDescription>
                Both simulations use your actual balances, rates and EMIs. Educational projections,
                not a promise.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field
                  label="Extra payment each month"
                  hint={
                    strategies.data?.spare_capacity
                      ? `You have about ${formatMoney(strategies.data.spare_capacity, currency)} spare this month.`
                      : "Anything above the minimum EMIs."
                  }
                >
                  <MoneyInput
                    value={extra}
                    onValueChange={setExtra}
                    symbol={symbol}
                    placeholder="0"
                  />
                </Field>
                {strategies.data?.spare_capacity ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExtra(Math.round(strategies.data!.spare_capacity!))}
                  >
                    Use spare capacity
                  </Button>
                ) : null}
              </div>

              {strategies.data?.extra_payment_impact && extra > 0 ? (
                <InfoNote variant="success">
                  Paying an extra {formatMoney(extra, currency)} a month clears your debt{" "}
                  <strong>{strategies.data.extra_payment_impact.months_saved} month(s) sooner</strong>{" "}
                  and saves{" "}
                  <strong>
                    {formatMoney(strategies.data.extra_payment_impact.interest_saved, currency)}
                  </strong>{" "}
                  in interest - {strategies.data.extra_payment_impact.baseline_months} months down to{" "}
                  {strategies.data.extra_payment_impact.new_months}.
                </InfoNote>
              ) : null}

              {strategies.data?.comparison ? (
                <p className="text-sm text-muted-foreground">{strategies.data.comparison}</p>
              ) : null}

              <Tabs defaultValue="AVALANCHE">
                <TabsList>
                  <TabsTrigger value="AVALANCHE">Avalanche</TabsTrigger>
                  <TabsTrigger value="SNOWBALL">Snowball</TabsTrigger>
                </TabsList>
                <TabsContent value="AVALANCHE">
                  {renderPlan(strategies.data?.avalanche ?? null)}
                </TabsContent>
                <TabsContent value="SNOWBALL">
                  {renderPlan(strategies.data?.snowball ?? null)}
                </TabsContent>
              </Tabs>

              {strategies.data?.note ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {strategies.data.note}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4 text-primary" />
                EMI calculator
              </CardTitle>
              <CardDescription>
                Check the real cost of a loan before taking one on
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmiCalculator currency={currency} symbol={symbol} />
            </CardContent>
          </Card>

          <Disclaimer />
        </>
      )}

      {/* ---------------- Debt dialog ---------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit debt" : "Add debt"}</DialogTitle>
            <DialogDescription>
              Leave the EMI at zero and it will be derived from the balance, rate and tenure.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void save.mutate(form);
            }}
          >
            <Field label="Name" required>
              <Input
                value={form.name}
                placeholder="e.g. Education loan"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <SimpleSelect
                  value={form.type}
                  onValueChange={(type) => setForm((f) => ({ ...f, type }))}
                  options={Object.keys(DEBT_LABELS)}
                  labels={DEBT_LABELS}
                />
              </Field>
              <Field label="Original amount">
                <MoneyInput
                  value={form.principal}
                  onValueChange={(principal) => setForm((f) => ({ ...f, principal }))}
                  symbol={symbol}
                  placeholder="0"
                />
              </Field>
              <Field label="Outstanding now" required>
                <MoneyInput
                  value={form.outstanding}
                  onValueChange={(outstanding) => setForm((f) => ({ ...f, outstanding }))}
                  symbol={symbol}
                  placeholder="0"
                />
              </Field>
              <Field label="Monthly EMI">
                <MoneyInput
                  value={form.emi}
                  onValueChange={(emi) => setForm((f) => ({ ...f, emi }))}
                  symbol={symbol}
                  placeholder="0"
                />
              </Field>
              <Field label="Interest rate (% per year)">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.interest_rate || ""}
                  placeholder="0"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, interest_rate: Number(e.target.value) || 0 }))
                  }
                />
              </Field>
              <Field label="Months remaining">
                <Input
                  type="number"
                  min={0}
                  value={form.remaining_months || ""}
                  placeholder="0"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, remaining_months: Number(e.target.value) || 0 }))
                  }
                />
              </Field>
              <Field label="Due day of month">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.due_day}
                  onChange={(e) => setForm((f) => ({ ...f, due_day: Number(e.target.value) || 1 }))}
                />
              </Field>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.pending} disabled={!valid}>
                {form.id ? "Save changes" : "Add debt"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------------- Payment dialog ---------------- */}
      <Dialog open={payFor !== null} onOpenChange={(open) => !open && setPayFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>
              {payFor?.name} - outstanding is {formatMoney(payFor?.outstanding ?? 0, currency)}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (payFor && payAmount > 0) {
                void recordPayment.mutate({ id: payFor.id, amount: payAmount });
              }
            }}
          >
            <Field label="Amount paid" required>
              <MoneyInput value={payAmount} onValueChange={setPayAmount} symbol={symbol} autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayFor(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={recordPayment.pending} disabled={payAmount <= 0}>
                Record payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this debt?"
        description="It is removed from your debt dashboard and from every calculation that used it."
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
// EMI calculator
// ---------------------------------------------------------------------------

function EmiCalculator({ currency, symbol }: { currency: string; symbol: string }) {
  const [principal, setPrincipal] = React.useState(100000);
  const [rate, setRate] = React.useState(10);
  const [months, setMonths] = React.useState(12);

  const params = React.useMemo(
    () => ({ principal, interest_rate: rate, months }),
    [principal, rate, months],
  );
  const { data } = useApiQuery<{
    emi: number;
    total_payable: number;
    total_interest: number;
    interest_share_pct: number;
  }>(principal > 0 && months > 0 ? "/debts/emi-calculator" : null, params);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Loan amount">
          <MoneyInput value={principal} onValueChange={setPrincipal} symbol={symbol} />
        </Field>
        <Field label="Interest rate (% per year)">
          <Input
            type="number"
            step="0.1"
            min={0}
            max={100}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Tenure (months)">
          <Input
            type="number"
            min={1}
            max={600}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) || 1)}
          />
        </Field>
      </div>

      {data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Monthly EMI</p>
            <p className="tabular mt-1 text-xl font-semibold">{formatMoney(data.emi, currency)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total interest</p>
            <p className="tabular mt-1 text-xl font-semibold text-warning">
              {formatMoney(data.total_interest, currency)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total repayable</p>
            <p className="tabular mt-1 text-xl font-semibold">
              {formatMoney(data.total_payable, currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatPercent(data.interest_share_pct, 0)} of it is interest
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
