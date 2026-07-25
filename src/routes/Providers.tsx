import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Star, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ProviderRow = {
  profile_id: string;
  headline: string | null;
  city: string | null;
  specialties: string[];
  verification_status: string;
  rating_avg: number;
  jobs_count: number;
  profiles: { full_name: string | null; email: string | null } | null;
  provider_verification_documents:
    | {
        id: string;
        document_type: string;
        status: string;
        storage_path: string;
        created_at: string;
      }[]
    | null;
};

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  identidade: "Identidade",
  selfie: "Selfie c/ documento",
  comprovante_endereco: "Comprovante de endereço",
  certificado: "Certificado",
  outro: "Outro",
};

const TABS = [
  { value: "pendente", label: "Pendentes" },
  { value: "verificado", label: "Verificados" },
  { value: "rejeitado", label: "Rejeitados" },
  { value: "todos", label: "Todos" },
] as const;

function useProviders(filter: string) {
  return useQuery({
    queryKey: ["admin-providers", filter],
    queryFn: async () => {
      let query = supabase
        .from("provider_profiles")
        .select(
          "profile_id, headline, city, specialties, verification_status, rating_avg, jobs_count, profiles(full_name, email), provider_verification_documents(id, document_type, status, storage_path, created_at)",
        )
        .order("member_since", { ascending: false });
      if (filter !== "todos") query = query.eq("verification_status", filter);
      const { data, error } = await query.returns<ProviderRow[]>();
      if (error) throw error;
      return data;
    },
  });
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  verificado: "Verificado",
  rejeitado: "Rejeitado",
};

type ProviderOrder = {
  id: string;
  status: string;
  final_price: number | null;
  created_at: string;
  service_requests: { service_categories: { label: string } | null } | null;
};

type WalletEntry = { amount: number; status: string };

function useProviderActivity(providerId: string | undefined) {
  return useQuery({
    queryKey: ["admin-provider-activity", providerId],
    queryFn: async () => {
      const [orders, wallet] = await Promise.all([
        supabase
          .from("orders")
          .select("id, status, final_price, created_at, service_requests(service_categories(label))")
          .eq("provider_id", providerId)
          .order("created_at", { ascending: false })
          .limit(10)
          .returns<ProviderOrder[]>(),
        supabase.from("wallet_transactions").select("amount, status").eq("provider_id", providerId).returns<WalletEntry[]>(),
      ]);
      if (orders.error) throw orders.error;
      if (wallet.error) throw wallet.error;
      const balanceByStatus = (wallet.data ?? []).reduce<Record<string, number>>((acc, w) => {
        acc[w.status] = (acc[w.status] ?? 0) + Number(w.amount);
        return acc;
      }, {});
      return { orders: orders.data ?? [], balanceByStatus };
    },
    enabled: !!providerId,
  });
}

export function Providers() {
  const [filter, setFilter] = useState<(typeof TABS)[number]["value"]>("pendente");
  const { data: providers = [], isLoading } = useProviders(filter);
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: activity, isLoading: loadingActivity } = useProviderActivity(expandedId ?? undefined);

  async function setStatus(profileId: string, status: string) {
    const { error } = await supabase
      .from("provider_profiles")
      .update({ verification_status: status })
      .eq("profile_id", profileId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.rpc("record_operational_audit", { p_entity_type: "provider", p_entity_id: profileId, p_action: `verification_${status}`, p_details: {} });
    toast.success("Status atualizado.");
    queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
  }

  function latestDocumentsByType(provider: ProviderRow) {
    const byType = new Map<string, ProviderRow["provider_verification_documents"] extends (infer T)[] | null ? T : never>();
    for (const document of provider.provider_verification_documents ?? []) {
      const current = byType.get(document.document_type);
      if (!current || document.created_at > current.created_at) byType.set(document.document_type, document);
    }
    return [...byType.values()];
  }

  async function openDocument(storagePath: string) {
    const { data, error } = await supabase.storage.from("provider-documents").createSignedUrl(storagePath, 120);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Nao foi possivel abrir o documento.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Prestadores</h1>
      <p className="text-sm text-muted-foreground mb-6">Aprove ou rejeite cadastros de prestador.</p>

      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`h-9 px-4 rounded-full text-sm font-semibold ${filter === t.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && providers.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum prestador nesse filtro.</p>
      )}

      <div className="space-y-3">
        {providers.map((p) => {
          const expanded = expandedId === p.profile_id;
          return (
          <div key={p.profile_id} className="bg-card border border-border rounded-2xl shadow-card">
            <div className="p-5 flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                {(p.profiles?.full_name || p.headline || "?")[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{p.profiles?.full_name || p.headline || "Prestador"}</p>
                  {p.verification_status === "verificado" && (
                    <BadgeCheck className="h-4 w-4 text-trust" />
                  )}
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {STATUS_LABEL[p.verification_status] ?? p.verification_status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{p.profiles?.email}</p>
                <p className="text-sm mt-1">{p.headline}</p>
                <p className="text-xs text-muted-foreground">
                  {p.city} • {p.specialties?.join(", ") || "sem especialidades"}
                </p>
                <div className="flex items-center gap-1 text-xs mt-1">
                  <Star className="h-3.5 w-3.5 fill-warn text-warn" />
                  {p.rating_avg} • {p.jobs_count} serviços
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {latestDocumentsByType(p).length === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhum documento enviado.</span>
                  )}
                  {latestDocumentsByType(p).map((document) => (
                    <button
                      key={document.id}
                      onClick={() => openDocument(document.storage_path)}
                      className={`h-8 px-3 rounded-lg border text-[11px] font-semibold ${document.status === "rejeitado" ? "border-destructive/40 text-destructive" : "border-border"}`}
                    >
                      {DOCUMENT_TYPE_LABEL[document.document_type] ?? document.document_type}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setExpandedId(expanded ? null : p.profile_id)}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  {expanded ? (
                    <>
                      Ocultar pedidos e carteira <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Ver pedidos e carteira <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => setStatus(p.profile_id, "verificado")}
                  disabled={p.verification_status === "verificado"}
                  className="h-9 px-4 rounded-lg bg-trust text-primary-foreground text-xs font-semibold disabled:opacity-40"
                >
                  Aprovar
                </button>
                <button
                  onClick={() => setStatus(p.profile_id, "rejeitado")}
                  disabled={p.verification_status === "rejeitado"}
                  className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-40"
                >
                  Rejeitar
                </button>
              </div>
            </div>

            {expanded && (
              <div className="px-5 pb-5 pt-1 border-t border-border">
                {loadingActivity && <p className="text-xs text-muted-foreground pt-3">Carregando...</p>}
                {!loadingActivity && activity && (
                  <div className="grid grid-cols-2 gap-4 pt-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Carteira</p>
                      {Object.keys(activity.balanceByStatus).length === 0 && (
                        <p className="text-xs text-muted-foreground">Sem movimentação.</p>
                      )}
                      <div className="space-y-0.5">
                        {Object.entries(activity.balanceByStatus).map(([statusKey, amount]) => (
                          <p key={statusKey} className="text-xs">
                            {statusKey}: <span className="font-semibold">R$ {amount.toFixed(2)}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Últimos pedidos</p>
                      {activity.orders.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhum pedido ainda.</p>
                      )}
                      <div className="space-y-0.5">
                        {activity.orders.map((o) => (
                          <p key={o.id} className="text-xs flex justify-between gap-2">
                            <span className="text-muted-foreground truncate">
                              {o.service_requests?.service_categories?.label ?? "Serviço"}
                            </span>
                            <span className="font-semibold shrink-0">
                              {o.status.replace(/_/g, " ")}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
