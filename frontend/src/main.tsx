import * as React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { Toaster } from "@/components/shared/toaster";
import { TooltipProvider } from "@/components/ui/overlay";
import { AuthProvider } from "@/context/auth-context";
import { initPerfTier } from "@/lib/perf-tier";
import "@/index.css";

// Before the first paint, so the correct material renders immediately rather
// than showing the expensive one and downgrading a moment later.
initPerfTier();

// The ambient ground, as its own composited layer. Outside React because it
// never changes and must not be touched by a re-render.
const ground = document.createElement("div");
ground.id = "app-ground";
ground.setAttribute("aria-hidden", "true");
document.body.prepend(ground);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          <App />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
