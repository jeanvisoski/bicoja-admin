import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/lib/admin-session";

type DisputeOrder = {
  id: string;
  price: number;
  total: number;
  service_requests: { description: string; service_categories: { label: string } | null } | null;
  profiles: { full_name: string | null } | null;
  provider_profiles: { profiles: { full_name: string | null } | null } | null;
};

type DisputeEvent = { order_id: string; note: string | null; created_at: string };

function useDisputes() {
  return useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          "id, price, total, service_requests(description, service_categories(label)), profiles(full_name), provider_profiles(profiles(full_name))",
        )
        .eq("status", "em_disputa")
        .returns<DisputeOrder[]>();
      if (error) throw error;

      const { data: events } = await supabase
        .from("order_status_events")
        .select("order_id, note, created_at")
        .eq("status", "em_disputa")
        .order("created_at", { ascending: false })
        .returns<DisputeEvent[]>();

      return orders.map((o) => ({
        ...o,
        reason: events?.find((e) => e.order_id === o.id)?.note ?? null,
      }));
    },
  });
}

export function Disputes() {
  const { session } = useAdminSession();
  const { data: disputes = [], isLoading } = useDisputes();
  const queryClient = useQueryClient();

  async function resolve(orderId: string, outcome: "liberar" | "reembolso_total", note: string) {
    const { error } = await supabase.rpc("resolve_protection_dispute", { p_order_id: orderId, p_resolution: outcome, p_refund_amount: 0, p_note: note });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.rpc("record_operational_audit", { p_entity_type: "order", p_entity_id: orderId, p_action: `dispute_${outcome}`, p_details: { note } });
    if (outcome === "reembolso_total") {
      const { error: refundError } = await supabase.functions.invoke("mercadopago-refund", { body: { orderId } });
      if (refundError) toast.error(`Disputa resolvida; reembolso ficou pendente: ${refundError.message}`);
      else toast.success("Disputa resolvida e reembolso processado.");
    } else toast.success("Disputa resolvida e carteira atualizada.");
    queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Disputas</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Pedidos com problema reportado pelo cliente, aguardando mediação.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && disputes.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma disputa em aberto.</p>
      )}

      <div className="space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="bg-card border border-border rounded-2xl p-5 shadow-card">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">
                  {d.service_requests?.service_categories?.label ?? "Serviço"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cliente: {d.profiles?.full_name ?? "—"} • Prestador:{" "}
                  {d.provider_profiles?.profiles?.full_name ?? "—"} • R$ {d.total?.toFixed(2)}
                </p>
                {d.service_requests?.description && (
                  <p className="text-sm mt-2 text-muted-foreground">
                    Pedido: {d.service_requests.description}
                  </p>
                )}
                {d.reason && (
                  <p className="text-sm mt-2 bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                    <span className="font-semibold">Motivo relatado: </span>
                    {d.reason}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() =>
                  resolve(
                    d.id,
                    "liberar",
                    `Mediado por ${session?.user.email} — resolvido a favor da conclusão do serviço.`,
                  )
                }
                className="h-9 px-4 rounded-lg bg-trust text-primary-foreground text-xs font-semibold"
              >
                Confirmar conclusão (libera pagamento)
              </button>
              <button
                onClick={() =>
                  resolve(
                    d.id,
                    "reembolso_total",
                    `Mediado por ${session?.user.email} — reembolso integral solicitado.`,
                  )
                }
                className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold"
              >
                Reembolso integral
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
