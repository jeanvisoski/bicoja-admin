import { useQuery } from "@tanstack/react-query";
import { Users, Briefcase, ClipboardList, Wallet, AlertTriangle, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Kpis = {
  totalUsers: number;
  totalProviders: number;
  pendingProviders: number;
  totalOrders: number;
  openRequests: number;
  openDisputes: number;
  revenue: number;
  ordersByStatus: Record<string, number>;
  recentUsers: { id: string; full_name: string | null; email: string | null; created_at: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  aceito: "Aceito",
  a_caminho: "A caminho",
  executando: "Em execução",
  fotos_enviadas: "Fotos enviadas",
  aguardando_confirmacao: "Aguardando confirmação",
  concluido: "Concluído",
  em_disputa: "Em disputa",
  cancelado: "Cancelado",
};

function useKpis() {
  return useQuery({
    queryKey: ["admin-kpis"],
    queryFn: async (): Promise<Kpis> => {
      const [
        { count: totalUsers },
        { count: totalProviders },
        { count: pendingProviders },
        { data: orders },
        { count: openRequests },
        { count: openDisputes },
        { data: recentUsers },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("provider_profiles").select("profile_id", { count: "exact", head: true }),
        supabase
          .from("provider_profiles")
          .select("profile_id", { count: "exact", head: true })
          .eq("verification_status", "pendente"),
        supabase.from("orders").select("status, platform_fee"),
        supabase
          .from("service_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["aberto", "em_negociacao"]),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "em_disputa"),
        supabase
          .from("profiles")
          .select("id, full_name, email, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const ordersByStatus: Record<string, number> = {};
      let revenue = 0;
      for (const o of orders ?? []) {
        ordersByStatus[o.status] = (ordersByStatus[o.status] ?? 0) + 1;
        if (o.status === "concluido") revenue += Number(o.platform_fee ?? 0);
      }

      return {
        totalUsers: totalUsers ?? 0,
        totalProviders: totalProviders ?? 0,
        pendingProviders: pendingProviders ?? 0,
        totalOrders: orders?.length ?? 0,
        openRequests: openRequests ?? 0,
        openDisputes: openDisputes ?? 0,
        revenue,
        ordersByStatus,
        recentUsers: recentUsers ?? [],
      };
    },
  });
}

function Kpi({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading } = useKpis();

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">Visão geral da plataforma.</p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
            <Kpi
              icon={Users}
              label="Usuários"
              value={String(data.totalUsers)}
              tint="bg-sky-100 text-sky-700"
            />
            <Kpi
              icon={Briefcase}
              label="Prestadores"
              value={String(data.totalProviders)}
              tint="bg-violet-100 text-violet-700"
            />
            <Kpi
              icon={UserPlus}
              label="Aprovações pendentes"
              value={String(data.pendingProviders)}
              tint="bg-amber-100 text-amber-700"
            />
            <Kpi
              icon={ClipboardList}
              label="Pedidos totais"
              value={String(data.totalOrders)}
              tint="bg-emerald-100 text-emerald-700"
            />
            <Kpi
              icon={ClipboardList}
              label="Solicitações em aberto"
              value={String(data.openRequests)}
              tint="bg-amber-100 text-amber-700"
            />
            <Kpi
              icon={AlertTriangle}
              label="Disputas abertas"
              value={String(data.openDisputes)}
              tint="bg-destructive/10 text-destructive"
            />
            <Kpi
              icon={Wallet}
              label="Receita da plataforma"
              value={`R$ ${data.revenue.toFixed(2)}`}
              tint="bg-trust-soft text-trust"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Pedidos por status
              </h2>
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                {Object.entries(data.ordersByStatus).length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum pedido ainda.</p>
                )}
                {Object.entries(data.ordersByStatus).map(([status, count]) => (
                  <div key={status} className="p-3 flex items-center justify-between text-sm">
                    <span>{STATUS_LABEL[status] ?? status}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Cadastros recentes
              </h2>
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                {data.recentUsers.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum usuário ainda.</p>
                )}
                {data.recentUsers.map((u) => (
                  <div key={u.id} className="p-3 text-sm">
                    <p className="font-semibold">{u.full_name || u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
