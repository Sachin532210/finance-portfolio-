import {
  CheckCircle2,
  Clock,
  History,
  PiggyBank,
  Send,
  ShoppingCart,
  Sparkles,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { GeneratedByBadge, VerdictBadge } from "@/components/shared/misc";
import {
  Disclaimer,
  EmptyState,
  ErrorState,
  InfoNote,
  LoadingState,
  PageHeader,
} from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Progress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/data";
import { Field, Input, MoneyInput, SimpleSelect } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAuth } from "@/context/auth-context";
import { useApiQuery, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, NECESSITY_LABELS } from "@/lib/constants";
import { currencySymbol, formatDate, formatMoney, formatPercent } from "@/lib/format";
import type { BuyingGuideItem, PurchaseAnalysis } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The history endpoint returns the reasoning already joined into prose. */
type DecisionHistoryItem = Omit<PurchaseAnalysis, "reasoning" | "factors"> & {
  id: string;
  reasoning: string;
  created_at: string;
};

type BuyingGuideResponse = {
  buckets: Record<string, BuyingGuideItem[]>;
  items: BuyingGuideItem[];
  context: {
    disposable: number;
    savings_rate: number;
    target_savings_rate: number;
    emergency_months: number;
    days_left: number;
  };
  currency_symbol: string;
};

const BUCKET_META = {
  BUY_NOW: { label: "Buy now", icon: CheckCircle2, tone: "success", blurb: "Necessary and affordable" },
  PLAN_AND_BUY: { label: "Plan and buy", icon: Clock, tone: "default", blurb: "Useful, but budget for it" },
  WAIT: { label: "Wait", icon: TriangleAlert, tone: "warning", blurb: "Not urgent, and it costs you" },
  AVOID: { label: "Avoid", icon: XCircle, tone: "destructive", blurb: "Financially harmful right now" },
} as const;

function scoreTone(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 60) return "text-primary";
  if (score >= 42) return "text-warning";
  return "text-destructive";
}

