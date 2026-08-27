import { Copy, MailCheck } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { InfoNote } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ApiError, api } from "@/lib/api";

import { AuthLayout } from "./login";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [devToken, setDevToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await api.post<{ message: string; reset_token: string | null }>(
        "/auth/forgot-password",
        { email: email.trim() },
      );
      setSent(true);
      setDevToken(result.reset_token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not process that request.");
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If an account exists for that address, a reset link has been generated"
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <div className="rounded-full bg-success/10 p-3">
              <MailCheck className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">
              Reset links expire after one hour and can be used once.
            </p>
          </div>

          {devToken ? (
            <InfoNote variant="warning">
              <p className="font-medium">Development mode</p>
              <p className="mt-1">
                No mail provider is configured in this build, so the reset token is shown here
                instead of being emailed. In production this is never returned to the browser.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-[11px]">
                  {devToken}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(devToken);
                    toast.success("Token copied.");
                  }}
                  aria-label="Copy token"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                className="mt-3 w-full"
                onClick={() => navigate(`/reset-password?token=${encodeURIComponent(devToken)}`)}
              >
                Continue to reset password
              </Button>
            </InfoNote>
          ) : null}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with"
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
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

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={pending}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
