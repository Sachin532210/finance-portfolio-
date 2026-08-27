import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import * as React from "react";

import { DonutChart, TrendLineChart } from "@/components/charts";
import { DemoBadge, PriceSourceBadge } from "@/components/shared/misc";
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
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/data";
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
import { INVESTMENT_LABELS } from "@/lib/constants";
import { currencySymbol, formatDate, formatMoney, formatPercent, toDateInput } from "@/lib/format";
import type { Holding, Portfolio } from "@/lib/types";
import { cn } from "@/lib/utils";

const PERIODS = ["1D", "1W", "1M", "6M", "1Y", "ALL"] as const;

type PerformanceResponse = {
  period: string;
  series: { date: string; cost_basis: number; type: string; amount: number }[];
  current_value: number;
  total_invested: number;
  profit_loss: number;
  profit_loss_pct: number;
  day_change: number | null;
  note: string;
};

type HoldingForm = {
  id?: string;
  name: string;
  ticker: string;
  type: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  notes: string;
};

const emptyHolding = (): HoldingForm => ({
  name: "",
  ticker: "",
  type: "STOCK",
  quantity: 0,
  avg_buy_price: 0,
  current_price: 0,
  notes: "",
});

export default function InvestmentsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);

  const [period, setPeriod] = React.useState<(typeof PERIODS)[number]>("1M");
  const portfolio = useApiQuery<Portfolio>("/investments");
  const perfParams = React.useMemo(() => ({ period }), [period]);
  const performance = useApiQuery<PerformanceResponse>("/investments/performance/history", perfParams);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<HoldingForm>(emptyHolding);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [txnFor, setTxnFor] = React.useState<Holding | null>(null);
  const [txn, setTxn] = React.useState({
    type: "BUY" as "BUY" | "SELL" | "DIVIDEND",
    quantity: 0,
    price: 0,
    fees: 0,
    occurred_at: toDateInput(),
  });

  const refreshAll = () => {
    portfolio.refetch();
    performance.refetch();
  };

  const save = useMutation(
    async (payload: HoldingForm) => {
      const body = {
        name: payload.name.trim(),
        ticker: payload.ticker.trim() ? payload.ticker.trim().toUpperCase() : null,
        type: payload.type,
        quantity: payload.quantity,
        avg_buy_price: payload.avg_buy_price,
        current_price: payload.current_price || payload.avg_buy_price,
        notes: payload.notes.trim() || null,
      };
      return payload.id
        ? api.patch(`/investments/${payload.id}`, body)
        : api.post("/investments", body);
    },
    {
      successMessage: "Holding saved.",
      onSuccess: () => {
        setDialogOpen(false);
        setForm(emptyHolding());
        refreshAll();
      },
    },
  );

  const remove = useMutation(async (id: string) => api.delete(`/investments/${id}`), {
    successMessage: "Holding removed.",
    onSuccess: refreshAll,
  });

  const refreshPrices = useMutation(
    async () => api.post<{ message: string; updated: number }>("/investments/refresh-prices"),
    { successMessage: (result) => result.message, onSuccess: refreshAll },
  );

  const addTransaction = useMutation(
    async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post(`/investments/${id}/transactions`, body),
    {
      successMessage: "Transaction recorded.",
      onSuccess: () => {
        setTxnFor(null);
        refreshAll();
      },
    },
  );

  const openEdit = (holding: Holding) => {
    setForm({
      id: holding.id,
      name: holding.name,
      ticker: holding.ticker ?? "",
      type: holding.type,
      quantity: holding.quantity,
      avg_buy_price: holding.avg_buy_price,
      current_price: holding.current_price,
      notes: holding.notes ?? "",
    });
    setDialogOpen(true);
  };

  if (portfolio.loading && !portfolio.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Investments" description="Loading your portfolio..." />
        <CardSkeleton />
      </div>
    );
  }
  if (portfolio.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Investments" />
        <ErrorState message={portfolio.error} onRetry={portfolio.refetch} />
      </div>
    );
  }
  if (!portfolio.data) return null;

  const data = portfolio.data;
  const valid = form.name.trim().length > 0 && form.quantity > 0 && form.avg_buy_price > 0;
  const gain = data.profit_loss >= 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investments"
        description="Your holdings, valuation and allocation. Prices are labelled by where they came from."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshPrices.mutate()}
              loading={refreshPrices.pending}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh prices
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setForm(emptyHolding());
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add holding
            </Button>
          </>
        }
      />

      {data.holdings.length === 0 ? (
        <>
          <EmptyState
            icon={TrendingUp}
            title="No investments tracked yet"
            description="Add a stock, fund, ETF or gold holding. Enter what you paid and the app tracks value, profit and allocation from there."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setForm(emptyHolding());
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add your first holding
              </Button>
            }
          />
          <Disclaimer />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Portfolio value"
              value={formatMoney(data.current_value, currency)}
              sub={`${data.holdings_count} holding(s)`}
              icon={Wallet}
              tone="primary"
            />
            <StatCard
              label="Total invested"
              value={formatMoney(data.total_invested, currency)}
              sub="Your cost basis"
              icon={Wallet}
            />
            <StatCard
              label="Profit / loss"
              value={formatMoney(data.profit_loss, currency, { signed: true })}
              sub={formatPercent(data.profit_loss_pct)}
              icon={gain ? TrendingUp : TrendingDown}
              tone={gain ? "success" : "destructive"}
            />
            <StatCard
              label="Day change"
              value={
                data.day_change === null
                  ? "Not available"
                  : formatMoney(data.day_change, currency, { signed: true })
              }
              sub={
                data.day_change === null
                  ? "Needs live prices with a previous close"
                  : "Since the previous close"
              }
              icon={data.day_change !== null && data.day_change >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={
                data.day_change === null
                  ? "default"
                  : data.day_change >= 0
                    ? "success"
                    : "destructive"
              }
            />
          </div>

          {data.market_data && !data.market_data.enabled ? (
            <InfoNote>
              <strong>Prices shown are the ones you entered.</strong> {data.market_data.note}
            </InfoNote>
          ) : (data.user_entered_count ?? 0) > 0 ? (
            <InfoNote>
              {data.user_entered_count} holding(s) have no ticker or no live quote, so they keep the
              price you entered. Live and user-entered prices are labelled separately in the table
              below.
            </InfoNote>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Contributions over time</CardTitle>
                  <CardDescription>Your recorded buys and cost basis</CardDescription>
                </div>
                <Tabs value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
                  <TabsList className="h-8">
                    {PERIODS.map((p) => (
                      <TabsTrigger key={p} value={p} className="px-2 text-xs">
                        {p}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <TrendLineChart
                  currency={currency}
                  xKey="date"
                  data={performance.data?.series ?? []}
                  lines={[{ key: "cost_basis", name: "Cost basis" }]}
                  emptyMessage="No transactions in this period"
                />
                {performance.data?.note ? (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {performance.data.note}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asset allocation</CardTitle>
                <CardDescription>By instrument type</CardDescription>
              </CardHeader>
              <CardContent>
                <DonutChart
                  currency={currency}
                  data={data.allocation.map((a) => ({
                    name: INVESTMENT_LABELS[a.type] ?? a.type,
                    value: a.value,
                  }))}
                  centerValue={formatMoney(data.current_value, currency, { compact: true })}
                  centerLabel="value"
                />
              </CardContent>
            </Card>
          </div>

          {data.best_performer || data.worst_performer ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.best_performer ? (
                <Card className="border-success/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4 text-success" />
                      Best performer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">{data.best_performer.name}</p>
                    <p className="tabular mt-1 text-sm text-success">
                      {formatMoney(data.best_performer.profit_loss, currency, { signed: true })} (
                      {formatPercent(data.best_performer.profit_loss_pct)})
                    </p>
                  </CardContent>
                </Card>
              ) : null}
              {data.worst_performer ? (
                <Card className="border-destructive/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                      Worst performer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">{data.worst_performer.name}</p>
                    <p
                      className={cn(
                        "tabular mt-1 text-sm",
                        data.worst_performer.profit_loss >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {formatMoney(data.worst_performer.profit_loss, currency, { signed: true })} (
                      {formatPercent(data.worst_performer.profit_loss_pct)})
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Holdings</CardTitle>
              <CardDescription>Every position, with the source of each price</CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:px-2 sm:pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Holding</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Avg cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.holdings.map((holding) => (
                    <TableRow key={holding.id}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{holding.name}</span>
                          {holding.ticker ? (
                            <Badge variant="outline" className="text-[10px]">
                              {holding.ticker}
                            </Badge>
                          ) : null}
                          {holding.is_demo ? <DemoBadge /> : null}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <PriceSourceBadge source={holding.price_source} />
                          {holding.price_updated_at ? (
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(holding.price_updated_at)}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary">
                          {INVESTMENT_LABELS[holding.type] ?? holding.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">{holding.quantity}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">
                        {formatMoney(holding.avg_buy_price, currency, { decimals: true })}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(holding.current_price, currency, { decimals: true })}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatMoney(holding.current_value, currency)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tabular text-right",
                          holding.profit_loss >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        <div className="font-medium">
                          {formatMoney(holding.profit_loss, currency, { signed: true })}
                        </div>
                        <div className="text-xs">{formatPercent(holding.profit_loss_pct)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setTxnFor(holding);
                              setTxn({
                                type: "BUY",
                                quantity: 0,
                                price: holding.current_price,
                                fees: 0,
                                occurred_at: toDateInput(),
                              });
                            }}
                            aria-label="Record transaction"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(holding)}
                            aria-label="Edit holding"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(holding.id)}
                            aria-label="Delete holding"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.educational_notes?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Worth keeping in mind
                </CardTitle>
                <CardDescription>General principles, not advice on any specific holding</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.educational_notes.map((note, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      {note}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Disclaimer />
        </>
      )}

      {/* ---------------- Holding dialog ---------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit holding" : "Add holding"}</DialogTitle>
            <DialogDescription>
              Leave the current price blank and the holding is valued at cost. The app never invents
              a market price.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void save.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required className="sm:col-span-2">
                <Input
                  value={form.name}
                  placeholder="e.g. Nifty 50 Index Fund"
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </Field>
              <Field label="Type">
                <SimpleSelect
                  value={form.type}
                  onValueChange={(type) => setForm((f) => ({ ...f, type }))}
                  options={Object.keys(INVESTMENT_LABELS)}
                  labels={INVESTMENT_LABELS}
                />
              </Field>
              <Field label="Ticker" hint="Optional. Needed for live price lookups.">
                <Input
                  value={form.ticker}
                  placeholder="e.g. AAPL"
                  onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                />
              </Field>
              <Field label="Quantity" required>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={form.quantity || ""}
                  placeholder="0"
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) || 0 }))}
                />
              </Field>
              <Field label="Average buy price" required>
                <MoneyInput
                  value={form.avg_buy_price}
                  onValueChange={(avg_buy_price) => setForm((f) => ({ ...f, avg_buy_price }))}
                  symbol={symbol}
                  placeholder="0"
                />
              </Field>
              <Field
                label="Current price"
                className="sm:col-span-2"
                hint="Optional. If set by hand it is labelled as user-entered, not live."
              >
                <MoneyInput
                  value={form.current_price}
                  onValueChange={(current_price) => setForm((f) => ({ ...f, current_price }))}
                  symbol={symbol}
                  placeholder="Same as buy price"
                />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea
                rows={2}
                value={form.notes}
                placeholder="Why you hold this, or anything worth remembering"
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.pending} disabled={!valid}>
                {form.id ? "Save changes" : "Add holding"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------------- Transaction dialog ---------------- */}
      <Dialog open={txnFor !== null} onOpenChange={(open) => !open && setTxnFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record a transaction</DialogTitle>
            <DialogDescription>
              {txnFor?.name} - buys update your average cost automatically.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (txnFor && txn.quantity > 0) {
                void addTransaction.mutate({
                  id: txnFor.id,
                  body: {
                    type: txn.type,
                    quantity: txn.quantity,
                    price: txn.price,
                    fees: txn.fees,
                    occurred_at: new Date(txn.occurred_at).toISOString(),
                  },
                });
              }
            }}
          >
            <Field label="Type">
              <SimpleSelect
                value={txn.type}
                onValueChange={(value) => setTxn((t) => ({ ...t, type: value as typeof t.type }))}
                options={["BUY", "SELL", "DIVIDEND"]}
                labels={{ BUY: "Buy", SELL: "Sell", DIVIDEND: "Dividend" }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity" required>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={txn.quantity || ""}
                  placeholder="0"
                  onChange={(e) => setTxn((t) => ({ ...t, quantity: Number(e.target.value) || 0 }))}
                  autoFocus
                />
              </Field>
              <Field label="Price">
                <MoneyInput
                  value={txn.price}
                  onValueChange={(price) => setTxn((t) => ({ ...t, price }))}
                  symbol={symbol}
                />
              </Field>
              <Field label="Fees">
                <MoneyInput
                  value={txn.fees}
                  onValueChange={(fees) => setTxn((t) => ({ ...t, fees }))}
                  symbol={symbol}
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={txn.occurred_at}
                  max={toDateInput()}
                  onChange={(e) => setTxn((t) => ({ ...t, occurred_at: e.target.value }))}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTxnFor(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={addTransaction.pending} disabled={txn.quantity <= 0}>
                Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this holding?"
        description="The holding and its full transaction history are removed permanently."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteId) void remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
