import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Login } from "./routes/Login";
import { Layout } from "./components/Layout";
import { Dashboard } from "./routes/Dashboard";
import { Providers } from "./routes/Providers";
import { Orders } from "./routes/Orders";
import { Disputes } from "./routes/Disputes";
import { Users } from "./routes/Users";
import { Categories } from "./routes/Categories";
import { Wallets } from "./routes/Wallets";
import { Requests } from "./routes/Requests";
import { Settings } from "./routes/Settings";
import { TrustReports } from "./routes/TrustReports";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "layout",
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/",
  component: Dashboard,
});

const providersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/providers",
  component: Providers,
});

const ordersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/orders",
  component: Orders,
});

const requestsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/requests",
  component: Requests,
});

const disputesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/disputes",
  component: Disputes,
});

const usersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/users",
  component: Users,
});

const categoriesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/categories",
  component: Categories,
});

const walletsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/wallets",
  component: Wallets,
});

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/settings",
  component: Settings,
});

const trustReportsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/trust-reports",
  component: TrustReports,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([
    indexRoute,
    providersRoute,
    requestsRoute,
    ordersRoute,
    disputesRoute,
    usersRoute,
    categoriesRoute,
    walletsRoute,
    settingsRoute,
    trustReportsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
