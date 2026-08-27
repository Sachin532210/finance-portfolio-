import {
  CalendarDays,
  Download,
  Filter,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { HorizontalBarChart, TrendLineChart } from "@/components/charts";
import { DemoBadge, MonthPicker } from "@/components/shared/misc";
import { StatCard } from "@/components/shared/stat-card";
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ConfirmDialog,
} from "@/components/ui/overlay";
import { Field, Input, MoneyInput, SimpleSelect, Textarea } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/data";
import { useAuth } from "@/context/auth-context";
import { useApiQuery, useDebounced, useMutation } from "@/hooks/use-api";
import { api, downloadCsv } from "@/lib/api";
import { CATEGORY_COLORS, CATEGORY_LABELS, PAYMENT_LABELS } from "@/lib/constants";
import { currencySymbol, formatDate, formatMoney, fromDateInput, toDateInput } from "@/lib/format";
import type { Expense, Paged } from "@/lib/types";

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const PAYMENTS = Object.keys(PAYMENT_LABELS);

type ExpenseStats = {
  total: number;
  today: number;
  week_to_date: number;
  daily_average: number;
  transaction_count: number;
  average_transaction: number;
  largest: { description: string; amount: number; category: string; date: string } | null;
  by_category: { category: string; amount: number; share: number }[];
  by_payment_method: { method: string; amount: number; share: number }[];
  daily_series: { date: string; day: number; amount: number }[];
};

type FormState = {
  id?: string;
  amount: number;
  category: string;
  description: string;
  notes: string;
  payment_method: string;
  spent_at: string;
  is_fixed: boolean;
  is_recurring: boolean;
};

const emptyForm = (): FormState => ({
  amount: 0,
  category: "FOOD",
  description: "",
  notes: "",
  payment_method: "UPI",
  spent_at: toDateInput(),
  is_fixed: false,
  is_recurring: false,
});

