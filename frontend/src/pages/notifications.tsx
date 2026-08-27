import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  Info,
  RefreshCw,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Separator, Switch } from "@/components/ui/data";
import { Label } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useApiQuery, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import type { AppNotification, NotificationPrefs } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY = {
  CRITICAL: { icon: AlertTriangle, className: "border-destructive/40 bg-destructive/5", tone: "text-destructive" },
  WARNING: { icon: AlertTriangle, className: "border-warning/40 bg-warning/5", tone: "text-warning" },
  SUCCESS: { icon: CheckCircle2, className: "border-success/40 bg-success/5", tone: "text-success" },
  INFO: { icon: Info, className: "border-border", tone: "text-muted-foreground" },
} as const;

const PREF_LABELS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  {
    key: "budget_warnings",
    label: "Budget warnings",
    description: "When a category reaches 80% of its limit, and again when it goes over.",
  },
  {
    key: "goal_reminders",
    label: "Goal reminders",
    description: "When a goal falls behind the contribution it needs, or is reached.",
  },
  {
    key: "savings_reminders",
    label: "Savings reminders",
    description: "When your savings rate or emergency fund drops below target.",
  },
  {
    key: "investment_updates",
    label: "Investment updates",
    description: "Portfolio position, and months with no contribution recorded.",
  },
  {
    key: "upcoming_payments",
    label: "Upcoming payments",
    description: "EMIs and bills falling due in the next few days.",
  },
  {
    key: "monthly_review",
    label: "Monthly review",
    description: "A prompt when the end-of-month report is ready.",
  },
  {
    key: "unusual_spending",
    label: "Unusual spending",
    description: "Spending spikes, subscription creep and large one-off purchases.",
  },
];

export default function NotificationsPage() {
  const notifications = useApiQuery<AppNotification[]>("/notifications");
  const prefs = useApiQuery<NotificationPrefs>("/notifications/preferences");
  const [clearOpen, setClearOpen] = React.useState(false);

  const refresh = useMutation(
    async () => api.post<{ created: number; message: string }>("/notifications/refresh"),
    { successMessage: (result) => result.message, onSuccess: notifications.refetch },
  );

  const markRead = useMutation(async (id: string) => api.post(`/notifications/${id}/read`), {
    onSuccess: notifications.refetch,
  });

  const markAllRead = useMutation(async () => api.post("/notifications/read-all"), {
    successMessage: "All caught up.",
    onSuccess: notifications.refetch,
  });

  const remove = useMutation(async (id: string) => api.delete(`/notifications/${id}`), {
    onSuccess: notifications.refetch,
  });

  const clearAll = useMutation(async () => api.delete("/notifications"), {
    successMessage: "Notifications cleared.",
    onSuccess: notifications.refetch,
  });

  const updatePref = useMutation(
    async (patch: Partial<NotificationPrefs>) =>
      api.patch<NotificationPrefs>("/notifications/preferences", patch),
    { successMessage: "Preference updated.", onSuccess: (data) => prefs.setData(data) },
  );

  const unreadCount = notifications.data?.filter((n) => !n.read_at).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Alerts generated from your own financial data, not generic tips."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh.mutate()}
              loading={refresh.pending}
            >
              <RefreshCw className="h-4 w-4" />
              Check now
            </Button>
            {unreadCount > 0 ? (
              <Button size="sm" onClick={() => void markAllRead.mutate()} loading={markAllRead.pending}>
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {notifications.loading && !notifications.data ? (
            <LoadingState />
          ) : notifications.error ? (
            <ErrorState message={notifications.error} onRetry={notifications.refetch} />
          ) : !notifications.data || notifications.data.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nothing to report"
              description="The rules engine checks budgets, savings rate, emergency fund, debt, goals and spending patterns. When something needs your attention, it shows up here."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refresh.mutate()}
                  loading={refresh.pending}
                >
                  <RefreshCw className="h-4 w-4" />
                  Run the checks
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {unreadCount > 0
                    ? `${unreadCount} unread of ${notifications.data.length}`
                    : `${notifications.data.length} notification(s), all read`}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setClearOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear all
                </Button>
              </div>

              <div className="space-y-3">
                {notifications.data.map((notification) => {
                  const style = SEVERITY[notification.severity] ?? SEVERITY.INFO;
                  const Icon = style.icon;
                  const unread = !notification.read_at;

                  return (
                    <Card
                      key={notification.id}
                      className={cn(style.className, unread && "ring-1 ring-primary/20")}
                    >
                      <CardContent className="flex gap-3 p-4">
                        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", style.tone)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{notification.title}</p>
                            {unread ? (
                              <Badge variant="default" className="text-[10px]">
                                New
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {notification.message}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <span className="text-[11px] text-muted-foreground">
                              {formatRelativeDate(notification.created_at)}
                            </span>
                            {notification.action_url ? (
                              <Link
                                to={notification.action_url}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Open
                              </Link>
                            ) : null}
                            {unread ? (
                              <button
                                type="button"
                                onClick={() => void markRead.mutate(notification.id)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                Mark read
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => void remove.mutate(notification.id)}
                          aria-label="Delete notification"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ---------------- Preferences ---------------- */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellOff className="h-4 w-4" />
              What you get told about
            </CardTitle>
            <CardDescription>Turn off anything you would rather not see</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {prefs.loading && !prefs.data ? (
              <LoadingState label="Loading preferences..." />
            ) : prefs.data ? (
              PREF_LABELS.map((pref, index) => (
                <React.Fragment key={pref.key}>
                  {index > 0 ? <Separator /> : null}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Label htmlFor={pref.key} className="cursor-pointer">
                        {pref.label}
                      </Label>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {pref.description}
                      </p>
                    </div>
                    <Switch
                      id={pref.key}
                      checked={prefs.data![pref.key]}
                      onCheckedChange={(checked) => void updatePref.mutate({ [pref.key]: checked })}
                    />
                  </div>
                </React.Fragment>
              ))
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear every notification?"
        description="All notifications are deleted. New ones will be created the next time the rules engine finds something."
        confirmLabel="Clear all"
        onConfirm={() => void clearAll.mutate()}
      />
    </div>
  );
}
