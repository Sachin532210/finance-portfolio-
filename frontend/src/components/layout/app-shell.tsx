import { Bell, LogOut, Menu, Moon, Sun, User as UserIcon, Wallet, X } from "lucide-react";
import * as React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { useAuth } from "@/context/auth-context";
import { useApiQuery, useLocalStorage } from "@/hooks/use-api";
import { MOBILE_NAV, NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

function useTheme() {
  const [theme, setTheme] = useLocalStorage<"dark" | "light">("ft-theme", "dark");

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "ios-press flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] font-medium",
              isActive
                ? "bg-primary/15 text-primary shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25)] backdrop-blur-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const { data: unread } = useApiQuery<{ count: number }>("/notifications/unread-count");

  // Close the drawer and scroll to top whenever the route changes.
  React.useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 flex-col rounded-none border-y-0 border-l-0 lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="glass-tint rounded-xl bg-primary p-1.5 shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.6)]">
            <Wallet className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold tracking-tight">Finance Track</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
        <div className="border-t border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
          Planning and educational tool. Not licensed financial advice.
        </div>
      </aside>

      {/* ---------------- Mobile drawer ---------------- */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="glass-strong animate-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col rounded-none border-y-0 border-l-0">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <span className="font-semibold">Finance Track</span>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavList onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      {/* ---------------- Main column ---------------- */}
      <div className="lg:pl-64">
        <header className="no-print safe-top sticky top-0 z-20 flex h-16 items-center gap-2 px-4 sm:ios-material sm:border-b sm:border-white/10 sm:px-6">
          <button
            type="button"
            className="ios-press glass-strong flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:glass lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            to="/dashboard"
            className="ios-press glass-strong flex items-center gap-2 rounded-full py-2 pl-2.5 pr-4 sm:glass lg:hidden"
          >
            <Wallet className="h-[18px] w-[18px] text-primary" />
            <span className="text-[15px] font-semibold">Finance Track</span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="ios-press glass-strong flex h-10 w-10 items-center justify-center rounded-full sm:glass"
              onClick={toggle}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            <Button variant="ghost" size="icon" asChild aria-label="Notifications">
              <Link
                to="/notifications"
                className="ios-press glass-strong relative flex h-10 w-10 items-center justify-center rounded-full sm:glass"
              >
                <Bell className="h-[18px] w-[18px]" />
                {unread && unread.count > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                    {unread.count > 9 ? "9+" : unread.count}
                  </span>
                ) : null}
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ios-press glass-strong ml-0.5 flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-primary sm:glass"
                  aria-label="Account menu"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm font-medium text-foreground">{user?.name}</span>
                  <span className="block truncate text-xs font-normal">{user?.email}</span>
                </DropdownMenuLabel>
                {user?.has_demo_data ? (
                  <div className="px-2 pb-1">
                    <Badge variant="outline" className="text-[10px]">
                      Demo data loaded
                    </Badge>
                  </div>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <UserIcon />
                  Profile and settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} className="text-destructive">
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Bottom padding clears the floating tab bar, which content passes
            beneath rather than stopping above. */}
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-32 pt-6 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ---------------- Mobile tab bar ----------------
          Liquid Glass detaches the tab bar from the screen edges and floats it
          as a capsule, so content scrolls behind and refracts through it. An
          edge-to-edge bar with square corners is the pre-iOS-26 shape. */}
      <nav
        className={cn(
          "no-print fixed inset-x-0 bottom-0 z-20 flex justify-center lg:hidden",
          "px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2",
          // The bar itself is the capsule; this wrapper only positions it.
          "pointer-events-none",
        )}
      >
        <div className="glass-strong pointer-events-auto flex w-full max-w-md items-center gap-0.5 rounded-full p-1.5">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "ios-press relative flex flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-2 text-[10px] font-medium",
                  isActive
                    ? "bg-primary/15 text-primary shadow-[inset_0_1px_0_0_rgb(255_255_255/0.3)]"
                    : "text-muted-foreground",
                )
              }
            >
              <item.icon className="h-[22px] w-[22px]" />
              <span className="truncate leading-none">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
