import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Lightbulb,
  Printer,
  TrendingUp,
} from "lucide-react";
import * as React from "react";

import {
  AreaTrendChart,
  DonutChart,
  GroupedBarChart,
  HorizontalBarChart,
  TrendLineChart,
} from "@/components/charts";
import { HealthScoreRing } from "@/components/shared/health-score";
import { MonthPicker } from "@/components/shared/misc";
import { StatCard } from "@/components/shared/stat-card";
import {
  CardSkeleton,
  Disclaimer,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/data";
import { useAuth } from "@/context/auth-context";
import { useApiQuery } from "@/hooks/use-api";
import { downloadCsv } from "@/lib/api";
import { CATEGORY_COLORS, CATEGORY_LABELS, INVESTMENT_LABELS, MONTHS } from "@/lib/constants";
import { formatMoney, formatPercent } from "@/lib/format";
import type { CategorySpend, HealthScore, MonthTotals, MonthlyReport, NetWorth } from "@/lib/types";

type SummaryResponse = {
  currency_symbol: string;
  income_vs_expense: MonthTotals[];
  savings_trend: { label: string; savings: number; rate: number }[];
  category_spending: CategorySpend[];
  net_worth_series: { label: string; date: string; net_worth: number; assets: number; liabilities: number }[];
  current_net_worth: NetWorth;
  portfolio: {
    invested: number;
    current_value: number;
    profit_loss: number;
    profit_loss_pct: number;
    allocation: { type: string; value: number; share: number }[];
    has_live_prices: boolean;
  };
  health_score: HealthScore;
};

type YearlyResponse = {
  year: number;
  months: (MonthTotals & { label: string; has_data: boolean })[];
  totals: { income: number; expenses: number; savings: number; invested: number; savings_rate: number };
  averages: { income: number; expenses: number; savings: number };
  by_category: { category: string; amount: number; share: number }[];
  best_month: { label: string; savings: number } | null;
  worst_month: { label: string; savings: number } | null;
  currency_symbol: string;
};

export default function ReportsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const now = new Date();

  const [period, setPeriod] = React.useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const monthParams = React.useMemo(() => ({ month: period.month, year: period.year }), [period]);
  const [year, setYear] = React.useState(now.getFullYear());
  const yearParams = React.useMemo(() => ({ year }), [year]);

  const summary = useApiQuery<SummaryResponse>("/reports/summary");
  const monthly = useApiQuery<MonthlyReport>("/reports/monthly", monthParams);
  const yearly = useApiQuery<YearlyResponse>("/reports/yearly", yearParams);

  if (summary.loading && !summary.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Preparing your reports..." />
        <CardSkeleton count={3} />
      </div>
    );
  }
  if (summary.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <ErrorState message={summary.error} onRetry={summary.refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Monthly reviews, yearly roll-ups and every chart in one place."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="no-print">
              <Printer className="h-4 w-4" />
              Print / save as PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="no-print"
              onClick={() =>
                downloadCsv("/reports/export/expenses.csv", "finance-track-expenses.csv")
              }
            >
              <Download className="h-4 w-4" />
              Export expenses
            </Button>
          </>
        }
      />

      <Tabs defaultValue="monthly">
        <TabsList className="no-print">
          <TabsTrigger value="monthly">Monthly review</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
          <TabsTrigger value="charts">All charts</TabsTrigger>
        </TabsList>

        {/* ---------------- Monthly ---------------- */}
        <TabsContent value="monthly" className="space-y-6">
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <MonthPicker
              month={period.month}
              year={period.year}
              onChange={(month, y) => setPeriod({ month, year: y })}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "/reports/export/monthly.csv",
                  `report-${period.year}-${String(period.month).padStart(2, "0")}.csv`,
                  monthParams,
                )
              }
            >
              <Download className="h-4 w-4" />
              Export this report
            </Button>
          </div>

          {monthly.loading && !monthly.data ? (
            <LoadingState label="Generating the review..." />
          ) : monthly.error ? (
            <ErrorState message={monthly.error} onRetry={monthly.refetch} />
          ) : monthly.data ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl">
                        {monthly.data.period_label} financial review
                      </CardTitle>
                      <CardDescription className="mt-1 max-w-2xl leading-relaxed">
                        {monthly.data.summary}
                      </CardDescription>
                    </div>
                    <HealthScoreRing
                      score={monthly.data.health_score}
                      grade={monthly.data.health_grade}
                      size={104}
                      strokeWidth={9}
                    />
                  </div>
                </CardHeader>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Income"
                  value={formatMoney(monthly.data.total_income, currency)}
                  icon={TrendingUp}
                  tone="success"
                />
                <StatCard
                  label="Expenses"
                  value={formatMoney(monthly.data.total_expenses, currency)}
                  icon={FileText}
                />
                <StatCard
                  label="Saved"
                  value={formatMoney(monthly.data.total_savings, currency)}
                  sub={`${formatPercent(monthly.data.savings_rate)} of income`}
                  icon={TrendingUp}
                  tone={monthly.data.total_savings > 0 ? "success" : "destructive"}
                />
                <StatCard
                  label="Invested"
                  value={formatMoney(monthly.data.total_invested, currency)}
                  icon={TrendingUp}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Biggest spending categories</CardTitle>
                  <CardDescription>Top five for the month</CardDescription>
                </CardHeader>
                <CardContent>
                  {monthly.data.top_categories.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No spending recorded this month.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {monthly.data.top_categories.map((cat, index) => (
                        <div key={cat.category} className="flex items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {CATEGORY_LABELS[cat.category] ?? cat.category}
                          </span>
                          {cat.budget ? (
                            <Badge
                              variant={cat.amount > cat.budget ? "destructive" : "secondary"}
                              className="tabular hidden sm:inline-flex"
                            >
                              budget {formatMoney(cat.budget, currency)}
                            </Badge>
                          ) : null}
                          <span className="tabular shrink-0 text-sm font-medium">
                            {formatMoney(cat.amount, currency)}
                          </span>
                          <span className="tabular w-12 shrink-0 text-right text-xs text-muted-foreground">
                            {formatPercent(cat.share, 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-success/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      What went well
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {monthly.data.good_decisions.map((line, index) => (
                        <li key={index} className="flex gap-2 text-sm leading-relaxed">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          <span className="text-muted-foreground">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-warning/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      What needs attention
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {monthly.data.problems.map((line, index) => (
                        <li key={index} className="flex gap-2 text-sm leading-relaxed">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                          <span className="text-muted-foreground">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    Plan for next month
                  </CardTitle>
                  <CardDescription>
                    Specific actions derived from the numbers above
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3">
                    {monthly.data.next_month_plan.map((line, index) => (
                      <li key={index} className="flex gap-3 text-sm leading-relaxed">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {index + 1}
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ---------------- Yearly ---------------- */}
        <TabsContent value="yearly" className="space-y-6">
          <div className="no-print flex flex-wrap items-center gap-2">
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <Button
                key={y}
                variant={y === year ? "default" : "outline"}
                size="sm"
                onClick={() => setYear(y)}
              >
                {y}
              </Button>
            ))}
          </div>

          {yearly.loading && !yearly.data ? (
            <LoadingState />
          ) : yearly.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label={`${year} income`}
                  value={formatMoney(yearly.data.totals.income, currency)}
                  sub={`${formatMoney(yearly.data.averages.income, currency)} average month`}
                  icon={TrendingUp}
                  tone="success"
                />
                <StatCard
                  label={`${year} expenses`}
                  value={formatMoney(yearly.data.totals.expenses, currency)}
                  sub={`${formatMoney(yearly.data.averages.expenses, currency)} average month`}
                  icon={FileText}
                />
                <StatCard
                  label={`${year} saved`}
                  value={formatMoney(yearly.data.totals.savings, currency)}
                  sub={`${formatPercent(yearly.data.totals.savings_rate)} savings rate`}
                  icon={TrendingUp}
                  tone={yearly.data.totals.savings > 0 ? "success" : "destructive"}
                />
                <StatCard
                  label={`${year} invested`}
                  value={formatMoney(yearly.data.totals.invested, currency)}
                  icon={TrendingUp}
                />
              </div>

              {yearly.data.best_month || yearly.data.worst_month ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {yearly.data.best_month ? (
                    <Card className="border-success/30">
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Best month
                        </p>
                        <p className="mt-1 text-lg font-semibold">
                          {yearly.data.best_month.label} -{" "}
                          <span className="tabular text-success">
                            {formatMoney(yearly.data.best_month.savings, currency)} saved
                          </span>
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}
                  {yearly.data.worst_month ? (
                    <Card className="border-warning/30">
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Toughest month
                        </p>
                        <p className="mt-1 text-lg font-semibold">
                          {yearly.data.worst_month.label} -{" "}
                          <span className="tabular text-warning">
                            {formatMoney(yearly.data.worst_month.savings, currency)} saved
                          </span>
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Month by month</CardTitle>
                  <CardDescription>Income against expenses for {year}</CardDescription>
                </CardHeader>
                <CardContent>
                  <GroupedBarChart
                    data={yearly.data.months}
                    currency={currency}
                    height={320}
                    bars={[
                      { key: "income", name: "Income", color: "hsl(var(--chart-2))" },
                      { key: "expenses", name: "Expenses", color: "hsl(var(--chart-6))" },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Where {year} went</CardTitle>
                  <CardDescription>Spending by category across the year</CardDescription>
                </CardHeader>
                <CardContent>
                  <HorizontalBarChart
                    currency={currency}
                    height={340}
                    data={yearly.data.by_category.map((c) => ({
                      name: CATEGORY_LABELS[c.category] ?? c.category,
                      value: c.amount,
                      color: CATEGORY_COLORS[c.category],
                    }))}
                    emptyMessage={`No spending recorded in ${year}`}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ---------------- All charts ---------------- */}
        <TabsContent value="charts" className="space-y-6">
          {summary.data ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Income vs expenses</CardTitle>
                    <CardDescription>Last six months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <GroupedBarChart
                      data={summary.data.income_vs_expense}
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
                    <CardTitle className="text-base">Savings rate trend</CardTitle>
                    <CardDescription>Percentage of income kept each month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TrendLineChart
                      data={summary.data.savings_trend}
                      currency={currency}
                      suffix="%"
                      lines={[{ key: "rate", name: "Savings rate", color: "hsl(var(--chart-2))" }]}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Net worth growth</CardTitle>
                      <CardDescription>
                        Built from the snapshots you have taken
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="no-print"
                      onClick={() =>
                        downloadCsv("/reports/export/net-worth.csv", "finance-track-net-worth.csv")
                      }
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <AreaTrendChart
                    data={summary.data.net_worth_series}
                    areaKey="net_worth"
                    name="Net worth"
                    currency={currency}
                    height={320}
                    emptyMessage="No snapshots yet - take one from the dashboard to start the history"
                  />
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Category spending</CardTitle>
                    <CardDescription>This month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DonutChart
                      currency={currency}
                      data={summary.data.category_spending.map((c) => ({
                        name: CATEGORY_LABELS[c.category] ?? c.category,
                        value: c.amount,
                        color: CATEGORY_COLORS[c.category],
                      }))}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Investment allocation</CardTitle>
                    <CardDescription>
                      {summary.data.portfolio.has_live_prices
                        ? "Includes live market prices"
                        : "Valued at the prices you entered"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DonutChart
                      currency={currency}
                      data={summary.data.portfolio.allocation.map((a) => ({
                        name: INVESTMENT_LABELS[a.type] ?? a.type,
                        value: a.value,
                      }))}
                      centerValue={formatMoney(summary.data.portfolio.current_value, currency, {
                        compact: true,
                      })}
                      centerLabel="value"
                      emptyMessage="No investments tracked"
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Net worth breakdown</CardTitle>
                  <CardDescription>Assets minus liabilities, right now</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Bank", value: summary.data.current_net_worth.bank },
                    { label: "Cash", value: summary.data.current_net_worth.cash },
                    { label: "Savings", value: summary.data.current_net_worth.savings },
                    { label: "Investments", value: summary.data.current_net_worth.investments },
                    { label: "Other assets", value: summary.data.current_net_worth.other_assets },
                    { label: "Loans", value: -summary.data.current_net_worth.loans },
                    { label: "Credit card", value: -summary.data.current_net_worth.credit_card },
                    { label: "Net worth", value: summary.data.current_net_worth.net_worth },
                  ].map((row) => (
                    <div key={row.label} className="rounded-xl border border-white/10 bg-foreground/[0.035] p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </p>
                      <p
                        className={`tabular mt-1 text-lg font-semibold ${
                          row.value < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatMoney(row.value, currency)}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      <Disclaimer />
    </div>
  );
}