export default function ExpensesPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);
  const now = new Date();

  const [period, setPeriod] = React.useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [category, setCategory] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounced(search);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const listParams = React.useMemo(
    () => ({
      month: period.month,
      year: period.year,
      category: category === "ALL" ? undefined : category,
      search: debouncedSearch || undefined,
      page,
      page_size: 20,
    }),
    [period, category, debouncedSearch, page],
  );
  const statsParams = React.useMemo(
    () => ({ month: period.month, year: period.year }),
    [period],
  );

  const list = useApiQuery<Paged<Expense>>("/expenses", listParams);
  const stats = useApiQuery<ExpenseStats>("/expenses-stats/summary", statsParams);

  const refreshAll = () => {
    list.refetch();
    stats.refetch();
  };

  const save = useMutation(
    async (payload: FormState) => {
      const body = {
        amount: payload.amount,
        category: payload.category,
        description: payload.description.trim(),
        notes: payload.notes.trim() || null,
        payment_method: payload.payment_method,
        spent_at: fromDateInput(payload.spent_at),
        is_fixed: payload.is_fixed,
        is_recurring: payload.is_recurring,
      };
      return payload.id
        ? api.patch<Expense>(`/expenses/${payload.id}`, body)
        : api.post<Expense>("/expenses", body);
    },
    {
      successMessage: (result) => `Saved "${result.description}".`,
      onSuccess: () => {
        setDialogOpen(false);
        setForm(emptyForm());
        refreshAll();
      },
    },
  );

  const remove = useMutation(async (id: string) => api.delete(`/expenses/${id}`), {
    successMessage: "Expense deleted.",
    onSuccess: refreshAll,
  });

  const openCreate = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setForm({
      id: expense.id,
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      notes: expense.notes ?? "",
      payment_method: expense.payment_method,
      spent_at: toDateInput(expense.spent_at),
      is_fixed: expense.is_fixed,
      is_recurring: expense.is_recurring,
    });
    setDialogOpen(true);
  };

  const valid = form.amount > 0 && form.description.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Every transaction, categorised and totalled."
        actions={
          <>
            <MonthPicker
              month={period.month}
              year={period.year}
              onChange={(month, year) => {
                setPeriod({ month, year });
                setPage(1);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                downloadCsv(
                  "/reports/export/expenses.csv",
                  `expenses-${period.year}-${String(period.month).padStart(2, "0")}.csv`,
                  { month: period.month, year: period.year },
                );
                toast.success("Export started.");
              }}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add expense
            </Button>
          </>
        }
      />

      {stats.loading && !stats.data ? (
        <CardSkeleton />
      ) : stats.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Spent this month"
            value={formatMoney(stats.data.total, currency)}
            sub={`${stats.data.transaction_count} transaction(s)`}
            icon={Receipt}
          />
          <StatCard
            label="Daily average"
            value={formatMoney(stats.data.daily_average, currency)}
            sub={`${formatMoney(stats.data.today, currency)} spent today`}
            icon={CalendarDays}
          />
          <StatCard
            label="This week"
            value={formatMoney(stats.data.week_to_date, currency)}
            sub="Monday to today"
            icon={TrendingUp}
          />
          <StatCard
            label="Average transaction"
            value={formatMoney(stats.data.average_transaction, currency)}
            sub={
              stats.data.largest
                ? `Largest: ${stats.data.largest.description} at ${formatMoney(stats.data.largest.amount, currency)}`
                : undefined
            }
            icon={Wallet}
          />
        </div>
      ) : null}

      {stats.data && stats.data.total > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spending by category</CardTitle>
              <CardDescription>Where the money actually goes</CardDescription>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart
                currency={currency}
                data={stats.data.by_category.map((c) => ({
                  name: CATEGORY_LABELS[c.category] ?? c.category,
                  value: c.amount,
                  color: CATEGORY_COLORS[c.category],
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily spending</CardTitle>
              <CardDescription>Every day of the month</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendLineChart
                currency={currency}
                xKey="day"
                data={stats.data.daily_series}
                lines={[{ key: "amount", name: "Spent" }]}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ---------------- Filters ---------------- */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search descriptions..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SimpleSelect
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              options={["ALL", ...CATEGORIES]}
              labels={{ ALL: "All categories", ...CATEGORY_LABELS }}
              className="w-full sm:w-48"
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Table ---------------- */}
      <Card>
        <CardContent className="p-0 sm:p-2">
          {list.loading && !list.data ? (
            <div className="p-4">
              <TableSkeleton />
            </div>
          ) : list.error ? (
            <div className="p-4">
              <ErrorState message={list.error} onRetry={list.refetch} />
            </div>
          ) : !list.data || list.data.items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses found"
              description={
                search || category !== "ALL"
                  ? "Nothing matches those filters. Try clearing them."
                  : "Add your first expense for this month and it will appear here."
              }
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Add expense
                </Button>
              }
              className="m-4 border-0"
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden md:table-cell">Method</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{expense.description}</span>
                          {expense.is_demo ? <DemoBadge /> : null}
                          {expense.is_fixed ? (
                            <Badge variant="outline" className="text-[10px]">
                              Fixed
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground sm:hidden">
                          <span>{CATEGORY_LABELS[expense.category] ?? expense.category}</span>
                          <span>-</span>
                          <span>{formatDate(expense.spent_at)}</span>
                        </div>
                        {expense.notes ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {expense.notes}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary">
                          {CATEGORY_LABELS[expense.category] ?? expense.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {PAYMENT_LABELS[expense.payment_method] ?? expense.payment_method}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">
                        {formatDate(expense.spent_at)}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatMoney(expense.amount, currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(expense)}
                            aria-label="Edit expense"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(expense.id)}
                            aria-label="Delete expense"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {list.data.pages > 1 ? (
                <div className="flex items-center justify-between gap-3 border-t border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    Page {list.data.page} of {list.data.pages} - {list.data.total} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= list.data.pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Add / edit dialog ---------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit expense" : "Add expense"}</DialogTitle>
            <DialogDescription>
              Marking something as a fixed cost tells the planner it is committed, not discretionary.
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
              <Field label="Amount" required>
                <MoneyInput
                  value={form.amount}
                  onValueChange={(amount) => setForm((f) => ({ ...f, amount }))}
                  symbol={symbol}
                  placeholder="0"
                  autoFocus
                />
              </Field>
              <Field label="Date" required>
                <Input
                  type="date"
                  value={form.spent_at}
                  max={toDateInput()}
                  onChange={(e) => setForm((f) => ({ ...f, spent_at: e.target.value }))}
                />
              </Field>
            </div>

            <Field label="Description" required>
              <Input
                value={form.description}
                placeholder="e.g. Groceries at the market"
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <SimpleSelect
                  value={form.category}
                  onValueChange={(category) => setForm((f) => ({ ...f, category }))}
                  options={CATEGORIES}
                  labels={CATEGORY_LABELS}
                />
              </Field>
              <Field label="Payment method">
                <SimpleSelect
                  value={form.payment_method}
                  onValueChange={(payment_method) => setForm((f) => ({ ...f, payment_method }))}
                  options={PAYMENTS}
                  labels={PAYMENT_LABELS}
                />
              </Field>
            </div>

            <Field label="Notes" hint="Optional context for later.">
              <Textarea
                value={form.notes}
                rows={2}
                placeholder="Anything worth remembering about this expense"
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>

            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_fixed}
                  onChange={(e) => setForm((f) => ({ ...f, is_fixed: e.target.checked }))}
                  className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                />
                Fixed / committed cost
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_recurring}
                  onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                  className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                />
                Repeats monthly
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.pending} disabled={!valid}>
                {form.id ? "Save changes" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this expense?"
        description="This removes the transaction permanently and updates every total that used it."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteId) void remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