export default function DecisionsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);

  const [itemName, setItemName] = React.useState("");
  const [price, setPrice] = React.useState(0);
  const [category, setCategory] = React.useState("SHOPPING");
  const [necessity, setNecessity] = React.useState("WANT");
  const [onCredit, setOnCredit] = React.useState(false);
  const [result, setResult] = React.useState<PurchaseAnalysis | null>(null);

  const [question, setQuestion] = React.useState("");

  const guide = useApiQuery<BuyingGuideResponse>("/decisions/buying-guide");
  const history = useApiQuery<DecisionHistoryItem[]>("/decisions/history");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const analyse = useMutation(
    async () =>
      api.post<PurchaseAnalysis>("/decisions/analyse", {
        item_name: itemName.trim(),
        price,
        category,
        necessity,
        on_credit: onCredit,
        explain_with_ai: true,
      }),
    {
      onSuccess: (analysis) => {
        setResult(analysis);
        history.refetch();
      },
    },
  );

  const quickAsk = useMutation(
    async () =>
      api.post<PurchaseAnalysis & { parsed: boolean; message?: string; detected_price?: number }>(
        "/decisions/quick-ask",
        { question: question.trim() },
      ),
    {
      onSuccess: (response) => {
        if (!response.parsed) {
          setResult(null);
          return;
        }
        setResult(response);
        setItemName(response.item_name);
        setPrice(response.price);
      },
    },
  );

  const remove = useMutation(async (id: string) => api.delete(`/decisions/history/${id}`), {
    successMessage: "Removed from history.",
    onSuccess: history.refetch,
  });

  const valid = itemName.trim().length > 0 && price > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Can I Buy This?"
        description="Score a purchase against your actual finances - affordability, necessity, savings impact and goal impact."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ---------------- Input ---------------- */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ask in plain language</CardTitle>
              <CardDescription>For example: "Can I buy a 5,000 headphone?"</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (question.trim().length > 3) void quickAsk.mutate();
                }}
              >
                <Input
                  value={question}
                  placeholder="Can I buy a 5,000 headphone?"
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <Button
                  type="submit"
                  size="icon"
                  loading={quickAsk.pending}
                  disabled={question.trim().length <= 3}
                  aria-label="Ask"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Or fill in the details</CardTitle>
              <CardDescription>More context produces a sharper answer</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid) void analyse.mutate();
                }}
              >
                <Field label="What are you buying?" required>
                  <Input
                    value={itemName}
                    placeholder="e.g. Wireless headphones"
                    onChange={(e) => setItemName(e.target.value)}
                  />
                </Field>

                <Field label="Price" required>
                  <MoneyInput
                    value={price}
                    onValueChange={setPrice}
                    symbol={symbol}
                    placeholder="0"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Category">
                    <SimpleSelect
                      value={category}
                      onValueChange={setCategory}
                      options={Object.keys(CATEGORY_LABELS)}
                      labels={CATEGORY_LABELS}
                    />
                  </Field>
                  <Field label="Need or want?">
                    <SimpleSelect
                      value={necessity}
                      onValueChange={setNecessity}
                      options={Object.keys(NECESSITY_LABELS)}
                      labels={NECESSITY_LABELS}
                    />
                  </Field>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={onCredit}
                    onChange={(e) => setOnCredit(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                  />
                  I would put this on a credit card or EMI
                </label>

                <Button type="submit" className="w-full" loading={analyse.pending} disabled={!valid}>
                  <ShoppingCart className="h-4 w-4" />
                  Score this purchase
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ---------------- Result ---------------- */}
        <div className="lg:col-span-3">
          {analyse.pending || quickAsk.pending ? (
            <Card>
              <CardContent>
                <LoadingState label="Checking this against your finances..." />
              </CardContent>
            </Card>
          ) : result ? (
            <Card
              className={cn(
                result.verdict === "BUY_NOW"
                  ? "border-success/40"
                  : result.verdict === "AVOID"
                    ? "border-destructive/40"
                    : "border-warning/40",
              )}
            >
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-lg">{result.item_name}</CardTitle>
                    <CardDescription className="tabular mt-1">
                      {formatMoney(result.price, currency)}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <VerdictBadge verdict={result.verdict} />
                    {result.generated_by ? <GeneratedByBadge by={result.generated_by} /> : null}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-foreground/[0.035] p-4">
                  <div className="text-center">
                    <p className={cn("tabular text-4xl font-bold leading-none", scoreTone(result.score))}>
                      {result.score}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      out of 100
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-relaxed">{result.headline}</p>
                    {result.wait_days > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Suggested waiting period: {result.wait_days} days
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Factor breakdown */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">How the score breaks down</p>
                  {result.factors.map((factor) => {
                    const pct = factor.max > 0 ? (factor.score / factor.max) * 100 : 0;
                    return (
                      <div key={factor.key} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm">{factor.label}</span>
                          <span className="tabular shrink-0 text-xs text-muted-foreground">
                            {factor.score.toFixed(1)} / {factor.max}
                          </span>
                        </div>
                        <Progress
                          value={pct}
                          className="h-1.5"
                          indicatorClassName={
                            pct >= 75
                              ? "bg-success"
                              : pct >= 45
                                ? "bg-primary"
                                : pct >= 25
                                  ? "bg-warning"
                                  : "bg-destructive"
                          }
                        />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {factor.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Impact */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-foreground/[0.035] p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Discretionary money
                    </p>
                    <p className="tabular mt-1 text-sm">
                      {formatMoney(result.impact.disposable_before, currency)} &rarr;{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          result.impact.disposable_after < 0 ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {formatMoney(result.impact.disposable_after, currency)}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-foreground/[0.035] p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Savings this month
                    </p>
                    <p className="tabular mt-1 text-sm">
                      {formatMoney(result.impact.savings_before, currency)} &rarr;{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          result.impact.savings_after < 0 ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {formatMoney(result.impact.savings_after, currency)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Savings rate would be {formatPercent(result.impact.savings_rate_after)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-foreground/[0.035] p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Share of income
                    </p>
                    <p className="tabular mt-1 text-sm font-semibold">
                      {formatPercent(result.impact.percent_of_monthly_income, 0)}
                    </p>
                  </div>
                  {result.impact.goal_delayed ? (
                    <div className="rounded-xl border border-white/10 bg-foreground/[0.035] p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Goal impact
                      </p>
                      <p className="mt-1 text-sm">
                        Delays <span className="font-medium">{result.impact.goal_delayed}</span> by
                        about {result.impact.goal_delay_months} month(s)
                      </p>
                    </div>
                  ) : null}
                </div>

                {result.impact.emergency_fund_touched ? (
                  <InfoNote variant="warning">
                    Paying for this would dip into your emergency fund. That money exists for a job
                    loss or a medical bill - spending it converts a future emergency into debt.
                  </InfoNote>
                ) : null}

                {/* Reasoning */}
                <div className="space-y-2 rounded-lg bg-foreground/[0.04] p-4">
                  <p className="text-sm font-medium">The reasoning</p>
                  {result.explanation ? (
                    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                      {result.explanation.split("\n").filter(Boolean).map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {result.reasoning.map((line, index) => (
                        <li
                          key={index}
                          className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                        >
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {result.months_to_save && result.verdict !== "BUY_NOW" ? (
                  <InfoNote variant="info">
                    <div className="flex items-start gap-2">
                      <PiggyBank className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Setting aside{" "}
                        <strong>{formatMoney(result.suggested_monthly_saving, currency)}</strong> a
                        month gets you there in about {result.months_to_save} month(s) without
                        touching your savings or emergency fund.
                      </span>
                    </div>
                  </InfoNote>
                ) : null}

                <Disclaimer />
              </CardContent>
            </Card>
          ) : quickAsk.pending === false && question && !result ? (
            <Card>
              <CardContent className="py-10">
                <EmptyState
                  icon={ShoppingCart}
                  title="No amount found in that question"
                  description='Try something like "Can I buy a 5,000 headphone?" or use the form on the left.'
                  className="border-0"
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10">
                <EmptyState
                  icon={ShoppingCart}
                  title="Score a purchase"
                  description="Enter what you want to buy and its price. The answer is calculated from your real income, expenses, savings target, emergency fund and goals - it is never a generic yes or no."
                  className="border-0"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ---------------- Smart buying guide + history ---------------- */}
      <Tabs defaultValue="guide">
        <TabsList>
          <TabsTrigger value="guide">
            <Sparkles className="mr-1.5 h-4 w-4" />
            Smart buying guide
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1.5 h-4 w-4" />
            Past decisions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guide">
          {guide.loading && !guide.data ? (
            <LoadingState />
          ) : guide.error ? (
            <ErrorState message={guide.error} onRetry={guide.refetch} />
          ) : guide.data ? (
            <div className="space-y-4">
              <InfoNote>
                Built entirely from your own numbers: {formatMoney(guide.data.context.disposable, currency)}{" "}
                discretionary this month, a {formatPercent(guide.data.context.savings_rate)} savings
                rate against a {formatPercent(guide.data.context.target_savings_rate, 0)} target, and{" "}
                {guide.data.context.emergency_months.toFixed(1)} months of emergency cover.
              </InfoNote>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {(Object.keys(BUCKET_META) as (keyof typeof BUCKET_META)[]).map((bucket) => {
                  const meta = BUCKET_META[bucket];
                  const items = guide.data!.buckets[bucket] ?? [];
                  const Icon = meta.icon;
                  return (
                    <Card key={bucket}>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              meta.tone === "success"
                                ? "text-success"
                                : meta.tone === "warning"
                                  ? "text-warning"
                                  : meta.tone === "destructive"
                                    ? "text-destructive"
                                    : "text-primary",
                            )}
                          />
                          {meta.label}
                        </CardTitle>
                        <CardDescription>{meta.blurb}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {items.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">
                            Nothing in this bucket right now.
                          </p>
                        ) : (
                          items.map((item, index) => (
                            <div key={index} className="rounded-xl border border-white/10 bg-foreground/[0.035] p-3">
                              <p className="text-sm font-medium capitalize">{item.name}</p>
                              {item.estimated_amount ? (
                                <Badge variant="secondary" className="tabular mt-1">
                                  {formatMoney(item.estimated_amount, currency)}
                                </Badge>
                              ) : null}
                              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                {item.reason}
                              </p>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="history">
          {history.loading && !history.data ? (
            <LoadingState />
          ) : !history.data || history.data.length === 0 ? (
            <EmptyState
              icon={History}
              title="No decisions yet"
              description="Every purchase you score is saved here, so you can see what you decided and why."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {history.data.map((decision) => (
                <Card key={decision.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{decision.item_name}</p>
                        <p className="tabular text-sm text-muted-foreground">
                          {formatMoney(decision.price, currency)} -{" "}
                          {formatDate(decision.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={cn("tabular text-lg font-bold", scoreTone(decision.score))}>
                          {decision.score}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(decision.id)}
                          aria-label="Delete decision"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <VerdictBadge verdict={decision.verdict} />
                      <Badge variant="outline" className="text-[10px]">
                        {NECESSITY_LABELS[decision.necessity] ?? decision.necessity}
                      </Badge>
                      <GeneratedByBadge by={decision.generated_by} />
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {decision.reasoning}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove this decision?"
        description="It is deleted from your history. Nothing else changes."
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteId) void remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
