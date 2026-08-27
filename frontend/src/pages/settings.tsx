import {
  AlertTriangle,
  Database,
  KeyRound,
  LogOut,
  Save,
  Sparkles,
  Trash2,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Disclaimer, InfoNote, LoadingState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/data";
import { Field, Input, MoneyInput, SimpleSelect } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAuth } from "@/context/auth-context";
import { useApiQuery, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { EMPLOYMENT_LABELS, RISK_DESCRIPTIONS, RISK_LABELS } from "@/lib/constants";
import { currencySymbol, formatMoney } from "@/lib/format";
import type { FinancialProfile } from "@/lib/types";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

export default function SettingsPage() {
  const { user, logout, refresh, updateUser } = useAuth();
  const navigate = useNavigate();
  const currency = user?.currency ?? "INR";
  const symbol = currencySymbol(currency);

  const profile = useApiQuery<FinancialProfile>("/profile");
  const demoStatus = useApiQuery<{ has_demo_data: boolean; note: string }>("/demo/status");

  const [account, setAccount] = React.useState({ name: user?.name ?? "", currency });
  const [draft, setDraft] = React.useState<FinancialProfile | null>(null);
  const [passwords, setPasswords] = React.useState({ current: "", next: "", confirm: "" });

  const [wipeOpen, setWipeOpen] = React.useState(false);
  const [demoClearOpen, setDemoClearOpen] = React.useState(false);

  React.useEffect(() => {
    if (profile.data) setDraft(profile.data);
  }, [profile.data]);

  React.useEffect(() => {
    if (user) setAccount({ name: user.name, currency: user.currency });
  }, [user]);

  const saveAccount = useMutation(
    async () => api.patch<typeof user>("/auth/me", account),
    {
      successMessage: "Account updated.",
      onSuccess: (updated) => {
        if (updated) updateUser(updated);
      },
    },
  );

  const saveProfile = useMutation(
    async (payload: FinancialProfile) => api.patch<FinancialProfile>("/profile", payload),
    { successMessage: "Financial profile saved.", onSuccess: (data) => profile.setData(data) },
  );

  const changePassword = useMutation(
    async () =>
      api.post<{ message: string }>("/auth/change-password", {
        current_password: passwords.current,
        new_password: passwords.next,
      }),
    {
      successMessage: (result) => result.message,
      onSuccess: async () => {
        setPasswords({ current: "", next: "", confirm: "" });
        await logout();
        navigate("/login", { replace: true });
      },
    },
  );

  const seedDemo = useMutation(async () => api.post<{ message: string }>("/demo/seed"), {
    successMessage: (result) => result.message,
    onSuccess: async () => {
      await refresh();
      demoStatus.refetch();
      profile.refetch();
    },
  });

  const clearDemo = useMutation(async () => api.delete<{ message: string }>("/demo"), {
    successMessage: (result) => result.message,
    onSuccess: async () => {
      await refresh();
      demoStatus.refetch();
      profile.refetch();
    },
  });

  const wipeData = useMutation(async () => api.delete<{ message: string }>("/profile/all-data"), {
    successMessage: (result) => result.message,
    onSuccess: async () => {
      await refresh();
      navigate("/onboarding", { replace: true });
    },
  });

  const passwordValid =
    passwords.current.length > 0 &&
    passwords.next.length >= 8 &&
    /[A-Za-z]/.test(passwords.next) &&
    /\d/.test(passwords.next) &&
    passwords.next === passwords.confirm;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your account, financial profile, demo data and planning assumptions."
      />

      <Tabs defaultValue="profile">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile">Financial profile</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        {/* ---------------- Financial profile ---------------- */}
        <TabsContent value="profile" className="space-y-4">
          {profile.loading && !draft ? (
            <LoadingState />
          ) : draft ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="h-4 w-4 text-primary" />
                    Income
                  </CardTitle>
                  <CardDescription>What the planner works from each month</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="Monthly salary" hint="Take-home, after tax.">
                    <MoneyInput
                      value={draft.monthly_salary}
                      onValueChange={(monthly_salary) => setDraft({ ...draft, monthly_salary })}
                      symbol={symbol}
                    />
                  </Field>
                  <Field label="Salary day">
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.salary_day}
                      onChange={(e) =>
                        setDraft({ ...draft, salary_day: Number(e.target.value) || 1 })
                      }
                    />
                  </Field>
                  <Field label="Other monthly income">
                    <MoneyInput
                      value={draft.other_monthly_income}
                      onValueChange={(other_monthly_income) =>
                        setDraft({ ...draft, other_monthly_income })
                      }
                      symbol={symbol}
                    />
                  </Field>
                  <Field label="Expected annual growth (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={draft.expected_growth_pct}
                      onChange={(e) =>
                        setDraft({ ...draft, expected_growth_pct: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                  <Field label="Employment type" className="sm:col-span-2">
                    <SimpleSelect
                      value={draft.employment_type}
                      onValueChange={(employment_type) => setDraft({ ...draft, employment_type })}
                      options={Object.keys(EMPLOYMENT_LABELS)}
                      labels={EMPLOYMENT_LABELS}
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Balances</CardTitle>
                  <CardDescription>
                    Used for net worth and for judging what you can afford
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bank balance">
                    <MoneyInput
                      value={draft.bank_balance}
                      onValueChange={(bank_balance) => setDraft({ ...draft, bank_balance })}
                      symbol={symbol}
                    />
                  </Field>
                  <Field label="Cash in hand">
                    <MoneyInput
                      value={draft.cash_balance}
                      onValueChange={(cash_balance) => setDraft({ ...draft, cash_balance })}
                      symbol={symbol}
                    />
                  </Field>
                  <Field label="Existing savings">
                    <MoneyInput
                      value={draft.existing_savings}
                      onValueChange={(existing_savings) => setDraft({ ...draft, existing_savings })}
                      symbol={symbol}
                    />
                  </Field>
                  <Field
                    label="Emergency fund"
                    hint="Kept in step with any emergency-fund savings goal."
                  >
                    <MoneyInput
                      value={draft.emergency_fund}
                      onValueChange={(emergency_fund) => setDraft({ ...draft, emergency_fund })}
                      symbol={symbol}
                    />
                  </Field>
                  <Field label="Other assets" className="sm:col-span-2">
                    <MoneyInput
                      value={draft.other_assets}
                      onValueChange={(other_assets) => setDraft({ ...draft, other_assets })}
                      symbol={symbol}
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Planning assumptions</CardTitle>
                  <CardDescription>
                    These drive the salary planner, goals and every projection
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Emergency fund target (months)"
                    hint="Three months is the usual floor."
                  >
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={draft.emergency_fund_months}
                      onChange={(e) =>
                        setDraft({ ...draft, emergency_fund_months: Number(e.target.value) || 6 })
                      }
                    />
                  </Field>
                  <Field label="Target savings rate (%)">
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={draft.target_savings_rate}
                      onChange={(e) =>
                        setDraft({ ...draft, target_savings_rate: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                  <Field label="Inflation assumption (%)">
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      step="0.5"
                      value={draft.inflation_assumption}
                      onChange={(e) =>
                        setDraft({ ...draft, inflation_assumption: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                  <Field
                    label="Expected investment return (%)"
                    hint="An assumption, never a guarantee."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      step="0.5"
                      value={draft.investment_return_pct}
                      onChange={(e) =>
                        setDraft({ ...draft, investment_return_pct: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                  <Field
                    label="Risk preference"
                    className="sm:col-span-2"
                    hint={RISK_DESCRIPTIONS[draft.risk_tolerance]}
                  >
                    <SimpleSelect
                      value={draft.risk_tolerance}
                      onValueChange={(risk_tolerance) => setDraft({ ...draft, risk_tolerance })}
                      options={Object.keys(RISK_LABELS)}
                      labels={RISK_LABELS}
                    />
                  </Field>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  onClick={() => void saveProfile.mutate(draft)}
                  loading={saveProfile.pending}
                >
                  <Save className="h-4 w-4" />
                  Save financial profile
                </Button>
              </div>

              <Disclaimer />
            </>
          ) : null}
        </TabsContent>

        {/* ---------------- Account ---------------- */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserIcon className="h-4 w-4 text-primary" />
                Your details
              </CardTitle>
              <CardDescription>{user?.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input
                    value={account.name}
                    onChange={(e) => setAccount({ ...account, name: e.target.value })}
                  />
                </Field>
                <Field
                  label="Currency"
                  hint="Changes how every amount is displayed. It does not convert values."
                >
                  <SimpleSelect
                    value={account.currency}
                    onValueChange={(value) => setAccount({ ...account, currency: value })}
                    options={CURRENCIES}
                  />
                </Field>
              </div>
              <Button
                onClick={() => void saveAccount.mutate()}
                loading={saveAccount.pending}
                disabled={account.name.trim().length < 2}
              >
                <Save className="h-4 w-4" />
                Save details
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" />
                Change password
              </CardTitle>
              <CardDescription>
                Changing your password signs you out of every device, including this one
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Current password">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  />
                </Field>
                <Field label="New password" hint="8+ characters, a letter and a number.">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.next}
                    onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                  />
                </Field>
                <Field
                  label="Confirm new password"
                  error={
                    passwords.confirm && passwords.confirm !== passwords.next
                      ? "Passwords do not match."
                      : undefined
                  }
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  />
                </Field>
              </div>
              <Button
                onClick={() => void changePassword.mutate()}
                loading={changePassword.pending}
                disabled={!passwordValid}
              >
                Update password
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await logout();
                  navigate("/login", { replace: true });
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await api.post("/auth/logout-all");
                  toast.success("Signed out of every device.");
                  navigate("/login", { replace: true });
                }}
              >
                Sign out everywhere
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Data ---------------- */}
        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Demo data
              </CardTitle>
              <CardDescription>
                A realistic sample dataset so every page has something to show
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {demoStatus.data?.has_demo_data ? (
                <>
                  <InfoNote>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Demo data loaded</Badge>
                      <span>{demoStatus.data.note}</span>
                    </div>
                  </InfoNote>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDemoClearOpen(true)}
                      loading={clearDemo.pending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove demo data
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void seedDemo.mutate()}
                      loading={seedDemo.pending}
                    >
                      Regenerate
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Loads a sample profile: {formatMoney(25000, currency)} salary,
                    four months of expenses, budgets, savings goals, investments, debts and future
                    plans. Every row is marked as demo, so removing it never touches anything you
                    entered yourself.
                  </p>
                  <Button onClick={() => void seedDemo.mutate()} loading={seedDemo.pending}>
                    <Database className="h-4 w-4" />
                    Load demo data
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Danger zone
              </CardTitle>
              <CardDescription>
                Deletes every financial record on this account. Your login is kept.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This removes expenses, income, budgets, savings goals, investments, debts, goals,
                future plans, reports, notifications and coach conversations. It cannot be undone.
              </p>
              <Button variant="destructive" onClick={() => setWipeOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Delete all my financial data
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={demoClearOpen}
        onOpenChange={setDemoClearOpen}
        title="Remove demo data?"
        description="Only rows marked as demo are deleted. Anything you entered yourself is left untouched."
        confirmLabel="Remove demo data"
        destructive={false}
        onConfirm={() => void clearDemo.mutate()}
      />

      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="Delete all financial data?"
        description="Every expense, budget, goal, investment, debt and report on this account will be permanently deleted. Your login stays, and you will be taken back through setup. This cannot be undone."
        confirmLabel="Yes, delete everything"
        onConfirm={() => void wipeData.mutate()}
      />
    </div>
  );
}
