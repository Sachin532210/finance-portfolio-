import { Loader2 } from "lucide-react";
import * as React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/context/auth-context";

import BudgetPage from "@/pages/budget";
import CalendarPage from "@/pages/calendar";
import CoachPage from "@/pages/coach";
import DashboardPage from "@/pages/dashboard";
import DebtPage from "@/pages/debt";
import DecisionsPage from "@/pages/decisions";
import ExpensesPage from "@/pages/expenses";
import ForgotPasswordPage from "@/pages/forgot-password";
import FuturePlannerPage from "@/pages/future-planner";
import GoalsPage from "@/pages/goals";
import InvestmentsPage from "@/pages/investments";
import LoginPage from "@/pages/login";
import NotFoundPage from "@/pages/not-found";
import NotificationsPage from "@/pages/notifications";
import OnboardingPage from "@/pages/onboarding";
import ReportsPage from "@/pages/reports";
import ResetPasswordPage from "@/pages/reset-password";
import SalaryPlannerPage from "@/pages/salary-planner";
import SavingsPage from "@/pages/savings";
import SettingsPage from "@/pages/settings";
import SignupPage from "@/pages/signup";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin" />
        <p className="text-sm">Loading your finances...</p>
      </div>
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
  return <AppShell>{children}</AppShell>;
}

/** Login, signup and the password-reset flow: redirect away once signed in. */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to={user.onboarded ? "/dashboard" : "/onboarding"} replace />;
  return <>{children}</>;
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
            <OnboardingPage />
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
