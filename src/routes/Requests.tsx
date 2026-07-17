import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type RequestRow = {
  id: string;
  description: string;
  urgency: string;
  status: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
  service_categories: { label: string } | null;
  proposals: { id: string }[] | null;
};

const STATUSES = [
  { value: "todos", label: "Todas" },
  { value: "aberto", label: "Em aberto" },
  { value: "em_negociacao", label: "Em negociação" },
  { value: "contratado", label: "Contratado" },
  { value: "cancelado", label: "Cancelado" },
] as const;

const STATUS_LABEL = Object.fromEntries(STATUSES.map((status) => [status.value, status.label]));

function useRequests(status: string) {
  return useQuery({
    queryKey: ["admin-requests", status],
    queryFn: async () => {
      let query = supabase
        .from("service_requests")
        .select("id, description, urgency, status, created_at, profiles(full_name), service_categories(label), proposals(id)")
        .order("created_at", { ascending: false })
        .limit(150);
      if (status !== "todos") query = query.eq("status", status);
      const { data, error } = await query.returns<RequestRow[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function Requests() {
  const [status, setStatus] = useState("aberto");
  const { data: requests = [], isLoading } = useRequests(status);
  const queryClient = useQueryClient();

  async function updateStatus(request: RequestRow, nextStatus: string) {
    const { error } = await supabase
      .from("service_requests")
      .update({ status: nextStatus })
      .eq("id", request.id);
    if (error) return toast.error(error.message);
    toast.success("Status da solicitação atualizado.");
    queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    queryClient.invalidateQueries({ queryKey: ["admin-kpis"] });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Solicitações</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Acompanhe solicitações ainda sem contratação e o andamento de cada uma.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 px-3 rounded-lg bg-card border border-border text-sm"
        >
          {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">
          {requests.length} solicitação(ões) encontrada(s)
        </span>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && requests.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma solicitação neste filtro.</p>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-secondary text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left p-3">Serviço</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Descrição</th>
              <th className="text-center p-3">Propostas</th>
              <th className="text-left p-3">Urgência</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Criada em</th>
              <th className="text-right p-3">Controle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {requests.map((request) => (
              <tr key={request.id}>
                <td className="p-3 font-medium">{request.service_categories?.label ?? "—"}</td>
                <td className="p-3">{request.profiles?.full_name ?? "—"}</td>
                <td className="p-3 max-w-64 truncate" title={request.description}>{request.description}</td>
                <td className="p-3 text-center font-semibold">{request.proposals?.length ?? 0}</td>
                <td className="p-3 capitalize">{request.urgency.replace(/_/g, " ")}</td>
                <td className="p-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-trust-soft text-trust">
                    {STATUS_LABEL[request.status] ?? request.status}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">{new Date(request.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="p-3 text-right">
                  <select
                    value={request.status}
                    onChange={(event) => updateStatus(request, event.target.value)}
                    className="h-8 max-w-40 rounded-lg border border-border bg-background px-2 text-xs"
                    aria-label="Alterar status da solicitação"
                  >
                    {STATUSES.filter((item) => item.value !== "todos").map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
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
