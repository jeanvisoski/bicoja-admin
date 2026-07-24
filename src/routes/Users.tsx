import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, ShieldCheck, Ban, CheckCircle2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_provider: boolean;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
};

function useUsers(search: string) {
  return useQuery({
    queryKey: ["admin-users", search],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, full_name, email, phone, is_provider, is_admin, is_active, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (search.trim()) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as UserRow[];
    },
  });
}

type OrderAsClient = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  service_requests: { service_categories: { label: string } | null } | null;
};

type OrderAsProvider = {
  id: string;
  status: string;
  final_price: number | null;
  created_at: string;
  service_requests: { service_categories: { label: string } | null } | null;
};

type RequestAsClient = {
  id: string;
  status: string;
  created_at: string;
  service_categories: { label: string } | null;
};

type ProviderStats = {
  verification_status: string;
  is_suspended: boolean;
  rating_avg: number;
  jobs_count: number;
};

function useUserActivity(userId: string | undefined, isProvider: boolean) {
  return useQuery({
    queryKey: ["admin-user-activity", userId, isProvider],
    queryFn: async () => {
      const [ordersAsClient, requests, ordersAsProvider, providerStats] = await Promise.all([
        supabase
          .from("orders")
          .select("id, status, total, created_at, service_requests(service_categories(label))")
          .eq("client_id", userId)
          .order("created_at", { ascending: false })
          .limit(20)
          .returns<OrderAsClient[]>(),
        supabase
          .from("service_requests")
          .select("id, status, created_at, service_categories(label)")
          .eq("client_id", userId)
          .order("created_at", { ascending: false })
          .limit(20)
          .returns<RequestAsClient[]>(),
        isProvider
          ? supabase
              .from("orders")
              .select("id, status, final_price, created_at, service_requests(service_categories(label))")
              .eq("provider_id", userId)
              .order("created_at", { ascending: false })
              .limit(20)
              .returns<OrderAsProvider[]>()
          : Promise.resolve({ data: [] as OrderAsProvider[], error: null }),
        isProvider
          ? supabase
              .from("provider_profiles")
              .select("verification_status, is_suspended, rating_avg, jobs_count")
              .eq("profile_id", userId)
              .maybeSingle<ProviderStats>()
          : Promise.resolve({ data: null as ProviderStats | null, error: null }),
      ]);
      if (ordersAsClient.error) throw ordersAsClient.error;
      if (requests.error) throw requests.error;
      if (ordersAsProvider.error) throw ordersAsProvider.error;
      if (providerStats.error) throw providerStats.error;
      return {
        ordersAsClient: ordersAsClient.data ?? [],
        requests: requests.data ?? [],
        ordersAsProvider: ordersAsProvider.data ?? [],
        providerStats: providerStats.data,
      };
    },
    enabled: !!userId,
  });
}

export function Users() {
  const [search, setSearch] = useState("");
  const { data: users = [], isLoading } = useUsers(search);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const { data: activity, isLoading: loadingActivity } = useUserActivity(
    editing?.id,
    editing?.is_provider ?? false,
  );

  async function toggleActive(user: UserRow) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !user.is_active })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(user.is_active ? "Usuário desativado." : "Usuário reativado.");
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function toggleAdmin(user: UserRow) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_admin: !user.is_admin })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(user.is_admin ? "Removido de admin." : "Promovido a admin.");
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editing.full_name, phone: editing.phone })
      .eq("id", editing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Usuário atualizado.");
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Usuários</h1>
      <p className="text-sm text-muted-foreground mb-6">Todos os clientes e prestadores cadastrados.</p>

      <div className="flex items-center gap-2 h-11 px-4 rounded-xl bg-card border border-border mb-6 max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email"
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Telefone</th>
              <th className="text-left p-3">Papel</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
                <td className="p-3">
                  <button onClick={() => setEditing(u)} className="font-medium hover:underline">
                    {u.full_name || "—"}
                  </button>
                </td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.phone || "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    {u.is_provider && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                        Prestador
                      </span>
                    )}
                    {u.is_admin && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.is_active ? "bg-trust-soft text-trust" : "bg-destructive/10 text-destructive"}`}
                  >
                    {u.is_active ? "Ativo" : "Desativado"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => toggleAdmin(u)}
                      className="text-xs font-semibold text-primary"
                      title={u.is_admin ? "Remover admin" : "Promover a admin"}
                    >
                      {u.is_admin ? "Remover admin" : "Tornar admin"}
                    </button>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`text-xs font-semibold flex items-center gap-1 ${u.is_active ? "text-destructive" : "text-trust"}`}
                    >
                      {u.is_active ? (
                        <>
                          <Ban className="h-3.5 w-3.5" /> Desativar
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Reativar
                        </>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl p-6 shadow-float">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editing.full_name || editing.email || "Usuário"}</h2>
              <button type="button" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveEdit} className="space-y-3">
              <input
                value={editing.full_name ?? ""}
                onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                placeholder="Nome completo"
                className="w-full h-11 px-3 rounded-lg bg-background border border-border text-sm outline-none"
              />
              <input
                value={editing.phone ?? ""}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                placeholder="Telefone"
                className="w-full h-11 px-3 rounded-lg bg-background border border-border text-sm outline-none"
              />
              <button
                type="submit"
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
              >
                Salvar
              </button>
            </form>

            {editing.is_provider && (
              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Como prestador
                  </h3>
                  <Link to="/providers" className="text-xs font-semibold text-primary">
                    Ver documentos →
                  </Link>
                </div>
                {activity?.providerStats ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 rounded-full bg-secondary">
                      Verificação: {activity.providerStats.verification_status}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-secondary">
                      {activity.providerStats.jobs_count} serviços • nota{" "}
                      {activity.providerStats.rating_avg}
                    </span>
                    {activity.providerStats.is_suspended && (
                      <span className="px-2 py-1 rounded-full bg-destructive/10 text-destructive font-semibold">
                        Suspenso
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem cadastro de prestador ainda.</p>
                )}
                {(activity?.ordersAsProvider.length ?? 0) > 0 && (
                  <div className="mt-2 space-y-1">
                    {activity?.ordersAsProvider.map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-xs py-1">
                        <span className="text-muted-foreground">
                          {o.service_requests?.service_categories?.label ?? "Serviço"} —{" "}
                          {o.status.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold">R$ {(o.final_price ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 pt-5 border-t border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Pedidos como cliente
              </h3>
              {loadingActivity && <p className="text-xs text-muted-foreground">Carregando...</p>}
              {!loadingActivity && (activity?.ordersAsClient.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum pedido ainda.</p>
              )}
              <div className="space-y-1">
                {activity?.ordersAsClient.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted-foreground">
                      {o.service_requests?.service_categories?.label ?? "Serviço"} —{" "}
                      {o.status.replace(/_/g, " ")}
                    </span>
                    <span className="font-semibold">R$ {(o.total ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Solicitações
              </h3>
              {!loadingActivity && (activity?.requests.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma solicitação ainda.</p>
              )}
              <div className="space-y-1">
                {activity?.requests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted-foreground">
                      {r.service_categories?.label ?? "Serviço"}
                    </span>
                    <span className="font-semibold">{r.status.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
