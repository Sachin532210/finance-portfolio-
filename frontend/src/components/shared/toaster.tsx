import * as React from "react";
import { Toaster as SonnerToaster } from "sonner";

/**
 * Toasts on the same material as the rest of the app.
 *
 * Sonner needs to be told the theme explicitly - it cannot read a class on
 * <html>. The theme is owned by the app shell and written to that class, so
 * this watches it rather than duplicating the state.
 */
export function Toaster() {
  const [theme, setTheme] = React.useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <SonnerToaster
      theme={theme}
      position="top-right"
      offset={16}
      gap={10}
      closeButton
      // `richColors` floods the whole toast with the status colour. Apple keeps
      // the surface neutral glass and lets a single coloured icon carry the
      // status, which is also far easier to read.
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "glass-toast animate-scale-in flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-3 text-[14px]",
          title: "font-medium leading-snug text-foreground",
          description: "text-[13px] leading-relaxed text-muted-foreground mt-0.5",
          icon: "shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-primary",
          // Sonner floats its close button outside the panel by default,
          // which reads as a stray dot next to the glass. Tuck it inside.
          closeButton:
            "ios-press left-auto right-2 top-1/2 h-6 w-6 -translate-y-1/2 border-none bg-foreground/10 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/20 group-hover:opacity-100",
          actionButton:
            "ios-press shrink-0 rounded-full bg-primary px-3 py-1 text-[13px] text-primary-foreground",
          cancelButton: "ios-press shrink-0 rounded-full bg-foreground/10 px-3 py-1 text-[13px]",
        },
      }}
    />
  );
}
