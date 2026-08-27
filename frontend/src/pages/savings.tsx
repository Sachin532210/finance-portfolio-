import {
  Minus,
  Pencil,
  PiggyBank,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import * as React from "react";

import { GoalStatusBadge } from "@/components/shared/misc";
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
import { Badge, StatusProgress } from "@/components/ui/data";
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
import { SAVINGS_LABELS } from "@/lib/constants";
import { currencySymbol, formatDate, formatMoney, formatPercent, toDateInput } from "@/lib/format";
import type { EmergencyFund, GoalProgress } from "@/lib/types";

type SavingsResponse = {
  goals: GoalProgress[];
  totals: {
    target: number;
    saved: number;
    remaining: number;
    progress_pct: number;
    monthly_committed: number;
    monthly_required: number;
  };
  emergency: EmergencyFund;
  currency_symbol: string;
  monthly_capacity: number;
};

type GoalForm = {
  id?: string;
  name: string;
  category: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  monthly_contribution: number;
  is_emergency_fund: boolean;
  priority: number;
};

const emptyGoal = (): GoalForm => ({
  name: "",
  category: "GENERAL",
  target_amount: 0,
  current_amount: 0,
  target_date: "",
  monthly_contribution: 0,
  is_emergency_fund: false,
  priority: 3,
});

export default function SavingsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);

  const savings = useApiQuery<SavingsResponse>("/savings/goals");
  const emergency = useApiQuery<EmergencyFund>("/savings/emergency-fund");

  const [goalDialog, setGoalDialog] = React.useState(false);
  const [form, setForm] = React.useState<GoalForm>(emptyGoal);
  const [contributeTo, setContributeTo] = React.useState<{ goal: GoalProgress; mode: "add" | "withdraw" } | null>(null);
  const [contributeAmount, setContributeAmount] = React.useState(0);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const refreshAll = () => {
    savings.refetch();
    emergency.refetch();
  };

  const saveGoal = useMutation(
    async (payload: GoalForm) => {
      const body = {
        name: payload.name.trim(),
        category: payload.category,
        target_amount: payload.target_amount,
        current_amount: payload.current_amount,
        target_date: payload.target_date ? new Date(payload.target_date).toISOString() : null,
        monthly_contribution: payload.monthly_contribution,
        is_emergency_fund: payload.is_emergency_fund,
        priority: payload.priority,
      };
      return payload.id
        ? api.patch(`/savings/goals/${payload.id}`, body)
        : api.post("/savings/goals", body);
    },
    {
      successMessage: "Goal saved.",
      onSuccess: () => {
        setGoalDialog(false);
        setForm(emptyGoal());
        refreshAll();
      },
    },
  );

  const contribute = useMutation(
    async ({ id, amount, mode }: { id: string; amount: number; mode: "add" | "withdraw" }) =>
      api.post(`/savings/goals/${id}/${mode === "add" ? "contribute" : "withdraw"}`, { amount }),
    {
      successMessage: "Savings updated.",
      onSuccess: () => {
        setContributeTo(null);
        setContributeAmount(0);
        refreshAll();
      },
    },
  );

  const remove = useMutation(async (id: string) => api.delete(`/savings/goals/${id}`), {
    successMessage: "Goal deleted.",
    onSuccess: refreshAll,
  });

  const openCreate = (preset?: Partial<GoalForm>) => {
    setForm({ ...emptyGoal(), ...preset });
    setGoalDialog(true);
  };

  const openEdit = (goal: GoalProgress) => {
    setForm({
      id: goal.id,
      name: goal.name,
      category: goal.category ?? "GENERAL",
      target_amount: goal.target_amount,
      current_amount: goal.current_amount,
      target_date: goal.target_date ? toDateInput(goal.target_date) : "",
      monthly_contribution: goal.planned_monthly,
      is_emergency_fund: Boolean(goal.is_emergency_fund),
      priority: goal.priority ?? 3,
    });
    setGoalDialog(true);
  };

  if (savings.loading && !savings.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Savings" description="Loading your goals..." />
        <CardSkeleton count={3} />
      </div>
    );
  }
  if (savings.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Savings" />
        <ErrorState message={savings.error} onRetry={savings.refetch} />
      </div>
    );
  }
  if (!savings.data) return null;

  const em = emergency.data ?? savings.data.emergency;
  const valid = form.name.trim().length > 0 && form.target_amount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Savings"
        description="Goals with real target dates, and the monthly contribution each one needs."
        actions={
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            New goal
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total saved"
          value={formatMoney(savings.data.totals.saved, currency)}
          sub={`of ${formatMoney(savings.data.totals.target, currency)} across all goals`}
          icon={PiggyBank}
          tone="success"
        />
        <StatCard
          label="Overall progress"
          value={formatPercent(savings.data.totals.progress_pct, 0)}
          sub={`${formatMoney(savings.data.totals.remaining, currency)} still to save`}
          icon={Target}
        />
        <StatCard
          label="Committed monthly"
          value={formatMoney(savings.data.totals.monthly_committed, currency)}
          sub={`${formatMoney(savings.data.totals.monthly_required, currency)} needed to stay on schedule`}
          icon={TrendingUp}
          tone={
            savings.data.totals.monthly_committed >= savings.data.totals.monthly_required
              ? "success"
              : "warning"
          }
        />
        <StatCard
          label="Spare capacity"
          value={formatMoney(savings.data.monthly_capacity, currency)}
          sub="Discretionary money left this month"
          icon={PiggyBank}
        />
      </div>

      {/* ---------------- Emergency fund ---------------- */}
      <Card className="border-primary/25">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Emergency fund
              </CardTitle>
              <CardDescription>
                Sized from your actual essential costs, not a round number
              </CardDescription>
            </div>
            <Badge
              variant={
                em.months_covered >= em.target_months
                  ? "success"
                  : em.months_covered >= 3
                    ? "default"
                    : em.months_covered >= 1
                      ? "warning"
                      : "destructive"
              }
            >
              {em.months_covered.toFixed(1)} months covered
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">You have</p>
              <p className="tabular mt-1 text-xl font-semibold">
                {formatMoney(em.current, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Recommended range
              </p>
              <p className="tabular mt-1 text-xl font-semibold">
                {formatMoney(em.min_recommended, currency)} - {formatMoney(em.max_recommended, currency)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">3 to 6 months of essentials</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Your {em.target_months}-month target
              </p>
              <p className="tabular mt-1 text-xl font-semibold">{formatMoney(em.target, currency)}</p>
              {em.shortfall > 0 ? (
                <p className="mt-0.5 text-xs text-warning">
                  {formatMoney(em.shortfall, currency)} short
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-success">Target reached</p>
              )}
            </div>
          </div>

          <StatusProgress value={em.progress_pct} inverted />

          {em.explanation ? (
            <InfoNote variant={em.shortfall > 0 ? "warning" : "success"}>{em.explanation}</InfoNote>
          ) : null}

          {em.shortfall > 0 && (em.linked_goals?.length ?? 0) === 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openCreate({
                  name: "Emergency Fund",
                  category: "EMERGENCY",
                  is_emergency_fund: true,
                  target_amount: em.target,
                  current_amount: em.current,
                  monthly_contribution: em.suggested_monthly ?? 0,
                  priority: 1,
                })
              }
            >
              <Plus className="h-4 w-4" />
              Track this as a goal
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------- Goals ---------------- */}
      {savings.data.goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No savings goals yet"
          description="Create a goal with a target amount and date, and the app works out exactly how much you need to set aside each month."
          action={
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              Create your first goal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savings.data.goals.map((goal) => (
            <Card key={goal.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{goal.name}</CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {SAVINGS_LABELS[goal.category ?? "GENERAL"] ?? goal.category}
                      </Badge>
                      {goal.is_emergency_fund ? (
                        <Badge variant="outline" className="text-[10px]">
                          Emergency
                        </Badge>
                      ) : null}
                    </CardDescription>
                  </div>
                  <GoalStatusBadge status={goal.status} />
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div>
                  <div className="tabular flex items-baseline justify-between text-sm">
                    <span className="font-semibold">{formatMoney(goal.current_amount, currency)}</span>
                    <span className="text-muted-foreground">
                      of {formatMoney(goal.target_amount, currency)}
                    </span>
                  </div>
                  <StatusProgress value={goal.progress_pct} inverted className="mt-2" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatPercent(goal.progress_pct, 0)} complete -{" "}
                    {formatMoney(goal.remaining_amount, currency)} to go
                  </p>
                </div>

                <dl className="space-y-1.5 border-t border-border pt-3 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Contributing</dt>
                    <dd className="tabular font-medium">
                      {formatMoney(goal.planned_monthly, currency)}/month
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Needed to stay on track</dt>
                    <dd className="tabular font-medium">
                      {formatMoney(goal.required_monthly, currency)}/month
                    </dd>
                  </div>
                  {goal.target_date ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Target date</dt>
                      <dd className="font-medium">{formatDate(goal.target_date)}</dd>
                    </div>
                  ) : null}
                  {goal.projected_completion ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">At current pace</dt>
                      <dd className="font-medium">{formatDate(goal.projected_completion)}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setContributeTo({ goal, mode: "add" });
                      setContributeAmount(goal.planned_monthly || 0);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add money
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => {
                      setContributeTo({ goal, mode: "withdraw" });
                      setContributeAmount(0);
                    }}
                    aria-label="Withdraw"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(goal)}
                    aria-label="Edit goal"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(goal.id)}
                    aria-label="Delete goal"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---------------- Goal dialog ---------------- */}
      <Dialog open={goalDialog} onOpenChange={setGoalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit goal" : "New savings goal"}</DialogTitle>
            <DialogDescription>
              Give it a target and a date, and the required monthly contribution is calculated for
              you.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void saveGoal.mutate(form);
            }}
          >
            <Field label="Goal name" required>
              <Input
                value={form.name}
                placeholder="e.g. New laptop"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target amount" required>
                <MoneyInput
                  value={form.target_amount}
                  onValueChange={(target_amount) => setForm((f) => ({ ...f, target_amount }))}
                  symbol={symbol}
                  placeholder="0"
                />
              </Field>
              <Field label="Already saved">
                <MoneyInput
                  value={form.current_amount}
                  onValueChange={(current_amount) => setForm((f) => ({ ...f, current_amount }))}
                  symbol={symbol}
                  placeholder="0"
                />
              </Field>
              <Field label="Category">
                <SimpleSelect
                  value={form.category}
                  onValueChange={(category) =>
                    setForm((f) => ({
                      ...f,
                      category,
                      is_emergency_fund: category === "EMERGENCY" ? true : f.is_emergency_fund,
                    }))
                  }
                  options={Object.keys(SAVINGS_LABELS)}
                  labels={SAVINGS_LABELS}
                />
              </Field>
              <Field label="Target date" hint="Optional - a 12-month horizon is assumed without one.">
                <Input
                  type="date"
                  value={form.target_date}
                  min={toDateInput()}
                  onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
                />
              </Field>
            </div>

            <Field
              label="Monthly contribution"
              hint={
                form.target_amount > 0
                  ? `Leave at 0 and the app will show what is required instead.`
                  : undefined
              }
            >
              <MoneyInput
                value={form.monthly_contribution}
                onValueChange={(monthly_contribution) =>
                  setForm((f) => ({ ...f, monthly_contribution }))
                }
                symbol={symbol}
                placeholder="0"
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGoalDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saveGoal.pending} disabled={!valid}>
                {form.id ? "Save changes" : "Create goal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------------- Contribute dialog ---------------- */}
      <Dialog open={contributeTo !== null} onOpenChange={(open) => !open && setContributeTo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {contributeTo?.mode === "add" ? "Add to" : "Withdraw from"} {contributeTo?.goal.name}
            </DialogTitle>
            <DialogDescription>
              {contributeTo?.mode === "add"
                ? "This is recorded as a contribution and updates your progress."
                : `You currently have ${formatMoney(contributeTo?.goal.current_amount ?? 0, currency)} in this goal.`}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (contributeTo && contributeAmount > 0) {
                void contribute.mutate({
                  id: contributeTo.goal.id,
                  amount: contributeAmount,
                  mode: contributeTo.mode,
                });
              }
            }}
          >
            <Field label="Amount" required>
              <MoneyInput
                value={contributeAmount}
                onValueChange={setContributeAmount}
                symbol={symbol}
                placeholder="0"
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContributeTo(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={contribute.pending}
                disabled={contributeAmount <= 0}
                variant={contributeTo?.mode === "withdraw" ? "destructive" : "default"}
              >
                {contributeTo?.mode === "add" ? "Add money" : "Withdraw"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this goal?"
        description="The goal and its contribution history are removed permanently. The money itself is unaffected."
        confirmLabel="Delete goal"
        onConfirm={() => {
          if (deleteId) void remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
