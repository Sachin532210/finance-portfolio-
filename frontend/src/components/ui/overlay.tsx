import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]",
      "data-[state=open]:animate-fade data-[state=closed]:animate-fade-out",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    {/* Centring lives on this wrapper, not on the panel. A CSS animation's
        transform replaces the element's own, so a panel that centres itself
        with -translate-1/2 loses that translate the instant its entrance
        animation applies a scale. Flexbox keeps the two independent. */}
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Phones get a true iOS sheet: pinned to the bottom, rounded top
          // only, rising with the spring curve. Desktop is a centred card.
          "glass-strong pointer-events-auto grid w-full gap-4 overflow-y-auto overflow-x-hidden p-6",
          "no-scrollbar",
          "max-h-[88vh] rounded-t-[26px] pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          "data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down",
          "sm:max-h-[90vh] sm:max-w-lg sm:rounded-[26px] sm:pb-6",
          "sm:data-[state=open]:animate-scale-in sm:data-[state=closed]:animate-scale-out",
          className,
        )}
        {...props}
      >
        <div
          className="mx-auto -mt-2 mb-1 h-1 w-9 rounded-full bg-foreground/15 sm:hidden"
          aria-hidden
        />
        {children}
        <DialogPrimitive.Close className="ios-press absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground backdrop-blur-sm hover:bg-foreground/15 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </div>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 pr-6", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

// ---------------------------------------------------------------------------
// Confirmation dialog - used before every destructive action
// ---------------------------------------------------------------------------

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6">
          <AlertDialogPrimitive.Content className="glass-strong pointer-events-auto w-full max-w-sm rounded-[26px] p-6 text-center data-[state=open]:animate-scale-in sm:text-left">
          <AlertDialogPrimitive.Title className="text-lg font-semibold">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: "outline" }))}>
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className={cn(buttonVariants({ variant: destructive ? "destructive" : "default" }))}
              onClick={onConfirm}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
          </AlertDialogPrimitive.Content>
        </div>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "glass-strong z-50 min-w-[11rem] overflow-hidden rounded-[18px] p-1.5 text-popover-foreground",
        "origin-[var(--radix-dropdown-menu-content-transform-origin)]",
        "data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "ios-press relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[15px] outline-none focus:bg-foreground/[0.08] focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-[1.05em]",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const TooltipProvider = TooltipPrimitive.Provider;

function InfoTooltip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="glass-strong z-50 max-w-xs rounded-2xl px-3 py-2 text-xs leading-relaxed text-popover-foreground data-[state=delayed-open]:animate-scale-in"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-border" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export {
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InfoTooltip,
  TooltipProvider,
};
