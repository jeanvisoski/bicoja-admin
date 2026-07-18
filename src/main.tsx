import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./index.css";
import { router } from "./router";
import { AdminSessionProvider } from "./lib/admin-session";

const queryClient = new QueryClient();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AdminSessionProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" />
      </AdminSessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
