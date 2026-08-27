import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Info,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { DonutChart, GroupedBarChart, TrendLineChart } from "@/components/charts";
import { HealthScoreBreakdown, HealthScoreRing } from "@/components/shared/health-score";
import { BudgetStatusBadge, GoalStatusBadge, MonthPicker } from "@/components/shared/misc";
import { StatCard } from "@/components/shared/stat-card";
import {
  CardSkeleton,
  Disclaimer,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Progress, Skeleton, StatusProgress } from "@/components/ui/data";
import { useAuth } from "@/context/auth-context";
import { useApiQuery } from "@/hooks/use-api";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/constants";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Dashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES = {
  CRITICAL: { icon: AlertTriangle, className: "border-destructive/40 bg-destructive/5", tone: "text-destructive" },
  WARNING: { icon: AlertTriangle, className: "border-warning/40 bg-warning/5", tone: "text-warning" },
  SUCCESS: { icon: CheckCircle2, className: "border-success/40 bg-success/5", tone: "text-success" },
  INFO: { icon: Info, className: "border-border bg-muted/30", tone: "text-muted-foreground" },
} as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const now = new Date();

  const [period, setPeriod] = React.useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const params = React.useMemo(() => ({ month: period.month, year: period.year }), [period]);
  const { data, loading, error, refetch } = useApiQuery<Dashboard>("/dashboard", params);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Loading your financial picture..." />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-52 lg:col-span-1" />
          <Skeleton className="h-52 lg:col-span-2" />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data) return null;

  const hasData =
    data.income.monthly > 0 || data.spend.month_to_date > 0 || data.net_worth.total_assets > 0;

  const categoryData = data.spend.by_category.map((c) => ({
    name: CATEGORY_LABELS[c.category] ?? c.category,
    value: c.amount,
    color: CATEGORY_COLORS[c.category],
  }));

  // Salary allocation: needs, wants, savings, investments, debt.
  const allocationData = [
    { name: "Needs", value: data.spend.essentials, color: "hsl(var(--chart-1))" },
    { name: "Wants", value: data.spend.lifestyle, color: "hsl(var(--chart-4))" },
    { name: "Savings", value: Math.max(data.savings.monthly_savings, 0), color: "hsl(var(--chart-2))" },
    { name: "Investments", value: data.history.at(-1)?.invested ?? 0, color: "hsl(var(--chart-5))" },
    { name: "Debt", value: data.debt.monthly_emi, color: "hsl(var(--chart-3))" },
  ].filter((slice) => slice.value > 0);

  const topGoals = [...data.savings.goals, ...data.goals]
    .filter((g) => g.status !== "COMPLETE")
    .sort((a, b) => (a.months_remaining ?? 999) - (b.months_remaining ?? 999))
    .slice(0, 4);

  const pressingBudgets = data.budgets.filter((b) => b.status !== "SAFE").slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${user?.name.split(" ")[0] ?? "there"}`}
        description={`Your financial picture for ${data.month_label}.`}
        actions={
          <>
            <MonthPicker
              month={period.month}
              year={period.year}
              onChange={(month, year) => setPeriod({ month, year })}
            />
            <Button asChild size="sm">
              <Link to="/expenses">
                <Receipt className="h-4 w-4" />
                Add expense
              </Link>
            </Button>
          </>
        }
      />

      {!hasData ? (
        <EmptyState
          icon={Sparkles}
          title="Your dashboard is empty"
          description="Add your salary and a few expenses, or load demo data to see how every page works before entering anything real."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm">
                <Link to="/settings">Add your income</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/settings">Load demo data</Link>
              </Button>
            </div>
          }
        />
      ) : null}

      {/* ---------------- Row 1: score, net worth, available ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Financial Health Score</CardTitle>
            <CardDescription>Weighted across six areas of your finances</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-2">
            <HealthScoreRing score={data.health_score.score} grade={data.health_score.grade} />
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              {data.health_score.summary}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What the score is made of</CardTitle>
            <CardDescription>
              Each area is scored against your own targets, not a generic benchmark
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HealthScoreBreakdown health={data.health_score} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net worth"
          value={formatMoney(data.net_worth.net_worth, currency)}
          sub={`${formatMoney(data.net_worth.total_assets, currency)} assets - ${formatMoney(data.net_worth.total_liabilities, currency)} liabilities`}
          icon={Banknote}
          tone={data.net_worth.net_worth >= 0 ? "primary" : "destructive"}
          hint="Everything you own minus everything you owe."
        />
        <StatCard
          label="Available balance"
          value={formatMoney(data.net_worth.bank + data.net_worth.cash, currency)}
          sub={`${formatMoney(data.safe_to_spend_this_month, currency)} safe to spend this month`}
          icon={Wallet}
          hint="Bank plus cash. 'Safe to spend' already sets aside your commitments and savings target."
        />
        <StatCard
          label="Safe daily spend"
          value={formatMoney(data.safe_daily_spend, currency)}
          sub={`${data.spend.days_left} day(s) left in ${data.month_label.split(" ")[0]}`}
          icon={CalendarClock}
          tone={data.safe_daily_spend > 0 ? "default" : "warning"}
          hint="Discretionary money left, divided by the days remaining this month."
        />
        <StatCard
          label="Emergency fund"
          value={formatMoney(data.emergency.current, currency)}
          sub={`Covers ${data.emergency.months_covered.toFixed(1)} of ${data.emergency.target_months} months`}
          icon={ShieldCheck}
          tone={
            data.emergency.months_covered >= data.emergency.target_months
              ? "success"
              : data.emergency.months_covered >= 3
                ? "default"
                : "warning"
          }
          hint="Sized from your essential monthly costs plus EMIs."
        />
      </div>

      {/* ---------------- Row 2: the four core numbers ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly income"
          value={formatMoney(data.income.monthly, currency)}
          sub={
            data.income.uses_planned_figure
              ? "Using your profile figure - no income recorded yet this month"
              : `${formatMoney(data.income.recorded_this_month, currency)} recorded this month`
          }
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Monthly expenses"
          value={formatMoney(data.spend.month_to_date, currency)}
          trend={
            data.spend.last_month > 0
              ? {
                  value: data.spend.vs_last_month_pct,
                  label: "vs last month",
                  goodWhenUp: false,
                }
              : null
          }
          sub={`On pace for ${formatMoney(data.spend.projected_month_end, currency)}`}
          icon={Receipt}
        />
        <StatCard
          label="Monthly savings"
          value={formatMoney(data.savings.monthly_savings, currency)}
          sub={`${formatPercent(data.savings.savings_rate)} of income - target ${formatPercent(data.profile.target_savings_rate, 0)}`}
          icon={PiggyBank}
          tone={
            data.savings.savings_rate >= data.profile.target_savings_rate ? "success" : "warning"
          }
        />
        <StatCard
          label="Investments"
          value={formatMoney(data.portfolio.current_value, currency)}
          sub={
            data.portfolio.total_invested > 0
              ? `${formatMoney(data.portfolio.profit_loss, currency, { signed: true })} (${formatPercent(data.portfolio.profit_loss_pct)})`
              : "No holdings recorded yet"
          }
          icon={TrendingUp}
          tone={data.portfolio.profit_loss >= 0 ? "success" : "destructive"}
        />
      </div>

      {data.debt.total_outstanding > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total debt"
            value={formatMoney(data.debt.total_outstanding, currency)}
            sub={`${formatMoney(data.debt.monthly_emi, currency)} in EMIs each month`}
            icon={CreditCard}
            tone="destructive"
          />
          <StatCard
            label="Debt-to-income"
            value={formatPercent(data.debt.debt_to_income_ratio)}
            sub={
              data.debt.debt_to_income_ratio > 36
                ? "Above the 36% comfort line"
                : "Within the usual comfort range"
            }
            icon={CreditCard}
            tone={data.debt.debt_to_income_ratio > 36 ? "destructive" : "default"}
          />
          <StatCard
            label="Interest still to pay"
            value={formatMoney(data.debt.estimated_interest_remaining, currency)}
            sub="Estimated across every active loan"
            icon={AlertTriangle}
            tone="warning"
          />
          <StatCard
            label="Total saved"
            value={formatMoney(data.savings.total_saved, currency)}
            sub="Across every savings goal"
            icon={PiggyBank}
          />
        </div>
      ) : null}

      {/* ---------------- Row 3: charts ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where your money went</CardTitle>
            <CardDescription>Spending by category this month</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={categoryData}
              currency={currency}
              centerValue={formatMoney(data.spend.month_to_date, currency, { compact: true })}
              centerLabel="spent"
              emptyMessage="No expenses recorded this month"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salary allocation</CardTitle>
            <CardDescription>Needs, wants, savings, investments and debt</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={allocationData}
              currency={currency}
              centerValue={formatMoney(data.income.monthly, currency, { compact: true })}
              centerLabel="income"
              emptyMessage="Add income and expenses to see the split"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Income vs expenses</CardTitle>
            <CardDescription>Last six months</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              data={data.history}
              currency={currency}
              bars={[
                { key: "income", name: "Income", color: "hsl(var(--chart-2))" },
                { key: "expenses", name: "Expenses", color: "hsl(var(--chart-6))" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Savings trend</CardTitle>
            <CardDescription>What was left over each month</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLineChart
              data={data.history}
              currency={currency}
              lines={[{ key: "savings", name: "Saved", color: "hsl(var(--chart-2))" }]}
            />
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Row 4: goals & portfolio ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Savings goals</CardTitle>
              <CardDescription>The ones closest to their target date</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/savings">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {topGoals.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No active goals"
                description="Set a goal and the app will work out the monthly contribution it needs."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/savings">Create a goal</Link>
                  </Button>
                }
                className="border-0 py-6"
              />
            ) : (
              topGoals.map((goal) => (
                <div key={goal.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{goal.name}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {formatMoney(goal.current_amount, currency)} of{" "}
                        {formatMoney(goal.target_amount, currency)}
                      </p>
                    </div>
                    <GoalStatusBadge status={goal.status} />
                  </div>
                  <StatusProgress value={goal.progress_pct} inverted />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatPercent(goal.progress_pct, 0)} complete</span>
                    <span className="tabular">
                      {goal.required_monthly > 0
                        ? `${formatMoney(goal.required_monthly, currency)}/month needed`
                        : "Funded"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Investment portfolio</CardTitle>
              <CardDescription>
                {data.portfolio.has_live_prices
                  ? "Includes live market prices"
                  : "Valued at the prices you entered"}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/investments">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.portfolio.holdings.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No investments tracked"
                description="Add a holding to see portfolio value, allocation and profit or loss."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/investments">Add a holding</Link>
                  </Button>
                }
                className="border-0 py-6"
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="tabular text-2xl font-semibold">
                    {formatMoney(data.portfolio.current_value, currency)}
                  </span>
                  <span
                    className={cn(
                      "tabular text-sm font-medium",
                      data.portfolio.profit_loss >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {formatMoney(data.portfolio.profit_loss, currency, { signed: true })} (
                    {formatPercent(data.portfolio.profit_loss_pct)})
                  </span>
                </div>
                {data.portfolio.holdings.slice(0, 5).map((holding) => (
                  <div
                    key={holding.id}
                    className="flex items-center justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{holding.name}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {holding.quantity} units at {formatMoney(holding.avg_buy_price, currency)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm">{formatMoney(holding.current_value, currency)}</p>
                      <p
                        className={cn(
                          "tabular text-xs",
                          holding.profit_loss >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {formatPercent(holding.profit_loss_pct)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Row 5: recommendations, payments, warnings ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">What to do next</CardTitle>
              <CardDescription>Generated from your own numbers</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/coach">
                Ask the coach
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.buying_guide.slice(0, 4).map((item, index) => (
              <div key={index} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge
                    variant={
                      item.bucket === "BUY_NOW"
                        ? "success"
                        : item.bucket === "PLAN_AND_BUY"
                          ? "default"
                          : item.bucket === "WAIT"
                            ? "warning"
                            : "destructive"
                    }
                  >
                    {item.bucket.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                  <p className="min-w-0 truncate text-sm font-medium capitalize">{item.name}</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upcoming payments</CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcoming_payments.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nothing due in the next 10 days.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.upcoming_payments.map((payment, index) => (
                    <li key={index} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{payment.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.days_away === 0
                            ? "Due today"
                            : `In ${payment.days_away} day(s), on the ${payment.due_day}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "tabular shrink-0 text-sm font-medium",
                          payment.type === "INCOME" ? "text-success" : "text-foreground",
                        )}
                      >
                        {payment.type === "INCOME" ? "+" : ""}
                        {formatMoney(payment.amount, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Budget warnings</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/budget">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {pressingBudgets.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Every budget is on track.
                </p>
              ) : (
                <ul className="space-y-3">
                  {pressingBudgets.map((budget) => (
                    <li key={budget.category} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {CATEGORY_LABELS[budget.category] ?? budget.category}
                        </span>
                        <BudgetStatusBadge status={budget.status} />
                      </div>
                      <Progress
                        value={Math.min(budget.used_pct, 100)}
                        className="h-1.5"
                        indicatorClassName={budget.status === "OVER" ? "bg-destructive" : "bg-warning"}
                      />
                      <p className="tabular text-xs text-muted-foreground">
                        {formatMoney(budget.spent, currency)} of {formatMoney(budget.amount, currency)}
                        {budget.remaining < 0
                          ? ` - ${formatMoney(Math.abs(budget.remaining), currency)} over`
                          : ` - ${formatMoney(budget.remaining, currency)} left`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---------------- Alerts ---------------- */}
      {data.insights.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alerts from your data</CardTitle>
            <CardDescription>Each one cites the number that triggered it</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {data.insights.slice(0, 6).map((insight, index) => {
              const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.INFO;
              const Icon = style.icon;
              return (
                <div key={index} className={cn("flex gap-3 rounded-lg border p-3", style.className)}>
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.tone)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{insight.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {insight.message}
                    </p>
                    {insight.action_url ? (
                      <Link
                        to={insight.action_url}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Disclaimer />
    </div>
  );
}
