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

/**
 * Sidebar navigation.
 *
 * The selection is a single capsule of glass that travels between items,
 * rather than a background each item paints for itself. That is the iOS 26
 * behaviour - one object moving, never a cross-fade between two - and it is
 * what the sidebar was missing entirely: changing page used to be an instant
 * class swap with nothing in motion.
 *
 * While it travels the capsule stretches along its direction of travel and
 * squishes as it lands, in proportion to the distance covered. That is the
 * documented behaviour of interactive Liquid Glass, and it is the part that
 * makes the material read as liquid rather than as a sliding rectangle.
 */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navRef = React.useRef<HTMLElement>(null);
  const activeIndex = NAV_ITEMS.findIndex((item) => location.pathname.startsWith(item.to));

  const [pill, setPill] = React.useState<{ top: number; height: number } | null>(null);
  const [stretch, setStretch] = React.useState(1);
  const lastTop = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    const container = navRef.current;
    if (!container || activeIndex < 0) {
      setPill(null);
      lastTop.current = null;
      return;
    }

    const measure = () => {
      const link = container.querySelectorAll("a")[activeIndex] as HTMLElement | undefined;
      if (!link) return;
      const next = { top: link.offsetTop, height: link.offsetHeight };
      setPill(next);
      // Longer jumps stretch further, the way a heavier pull deforms further.
      // Capped, because past about 12% it stops reading as glass and starts
      // reading as a rubber band.
      if (lastTop.current !== null && lastTop.current !== next.top) {
        setStretch(1 + Math.min(Math.abs(next.top - lastTop.current) / 900, 0.12));
      }
      lastTop.current = next.top;
    };

    measure();
    // Re-measure on resize so the capsule cannot drift off its item.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeIndex]);

  // Release the stretch before the travel finishes, so the gel curve delivers
  // the squish on landing instead of fighting a transform still held open.
  React.useEffect(() => {
    if (stretch === 1) return;
    const id = window.setTimeout(() => setStretch(1), 190);
    return () => window.clearTimeout(id);
  }, [stretch]);

  return (
    <nav ref={navRef} className="relative flex flex-col gap-0.5">
      {pill && (
        <span
          aria-hidden
          className={cn(
            // Clear glass, not a blue fill. The colour belongs to the icon
            // and label above it - see .glass-lens.
            "glass-lens pointer-events-none absolute inset-x-0 rounded-full",
            "transition-[top,height,transform] duration-base ease-gel",
          )}
          style={{ top: pill.top, height: pill.height, transform: `scaleY(${stretch})` }}
        />
      )}

      {/* The capsule must not live inside this container: stagger-children
          animates every direct child with ios-rise, whose final keyframe sets
          transform: none, and a running animation beats an inline transform. */}
      <div className="stagger-children contents">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "ios-press relative z-10 flex items-center gap-3 rounded-full px-3.5 py-2 text-[16px] font-medium tracking-[-0.18px]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "icon-selected")} />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
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

  // Drives the travelling pill in the mobile tab bar.
  const activeTabIndex = MOBILE_NAV.findIndex((item) =>
    location.pathname.startsWith(item.to),
  );

  // The desktop toolbar was an empty strip. macOS names the current section
  // there, which is also the only always-visible label once the page scrolls.
  const currentSection = NAV_ITEMS.find((item) =>
    location.pathname.startsWith(item.to),
  );

  const tabBarRef = React.useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);

  // The pill is placed from the active link's measured box. Percentage-based
  // positioning is not reliable here, and measuring also lets tab widths vary.
  React.useLayoutEffect(() => {
    const container = tabBarRef.current;
    if (!container || activeTabIndex < 0) {
      setIndicator(null);
      return;
    }

    const measure = () => {
      const link = container.querySelectorAll("a")[activeTabIndex] as HTMLElement | undefined;
      if (link) setIndicator({ left: link.offsetLeft, width: link.offsetWidth });
    };

    measure();

    // Re-measure when the bar resizes - rotation, or a wider phone.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeTabIndex]);

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
      <aside className="glass fixed inset-y-3 left-3 z-30 hidden w-60 flex-col overflow-hidden rounded-[22px] lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
          <div className="glass-tint rounded-xl bg-primary p-1.5 shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.6)]">
            <Wallet className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-headline">Finance Track</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
        <div className="border-t border-white/10 p-3 text-[11px] leading-relaxed text-muted-foreground">
          Planning and educational tool. Not licensed financial advice.
        </div>
      </aside>

      {/* ---------------- Mobile drawer ---------------- */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade absolute inset-0 bg-black/25"
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
      {/* 240px sidebar + its own 12px inset. The column adds the matching
          12px itself, so the gutters either side of it are equal. */}
      <div className="lg:pl-[252px]">
        {/* Toolbar and content share one centred column, so they stay
            aligned with each other and the measure stays readable on a
            wide screen instead of running the full width. */}
        <div className="mx-auto w-full max-w-[1240px] lg:px-3">
        <header className="no-print safe-top sticky top-0 z-20 flex h-16 items-center gap-2 px-4 sm:ios-material sm:border-b sm:border-white/10 sm:px-6 lg:mt-3 lg:h-14 lg:rounded-[22px] lg:border">
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

          {currentSection ? (
            <div className="hidden min-w-0 items-center gap-2.5 lg:flex">
              <currentSection.icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              <span className="text-headline truncate">{currentSection.label}</span>
            </div>
          ) : null}

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
        <main className="w-full px-4 pb-32 pt-6 sm:px-6 lg:px-0 lg:pb-10 lg:pt-4">
          {children}
        </main>
        </div>
      </div>

      {/* ---------------- Mobile tab bar ----------------
          Liquid Glass detaches the tab bar from the screen edges and floats it
          as a capsule, so content scrolls behind and refracts through it. An
          edge-to-edge bar with square corners is the pre-iOS-26 shape. */}
      <nav
        className={cn(
          "no-print pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center lg:hidden",
          "px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2",
        )}
      >
        <div
          ref={tabBarRef}
          className="glass-strong pointer-events-auto relative flex w-full max-w-sm items-stretch rounded-full p-1.5"
        >
          {/* One pill travels between tabs rather than the highlight blinking
              from one to the next. */}
          {indicator ? (
            <span
              aria-hidden
              className="glass-lens absolute bottom-1.5 top-1.5 rounded-full transition-[left,width] duration-base ease-gel"
              style={{ left: indicator.left, width: indicator.width }}
            />
          ) : null}

          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-0.5 py-1.5",
                  "text-[10px] font-medium transition-colors duration-base",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      "h-[21px] w-[21px] transition-transform duration-base ease-gel",
                      isActive && "icon-selected scale-110",
                    )}
                  />
                  <span className="w-full truncate text-center leading-none">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
