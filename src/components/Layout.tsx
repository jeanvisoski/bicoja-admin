import { Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ShieldCheck,
  Users,
  ListChecks,
  AlertTriangle,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Tags,
  WalletCards,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { useAdminSession } from "@/lib/admin-session";
import { supabase } from "@/lib/supabase";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/users", label: "Usuários", icon: Users },
  { to: "/providers", label: "Prestadores", icon: ShieldCheck },
  { to: "/requests", label: "Solicitações", icon: ClipboardList },
  { to: "/orders", label: "Pedidos", icon: ListChecks },
  { to: "/disputes", label: "Disputas", icon: AlertTriangle },
  { to: "/categories", label: "Categorias", icon: Tags },
  { to: "/wallets", label: "Carteira", icon: WalletCards },
  { to: "/settings", label: "Configurações", icon: Settings },
  { to: "/trust-reports", label: "Proteção", icon: ShieldAlert },
] as const;

export function Layout() {
  const { session, isAdmin, loading } = useAdminSession();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && (!session || !isAdmin)) {
      nav({ to: "/login" });
    }
  }, [loading, session, isAdmin, nav]);

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  }

  if (loading || !session || !isAdmin) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col p-4">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="h-9 w-9 rounded-xl bg-hero flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-extrabold tracking-tight">BicoJá Admin</span>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
