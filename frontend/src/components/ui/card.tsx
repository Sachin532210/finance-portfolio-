import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A pane of Liquid Glass: translucent body, specular highlight along the top
 * inner edge, hairline rim, and a soft shadow so it floats above the canvas.
 *
 * Uses the cheap `.glass-panel` tier - a page can hold twenty of these, and
 * twenty stacked `backdrop-filter` layers would wreck scroll performance for
 * an effect nobody can see behind an opaque card anyway.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; index?: number }
>(({ className, interactive, index, style, ...props }, ref) => (
  <div
    ref={ref}
    style={
      index !== undefined
        ? ({ "--i": index } as React.CSSProperties & Record<string, number>)
        : style
    }
    className={cn(
      "glass-panel rounded-lg text-card-foreground",
      interactive && "glass-lift glass-sheen ios-press-subtle cursor-pointer",
      index !== undefined && "stagger-in",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1 p-5 pb-3", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-headline", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-footnote text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-5 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
