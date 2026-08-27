import * as LabelPrimitive from "@radix-ui/react-label";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // iOS text fields sit on a filled surface rather than a heavy border.
        // 16px on mobile stops Safari zooming the page on focus.
        "flex h-11 w-full rounded-xl border border-white/10 bg-foreground/[0.04] px-3.5 py-2 text-base backdrop-blur-sm sm:text-[15px]",
        "shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)]",
        "transition-all duration-fast ease-spring placeholder:text-muted-foreground/70",
        "focus-visible:border-primary/40 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-xl border border-white/10 bg-foreground/[0.04] px-3.5 py-2.5 text-base backdrop-blur-sm sm:text-[15px]",
      "shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)]",
      "transition-all duration-fast ease-spring placeholder:text-muted-foreground/70",
      "focus-visible:border-primary/40 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25",
      "disabled:cursor-not-allowed disabled:opacity-40",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// ---------------------------------------------------------------------------
// Money input - keeps the currency symbol visible while typing
// ---------------------------------------------------------------------------

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: number | string;
  onValueChange: (value: number) => void;
  symbol?: string;
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, value, onValueChange, symbol = "", ...props }, ref) => (
    <div className="relative">
      {symbol ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {symbol}
        </span>
      ) : null}
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        className={cn("tabular", symbol && "pl-7", className)}
        value={value === 0 && props.placeholder ? "" : value}
        onChange={(e) => {
          const next = e.target.value === "" ? 0 : Number(e.target.value);
          onValueChange(Number.isFinite(next) ? next : 0);
        }}
        {...props}
      />
    </div>
  ),
);
MoneyInput.displayName = "MoneyInput";

// ---------------------------------------------------------------------------
// Field wrapper - label, control, hint and error in a consistent stack
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
          {!required && hint === undefined ? null : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "ios-press flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-foreground/[0.04] px-3.5 py-2 text-[15px] backdrop-blur-sm",
      "focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25",
      "disabled:cursor-not-allowed disabled:opacity-40 [&>span]:line-clamp-1 [&>span]:text-left",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        "glass-strong relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-[18px] p-0.5 text-popover-foreground",
        "origin-[var(--radix-select-content-transform-origin)]",
        "data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1 w-full min-w-[var(--radix-select-trigger-width)]",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
        <ChevronUp className="h-4 w-4" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
        <ChevronDown className="h-4 w-4" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 pl-8 pr-2 text-[15px] outline-none",
      "transition-colors duration-fast focus:bg-foreground/[0.08] focus:text-foreground",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

/**
 * Convenience wrapper: a labelled select built from a plain option list.
 * Keeps page code free of Radix boilerplate for the common case.
 */
function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  labels,
  className,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  labels?: Record<string, string>;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels?.[option] ?? option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export {
  Field,
  Input,
  Label,
  MoneyInput,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SimpleSelect,
  Textarea,
};
