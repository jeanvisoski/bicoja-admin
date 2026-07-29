import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/lib/admin-session";

type DisputeOrder = {
  id: string;
  price: number;
  total: number;
  final_price: number;
  service_requests: { description: string; service_categories: { label: string } | null } | null;
  profiles: { full_name: string | null } | null;
  provider_profiles: { profiles: { full_name: string | null } | null } | null;
};

type DisputeEvent = { order_id: string; note: string | null; created_at: string };
type DisputeReport = { order_id: string; category: string; created_at: string };

const CATEGORY_LABELS: Record<string, string> = {
  servico_incompleto: "Serviço não concluído",
  servico_com_defeito: "Serviço com defeito",
  atraso_grave: "Atraso grave",
  cobranca_indevida: "Cobrança indevida",
  dano_material: "Dano material",
  conduta: "Comportamento inadequado",
  pagamento_externo: "Pagamento externo",
  fraude: "Fraude",
  outro: "Outro motivo",
};

function hoursSince(dateStr: string) {
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 3_600_000));
}

function useDisputes() {
  return useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          "id, price, total, final_price, service_requests(description, service_categories(label)), profiles(full_name), provider_profiles(profiles(full_name))",
        )
        .eq("status", "em_disputa")
        .returns<DisputeOrder[]>();
      if (error) throw error;

      const orderIds = orders.map((o) => o.id);
      const [{ data: events }, { data: reports }] = await Promise.all([
        supabase
          .from("order_status_events")
          .select("order_id, note, created_at")
          .eq("status", "em_disputa")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .returns<DisputeEvent[]>(),
        supabase
          .from("trust_reports")
          .select("order_id, category, created_at")
          .eq("source", "manual")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .returns<DisputeReport[]>(),
      ]);

      return orders.map((o) => {
        const event = events?.find((e) => e.order_id === o.id);
        return {
          ...o,
          reason: event?.note ?? null,
          openedAt: event?.created_at ?? null,
          category: reports?.find((r) => r.order_id === o.id)?.category ?? null,
        };
      });
    },
    refetchInterval: 30_000,
  });
}

export function Disputes() {
  const { session } = useAdminSession();
  const { data: disputes = [], isLoading } = useDisputes();
  const queryClient = useQueryClient();
  const [partialAmount, setPartialAmount] = useState<Record<string, string>>({});

  async function resolve(
    orderId: string,
    outcome: "liberar" | "reembolso_total" | "reembolso_parcial",
    note: string,
    refundAmount = 0,
  ) {
    const { error } = await supabase.rpc("resolve_protection_dispute", {
      p_order_id: orderId,
      p_resolution: outcome,
      p_refund_amount: refundAmount,
      p_note: note,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.rpc("record_operational_audit", { p_entity_type: "order", p_entity_id: orderId, p_action: `dispute_${outcome}`, p_details: { note, refundAmount } });
    if (outcome !== "liberar") {
      const { error: refundError } = await supabase.functions.invoke("mercadopago-refund", {
        body: outcome === "reembolso_parcial" ? { orderId, amount: refundAmount } : { orderId },
      });
      if (refundError) toast.error(`Disputa resolvida; reembolso ficou pendente: ${refundError.message}`);
      else toast.success("Disputa resolvida e reembolso processado.");
    } else toast.success("Disputa resolvida e carteira atualizada.");
    queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }

  function resolvePartial(orderId: string, maxAmount: number) {
    const raw = partialAmount[orderId];
    const amount = Number(raw);
    if (!amount || amount <= 0 || amount >= maxAmount) {
      toast.error(`Informe um valor entre R$ 0,01 e R$ ${(maxAmount - 0.01).toFixed(2)}.`);
      return;
    }
    resolve(
      orderId,
      "reembolso_parcial",
      `Mediado por ${session?.user.email} — reembolso parcial de R$ ${amount.toFixed(2)}.`,
      amount,
    );
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">
                    {d.service_requests?.service_categories?.label ?? "Serviço"}
                  </p>
                  {d.category && (
                    <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-destructive/10 text-destructive px-2 py-0.5">
                      {CATEGORY_LABELS[d.category] ?? d.category}
                    </span>
                  )}
                  {d.openedAt && (
                    <span className="text-[10px] font-semibold rounded-full bg-secondary text-muted-foreground px-2 py-0.5">
                      aberta há {hoursSince(d.openedAt)}h
                    </span>
                  )}
                </div>
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
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">R$</span>
              <input
                value={partialAmount[d.id] ?? ""}
                onChange={(e) =>
                  setPartialAmount((prev) => ({
                    ...prev,
                    [d.id]: e.target.value.replace(/[^0-9.]/g, ""),
                  }))
                }
                placeholder={`parcial (até R$ ${Number(d.final_price).toFixed(2)})`}
                className="h-9 w-48 px-2 rounded-lg bg-background border border-border text-xs outline-none"
              />
              <button
                onClick={() => resolvePartial(d.id, Number(d.final_price))}
                className="h-9 px-4 rounded-lg border border-destructive text-destructive text-xs font-semibold"
              >
                Reembolso parcial
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
