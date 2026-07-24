import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/lib/admin-session";

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

type OrderDetail = {
  id: string;
  status: string;
  price: number;
  platform_fee: number;
  customer_protection_fee: number;
  total: number;
  final_price: number | null;
  refund_due: number;
  refund_status: string;
  cancellation_reason: string | null;
  created_at: string;
  service_requests: {
    description: string;
    addresses: { street: string | null; number: string | null; city: string | null; state: string | null } | null;
  } | null;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null;
  provider_profiles: { profiles: { full_name: string | null; email: string | null; phone: string | null } | null } | null;
};

type OrderPhoto = { id: string; kind: string; photo_url: string };
type OrderEvent = { id: string; status: string; note: string | null; created_at: string };
type OrderPayment = { status: string; method: string | null; gateway_payment_id: string | null; mode: string };
type WalletEntry = { id: string; type: string; amount: number; status: string };

function useOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ["admin-order-detail", orderId],
    queryFn: async () => {
      const [order, photos, events, payment, wallet] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, status, price, platform_fee, customer_protection_fee, total, final_price, refund_due, refund_status, cancellation_reason, created_at, service_requests(description, addresses(street, number, city, state)), profiles(full_name, email, phone), provider_profiles(profiles(full_name, email, phone))",
          )
          .eq("id", orderId)
          .single<OrderDetail>(),
        supabase.from("order_photos").select("id, kind, photo_url").eq("order_id", orderId).returns<OrderPhoto[]>(),
        supabase
          .from("order_status_events")
          .select("id, status, note, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true })
          .returns<OrderEvent[]>(),
        supabase
          .from("payment_transactions")
          .select("status, method, gateway_payment_id, mode")
          .eq("order_id", orderId)
          .maybeSingle<OrderPayment>(),
        supabase.from("wallet_transactions").select("id, type, amount, status").eq("order_id", orderId).returns<WalletEntry[]>(),
      ]);
      if (order.error) throw order.error;
      if (photos.error) throw photos.error;
      if (events.error) throw events.error;
      if (wallet.error) throw wallet.error;
      return {
        order: order.data,
        photos: photos.data ?? [],
        events: events.data ?? [],
        payment: payment.data,
        wallet: wallet.data ?? [],
      };
    },
    enabled: !!orderId,
  });
}

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

