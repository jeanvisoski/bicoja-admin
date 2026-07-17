import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Star } from "lucide-react";
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
  provider_verification_documents: { id: string; status: string; storage_path: string }[] | null;
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
          "profile_id, headline, city, specialties, verification_status, rating_avg, jobs_count, profiles(full_name, email), provider_verification_documents(id, status, storage_path)",
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

export function Providers() {
  const [filter, setFilter] = useState<(typeof TABS)[number]["value"]>("pendente");
  const { data: providers = [], isLoading } = useProviders(filter);
  const queryClient = useQueryClient();

  async function setStatus(profileId: string, status: string) {
    const { error } = await supabase
      .from("provider_profiles")
      .update({ verification_status: status })
      .eq("profile_id", profileId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status atualizado.");
    queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
  }

  async function openLatestDocument(provider: ProviderRow) {
    const document = provider.provider_verification_documents?.[0];
    if (!document) return toast.error("Este prestador ainda nao enviou documentos.");
    const { data, error } = await supabase.storage.from("provider-documents").createSignedUrl(document.storage_path, 120);
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
        {providers.map((p) => (
          <div
            key={p.profile_id}
            className="bg-card border border-border rounded-2xl p-5 shadow-card flex items-start gap-4"
          >
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
              <p className="text-xs text-muted-foreground mt-1">Documentos enviados: {p.provider_verification_documents?.length ?? 0}</p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={() => openLatestDocument(p)} disabled={!p.provider_verification_documents?.length} className="h-9 px-4 rounded-lg border border-border text-xs font-semibold disabled:opacity-40">Documento</button>
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
        ))}
      </div>
    </div>
  );
}
