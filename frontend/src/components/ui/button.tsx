import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Liquid Glass control.
 *
 * Filled variants are capsules with a bright sweep across the top third
 * (`glass-tint`) and a shadow carrying the fill's own colour, so they read as
 * light passing through tinted glass rather than flat paint. Quiet variants
 * are clear glass with a hairline rim.
 */
const buttonVariants = cva(
  "ios-press glass-sheen inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-medium tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[1.05em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "glass-tint bg-primary text-primary-foreground shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_20px_-6px_hsl(var(--primary)/0.55)] hover:bg-primary/92",
        destructive:
          "glass-tint bg-destructive text-destructive-foreground shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_20px_-6px_hsl(var(--destructive)/0.55)] hover:bg-destructive/92",
        success:
          "glass-tint bg-success text-success-foreground shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_20px_-6px_hsl(var(--success)/0.55)] hover:bg-success/92",
        // iOS "tinted": the accent colour behind frosted glass
        tinted: "bg-primary/12 text-primary backdrop-blur-sm hover:bg-primary/20",
        // Clear glass with a lit rim
        outline: "glass-panel text-foreground hover:bg-accent/60",
        secondary: "bg-secondary/80 text-secondary-foreground backdrop-blur-sm hover:bg-secondary",
        ghost: "hover:bg-accent/70",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-[52px] px-7 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
