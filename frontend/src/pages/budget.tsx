import { BarChart3, Copy, Plus, Trash2, Wallet } from "lucide-react";
import * as React from "react";

import { BudgetStatusBadge, MonthPicker } from "@/components/shared/misc";
import { StatCard } from "@/components/shared/stat-card";
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  InfoNote,
  PageHeader,
} from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Progress } from "@/components/ui/data";
import { Field, MoneyInput, SimpleSelect } from "@/components/ui/form";
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
import { CATEGORY_LABELS } from "@/lib/constants";
import { currencySymbol, formatMoney, formatPercent } from "@/lib/format";
import type { BudgetRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type BudgetResponse = {
  month: number;
  year: number;
  month_label: string;
  currency_symbol: string;
  budgets: BudgetRow[];
  unbudgeted_spending: { category: string; spent: number }[];
  available_categories: string[];
  totals: { budget: number; spent: number; remaining: number; used_pct: number; unbudgeted: number };
  counts: { safe: number; warning: number; over: number };
  days_left: number;
  monthly_income: number;
};

export default function BudgetPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);
  const now = new Date();

  const [period, setPeriod] = React.useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const params = React.useMemo(() => ({ month: period.month, year: period.year }), [period]);
  const { data, loading, error, refetch } = useApiQuery<BudgetResponse>("/budgets", params);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<{ category: string; amount: number } | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const save = useMutation(
    async (payload: { category: string; amount: number }) =>
      api.put("/budgets", { ...payload, month: period.month, year: period.year }),
    {
      successMessage: "Budget saved.",
      onSuccess: () => {
        setDialogOpen(false);
        setEditing(null);
        refetch();
      },
    },
  );

  const remove = useMutation(async (id: string) => api.delete(`/budgets/${id}`), {
    successMessage: "Budget removed.",
    onSuccess: refetch,
  });

  const copyPrevious = useMutation(
    async () => api.post<{ copied: number; message: string }>("/budgets/copy-previous", undefined, params),
    { successMessage: (result) => result.message, onSuccess: refetch },
  );

  const openEditor = (category: string, amount = 0) => {
    setEditing({ category, amount });
    setDialogOpen(true);
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Budget" description="Loading your category budgets..." />
        <CardSkeleton count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Budget" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }
  if (!data) return null;

  const overspendRisk = data.totals.budget > 0 && data.totals.spent > data.totals.budget;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description={`Category limits for ${data.month_label}, tracked against real spending.`}
        actions={
          <>
            <MonthPicker
              month={period.month}
              year={period.year}
              onChange={(month, year) => setPeriod({ month, year })}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyPrevious.mutate()}
              loading={copyPrevious.pending}
            >
              <Copy className="h-4 w-4" />
              Copy last month
            </Button>
            <Button
              size="sm"
              onClick={() => openEditor(data.available_categories[0] ?? "FOOD")}
              disabled={data.available_categories.length === 0}
            >
              <Plus className="h-4 w-4" />
              Set a budget
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total budgeted"
          value={formatMoney(data.totals.budget, currency)}
          sub={
            data.monthly_income > 0
              ? `${formatPercent((data.totals.budget / data.monthly_income) * 100, 0)} of income`
              : undefined
          }
          icon={BarChart3}
        />
        <StatCard
          label="Spent so far"
          value={formatMoney(data.totals.spent, currency)}
          sub={`${formatPercent(data.totals.used_pct, 0)} of the budget used`}
          icon={Wallet}
          tone={overspendRisk ? "destructive" : "default"}
        />
        <StatCard
          label="Remaining"
          value={formatMoney(data.totals.remaining, currency)}
          sub={`${data.days_left} day(s) left this month`}
          icon={Wallet}
          tone={data.totals.remaining < 0 ? "destructive" : "success"}
        />
        <StatCard
          label="Unbudgeted spending"
          value={formatMoney(data.totals.unbudgeted, currency)}
          sub={
            data.unbudgeted_spending.length > 0
              ? `${data.unbudgeted_spending.length} category(ies) with no limit`
              : "Everything is inside a budget"
          }
          icon={BarChart3}
          tone={data.totals.unbudgeted > 0 ? "warning" : "default"}
        />
      </div>

      {data.counts.over > 0 ? (
        <InfoNote variant="warning">
          <strong>
            {data.counts.over} budget{data.counts.over > 1 ? "s are" : " is"} over the limit.
          </strong>{" "}
          Anything more in those categories comes straight out of savings. The Salary Planner shows
          where the money would otherwise have gone.
        </InfoNote>
      ) : null}

      {data.budgets.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No budgets set for this month"
          description="Pick a category and a monthly limit. The app tracks real spending against it and warns you before you go over."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => openEditor(data.available_categories[0] ?? "FOOD")}>
                <Plus className="h-4 w-4" />
                Set your first budget
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyPrevious.mutate()}
                loading={copyPrevious.pending}
              >
                Copy last month
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.budgets.map((budget) => {
            const pct = Math.min(budget.used_pct, 100);
            return (
              <Card key={budget.category}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {CATEGORY_LABELS[budget.category] ?? budget.category}
                      </CardTitle>
                      <CardDescription className="tabular mt-1">
                        {formatMoney(budget.spent, currency)} of{" "}
                        {formatMoney(budget.amount, currency)}
                      </CardDescription>
                    </div>
                    <BudgetStatusBadge status={budget.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress
                    value={pct}
                    indicatorClassName={
                      budget.status === "OVER"
                        ? "bg-destructive"
                        : budget.status === "WARNING"
                          ? "bg-warning"
                          : "bg-success"
                    }
                  />
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="tabular font-medium">{formatPercent(budget.used_pct, 0)} used</span>
                    <span
                      className={cn(
                        "tabular",
                        budget.remaining < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {budget.remaining < 0
                        ? `${formatMoney(Math.abs(budget.remaining), currency)} over`
                        : `${formatMoney(budget.remaining, currency)} left`}
                    </span>
                  </div>

                  {budget.status !== "OVER" && data.days_left > 0 && budget.remaining > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      That is {formatMoney(budget.remaining / data.days_left, currency)} a day for the
                      rest of the month.
                    </p>
                  ) : null}

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditor(budget.category, budget.amount)}
                    >
                      Adjust
                    </Button>
                    {budget.id ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(budget.id!)}
                        aria-label="Remove budget"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {data.unbudgeted_spending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending with no budget</CardTitle>
            <CardDescription>
              These categories have activity this month but no limit set
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.unbudgeted_spending.map((row) => (
              <button
                key={row.category}
                type="button"
                onClick={() => openEditor(row.category, Math.ceil(row.spent / 100) * 100)}
                className="flex items-center gap-2 rounded-full border border-white/12 bg-foreground/[0.04] px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                <span>{CATEGORY_LABELS[row.category] ?? row.category}</span>
                <Badge variant="secondary" className="tabular">
                  {formatMoney(row.spent, currency)}
                </Badge>
                <Plus className="h-3.5 w-3.5" />
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set a budget</DialogTitle>
            <DialogDescription>
              A monthly limit for one category. You will be warned at 80% and again when it is
              exceeded.
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (editing.amount > 0) void save.mutate(editing);
              }}
            >
              <Field label="Category">
                <SimpleSelect
                  value={editing.category}
                  onValueChange={(category) => setEditing({ ...editing, category })}
                  options={Object.keys(CATEGORY_LABELS)}
                  labels={CATEGORY_LABELS}
                />
              </Field>
              <Field label="Monthly limit" required>
                <MoneyInput
                  value={editing.amount}
                  onValueChange={(amount) => setEditing({ ...editing, amount })}
                  symbol={symbol}
                  placeholder="0"
                  autoFocus
                />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={save.pending} disabled={editing.amount <= 0}>
                  Save budget
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove this budget?"
        description="Spending in this category will still be tracked, but it will no longer have a limit or warnings."
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteId) void remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