// "Concluído" e "Cancelado" mexem em saldo do prestador e reembolso -- só
// devem acontecer pela confirmação do próprio cliente/prestador ou pela
// mediação de disputa (que credita/estorna corretamente). Ajustar esses dois
// direto por aqui pulava o trigger de carteira e podia deixar saldo preso ou
// liberado errado, então não entram nas opções de ajuste manual.
const MANUAL_ADJUSTABLE_STATUSES = STATUSES.filter(
  (s) => s.value !== "todos" && s.value !== "concluido" && s.value !== "cancelado",
);

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
  const { session } = useAdminSession();
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail, isLoading: loadingDetail } = useOrderDetail(detailId ?? undefined);

  async function updateStatus(order: OrderRow, nextStatus: string) {
    const reason = window.prompt(
      `Motivo do ajuste manual de "${STATUS_LABEL[order.status] ?? order.status}" para "${STATUS_LABEL[nextStatus] ?? nextStatus}" (fica registrado no histórico do pedido):`,
    );
    if (reason === null) return;
    if (reason.trim().length < 10) {
      toast.error("Descreva o motivo do ajuste com pelo menos 10 caracteres.");
      return;
    }
    const { error } = await supabase.from("orders").update({ status: nextStatus }).eq("id", order.id);
    if (error) return toast.error(error.message);
    await supabase.from("order_status_events").insert({
      order_id: order.id,
      status: nextStatus,
      note: `[Admin - ${session?.user.email}] ${reason.trim()}`,
    });
    await supabase.rpc("record_operational_audit", {
      p_entity_type: "order",
      p_entity_id: order.id,
      p_action: `manual_status_${nextStatus}`,
      p_details: { from: order.status, note: reason.trim() },
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
                <td className="p-3">
                  <button onClick={() => setDetailId(o.id)} className="font-medium hover:underline text-left">
                    {o.service_requests?.service_categories?.label ?? "—"}
                  </button>
                </td>
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
                  {o.status === "em_disputa" ? (
                    <Link to="/disputes" className="text-xs font-semibold text-primary">
                      Resolver em Disputas →
                    </Link>
                  ) : o.status === "concluido" || o.status === "cancelado" ? (
                    <span className="text-xs text-muted-foreground">Etapa final</span>
                  ) : (
                    <select
                      value={o.status}
                      onChange={(e) => updateStatus(o, e.target.value)}
                      className="h-8 max-w-40 rounded-lg border border-border bg-background px-2 text-xs"
                    >
                      {MANUAL_ADJUSTABLE_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl p-6 shadow-float">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">
                {detail?.order.service_requests?.description
                  ? detail.order.service_requests.description.slice(0, 60)
                  : "Pedido"}
              </h2>
              <button type="button" onClick={() => setDetailId(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingDetail && <p className="text-sm text-muted-foreground">Carregando...</p>}

            {detail?.order && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-secondary">
                    <p className="font-semibold text-muted-foreground mb-1">Cliente</p>
                    <p>{detail.order.profiles?.full_name ?? "—"}</p>
                    <p className="text-muted-foreground">{detail.order.profiles?.email}</p>
                    <p className="text-muted-foreground">{detail.order.profiles?.phone}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary">
                    <p className="font-semibold text-muted-foreground mb-1">Prestador</p>
                    <p>{detail.order.provider_profiles?.profiles?.full_name ?? "—"}</p>
                    <p className="text-muted-foreground">
                      {detail.order.provider_profiles?.profiles?.email}
                    </p>
                    <p className="text-muted-foreground">
                      {detail.order.provider_profiles?.profiles?.phone}
                    </p>
                  </div>
                </div>

                <div className="text-xs">
                  <p className="font-semibold text-muted-foreground mb-1">Endereço</p>
                  <p>
                    {[
                      detail.order.service_requests?.addresses?.street,
                      detail.order.service_requests?.addresses?.number,
                    ]
                      .filter(Boolean)
                      .join(", ")}{" "}
                    —{" "}
                    {[
                      detail.order.service_requests?.addresses?.city,
                      detail.order.service_requests?.addresses?.state,
                    ]
                      .filter(Boolean)
                      .join("/")}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-secondary space-y-1">
                    <p className="font-semibold text-muted-foreground mb-1">Valores</p>
                    <p>Preço: R$ {detail.order.price?.toFixed(2)}</p>
                    <p>Taxa: R$ {detail.order.platform_fee?.toFixed(2)}</p>
                    <p>Proteção: R$ {detail.order.customer_protection_fee?.toFixed(2)}</p>
                    <p className="font-semibold">Total: R$ {detail.order.total?.toFixed(2)}</p>
                    {detail.order.final_price != null && (
                      <p>Valor final: R$ {detail.order.final_price.toFixed(2)}</p>
                    )}
                    {detail.order.refund_due > 0 && (
                      <p className="text-destructive font-semibold">
                        Reembolso devido: R$ {detail.order.refund_due.toFixed(2)} (
                        {detail.order.refund_status})
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-xl bg-secondary space-y-1">
                    <p className="font-semibold text-muted-foreground mb-1">Pagamento</p>
                    {detail.payment ? (
                      <>
                        <p>Status: {detail.payment.status}</p>
                        <p>Método: {detail.payment.method ?? "—"}</p>
                        <p>Modo: {detail.payment.mode}</p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Sem transação registrada.</p>
                    )}
                    {detail.wallet.length > 0 && (
                      <>
                        <p className="font-semibold text-muted-foreground mt-2">Carteira do prestador</p>
                        {detail.wallet.map((w) => (
                          <p key={w.id}>
                            {w.type} — R$ {w.amount?.toFixed(2)} ({w.status})
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {detail.photos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Fotos</p>
                    <div className="grid grid-cols-4 gap-2">
                      {detail.photos.map((photo) => (
                        <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={photo.photo_url}
                            alt={photo.kind}
                            className="aspect-square object-cover rounded-lg border border-border"
                          />
                          <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                            {photo.kind}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Linha do tempo
                  </p>
                  <div className="space-y-2">
                    {detail.events.map((event) => (
                      <div key={event.id} className="text-xs border-l-2 border-border pl-3">
                        <p className="font-semibold">
                          {event.status.replace(/_/g, " ")} —{" "}
                          {new Date(event.created_at).toLocaleString("pt-BR")}
                        </p>
                        {event.note && <p className="text-muted-foreground">{event.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
