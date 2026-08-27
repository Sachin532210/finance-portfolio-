import { CheckCircle2, Pencil, Plus, Target, Trash2, TrendingUp } from "lucide-react";
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
import { Badge, StatusProgress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/data";
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
import { HORIZON_LABELS, HORIZON_RANGE } from "@/lib/constants";
import { currencySymbol, formatDate, formatMoney, formatPercent, toDateInput } from "@/lib/format";
import type { GoalProgress } from "@/lib/types";

type GoalsResponse = {
  goals: GoalProgress[];
  by_horizon: Record<string, GoalProgress[]>;
  summary: {
    total: number;
    on_track: number;
    slightly_behind: number;
    behind: number;
    complete: number;
    total_target: number;
    total_saved: number;
    monthly_committed: number;
    monthly_required: number;
  };
  monthly_capacity: number;
  currency_symbol: string;
};

type GoalForm = {
  id?: string;
  name: string;
  description: string;
  horizon: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  monthly_contribution: number;
  priority: number;
};

const emptyGoal = (horizon = "SHORT"): GoalForm => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + (horizon === "SHORT" ? 1 : horizon === "MEDIUM" ? 3 : 7));
  return {
    name: "",
    description: "",
    horizon,
    target_amount: 0,
    current_amount: 0,
    target_date: toDateInput(date),
    monthly_contribution: 0,
    priority: 3,
  };
};

