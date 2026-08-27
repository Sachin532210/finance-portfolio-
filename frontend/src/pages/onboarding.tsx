import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Disclaimer, InfoNote } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, MoneyInput, SimpleSelect } from "@/components/ui/form";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { EMPLOYMENT_LABELS, RISK_DESCRIPTIONS, RISK_LABELS } from "@/lib/constants";
import { currencySymbol, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type FixedExpense = { id: number; category: string; description: string; amount: number };
type DebtRow = {
  id: number;
  name: string;
  type: string;
  principal: number;
  outstanding: number;
  emi: number;
  interest_rate: number;
  remaining_months: number;
  due_day: number;
};

const EXPENSE_CATEGORIES = [
  "RENT",
  "BILLS",
  "FOOD",
  "TRAVEL",
  "FAMILY",
  "SUBSCRIPTIONS",
  "EDUCATION",
  "HEALTH",
  "OTHER",
];

const DEBT_TYPES = [
  "PERSONAL_LOAN",
  "HOME_LOAN",
  "VEHICLE_LOAN",
  "EDUCATION_LOAN",
  "CREDIT_CARD",
  "OTHER",
];

const SUGGESTED_EXPENSES = [
  { category: "RENT", description: "Rent" },
  { category: "BILLS", description: "Electricity" },
  { category: "BILLS", description: "WiFi / broadband" },
  { category: "FOOD", description: "Groceries" },
  { category: "FAMILY", description: "Family contribution" },
  { category: "TRAVEL", description: "Transport" },
  { category: "SUBSCRIPTIONS", description: "Subscriptions" },
  { category: "HEALTH", description: "Insurance" },
];

const STEPS = [
  { key: "income", title: "Income", icon: Wallet, blurb: "What comes in each month" },
  { key: "expenses", title: "Fixed expenses", icon: Receipt, blurb: "Your committed monthly costs" },
  { key: "money", title: "Existing money", icon: Banknote, blurb: "What you already hold" },
  { key: "debts", title: "Debts", icon: CreditCard, blurb: "Loans and cards, if any" },
  { key: "prefs", title: "Preferences", icon: Sparkles, blurb: "How you want to plan" },
];

export default function OnboardingPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const symbol = currencySymbol(user?.currency ?? "INR");

  const [step, setStep] = React.useState(0);
  const [pending, setPending] = React.useState(false);

  // Income
  const [monthlySalary, setMonthlySalary] = React.useState(0);
  const [salaryDay, setSalaryDay] = React.useState(1);
  const [otherIncome, setOtherIncome] = React.useState(0);
  const [growth, setGrowth] = React.useState(0);
  const [employmentType, setEmploymentType] = React.useState("SALARIED");

  // Fixed expenses
  const [expenses, setExpenses] = React.useState<FixedExpense[]>([
    { id: 1, category: "RENT", description: "Rent", amount: 0 },
  ]);

  // Existing money
  const [bank, setBank] = React.useState(0);
  const [cash, setCash] = React.useState(0);
  const [savings, setSavings] = React.useState(0);
  const [emergency, setEmergency] = React.useState(0);
  const [otherAssets, setOtherAssets] = React.useState(0);

  // Debts
  const [debts, setDebts] = React.useState<DebtRow[]>([]);

  // Preferences
  const [emergencyMonths, setEmergencyMonths] = React.useState(6);
  const [targetRate, setTargetRate] = React.useState(20);
  const [inflation, setInflation] = React.useState(6);
  const [expectedReturn, setExpectedReturn] = React.useState(10);
  const [risk, setRisk] = React.useState("MODERATE");

  const totalFixed = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalIncome = monthlySalary + otherIncome;
  const leftOver = totalIncome - totalFixed;

  const addExpense = (category = "OTHER", description = "") =>
    setExpenses((rows) => [...rows, { id: Date.now() + Math.random(), category, description, amount: 0 }]);

  const addDebt = () =>
    setDebts((rows) => [
      ...rows,
      {
        id: Date.now() + Math.random(),
        name: "",
        type: "PERSONAL_LOAN",
        principal: 0,
        outstanding: 0,
        emi: 0,
        interest_rate: 0,
        remaining_months: 0,
        due_day: 5,
      },
    ]);

  const submit = async () => {
    setPending(true);
    try {
      await api.post("/profile/onboarding", {
        monthly_salary: monthlySalary,
        salary_day: salaryDay,
        other_monthly_income: otherIncome,
        expected_growth_pct: growth,
        employment_type: employmentType,
        fixed_expenses: expenses
          .filter((e) => e.amount > 0 && e.description.trim())
          .map((e) => ({ category: e.category, description: e.description.trim(), amount: e.amount })),
        bank_balance: bank,
        cash_balance: cash,
        existing_savings: savings,
        emergency_fund: emergency,
        other_assets: otherAssets,
        debts: debts
          .filter((d) => d.name.trim() && d.outstanding > 0)
          .map(({ id, ...rest }) => ({ ...rest, name: rest.name.trim() })),
        emergency_fund_months: emergencyMonths,
        target_savings_rate: targetRate,
        inflation_assumption: inflation,
        investment_return_pct: expectedReturn,
        risk_tolerance: risk,
      });
      await refresh();
      toast.success("Profile saved. Here is your dashboard.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setPending(false);
    }
  };

  const skip = async () => {
    setPending(true);
    try {
      await api.post("/profile/skip-onboarding");
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch {
      toast.error("Could not skip setup.");
    } finally {
      setPending(false);
    }
  };

  const loadDemo = async () => {
    setPending(true);
    try {
      await api.post("/demo/seed");
      await refresh();
      toast.success("Demo data loaded. You can remove it any time from Settings.");
      navigate("/dashboard", { replace: true });
    } catch {
      toast.error("Could not load demo data.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Let's set up your finances
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Nothing here is required. Fill in what you know and skip the rest - you can add or edit
            everything later from Settings.
          </p>
        </div>

        {/* Step indicator */}
        <ol className="no-scrollbar mb-6 flex items-center gap-2 overflow-x-auto pb-1">
          {STEPS.map((s, index) => {
            const done = index < step;
            const active = index === step;
            return (
              <li key={s.key} className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : done
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                  {s.title}
                </button>
                {index < STEPS.length - 1 ? (
                  <span className="h-px w-4 shrink-0 bg-border" aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ol>

        <Card>
          <CardContent className="p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold">{STEPS[step].title}</h2>
              <p className="text-sm text-muted-foreground">{STEPS[step].blurb}</p>
            </div>

            {/* ---------------- Step 1: income ---------------- */}
            {step === 0 ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Monthly salary" hint="Take-home amount, after tax and deductions.">
                    <MoneyInput
                      value={monthlySalary}
                      onValueChange={setMonthlySalary}
                      symbol={symbol}
                      placeholder="25000"
                    />
                  </Field>
                  <Field label="Salary date" hint="Day of the month it usually lands.">
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={salaryDay}
                      onChange={(e) => setSalaryDay(Number(e.target.value) || 1)}
                    />
                  </Field>
                  <Field label="Other monthly income" hint="Freelance, rent, interest - optional.">
                    <MoneyInput
                      value={otherIncome}
                      onValueChange={setOtherIncome}
                      symbol={symbol}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Expected annual growth (%)" hint="Used for long-term projections.">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={growth}
                      onChange={(e) => setGrowth(Number(e.target.value) || 0)}
                    />
                  </Field>
                </div>
                <Field label="Employment type">
                  <SimpleSelect
                    value={employmentType}
                    onValueChange={setEmploymentType}
                    options={Object.keys(EMPLOYMENT_LABELS)}
                    labels={EMPLOYMENT_LABELS}
                  />
                </Field>
                {totalIncome > 0 ? (
                  <InfoNote>
                    Total monthly income:{" "}
                    <strong>{formatMoney(totalIncome, user?.currency)}</strong>
                  </InfoNote>
                ) : null}
              </div>
            ) : null}

            {/* ---------------- Step 2: fixed expenses ---------------- */}
            {step === 1 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_EXPENSES.map((s) => (
                    <button
                      key={s.description}
                      type="button"
                      onClick={() => addExpense(s.category, s.description)}
                      className="rounded-full border border-white/12 bg-foreground/[0.04] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      + {s.description}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {expenses.map((row, index) => (
                    <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <Field label={index === 0 ? "Description" : undefined}>
                        <Input
                          value={row.description}
                          placeholder="e.g. Room rent"
                          onChange={(e) =>
                            setExpenses((rows) =>
                              rows.map((r) =>
                                r.id === row.id ? { ...r, description: e.target.value } : r,
                              ),
                            )
                          }
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={index === 0 ? "Category" : undefined}>
                          <SimpleSelect
                            value={row.category}
                            onValueChange={(value) =>
                              setExpenses((rows) =>
                                rows.map((r) => (r.id === row.id ? { ...r, category: value } : r)),
                              )
                            }
                            options={EXPENSE_CATEGORIES}
                          />
                        </Field>
                        <Field label={index === 0 ? "Amount" : undefined}>
                          <MoneyInput
                            value={row.amount}
                            symbol={symbol}
                            placeholder="0"
                            onValueChange={(value) =>
                              setExpenses((rows) =>
                                rows.map((r) => (r.id === row.id ? { ...r, amount: value } : r)),
                              )
                            }
                          />
                        </Field>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="justify-self-end text-muted-foreground hover:text-destructive"
                        onClick={() => setExpenses((rows) => rows.filter((r) => r.id !== row.id))}
                        aria-label="Remove expense"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={() => addExpense()}>
                  <Plus className="h-4 w-4" />
                  Add another
                </Button>

                {totalFixed > 0 ? (
                  <InfoNote variant={leftOver < 0 ? "warning" : "info"}>
                    Fixed expenses total <strong>{formatMoney(totalFixed, user?.currency)}</strong>
                    {totalIncome > 0 ? (
                      <>
                        {" "}
                        - that is {((totalFixed / totalIncome) * 100).toFixed(0)}% of your income,
                        leaving <strong>{formatMoney(leftOver, user?.currency)}</strong> for
                        everything else.
                      </>
                    ) : null}
                  </InfoNote>
                ) : null}
              </div>
            ) : null}

            {/* ---------------- Step 3: existing money ---------------- */}
            {step === 2 ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bank balance">
                    <MoneyInput value={bank} onValueChange={setBank} symbol={symbol} placeholder="0" />
                  </Field>
                  <Field label="Cash in hand">
                    <MoneyInput value={cash} onValueChange={setCash} symbol={symbol} placeholder="0" />
                  </Field>
                  <Field label="Existing savings" hint="Money set aside but not an emergency fund.">
                    <MoneyInput value={savings} onValueChange={setSavings} symbol={symbol} placeholder="0" />
                  </Field>
                  <Field label="Emergency fund" hint="We will turn this into a trackable goal.">
                    <MoneyInput
                      value={emergency}
                      onValueChange={setEmergency}
                      symbol={symbol}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Other assets" hint="Gold, property, anything else you own.">
                    <MoneyInput
                      value={otherAssets}
                      onValueChange={setOtherAssets}
                      symbol={symbol}
                      placeholder="0"
                    />
                  </Field>
                </div>
                <InfoNote>
                  Investments are added separately on the Investments page, so you can track each
                  holding individually.
                </InfoNote>
              </div>
            ) : null}

            {/* ---------------- Step 4: debts ---------------- */}
            {step === 3 ? (
              <div className="space-y-4">
                {debts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-foreground/15 px-6 py-10 text-center">
                    <p className="text-sm font-medium">No debts recorded</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      If you have no loans or card balances, skip this step - that is a strong
                      position to be in.
                    </p>
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={addDebt}>
                      <Plus className="h-4 w-4" />
                      Add a debt
                    </Button>
                  </div>
                ) : (
                  <>
                    {debts.map((row) => (
                      <div key={row.id} className="space-y-3 rounded-xl border border-white/10 bg-foreground/[0.035] p-4">
                        <div className="flex items-start gap-2">
                          <Field label="Name" className="flex-1">
                            <Input
                              value={row.name}
                              placeholder="e.g. Education loan"
                              onChange={(e) =>
                                setDebts((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                                )
                              }
                            />
                          </Field>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mt-6 text-muted-foreground hover:text-destructive"
                            onClick={() => setDebts((rows) => rows.filter((r) => r.id !== row.id))}
                            aria-label="Remove debt"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Type">
                            <SimpleSelect
                              value={row.type}
                              onValueChange={(value) =>
                                setDebts((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, type: value } : r)),
                                )
                              }
                              options={DEBT_TYPES}
                            />
                          </Field>
                          <Field label="Original amount">
                            <MoneyInput
                              value={row.principal}
                              symbol={symbol}
                              placeholder="0"
                              onValueChange={(value) =>
                                setDebts((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, principal: value } : r)),
                                )
                              }
                            />
                          </Field>
                          <Field label="Outstanding now">
                            <MoneyInput
                              value={row.outstanding}
                              symbol={symbol}
                              placeholder="0"
                              onValueChange={(value) =>
                                setDebts((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, outstanding: value } : r)),
                                )
                              }
                            />
                          </Field>
                          <Field label="Monthly EMI">
                            <MoneyInput
                              value={row.emi}
                              symbol={symbol}
                              placeholder="0"
                              onValueChange={(value) =>
                                setDebts((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, emi: value } : r)),
                                )
                              }
                            />
                          </Field>
                          <Field label="Interest rate (% per year)">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={row.interest_rate}
                              onChange={(e) =>
                                setDebts((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id
                                      ? { ...r, interest_rate: Number(e.target.value) || 0 }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field label="Months remaining">
                            <Input
                              type="number"
                              min={0}
                              value={row.remaining_months}
                              onChange={(e) =>
                                setDebts((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id
                                      ? { ...r, remaining_months: Number(e.target.value) || 0 }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addDebt}>
                      <Plus className="h-4 w-4" />
                      Add another debt
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            {/* ---------------- Step 5: preferences ---------------- */}
            {step === 4 ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Emergency fund target (months)"
                    hint="Three months is the usual floor, six is comfortable."
                  >
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={emergencyMonths}
                      onChange={(e) => setEmergencyMonths(Number(e.target.value) || 6)}
                    />
                  </Field>
                  <Field label="Target savings rate (%)" hint="Share of income you want to save.">
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={targetRate}
                      onChange={(e) => setTargetRate(Number(e.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Inflation assumption (%)" hint="Used by the Future Planner.">
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      step="0.5"
                      value={inflation}
                      onChange={(e) => setInflation(Number(e.target.value) || 0)}
                    />
                  </Field>
                  <Field
                    label="Expected investment return (%)"
                    hint="An assumption, not a promise. Projections are estimates."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      step="0.5"
                      value={expectedReturn}
                      onChange={(e) => setExpectedReturn(Number(e.target.value) || 0)}
                    />
                  </Field>
                </div>

                <Field label="Risk preference" hint={RISK_DESCRIPTIONS[risk]}>
                  <SimpleSelect
                    value={risk}
                    onValueChange={setRisk}
                    options={Object.keys(RISK_LABELS)}
                    labels={RISK_LABELS}
                  />
                </Field>

                <Disclaimer />
              </div>
            ) : null}

            {/* ---------------- Navigation ---------------- */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={() => setStep((s) => s + 1)}>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={submit} loading={pending}>
                  <Check className="h-4 w-4" />
                  Finish setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-4">
          <Button variant="link" size="sm" onClick={skip} disabled={pending}>
            Skip for now
          </Button>
          <span className="hidden text-muted-foreground sm:inline">|</span>
          <Button variant="link" size="sm" onClick={loadDemo} disabled={pending}>
            <Sparkles className="h-4 w-4" />
            Explore with demo data instead
          </Button>
        </div>
      </div>
    </div>
  );
}
