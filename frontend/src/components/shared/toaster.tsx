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
      closeButton
      // `richColors` floods the whole toast with the status colour. Apple keeps
      // the surface neutral glass and lets a single coloured icon carry the
      // status, which is also far easier to read.
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "glass-strong animate-scale-in flex w-full items-start gap-3 rounded-[18px] p-4 text-[15px]",
          title: "font-semibold leading-snug text-foreground",
          description: "text-[13px] leading-relaxed text-muted-foreground mt-0.5",
          icon: "shrink-0 mt-0.5",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-primary",
          closeButton:
            "ios-press border-none bg-foreground/10 text-muted-foreground hover:bg-foreground/20",
          actionButton: "ios-press rounded-full bg-primary px-3 py-1 text-primary-foreground",
          cancelButton: "ios-press rounded-full bg-foreground/10 px-3 py-1",
        },
      }}
    />
  );
}