export default function GoalsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);

  const { data, loading, error, refetch } = useApiQuery<GoalsResponse>("/goals");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<GoalForm>(() => emptyGoal());
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const save = useMutation(
    async (payload: GoalForm) => {
      const body = {
        name: payload.name.trim(),
        description: payload.description.trim() || null,
        horizon: payload.horizon,
        target_amount: payload.target_amount,
        current_amount: payload.current_amount,
        target_date: new Date(payload.target_date).toISOString(),
        monthly_contribution: payload.monthly_contribution,
        priority: payload.priority,
      };
      return payload.id ? api.patch(`/goals/${payload.id}`, body) : api.post("/goals", body);
    },
    {
      successMessage: "Goal saved.",
      onSuccess: () => {
        setDialogOpen(false);
        refetch();
      },
    },
  );

  const complete = useMutation(
    async (goal: GoalProgress) =>
      api.patch(`/goals/${goal.id}`, { completed: true, current_amount: goal.target_amount }),
    { successMessage: "Goal marked as reached.", onSuccess: refetch },
  );

  const remove = useMutation(async (id: string) => api.delete(`/goals/${id}`), {
    successMessage: "Goal deleted.",
    onSuccess: refetch,
  });

  const openEdit = (goal: GoalProgress) => {
    setForm({
      id: goal.id,
      name: goal.name,
      description: goal.description ?? "",
      horizon: goal.horizon ?? "SHORT",
      target_amount: goal.target_amount,
      current_amount: goal.current_amount,
      target_date: goal.target_date ? toDateInput(goal.target_date) : toDateInput(),
      monthly_contribution: goal.planned_monthly,
      priority: goal.priority ?? 3,
    });
    setDialogOpen(true);
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial Goals" description="Loading your goals..." />
        <CardSkeleton count={3} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial Goals" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }
  if (!data) return null;

  const valid = form.name.trim().length > 0 && form.target_amount > 0;
  const shortfall = data.summary.monthly_required - data.monthly_capacity;

  const renderGoal = (goal: GoalProgress) => (
    <Card key={goal.id}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{goal.name}</CardTitle>
            {goal.description ? (
              <CardDescription className="mt-1 line-clamp-2">{goal.description}</CardDescription>
            ) : null}
          </div>
          <GoalStatusBadge status={goal.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="tabular flex items-baseline justify-between text-sm">
            <span className="font-semibold">{formatMoney(goal.current_amount, currency)}</span>
            <span className="text-muted-foreground">of {formatMoney(goal.target_amount, currency)}</span>
          </div>
          <StatusProgress value={goal.progress_pct} inverted className="mt-2" />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPercent(goal.progress_pct, 0)} complete
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
            <dt className="text-muted-foreground">Required</dt>
            <dd className="tabular font-medium">
              {formatMoney(goal.required_monthly, currency)}/month
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Target date</dt>
            <dd className="font-medium">{formatDate(goal.target_date)}</dd>
          </div>
          {goal.months_remaining !== null ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Time left</dt>
              <dd className="font-medium">{goal.months_remaining} month(s)</dd>
            </div>
          ) : null}
          {goal.projected_completion ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">At current pace</dt>
              <dd className="font-medium">{formatDate(goal.projected_completion)}</dd>
            </div>
          ) : null}
          {goal.required_savings_rate ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Share of income</dt>
              <dd className="tabular font-medium">{formatPercent(goal.required_savings_rate)}</dd>
            </div>
          ) : null}
        </dl>

        {goal.status === "BEHIND" && goal.required_monthly > goal.planned_monthly ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs leading-relaxed">
            Raise the contribution by{" "}
            <strong>{formatMoney(goal.required_monthly - goal.planned_monthly, currency)}</strong> a
            month, or push the date back, to make this goal realistic.
          </p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(goal)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {goal.status !== "COMPLETE" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void complete.mutate(goal)}
              aria-label="Mark as reached"
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          ) : null}
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
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Goals"
        description="Short, medium and long term. Each one shows whether the plan is actually achievable."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyGoal());
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New goal
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total target"
          value={formatMoney(data.summary.total_target, currency)}
          sub={`${data.summary.total} active goal(s)`}
          icon={Target}
        />
        <StatCard
          label="Saved towards goals"
          value={formatMoney(data.summary.total_saved, currency)}
          sub={`${formatPercent(
            data.summary.total_target > 0
              ? (data.summary.total_saved / data.summary.total_target) * 100
              : 0,
            0,
          )} of the way there`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="On track"
          value={`${data.summary.on_track} of ${data.summary.total}`}
          sub={`${data.summary.behind} significantly behind`}
          icon={CheckCircle2}
          tone={data.summary.behind === 0 ? "success" : "warning"}
        />
        <StatCard
          label="Monthly required"
          value={formatMoney(data.summary.monthly_required, currency)}
          sub={`You are contributing ${formatMoney(data.summary.monthly_committed, currency)}`}
          icon={TrendingUp}
          tone={
            data.summary.monthly_committed >= data.summary.monthly_required ? "success" : "warning"
          }
        />
      </div>

      {shortfall > 0 && data.summary.total > 0 ? (
        <InfoNote variant="warning">
          Your goals need <strong>{formatMoney(data.summary.monthly_required, currency)}</strong> a
          month, but only <strong>{formatMoney(data.monthly_capacity, currency)}</strong> is
          discretionary right now - a gap of {formatMoney(shortfall, currency)}. Closing it means
          extending a target date, lowering a target amount, cutting a fixed cost, or increasing
          income. Deciding deliberately beats missing all of them quietly.
        </InfoNote>
      ) : null}

      {data.goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals set yet"
          description="Add what you are working towards - an emergency fund, a laptop, a house deposit - and the app works out the monthly contribution and whether it is realistic."
          action={
            <Button
              size="sm"
              onClick={() => {
                setForm(emptyGoal());
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Create your first goal
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="ALL">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="ALL">All ({data.goals.length})</TabsTrigger>
            {(["SHORT", "MEDIUM", "LONG"] as const).map((horizon) => (
              <TabsTrigger key={horizon} value={horizon}>
                {HORIZON_LABELS[horizon]} ({data.by_horizon[horizon]?.length ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="ALL">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.goals.map(renderGoal)}
            </div>
          </TabsContent>

          {(["SHORT", "MEDIUM", "LONG"] as const).map((horizon) => (
            <TabsContent key={horizon} value={horizon}>
              <div className="mb-4 flex items-center gap-2">
                <Badge variant="secondary">{HORIZON_RANGE[horizon]}</Badge>
              </div>
              {(data.by_horizon[horizon]?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={Target}
                  title={`No ${HORIZON_LABELS[horizon].toLowerCase()} goals`}
                  description={`Goals in this bracket usually sit ${HORIZON_RANGE[horizon]} away.`}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setForm(emptyGoal(horizon));
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add one
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.by_horizon[horizon].map(renderGoal)}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit goal" : "New financial goal"}</DialogTitle>
            <DialogDescription>
              The required monthly contribution and completion date are calculated from what you
              enter here.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void save.mutate(form);
            }}
          >
            <Field label="Goal name" required>
              <Input
                value={form.name}
                placeholder="e.g. House down payment"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </Field>

            <Field label="Why this matters" hint="Optional. Useful when you review the goal later.">
              <Textarea
                rows={2}
                value={form.description}
                placeholder="e.g. 20% down payment keeps the loan affordable"
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Horizon">
                <SimpleSelect
                  value={form.horizon}
                  onValueChange={(horizon) => setForm((f) => ({ ...f, horizon }))}
                  options={["SHORT", "MEDIUM", "LONG"]}
                  labels={{
                    SHORT: "Short term (0-2 years)",
                    MEDIUM: "Medium term (2-5 years)",
                    LONG: "Long term (5+ years)",
                  }}
                />
              </Field>
              <Field label="Target date" required>
                <Input
                  type="date"
                  value={form.target_date}
                  min={toDateInput()}
                  onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
                />
              </Field>
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
            </div>

            <Field
              label="Monthly contribution"
              hint="Leave at 0 to see what the goal actually requires."
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.pending} disabled={!valid}>
                {form.id ? "Save changes" : "Create goal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this goal?"
        description="The goal and its progress are removed permanently."
        confirmLabel="Delete goal"
        onConfirm={() => {
          if (deleteId) void remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
