import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * iOS-style control: filled shapes, generous corners, and the scale-down press
 * that UIKit gives every tappable element. `ios-press` carries the spring.
 */
const buttonVariants = cva(
  "ios-press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-[15px] font-medium tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[1.05em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-ios hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-ios hover:bg-destructive/90",
        success: "bg-success text-success-foreground shadow-ios hover:bg-success/90",
        // iOS "tinted" button: primary colour on a soft wash of itself
        tinted: "bg-primary/12 text-primary hover:bg-primary/20",
        outline: "border border-border bg-card/60 hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-sm px-3.5 text-[13px]",
        lg: "h-[52px] rounded-lg px-7 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9 rounded-sm",
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
