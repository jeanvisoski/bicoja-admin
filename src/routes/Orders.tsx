import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  status: string;
  price: number;
  total: number;
  created_at: string;
  service_requests: { service_categories: { label: string } | null } | null;
  profiles: { full_name: string | null } | null;
  provider_profiles: { profiles: { full_name: string | null } | null } | null;
};

const STATUSES = [
  { value: "todos", label: "Todos" },
  { value: "aceito", label: "Aceito" },
  { value: "a_caminho", label: "A caminho" },
  { value: "executando", label: "Executando" },
  { value: "fotos_enviadas", label: "Fotos enviadas" },
  { value: "aguardando_confirmacao", label: "Aguardando confirmação" },
  { value: "concluido", label: "Concluído" },
  { value: "em_disputa", label: "Em disputa" },
  { value: "cancelado", label: "Cancelado" },
] as const;

function useOrders(status: string) {
  return useQuery({
    queryKey: ["admin-orders", status],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "id, status, price, total, created_at, service_requests(service_categories(label)), profiles(full_name), provider_profiles(profiles(full_name))",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (status !== "todos") query = query.eq("status", status);
      const { data, error } = await query.returns<OrderRow[]>();
      if (error) throw error;
      return data;
    },
  });
}

const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label]));

export function Orders() {
  const [status, setStatus] = useState("todos");
  const { data: orders = [], isLoading } = useOrders(status);
  const queryClient = useQueryClient();

  async function updateStatus(order: OrderRow, nextStatus: string) {
    const { error } = await supabase.from("orders").update({ status: nextStatus }).eq("id", order.id);
    if (error) return toast.error(error.message);
    await supabase.from("order_status_events").insert({
      order_id: order.id,
      status: nextStatus,
      note: "[Admin] Status ajustado pelo portal administrativo.",
    });
    toast.success("Status do pedido atualizado.");
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-kpis"] });
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Pedidos</h1>
      <p className="text-sm text-muted-foreground mb-6">Todos os pedidos da plataforma.</p>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-10 px-3 rounded-lg bg-card border border-border text-sm mb-6"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && orders.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum pedido nesse filtro.</p>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left p-3">Serviço</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Prestador</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Total</th>
              <th className="text-left p-3">Criado em</th>
              <th className="text-right p-3">Controle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="p-3">{o.service_requests?.service_categories?.label ?? "—"}</td>
                <td className="p-3">{o.profiles?.full_name ?? "—"}</td>
                <td className="p-3">{o.provider_profiles?.profiles?.full_name ?? "—"}</td>
                <td className="p-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-trust-soft text-trust">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </td>
                <td className="p-3 text-right font-semibold">R$ {o.total?.toFixed(2)}</td>
                <td className="p-3 text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-3 text-right">
                  <select value={o.status} onChange={(e) => updateStatus(o, e.target.value)} className="h-8 max-w-40 rounded-lg border border-border bg-background px-2 text-xs">
                    {STATUSES.filter((item) => item.value !== "todos").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
