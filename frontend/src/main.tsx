import * as React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { Toaster } from "@/components/shared/toaster";
import { TooltipProvider } from "@/components/ui/overlay";
import { AuthProvider } from "@/context/auth-context";
import "@/index.css";

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
