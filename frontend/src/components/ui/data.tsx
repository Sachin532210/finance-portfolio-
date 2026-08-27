import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold tracking-[-0.005em] backdrop-blur-sm transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-foreground/[0.08] shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full w-full flex-1 rounded-full bg-primary transition-transform duration-slow ease-spring",
        indicatorClassName,
      )}
      style={{ transform: `translateX(-${100 - Math.min(Math.max(value ?? 0, 0), 100)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

/**
 * Progress bar that colours itself from a percentage: green while there is
 * room, amber when approaching the limit, red once past it.
 */
function StatusProgress({
  value,
  className,
  inverted = false,
}: {
  value: number;
  className?: string;
  /** When true, a HIGH value is good (goal progress) rather than bad (budget use). */
  inverted?: boolean;
}) {
  const pct = Math.min(Math.max(value, 0), 100);
  const good = inverted ? pct >= 80 : pct < 80;
  const bad = inverted ? pct < 40 : pct >= 100;

  return (
    <Progress
      value={pct}
      className={className}
      indicatorClassName={cn(
        bad ? "bg-destructive" : good ? "bg-success" : "bg-warning",
        "rounded-full",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-foreground/[0.06]", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className,
    )}
    {...props}
  />
));
Separator.displayName = "Separator";

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      // 40x24 with a 20pt thumb - macOS proportions. The iOS 51x31 metric is
      // sized for a thumb on a phone and looks oversized in a settings list.
      "group peer relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
      "transition-colors duration-base ease-spring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
      "disabled:cursor-not-allowed disabled:opacity-40",
      // Keeps a 44pt hit area around the smaller control, so shrinking it
      // costs nothing on touch.
      "before:absolute before:-inset-2.5 before:content-['']",
      // Off: a recessed well. On: tinted glass with a specular top edge and a
      // shadow carrying its own colour, the same treatment as filled buttons.
      "data-[state=unchecked]:bg-foreground/[0.12] data-[state=unchecked]:shadow-[inset_0_1px_2px_rgb(0_0_0/0.14)]",
      "data-[state=checked]:bg-success data-[state=checked]:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.28),0_1px_6px_-1px_hsl(var(--success)/0.4)]",
      className,
    )}
    {...props}
  >
    {/* The bright sweep across the top of the track when it is on. */}
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/14 to-transparent to-[55%] opacity-0 transition-opacity duration-base group-data-[state=checked]:opacity-100"
    />
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none relative block h-5 w-5 rounded-full ring-0",
        // A raised object: gradient body, contact hairline, soft drop shadow.
        "bg-gradient-to-b from-white to-white/92",
        "shadow-[0_0_0_0.5px_rgb(0_0_0/0.04),0_1px_1px_rgb(0_0_0/0.06),0_2px_4px_rgb(0_0_0/0.14)]",
        // Overshoots very slightly on release, the way a physical toggle settles.
        "transition-transform duration-base ease-gel",
        "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-foreground/[0.05] p-1 text-muted-foreground backdrop-blur-sm",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "ios-press-subtle inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-1 text-[13px] font-medium",
      "transition-all duration-base ease-spring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
      "disabled:pointer-events-none disabled:opacity-40",
      "data-[state=active]:glass-panel data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

// ---------------------------------------------------------------------------
// Table - wrapped so wide tables scroll inside their own container
// ---------------------------------------------------------------------------

function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors duration-fast hover:bg-accent/50",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-3 align-middle", className)} {...props} />;
}

export {
  Badge,
  badgeVariants,
  Progress,
  Separator,
  Skeleton,
  StatusProgress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
};
