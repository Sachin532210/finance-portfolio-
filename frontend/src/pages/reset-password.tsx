import { Check, X } from "lucide-react";
import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AuthLayout } from "./login";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token, setToken] = React.useState(searchParams.get("token") ?? "");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const matches = password.length > 0 && password === confirm;
  const valid = hasLength && hasLetter && hasNumber && matches && token.length > 10;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setError(null);
    setPending(true);
    try {
      await api.post("/auth/reset-password", { token: token.trim(), password });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset your password.");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a password you have not used before"
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!searchParams.get("token") ? (
          <Field label="Reset token" htmlFor="token" hint="Paste the token from your reset link.">
            <Input
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Reset token"
              required
            />
          </Field>
        ) : null}

        <Field label="New password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
          {password ? (
            <ul className="mt-2 space-y-1 text-xs">
              {[
                { met: hasLength, label: "At least 8 characters" },
                { met: hasLetter, label: "Contains a letter" },
                { met: hasNumber, label: "Contains a number" },
              ].map((rule) => (
                <li
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-1.5",
                    rule.met ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {rule.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {rule.label}
                </li>
              ))}
            </ul>
          ) : null}
        </Field>

        <Field
          label="Confirm password"
          htmlFor="confirm"
          error={confirm && !matches ? "Passwords do not match." : undefined}
        >
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
            required
          />
        </Field>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={pending} disabled={!valid}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
