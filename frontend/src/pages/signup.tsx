import { Check, Eye, EyeOff, X } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, SimpleSelect } from "@/components/ui/form";
import { useAuth } from "@/context/auth-context";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AuthLayout } from "./login";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

const CURRENCY_LABELS: Record<string, string> = {
  INR: "INR - Indian Rupee",
  USD: "USD - US Dollar",
  EUR: "EUR - Euro",
  GBP: "GBP - British Pound",
  AED: "AED - UAE Dirham",
  SGD: "SGD - Singapore Dollar",
  AUD: "AUD - Australian Dollar",
  CAD: "CAD - Canadian Dollar",
};

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-1.5", met ? "text-success" : "text-muted-foreground")}>
      {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </li>
  );
}

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [currency, setCurrency] = React.useState("INR");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const hasLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const valid = hasLength && hasLetter && hasNumber && name.trim().length >= 2 && email.includes("@");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setError(null);
    setPending(true);
    try {
      await signup({ name: name.trim(), email: email.trim(), password, currency });
      toast.success("Account created. Let's set up your finances.");
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account.");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Plan your salary, track spending and reach your goals"
      footer={
        <span className="text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password ? (
            <ul className="mt-2 space-y-1 text-xs">
              <Requirement met={hasLength} label="At least 8 characters" />
              <Requirement met={hasLetter} label="Contains a letter" />
              <Requirement met={hasNumber} label="Contains a number" />
            </ul>
          ) : null}
        </Field>

        <Field label="Currency" hint="Used across every figure in the app. You can change it later.">
          <SimpleSelect
            value={currency}
            onValueChange={setCurrency}
            options={CURRENCIES}
            labels={CURRENCY_LABELS}
          />
        </Field>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={pending} disabled={!valid}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
