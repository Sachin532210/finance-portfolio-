import { Loader2 } from "lucide-react";
import * as React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/context/auth-context";

// Auth screens load eagerly - they are the first thing an unauthenticated
// visitor sees, and delaying them would show a spinner on a cold start.
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";

/**
 * Every other route is split into its own chunk. Recharts alone is roughly a
 * third of the bundle, so keeping it out of the initial download is the single
 * biggest win for time-to-interactive.
 */
const DashboardPage = React.lazy(() => import("@/pages/dashboard"));
const SalaryPlannerPage = React.lazy(() => import("@/pages/salary-planner"));
const ExpensesPage = React.lazy(() => import("@/pages/expenses"));
const BudgetPage = React.lazy(() => import("@/pages/budget"));
const SavingsPage = React.lazy(() => import("@/pages/savings"));
const InvestmentsPage = React.lazy(() => import("@/pages/investments"));
const GoalsPage = React.lazy(() => import("@/pages/goals"));
const DebtPage = React.lazy(() => import("@/pages/debt"));
const FuturePlannerPage = React.lazy(() => import("@/pages/future-planner"));
const DecisionsPage = React.lazy(() => import("@/pages/decisions"));
const ReportsPage = React.lazy(() => import("@/pages/reports"));
const CalendarPage = React.lazy(() => import("@/pages/calendar"));
const CoachPage = React.lazy(() => import("@/pages/coach"));
const NotificationsPage = React.lazy(() => import("@/pages/notifications"));
const SettingsPage = React.lazy(() => import("@/pages/settings"));
const OnboardingPage = React.lazy(() => import("@/pages/onboarding"));
const ForgotPasswordPage = React.lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = React.lazy(() => import("@/pages/reset-password"));
const NotFoundPage = React.lazy(() => import("@/pages/not-found"));

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="animate-fade flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin" />
        <p className="text-sm">Loading your finances...</p>
      </div>
    </div>
  );
}

/**
 * Chunk-loading fallback. Deliberately minimal: a chunk usually arrives in
 * well under a second, and a heavy skeleton flashing in and out reads as
 * slower than a quiet pause.
 */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Re-mounts on every navigation so the page rises into view the way a pushed
 * iOS view controller does.
 */
function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="animate-rise">
      {children}
    </div>
  );
}

/** Requires a session, and pushes new users through onboarding first. */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!user.onboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <AppShell>
      <React.Suspense fallback={<RouteFallback />}>
        <PageTransition>{children}</PageTransition>
      </React.Suspense>
    </AppShell>
  );
}

/** Login, signup and the password-reset flow: redirect away once signed in. */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to={user.onboarded ? "/dashboard" : "/onboarding"} replace />;
  return <React.Suspense fallback={<FullScreenLoader />}>{children}</React.Suspense>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* ---------------- Public ---------------- */}
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
      <Route path="/reset-password" element={<PublicOnly><ResetPasswordPage /></PublicOnly>} />

      {/* Onboarding needs a session but renders without the app shell. */}
      <Route
        path="/onboarding"
        element={
          loading ? (
            <FullScreenLoader />
          ) : !user ? (
            <Navigate to="/login" replace />
          ) : user.onboarded ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <React.Suspense fallback={<FullScreenLoader />}>
              <OnboardingPage />
            </React.Suspense>
          )
        }
      />

      {/* ---------------- Protected ---------------- */}
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/salary-planner" element={<Protected><SalaryPlannerPage /></Protected>} />
      <Route path="/expenses" element={<Protected><ExpensesPage /></Protected>} />
      <Route path="/budget" element={<Protected><BudgetPage /></Protected>} />
      <Route path="/savings" element={<Protected><SavingsPage /></Protected>} />
      <Route path="/investments" element={<Protected><InvestmentsPage /></Protected>} />
      <Route path="/goals" element={<Protected><GoalsPage /></Protected>} />
      <Route path="/debt" element={<Protected><DebtPage /></Protected>} />
      <Route path="/future-planner" element={<Protected><FuturePlannerPage /></Protected>} />
      <Route path="/decisions" element={<Protected><DecisionsPage /></Protected>} />
      <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
      <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
      <Route path="/coach" element={<Protected><CoachPage /></Protected>} />
      <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="*"
        element={
          <React.Suspense fallback={<FullScreenLoader />}>
            <NotFoundPage />
          </React.Suspense>
        }
      />
    </Routes>
  );
}
