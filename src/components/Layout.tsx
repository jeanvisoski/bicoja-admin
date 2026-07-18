import { Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  Download,
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

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function InstallAdminApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt) return null;
  return <button onClick={async () => { await prompt.prompt(); setPrompt(null); }} className="h-8 px-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />Instalar</button>;
}

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
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-card flex-col p-4">
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
      <div className="md:hidden fixed inset-x-0 top-0 z-40 border-b border-border bg-card/95 backdrop-blur shadow-card">
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0"><img src="/bicoja-mark.png" alt="" className="h-8 w-8 object-contain" /><span className="font-extrabold tracking-tight truncate">BICOJÁ Admin</span></div>
          <InstallAdminApp />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return <Link key={item.to} to={item.to} className={`shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}><item.icon className="h-3.5 w-3.5" />{item.label}</Link>;
          })}
        </nav>
      </div>
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-28 pb-6 md:pt-0 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
